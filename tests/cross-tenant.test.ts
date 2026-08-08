import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic, resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasPermission } from "@/lib/rbac/permissions";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

/**
 * These are THE tests referenced in the prompt mestre item 40/13:
 * "Um usuário da Clínica A nunca poderá acessar dados da Clínica B" —
 * they MUST fail (i.e. access must be denied) or the build is broken.
 */
describe("Cross-tenant security", () => {
  it("refuses to switch into a clinic the user has no membership in", async () => {
    const ownerA = await createTestUser({ email: "ownerA@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic A");

    const ownerB = await createTestUser({ email: "ownerB@test.local", password: "Password123!" });
    await createTestClinic(ownerB.id, "Clinic B");

    // Owner A tries to log in and then switch into Clinic A (fine)...
    await login("ownerA@test.local", "Password123!");
    await expect(switchActiveClinic(clinicA.id)).resolves.toBeDefined();

    // ...but must NEVER be able to switch into a clinic they don't belong to.
    const clinicBIdGuessedOrLeaked = (await createTestClinic(ownerB.id, "Clinic B (again)")).clinic.id;
    await expect(switchActiveClinic(clinicBIdGuessedOrLeaked)).rejects.toThrow(
      "No active membership for this clinic"
    );
  });

  it("never resolves a tenant context for a clinic outside the user's memberships, even if attempted directly", async () => {
    const ownerA = await createTestUser({ email: "a2@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic A2");
    const ownerB = await createTestUser({ email: "b2@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic B2");

    await login("a2@test.local", "Password123!");
    await switchActiveClinic(clinicA.id);

    const ctx = await resolveTenantContext();
    expect(ctx?.clinicId).toBe(clinicA.id);
    expect(ctx?.clinicId).not.toBe(clinicB.id);
  });

  it("denies a permission check for a user who is not a member of the clinic being queried", async () => {
    const ownerA = await createTestUser({ email: "a3@test.local", password: "Password123!" });
    await createTestClinic(ownerA.id, "Clinic A3");

    const outsider = await createTestUser({ email: "outsider@test.local", password: "Password123!" });
    await login("outsider@test.local", "Password123!");
    // Outsider never switched into any clinic — resolveTenantContext must be null,
    // and therefore every permission check must be denied by default.
    expect(await hasPermission("patients.view")).toBe(false);
    expect(await hasPermission("financial.view")).toBe(false);
  });

  it("does not leak data across two clinics owned by different users with identical role keys", async () => {
    const ownerA = await createTestUser({ email: "a4@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic A4");
    const ownerB = await createTestUser({ email: "a5@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic A5");

    await login("a4@test.local", "Password123!");
    await switchActiveClinic(clinicA.id);
    const ctxA = await resolveTenantContext();

    await login("a5@test.local", "Password123!");
    await switchActiveClinic(clinicB.id);
    const ctxB = await resolveTenantContext();

    expect(ctxA?.clinicId).not.toBe(ctxB?.clinicId);
    expect(ctxA?.roleId).not.toBe(ctxB?.roleId); // roles are per-clinic rows, never shared
  });
});
