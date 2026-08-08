import { eq, and, count, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  clinics,
  clinicModules,
  modules,
  memberships,
  patients,
  users,
  type Clinic,
  type ModuleRow,
  type User,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { recordAudit } from "@/lib/audit";

/**
 * Platform-wide administration — deliberately NOT tenant-scoped. Every
 * function here is cross-clinic by nature (it exists to manage the
 * whole platform), so instead of resolveTenantContext() it checks
 * isPlatformAdmin directly. This is the "Sistema Global" panel from the
 * prompt mestre (item 41/42) — see src/app/admin/page.tsx for the
 * server-side page-level gate that mirrors this same check.
 *
 * Every function throws FORBIDDEN if the caller isn't a platform admin
 * — never silently returns an empty/filtered result, since that could
 * mask the access-control bug in a way that "looks fine" during manual
 * testing.
 */

async function requirePlatformAdmin() {
  const current = await getCurrentUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  if (!current.user.isPlatformAdmin) throw new Error("FORBIDDEN");
  return current.user;
}

export type ClinicSummary = Clinic & {
  memberCount: number;
  patientCount: number;
};

export async function listAllClinics(): Promise<ClinicSummary[]> {
  await requirePlatformAdmin();
  const db = await getDb();

  const allClinics = await db.select().from(clinics);

  const memberCounts = await db
    .select({ clinicId: memberships.clinicId, value: count() })
    .from(memberships)
    .where(eq(memberships.status, "active"))
    .groupBy(memberships.clinicId);
  const memberCountByClinic = new Map(memberCounts.map((r) => [r.clinicId, r.value]));

  const patientCounts = await db
    .select({ clinicId: patients.clinicId, value: count() })
    .from(patients)
    .where(eq(patients.isActive, true))
    .groupBy(patients.clinicId);
  const patientCountByClinic = new Map(patientCounts.map((r) => [r.clinicId, r.value]));

  return allClinics.map((c) => ({
    ...c,
    memberCount: memberCountByClinic.get(c.id) ?? 0,
    patientCount: patientCountByClinic.get(c.id) ?? 0,
  }));
}

export type ClinicModuleStatus = ModuleRow & { enabled: boolean };

/** All modules in the global catalog, with whether each is enabled for the given clinic. */
export async function listClinicModules(clinicId: string): Promise<ClinicModuleStatus[]> {
  await requirePlatformAdmin();
  const db = await getDb();

  const [clinic] = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  if (!clinic) throw new Error("NOT_FOUND");

  const allModules = await db.select().from(modules);
  const enabledRows = await db
    .select({ moduleId: clinicModules.moduleId, enabled: clinicModules.enabled })
    .from(clinicModules)
    .where(eq(clinicModules.clinicId, clinicId));
  const enabledByModuleId = new Map(enabledRows.map((r) => [r.moduleId, r.enabled]));

  return allModules.map((m) => ({ ...m, enabled: enabledByModuleId.get(m.id) ?? false }));
}

/** Enables or disables a single module for a clinic — creates the clinic_modules row if it doesn't exist yet. */
export async function toggleClinicModule(
  clinicId: string,
  moduleKey: string,
  enabled: boolean
): Promise<void> {
  const admin = await requirePlatformAdmin();
  const db = await getDb();

  const [clinic] = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  if (!clinic) throw new Error("NOT_FOUND");

  const [module] = await db.select().from(modules).where(eq(modules.key, moduleKey)).limit(1);
  if (!module) throw new Error("VALIDATION:unknown_module_key");

  const [existing] = await db
    .select({ id: clinicModules.id })
    .from(clinicModules)
    .where(and(eq(clinicModules.clinicId, clinicId), eq(clinicModules.moduleId, module.id)))
    .limit(1);

  if (existing) {
    await db.update(clinicModules).set({ enabled }).where(eq(clinicModules.id, existing.id));
  } else {
    await db.insert(clinicModules).values({ clinicId, moduleId: module.id, enabled });
  }

  await recordAudit({
    userId: admin.id,
    clinicId,
    action: "platform_admin.toggle_module",
    objectType: "clinic_module",
    objectId: module.id,
    result: "success",
    metadata: { moduleKey, enabled },
  });
}

export type BetaUserSummary = Pick<
  User,
  "id" | "name" | "email" | "isAllowedInPrivateBeta" | "isPlatformAdmin" | "isActive" | "createdAt"
>;

/** Every non-admin user, for the Private Beta allowlist screen. Platform admins are always allowed (see private-beta.ts) so they're excluded from this list — toggling them would be a no-op. */
export async function listPrivateBetaAllowlist(): Promise<BetaUserSummary[]> {
  await requirePlatformAdmin();
  const db = await getDb();

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isAllowedInPrivateBeta: users.isAllowedInPrivateBeta,
      isPlatformAdmin: users.isPlatformAdmin,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.isPlatformAdmin, false));
}

export async function setUserBetaAccess(userId: string, allowed: boolean): Promise<void> {
  const admin = await requirePlatformAdmin();
  const db = await getDb();

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new Error("NOT_FOUND");

  await db.update(users).set({ isAllowedInPrivateBeta: allowed, updatedAt: new Date() }).where(eq(users.id, userId));

  await recordAudit({
    userId: admin.id,
    action: "platform_admin.set_beta_access",
    objectType: "user",
    objectId: userId,
    result: "success",
    metadata: { allowed },
  });
}
