import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { getDb } from "@/db/client";
import { plans, modules, clinicModules } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  listPlans,
  getSubscription,
  getMyClinicSubscription,
  createSubscription,
  changeSubscriptionPlan,
  cancelSubscription,
} from "@/lib/billing/billing-service";
import {
  listPlansAction,
  getMyClinicSubscriptionAction,
  createSubscriptionAction,
  changeSubscriptionPlanAction,
} from "@/app/actions/billing-actions";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

async function loginAsOwnerOf(clinicId: string, email: string) {
  await login(email, "Password123!");
  await switchActiveClinic(clinicId);
}

/** Creates the two test plans (Básico with only PATIENTS, Profissional with PATIENTS+FINANCE) with plan_modules wired. */
async function seedTestPlans() {
  const db = await getDb();
  const allModules = await db.select().from(modules);
  const moduleByKey = new Map(allModules.map((m) => [m.key, m]));

  const [basico] = await db
    .insert(plans)
    .values({ key: "basico", name: "Básico", priceCents: 9700, maxUsers: 3 })
    .returning();
  const [profissional] = await db
    .insert(plans)
    .values({ key: "profissional", name: "Profissional", priceCents: 29700, maxUsers: 10 })
    .returning();
  const [enterprise] = await db
    .insert(plans)
    .values({ key: "enterprise", name: "Enterprise", priceCents: null, maxUsers: null })
    .returning();

  const db2 = await getDb();
  const { planModules } = await import("@/db/schema");

  const link = async (planId: string, moduleKeys: string[]) => {
    for (const key of moduleKeys) {
      const mod = moduleByKey.get(key);
      if (!mod) continue;
      await db2.insert(planModules).values({ planId, moduleId: mod.id });
    }
  };

  await link(basico.id, ["CORE", "PATIENTS"]);
  await link(profissional.id, ["CORE", "PATIENTS", "FINANCE"]);
  await link(enterprise.id, allModules.map((m) => m.key));

  return { basico, profissional, enterprise };
}

