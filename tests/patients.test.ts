import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deactivatePatient,
  reactivatePatient,
} from "@/lib/patients/patients-service";
import {
  createPatientAction,
  updatePatientAction,
  deactivatePatientAction,
  getPatientAction,
} from "@/app/actions/patients-actions";

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

describe("Patients — service layer CRUD", () => {
  it("creates, reads, updates and deactivates a patient within the owner's clinic", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic CRUD");
    await loginAsOwnerOf(clinic.id, "owner@test.local");

    const created = await createPatient({ name: "Paciente Um", phone: "11999990000" });
    expect(created.name).toBe("Paciente Um");
    expect(created.clinicId).toBe(clinic.id);
    expect(created.isActive).toBe(true);

    const fetched = await getPatient(created.id);
    expect(fetched?.id).toBe(created.id);

    const updated = await updatePatient(created.id, { name: "Paciente Um Editado", email: "p1@test.local" });
    expect(updated.name).toBe("Paciente Um Editado");
    expect(updated.email).toBe("p1@test.local");

    const deactivated = await deactivatePatient(created.id);
    expect(deactivated.isActive).toBe(false);

    const reactivated = await reactivatePatient(created.id);
    expect(reactivated.isActive).toBe(true);
  });

  it("rejects creating a patient with an empty name", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Validation");
    await loginAsOwnerOf(clinic.id, "owner2@test.local");

    await expect(createPatient({ name: "   " })).rejects.toThrow("VALIDATION:name_required");
  });

  it("excludes inactive patients from listPatients by default, includes them when asked", async () => {
    const owner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic List");
    await loginAsOwnerOf(clinic.id, "owner3@test.local");

    const p1 = await createPatient({ name: "Ativo" });
    const p2 = await createPatient({ name: "Inativo" });
    await deactivatePatient(p2.id);

    const activeOnly = await listPatients({});
    expect(activeOnly.patients.map((p) => p.id)).toContain(p1.id);
    expect(activeOnly.patients.map((p) => p.id)).not.toContain(p2.id);

    const withInactive = await listPatients({ includeInactive: true });
    expect(withInactive.patients.map((p) => p.id)).toEqual(
      expect.arrayContaining([p1.id, p2.id])
    );
  });

  it("searches by name, phone and email", async () => {
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Search");
    await loginAsOwnerOf(clinic.id, "owner4@test.local");

    await createPatient({ name: "Zelia Rocha", phone: "11911112222", email: "zelia@test.local" });
    await createPatient({ name: "Outro Paciente", phone: "11933334444" });

    const byName = await listPatients({ search: "zelia" });
    expect(byName.patients).toHaveLength(1);

    const byPhone = await listPatients({ search: "9111" });
    expect(byPhone.patients).toHaveLength(1);

    const byEmail = await listPatients({ search: "zelia@test.local" });
    expect(byEmail.patients).toHaveLength(1);
  });

  it("throws when the caller has no resolved tenant context", async () => {
    // No login at all — resolveTenantContext() must return null.
    await expect(createPatient({ name: "Ninguem" })).rejects.toThrow("UNAUTHENTICATED_OR_NO_TENANT");
    await expect(listPatients({})).rejects.toThrow("UNAUTHENTICATED_OR_NO_TENANT");
  });
});

