import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { hasPermission, requirePermission } from "@/lib/rbac/permissions";
import { getDb } from "@/db/client";
import { memberships, roles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

describe("RBAC — granular permissions per role", () => {
  it("grants OWNER every permission, including financial", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Owner Clinic");

    await login("owner@test.local", "Password123!");
    await switchActiveClinic(clinic.id);

    expect(await hasPermission("financial.view")).toBe(true);
    expect(await hasPermission("members.manage")).toBe(true);
  });

  it("denies a RECEPTIONIST access to financial permissions", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic, roles: clinicRoles } = await createTestClinic(owner.id, "Reception Clinic");

    const receptionist = await createTestUser({ email: "reception@test.local", password: "Password123!" });
    const db = await getDb();
    const receptionistRole = clinicRoles.find((r) => r.key === "RECEPTIONIST")!;
    await db.insert(memberships).values({
      userId: receptionist.id,
      clinicId: clinic.id,
      roleId: receptionistRole.id,
      status: "active",
    });

    await login("reception@test.local", "Password123!");
    await switchActiveClinic(clinic.id);

    expect(await hasPermission("agenda.create")).toBe(true);
    expect(await hasPermission("financial.view")).toBe(false);
    await expect(requirePermission("financial.delete")).rejects.toThrow("FORBIDDEN");
  });

  it("denies every permission when there is no active tenant context", async () => {
    await createTestUser({ email: "noclinic@test.local", password: "Password123!" });
    await login("noclinic@test.local", "Password123!");
    // No switchActiveClinic() call — session has no active clinic yet.
    expect(await hasPermission("patients.view")).toBe(false);
  });
});
