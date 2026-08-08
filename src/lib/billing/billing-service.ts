import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  plans,
  planModules,
  subscriptions,
  clinics,
  clinicModules,
  modules,
  type Plan,
  type Subscription,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";

/**
 * SCAFFOLDING — NOT a real billing system. There is no payment gateway,
 * no invoicing, no card on file, no webhooks. This mirrors the Sprint 11
 * mock-provider decision: the shape of a real subscription/billing
 * system is built (plans, plan_modules, subscriptions) so the platform
 * can adopt real billing later without a data-model rewrite, but every
 * mutation here is a platform-admin manual action, not a customer-facing
 * checkout flow.
 *
 * IMPORTANT: hasModule() (src/lib/entitlements/modules.ts) reads ONLY
 * from clinic_modules — never from subscriptions/plan_modules. Changing
 * a clinic's plan does NOT automatically change what the clinic can
 * access; changeSubscriptionPlan() explicitly syncs clinic_modules to
 * match the new plan's included modules as a one-time action, and an
 * admin remains free to manually enable/disable individual modules
 * afterward (e.g. a trial add-on) without that being overwritten until
 * the next explicit plan change.
 */

async function requirePlatformAdmin() {
  const current = await getCurrentUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  if (!current.user.isPlatformAdmin) throw new Error("FORBIDDEN");
  return current.user;
}

/** Global plan catalog — visible to any authenticated user (used to render "compare plans" UI), not just admins. */
export async function listPlans(): Promise<Plan[]> {
  const current = await getCurrentUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  const db = await getDb();
  return db.select().from(plans).where(eq(plans.isActive, true));
}

/** All plans including inactive ones — platform-admin only (for the admin plan-management screen). */
export async function listAllPlansForAdmin(): Promise<Plan[]> {
  await requirePlatformAdmin();
  const db = await getDb();
  return db.select().from(plans);
}

export type SubscriptionWithPlan = Subscription & { plan: Plan };

async function getSubscriptionByClinicId(clinicId: string): Promise<SubscriptionWithPlan | null> {
  const db = await getDb();
  const [row] = await db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.clinicId, clinicId))
    .limit(1);
  if (!row) return null;
  return { ...row.subscription, plan: row.plan };
}

/** Platform-admin read of any clinic's subscription. */
export async function getSubscription(clinicId: string): Promise<SubscriptionWithPlan | null> {
  await requirePlatformAdmin();
  return getSubscriptionByClinicId(clinicId);
}

/** Self-service read: the current user's OWN active clinic's subscription. No platform-admin check — any active member of the clinic can see their own plan. */
export async function getMyClinicSubscription(): Promise<SubscriptionWithPlan | null> {
  const ctx = await resolveTenantContext();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  return getSubscriptionByClinicId(ctx.clinicId);
}

async function getModuleIdsForPlan(planId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ moduleId: planModules.moduleId }).from(planModules).where(eq(planModules.planId, planId));
  return rows.map((r) => r.moduleId);
}

/**
 * Syncs clinic_modules to match the plan's included modules: enables
 * every module included in the plan, and does NOT touch modules that
 * aren't part of the plan (so a manually-granted extra module isn't
 * silently revoked by a plan sync). This is a one-way "at least" sync,
 * not an exact mirror — matches the doc comment's stated design.
 */
async function syncClinicModulesToPlan(clinicId: string, planId: string) {
  const db = await getDb();
  const moduleIds = await getModuleIdsForPlan(planId);

  for (const moduleId of moduleIds) {
    const [existing] = await db
      .select({ id: clinicModules.id })
      .from(clinicModules)
      .where(and(eq(clinicModules.clinicId, clinicId), eq(clinicModules.moduleId, moduleId)))
      .limit(1);

    if (existing) {
      await db.update(clinicModules).set({ enabled: true }).where(eq(clinicModules.id, existing.id));
    } else {
      await db.insert(clinicModules).values({ clinicId, moduleId, enabled: true });
    }
  }
}

/** Creates a subscription for a clinic that doesn't have one yet. Platform-admin only. */
export async function createSubscription(
  clinicId: string,
  planId: string,
  status: (typeof subscriptions.$inferInsert)["status"] = "trialing"
): Promise<Subscription> {
  const admin = await requirePlatformAdmin();
  const db = await getDb();

  const [clinic] = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  if (!clinic) throw new Error("NOT_FOUND");

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new Error("VALIDATION:unknown_plan");

  const existing = await getSubscriptionByClinicId(clinicId);
  if (existing) throw new Error("CONFLICT:subscription_already_exists");

  const [created] = await db
    .insert(subscriptions)
    .values({ clinicId, planId, status })
    .returning();

  await syncClinicModulesToPlan(clinicId, planId);

  await recordAudit({
    userId: admin.id,
    clinicId,
    action: "billing.create_subscription",
    objectType: "subscription",
    objectId: created.id,
    result: "success",
    metadata: { planId, status },
  });

  return created;
}

/** Changes a clinic's plan (and re-syncs clinic_modules to the new plan). Platform-admin only. */
export async function changeSubscriptionPlan(clinicId: string, newPlanId: string): Promise<Subscription> {
  const admin = await requirePlatformAdmin();
  const db = await getDb();

  const existing = await getSubscriptionByClinicId(clinicId);
  if (!existing) throw new Error("NOT_FOUND");

  const [plan] = await db.select().from(plans).where(eq(plans.id, newPlanId)).limit(1);
  if (!plan) throw new Error("VALIDATION:unknown_plan");

  const [updated] = await db
    .update(subscriptions)
    .set({ planId: newPlanId, updatedAt: new Date() })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  await syncClinicModulesToPlan(clinicId, newPlanId);

  await recordAudit({
    userId: admin.id,
    clinicId,
    action: "billing.change_plan",
    objectType: "subscription",
    objectId: updated.id,
    result: "success",
    metadata: { fromPlanId: existing.planId, toPlanId: newPlanId },
  });

  return updated;
}

/** Cancels a clinic's subscription (status -> cancelled). Does NOT disable clinic_modules — access removal on cancellation is a separate, deliberate future decision, not an implicit side effect here. */
export async function cancelSubscription(clinicId: string): Promise<Subscription> {
  const admin = await requirePlatformAdmin();
  const db = await getDb();

  const existing = await getSubscriptionByClinicId(clinicId);
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status === "cancelled") throw new Error("IMMUTABLE:already_cancelled");

  const [updated] = await db
    .update(subscriptions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  await recordAudit({
    userId: admin.id,
    clinicId,
    action: "billing.cancel_subscription",
    objectType: "subscription",
    objectId: updated.id,
    result: "success",
  });

  return updated;
}

/** Which modules are included in a given plan — used by the admin UI to show/compare plan contents. */
export async function getPlanModules(planId: string) {
  const db = await getDb();
  const rows = await db
    .select({ module: modules })
    .from(planModules)
    .innerJoin(modules, eq(modules.id, planModules.moduleId))
    .where(eq(planModules.planId, planId));
  return rows.map((r) => r.module);
}