describe("Patients — cross-tenant isolation", () => {
  it("never returns a patient that belongs to a different clinic", async () => {
    const ownerA = await createTestUser({ email: "pa@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic PA");
    const ownerB = await createTestUser({ email: "pb@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic PB");

    await loginAsOwnerOf(clinicA.id, "pa@test.local");
    const patientInA = await createPatient({ name: "Paciente da Clínica A" });

    // Switch context to clinic B and attempt to read/update/deactivate
    // a patient id that belongs to clinic A.
    await loginAsOwnerOf(clinicB.id, "pb@test.local");

    const leaked = await getPatient(patientInA.id);
    expect(leaked).toBeNull();

    await expect(updatePatient(patientInA.id, { name: "Hackeado" })).rejects.toThrow("NOT_FOUND");
    await expect(deactivatePatient(patientInA.id)).rejects.toThrow("NOT_FOUND");

    // And clinic B's own patient list must never include clinic A's patient.
    const listInB = await listPatients({ includeInactive: true });
    expect(listInB.patients.map((p) => p.id)).not.toContain(patientInA.id);
  });

  it("does not leak a cross-tenant patient through the server action layer either", async () => {
    const ownerA = await createTestUser({ email: "pa2@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic PA2");
    const ownerB = await createTestUser({ email: "pb2@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic PB2");

    await loginAsOwnerOf(clinicA.id, "pa2@test.local");
    const created = await createPatientAction({ name: "Paciente Ação A" });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");

    await loginAsOwnerOf(clinicB.id, "pb2@test.local");
    const result = await getPatientAction(created.data.id);
    expect(result.ok).toBe(false);
  });
});

describe("Patients — RBAC enforcement", () => {
  it("blocks a role without patients.create from creating a patient", async () => {
    const owner = await createTestUser({ email: "ownerR@test.local", password: "Password123!" });
    const { clinic, roles: clinicRoles } = await createTestClinic(owner.id, "Clinic RBAC");

    // FINANCE role only has financial.* + patients.view (per ROLE_PERMISSION_KEYS)
    const financeUser = await createTestUser({ email: "finance@test.local", password: "Password123!" });
    const db = await getDb();
    const financeRole = clinicRoles.find((r) => r.key === "FINANCE")!;
    await db.insert(memberships).values({
      userId: financeUser.id,
      clinicId: clinic.id,
      roleId: financeRole.id,
      status: "active",
    });

    await loginAsOwnerOf(clinic.id, "finance@test.local");

    const result = await createPatientAction({ name: "Não Deveria Existir" });
    expect(result.ok).toBe(false);

    // But viewing patients should still work for FINANCE.
    const listResult = await listPatients({});
    expect(listResult.patients).toBeDefined();
  });

  it("blocks a role without patients.delete from deactivating a patient", async () => {
    const owner = await createTestUser({ email: "ownerR2@test.local", password: "Password123!" });
    const { clinic, roles: clinicRoles } = await createTestClinic(owner.id, "Clinic RBAC2");
    await loginAsOwnerOf(clinic.id, "ownerR2@test.local");
    const patient = await createPatient({ name: "Paciente Protegido" });

    // PROFESSIONAL role has no patients.delete per ROLE_PERMISSION_KEYS.
    const proUser = await createTestUser({ email: "pro@test.local", password: "Password123!" });
    const db = await getDb();
    const proRole = clinicRoles.find((r) => r.key === "PROFESSIONAL")!;
    await db.insert(memberships).values({
      userId: proUser.id,
      clinicId: clinic.id,
      roleId: proRole.id,
      status: "active",
    });

    await loginAsOwnerOf(clinic.id, "pro@test.local");
    const result = await deactivatePatientAction(patient.id);
    expect(result.ok).toBe(false);
  });

  it("blocks all patient actions when the PATIENTS module is disabled for the clinic", async () => {
    const owner = await createTestUser({ email: "ownerM@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Module Off");

    // Disable PATIENTS for this clinic after creation.
    const db = await getDb();
    const { clinicModules, modules } = await import("@/db/schema");
    const [patientsModule] = await db.select().from(modules).where(eq(modules.key, "PATIENTS")).limit(1);
    await db
      .update(clinicModules)
      .set({ enabled: false })
      .where(and(eq(clinicModules.clinicId, clinic.id), eq(clinicModules.moduleId, patientsModule.id)));

    await loginAsOwnerOf(clinic.id, "ownerM@test.local");

    const result = await createPatientAction({ name: "Bloqueado por módulo" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/módulo/i);
  });
});
