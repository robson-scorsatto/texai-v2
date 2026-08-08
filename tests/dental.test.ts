import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import {
  getOrCreateDentalChart,
  listToothRecords,
  addToothRecord,
  getCurrentToothStatuses,
} from "@/lib/dental/dental-service";
import { createPatient } from "@/lib/patients/patients-service";
import {
  addToothRecordAction,
  listToothRecordsAction,
} from "@/app/actions/dental-actions";

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

describe("Dental — service layer CRUD", () => {
  it("creates a dental chart on first access and reuses it afterwards", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Dental CRUD");
    await loginAsOwnerOf(clinic.id, "owner@test.local");
    const patient = await createPatient({ name: "Paciente Odontograma" });

    const chart1 = await getOrCreateDentalChart(patient.id);
    expect(chart1.dentitionType).toBe("permanente");

    const chart2 = await getOrCreateDentalChart(patient.id);
    expect(chart2.id).toBe(chart1.id);
  });

  it("adds tooth records and lists them for a patient", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Dental Add");
    await loginAsOwnerOf(clinic.id, "owner2@test.local");
    const patient = await createPatient({ name: "Paciente Dentes" });

    const record = await addToothRecord(patient.id, { toothNumber: 16, status: "restaurado", procedureNote: "Restauração." });
    expect(record.toothNumber).toBe(16);
    expect(record.status).toBe("restaurado");

    await addToothRecord(patient.id, { toothNumber: 26, status: "cariado" });

    const records = await listToothRecords(patient.id);
    expect(records).toHaveLength(2);
  });

  it("rejects an invalid FDI tooth number", async () => {
    const owner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Dental Validation");
    await loginAsOwnerOf(clinic.id, "owner3@test.local");
    const patient = await createPatient({ name: "Paciente Validação Dental" });

    await expect(addToothRecord(patient.id, { toothNumber: 99, status: "saudavel" })).rejects.toThrow(
      "VALIDATION:invalid_tooth_number"
    );
    await expect(addToothRecord(patient.id, { toothNumber: 9, status: "saudavel" })).rejects.toThrow(
      "VALIDATION:invalid_tooth_number"
    );
  });

  it("tracks the CURRENT status per tooth as the most recent record", async () => {
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Dental Current Status");
    await loginAsOwnerOf(clinic.id, "owner4@test.local");
    const patient = await createPatient({ name: "Paciente Status Atual" });

    await addToothRecord(patient.id, { toothNumber: 11, status: "cariado" });
    await addToothRecord(patient.id, { toothNumber: 11, status: "em_tratamento" });
    await addToothRecord(patient.id, { toothNumber: 11, status: "restaurado" });

    const statuses = await getCurrentToothStatuses(patient.id);
    expect(statuses.get(11)).toBe("restaurado");
  });

  it("throws when the caller has no resolved tenant context", async () => {
    await expect(
      addToothRecord("00000000-0000-0000-0000-000000000000", { toothNumber: 11, status: "saudavel" })
    ).rejects.toThrow("UNAUTHENTICATED_OR_NO_TENANT");
  });
});

describe("Dental — cross-tenant isolation", () => {
  it("rejects operating on a patientId from another clinic", async () => {
    const ownerA = await createTestUser({ email: "da@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Dental A");
    const ownerB = await createTestUser({ email: "db@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Dental B");

    await loginAsOwnerOf(clinicA.id, "da@test.local");
    const patientInA = await createPatient({ name: "Paciente Só da A Dental" });

    await loginAsOwnerOf(clinicB.id, "db@test.local");
    await expect(getOrCreateDentalChart(patientInA.id)).rejects.toThrow("VALIDATION:patient_not_in_tenant");
    await expect(addToothRecord(patientInA.id, { toothNumber: 11, status: "saudavel" })).rejects.toThrow(
      "VALIDATION:patient_not_in_tenant"
    );
    await expect(listToothRecords(patientInA.id)).rejects.toThrow("VALIDATION:patient_not_in_tenant");
  });

  it("keeps two patients' dental charts (in different clinics) fully separate", async () => {
    const ownerA = await createTestUser({ email: "dc@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Dental C");
    const ownerB = await createTestUser({ email: "dd@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Dental D");

    await loginAsOwnerOf(clinicA.id, "dc@test.local");
    const patientA = await createPatient({ name: "Paciente A Dental" });
    await addToothRecord(patientA.id, { toothNumber: 11, status: "cariado" });

    await loginAsOwnerOf(clinicB.id, "dd@test.local");
    const patientB = await createPatient({ name: "Paciente B Dental" });
    const recordsForB = await listToothRecords(patientB.id);
    expect(recordsForB).toHaveLength(0);
  });

  it("does not leak cross-tenant tooth records through the server action layer either", async () => {
    const ownerA = await createTestUser({ email: "de@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Dental E");
    const ownerB = await createTestUser({ email: "df@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Dental F");

    await loginAsOwnerOf(clinicA.id, "de@test.local");
    const patientA = await createPatient({ name: "Paciente Ação Dental A" });
    const created = await addToothRecordAction(patientA.id, { toothNumber: 11, status: "saudavel" });
    expect(created.ok).toBe(true);

    await loginAsOwnerOf(clinicB.id, "df@test.local");
    const result = await listToothRecordsAction(patientA.id);
    expect(result.ok).toBe(false);
  });
});

describe("Dental — RBAC enforcement", () => {
  it("blocks a role without clinical_record.edit from adding a tooth record", async () => {
    const owner = await createTestUser({ email: "ownerR@test.local", password: "Password123!" });
    const { clinic, roles } = await createTestClinic(owner.id, "Clinic Dental RBAC");
    await loginAsOwnerOf(clinic.id, "ownerR@test.local");
    const patient = await createPatient({ name: "Paciente RBAC Dental" });

    // RECEPTIONIST has no clinical_record.* permissions per ROLE_PERMISSION_KEYS.
    const receptionUser = await createTestUser({ email: "receptionDental@test.local", password: "Password123!" });
    const db = await getDb();
    const receptionRole = roles.find((r) => r.key === "RECEPTIONIST")!;
    await db.insert(memberships).values({
      userId: receptionUser.id,
      clinicId: clinic.id,
      roleId: receptionRole.id,
      status: "active",
    });

    await loginAsOwnerOf(clinic.id, "receptionDental@test.local");
    const result = await addToothRecordAction(patient.id, { toothNumber: 11, status: "saudavel" });
    expect(result.ok).toBe(false);
  });

  it("blocks all dental actions when the DENTAL module is disabled for the clinic", async () => {
    const owner = await createTestUser({ email: "ownerM@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Dental Module Off");

    const db = await getDb();
    const { clinicModules, modules } = await import("@/db/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const [dentalModule] = await db.select().from(modules).where(eqOp(modules.key, "DENTAL")).limit(1);
    await db
      .update(clinicModules)
      .set({ enabled: false })
      .where(andOp(eqOp(clinicModules.clinicId, clinic.id), eqOp(clinicModules.moduleId, dentalModule.id)));

    await loginAsOwnerOf(clinic.id, "ownerM@test.local");
    const patient = await createPatient({ name: "Paciente Módulo Off Dental" });

    const result = await addToothRecordAction(patient.id, { toothNumber: 11, status: "saudavel" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/módulo/i);
  });
});