describe("Billing — access control", () => {
  it("rejects platform-admin-only functions for an unauthenticated caller", async () => {
    const { basico } = await seedTestPlans();
    const owner = await createTestUser({ email: "owner1@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing 1");

    await expect(getSubscription(clinic.id)).rejects.toThrow("UNAUTHENTICATED");
    await expect(createSubscription(clinic.id, basico.id)).rejects.toThrow("UNAUTHENTICATED");
  });

  it("rejects platform-admin-only functions for a regular clinic OWNER", async () => {
    const { basico } = await seedTestPlans();
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing 2");
    await loginAsOwnerOf(clinic.id, "owner2@test.local");

    await expect(getSubscription(clinic.id)).rejects.toThrow("FORBIDDEN");
    await expect(createSubscription(clinic.id, basico.id)).rejects.toThrow("FORBIDDEN");
    await expect(changeSubscriptionPlan(clinic.id, basico.id)).rejects.toThrow("FORBIDDEN");
    await expect(cancelSubscription(clinic.id)).rejects.toThrow("FORBIDDEN");
  });

  it("allows any authenticated user to list the public plan catalog", async () => {
    await seedTestPlans();
    const owner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing 3");
    await loginAsOwnerOf(clinic.id, "owner3@test.local");

    const result = await listPlans();
    expect(result.length).toBe(3);
  });
});

describe("Billing — subscription lifecycle", () => {
  it("creates a subscription and syncs clinic_modules to the plan's modules", async () => {
    const { basico } = await seedTestPlans();
    const admin = await createTestUser({ email: "admin1@test.local", password: "Password123!", isPlatformAdmin: true });
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    // Regular clinic (not createTestClinic's all-modules-enabled shortcut) so the sync is observable.
    const { createClinic } = await import("@/lib/tenant/clinics-service");
    const clinic = await createClinic({ name: "Clinic Billing 4", ownerUserId: owner.id, isDevSeedData: true, defaultEnabledModules: [] });

    await login("admin1@test.local", "Password123!");
    const sub = await createSubscription(clinic.id, basico.id);
    expect(sub.status).toBe("trialing");
    expect(sub.planId).toBe(basico.id);

    const db = await getDb();
    const [patientsModule] = await db.select().from(modules).where(eq(modules.key, "PATIENTS")).limit(1);
    const [enabledRow] = await db
      .select()
      .from(clinicModules)
      .where(and(eq(clinicModules.clinicId, clinic.id), eq(clinicModules.moduleId, patientsModule.id)))
      .limit(1);
    expect(enabledRow?.enabled).toBe(true);
  });

  it("rejects creating a second subscription for a clinic that already has one", async () => {
    const { basico, profissional } = await seedTestPlans();
    const admin = await createTestUser({ email: "admin2@test.local", password: "Password123!", isPlatformAdmin: true });
    const owner = await createTestUser({ email: "owner5@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing 5");

    await login("admin2@test.local", "Password123!");
    await createSubscription(clinic.id, basico.id);
    await expect(createSubscription(clinic.id, profissional.id)).rejects.toThrow("CONFLICT:subscription_already_exists");
  });

  it("changes plan and re-syncs clinic_modules to include the new plan's modules", async () => {
    const { basico, profissional } = await seedTestPlans();
    const admin = await createTestUser({ email: "admin3@test.local", password: "Password123!", isPlatformAdmin: true });
    const owner = await createTestUser({ email: "owner6@test.local", password: "Password123!" });
    const { createClinic } = await import("@/lib/tenant/clinics-service");
    const clinic = await createClinic({ name: "Clinic Billing 6", ownerUserId: owner.id, isDevSeedData: true, defaultEnabledModules: [] });

    await login("admin3@test.local", "Password123!");
    await createSubscription(clinic.id, basico.id);
    const updated = await changeSubscriptionPlan(clinic.id, profissional.id);
    expect(updated.planId).toBe(profissional.id);

    const db = await getDb();
    const [financeModule] = await db.select().from(modules).where(eq(modules.key, "FINANCE")).limit(1);
    const [enabledRow] = await db
      .select()
      .from(clinicModules)
      .where(and(eq(clinicModules.clinicId, clinic.id), eq(clinicModules.moduleId, financeModule.id)))
      .limit(1);
    expect(enabledRow?.enabled).toBe(true); // FINANCE wasn't in Básico, now included via Profissional
  });

  it("does not disable a manually-granted extra module when changing plans", async () => {
    const { basico, profissional } = await seedTestPlans();
    const admin = await createTestUser({ email: "admin4@test.local", password: "Password123!", isPlatformAdmin: true });
    const owner = await createTestUser({ email: "owner7@test.local", password: "Password123!" });
    const { createClinic } = await import("@/lib/tenant/clinics-service");
    const clinic = await createClinic({ name: "Clinic Billing 7", ownerUserId: owner.id, isDevSeedData: true, defaultEnabledModules: [] });

    await login("admin4@test.local", "Password123!");
    await createSubscription(clinic.id, basico.id);

    // Manually enable AGENDA even though it's not in Básico.
    const db = await getDb();
    const [agendaModule] = await db.select().from(modules).where(eq(modules.key, "AGENDA")).limit(1);
    await db.insert(clinicModules).values({ clinicId: clinic.id, moduleId: agendaModule.id, enabled: true });

    // Changing to Profissional (which also doesn't include AGENDA in our test fixture) must not revoke it.
    await changeSubscriptionPlan(clinic.id, profissional.id);
    const [afterChange] = await db
      .select()
      .from(clinicModules)
      .where(and(eq(clinicModules.clinicId, clinic.id), eq(clinicModules.moduleId, agendaModule.id)))
      .limit(1);
    expect(afterChange?.enabled).toBe(true);
  });

  it("cancels a subscription and rejects cancelling it twice", async () => {
    const { basico } = await seedTestPlans();
    const admin = await createTestUser({ email: "admin5@test.local", password: "Password123!", isPlatformAdmin: true });
    const owner = await createTestUser({ email: "owner8@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing 8");

    await login("admin5@test.local", "Password123!");
    await createSubscription(clinic.id, basico.id);
    const cancelled = await cancelSubscription(clinic.id);
    expect(cancelled.status).toBe("cancelled");

    await expect(cancelSubscription(clinic.id)).rejects.toThrow("IMMUTABLE:already_cancelled");
  });

  it("rejects an unknown plan id", async () => {
    const admin = await createTestUser({ email: "admin6@test.local", password: "Password123!", isPlatformAdmin: true });
    const owner = await createTestUser({ email: "owner9@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing 9");

    await login("admin6@test.local", "Password123!");
    await expect(createSubscription(clinic.id, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      "VALIDATION:unknown_plan"
    );
  });
});

describe("Billing — self-service read isolation", () => {
  it("lets a clinic member see only their own clinic's subscription", async () => {
    const { basico, profissional } = await seedTestPlans();
    const admin = await createTestUser({ email: "admin7@test.local", password: "Password123!", isPlatformAdmin: true });

    const ownerA = await createTestUser({ email: "ownerA@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Billing A");
    const ownerB = await createTestUser({ email: "ownerB@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Billing B");

    await login("admin7@test.local", "Password123!");
    await createSubscription(clinicA.id, basico.id);
    await createSubscription(clinicB.id, profissional.id);

    await loginAsOwnerOf(clinicA.id, "ownerA@test.local");
    const subA = await getMyClinicSubscription();
    expect(subA?.planId).toBe(basico.id);
    expect(subA?.clinicId).toBe(clinicA.id);

    await loginAsOwnerOf(clinicB.id, "ownerB@test.local");
    const subB = await getMyClinicSubscription();
    expect(subB?.planId).toBe(profissional.id);
    expect(subB?.clinicId).toBe(clinicB.id);
  });

  it("returns null (not an error) for a clinic with no subscription yet", async () => {
    await seedTestPlans();
    const owner = await createTestUser({ email: "ownerC@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing C");
    await loginAsOwnerOf(clinic.id, "ownerC@test.local");

    const sub = await getMyClinicSubscription();
    expect(sub).toBeNull();
  });
});

describe("Billing — server action layer", () => {
  it("does not leak subscription data through the action layer for a non-admin", async () => {
    const { basico } = await seedTestPlans();
    const owner = await createTestUser({ email: "ownerD@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing D");
    await loginAsOwnerOf(clinic.id, "ownerD@test.local");

    const createResult = await createSubscriptionAction(clinic.id, basico.id);
    expect(createResult.ok).toBe(false);
  });

  it("round-trips list/create/change/read through the action layer", async () => {
    const { basico, profissional } = await seedTestPlans();
    const admin = await createTestUser({ email: "admin8@test.local", password: "Password123!", isPlatformAdmin: true });
    const owner = await createTestUser({ email: "ownerE@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Billing E");

    await login("admin8@test.local", "Password123!");
    const plansResult = await listPlansAction();
    expect(plansResult.ok).toBe(true);

    const createResult = await createSubscriptionAction(clinic.id, basico.id);
    expect(createResult.ok).toBe(true);

    const changeResult = await changeSubscriptionPlanAction(clinic.id, profissional.id);
    expect(changeResult.ok).toBe(true);

    await loginAsOwnerOf(clinic.id, "ownerE@test.local");
    const readResult = await getMyClinicSubscriptionAction();
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.data?.planId).toBe(profissional.id);
    }
  });
});
