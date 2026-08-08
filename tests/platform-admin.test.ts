import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import {
  listAllClinics,
  listClinicModules,
  toggleClinicModule,
  listPrivateBetaAllowlist,
  setUserBetaAccess,
} from "@/lib/platform-admin/platform-admin-service";
import {
  listAllClinicsAction,
  toggleClinicModuleAction,
  setUserBetaAccessAction,
} from "@/app/actions/platform-admin-actions";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

describe("Platform admin — access control", () => {
  it("rejects every function for an unauthenticated caller", async () => {
    await expect(listAllClinics()).rejects.toThrow("UNAUTHENTICATED");
    await expect(listPrivateBetaAllowlist()).rejects.toThrow("UNAUTHENTICATED");
  });

  it("rejects every function for a regular (non-admin) authenticated user, even a clinic OWNER", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Platform Admin");
    await login("owner@test.local", "Password123!");

    await expect(listAllClinics()).rejects.toThrow("FORBIDDEN");
    await expect(listClinicModules(clinic.id)).rejects.toThrow("FORBIDDEN");
    await expect(toggleClinicModule(clinic.id, "FINANCE", false)).rejects.toThrow("FORBIDDEN");
    await expect(listPrivateBetaAllowlist()).rejects.toThrow("FORBIDDEN");
    await expect(setUserBetaAccess(owner.id, true)).rejects.toThrow("FORBIDDEN");
  });

  it("does not leak platform-admin data through the server action layer for a non-admin", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    await createTestClinic(owner.id, "Clinic Platform Admin 2");
    await login("owner2@test.local", "Password123!");

    const result = await listAllClinicsAction();
    expect(result.ok).toBe(false);

    const toggleResult = await toggleClinicModuleAction("00000000-0000-0000-0000-000000000000", "FINANCE", true);
    expect(toggleResult.ok).toBe(false);
  });

  it("allows a platform admin to access every function", async () => {
    const admin = await createTestUser({
      email: "admin@test.local",
      password: "Password123!",
      isPlatformAdmin: true,
    });
    const otherOwner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(otherOwner.id, "Clinic Under Admin");

    await login("admin@test.local", "Password123!");

    const clinicsList = await listAllClinics();
    expect(clinicsList.map((c) => c.id)).toContain(clinic.id);

    const modulesList = await listClinicModules(clinic.id);
    expect(modulesList.length).toBeGreaterThan(0);

    const allowlist = await listPrivateBetaAllowlist();
    // The admin itself is excluded from the allowlist (admins always have access).
    expect(allowlist.map((u) => u.id)).not.toContain(admin.id);
    expect(allowlist.map((u) => u.id)).toContain(otherOwner.id);
  });
});

describe("Platform admin — clinic listing with counts", () => {
  it("reports correct member and patient counts per clinic", async () => {
    const admin = await createTestUser({
      email: "admin2@test.local",
      password: "Password123!",
      isPlatformAdmin: true,
    });
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic With Counts");

    await login("admin2@test.local", "Password123!");
    const clinicsList = await listAllClinics();
    const summary = clinicsList.find((c) => c.id === clinic.id);
    expect(summary).toBeDefined();
    expect(summary!.memberCount).toBe(1); // just the owner
    expect(summary!.patientCount).toBe(0); // none created yet
  });
});

describe("Platform admin — module toggling", () => {
  it("enables and disables a module for a clinic, and it's reflected in hasModule() semantics", async () => {
    const admin = await createTestUser({
      email: "admin3@test.local",
      password: "Password123!",
      isPlatformAdmin: true,
    });
    const owner = await createTestUser({ email: "owner5@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Module Toggle");

    await login("admin3@test.local", "Password123!");

    const before = await listClinicModules(clinic.id);
    const financeModule = before.find((m) => m.key === "FINANCE")!;
    expect(financeModule.enabled).toBe(true); // createTestClinic enables everything by default

    await toggleClinicModule(clinic.id, "FINANCE", false);

    const after = await listClinicModules(clinic.id);
    expect(after.find((m) => m.key === "FINANCE")!.enabled).toBe(false);

    // Toggle back on.
    await toggleClinicModule(clinic.id, "FINANCE", true);
    const afterReenable = await listClinicModules(clinic.id);
    expect(afterReenable.find((m) => m.key === "FINANCE")!.enabled).toBe(true);
  });

  it("rejects an unknown module key", async () => {
    const admin = await createTestUser({
      email: "admin4@test.local",
      password: "Password123!",
      isPlatformAdmin: true,
    });
    const owner = await createTestUser({ email: "owner6@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Unknown Module");

    await login("admin4@test.local", "Password123!");
    await expect(toggleClinicModule(clinic.id, "NOT_A_REAL_MODULE", true)).rejects.toThrow(
      "VALIDATION:unknown_module_key"
    );
  });

  it("does the toggle through the server action layer too", async () => {
    const admin = await createTestUser({
      email: "admin5@test.local",
      password: "Password123!",
      isPlatformAdmin: true,
    });
    const owner = await createTestUser({ email: "owner7@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Toggle Via Action");

    await login("admin5@test.local", "Password123!");
    const result = await toggleClinicModuleAction(clinic.id, "DENTAL", false);
    expect(result.ok).toBe(true);

    const modules = await listClinicModules(clinic.id);
    expect(modules.find((m) => m.key === "DENTAL")!.enabled).toBe(false);
  });
});

describe("Platform admin — Private Beta allowlist", () => {
  it("grants and revokes beta access for a user", async () => {
    const admin = await createTestUser({
      email: "admin6@test.local",
      password: "Password123!",
      isPlatformAdmin: true,
    });
    const target = await createTestUser({
      email: "target@test.local",
      password: "Password123!",
      isAllowedInPrivateBeta: false,
    });

    await login("admin6@test.local", "Password123!");
    await setUserBetaAccess(target.id, true);

    const db = await getDb();
    const [reloaded] = await db.select().from(users).where(eq(users.id, target.id)).limit(1);
    expect(reloaded.isAllowedInPrivateBeta).toBe(true);

    await setUserBetaAccess(target.id, false);
    const [reloaded2] = await db.select().from(users).where(eq(users.id, target.id)).limit(1);
    expect(reloaded2.isAllowedInPrivateBeta).toBe(false);
  });

  it("does it through the server action layer too", async () => {
    const admin = await createTestUser({
      email: "admin7@test.local",
      password: "Password123!",
      isPlatformAdmin: true,
    });
    const target = await createTestUser({
      email: "target2@test.local",
      password: "Password123!",
      isAllowedInPrivateBeta: false,
    });

    await login("admin7@test.local", "Password123!");
    const result = await setUserBetaAccessAction(target.id, true);
    expect(result.ok).toBe(true);

    const db = await getDb();
    const [reloaded] = await db.select().from(users).where(eq(users.id, target.id)).limit(1);
    expect(reloaded.isAllowedInPrivateBeta).toBe(true);
  });
});
