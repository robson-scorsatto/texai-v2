import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import {
  listClinicalRecords,
  getClinicalRecord,
  createClinicalRecord,
  updateClinicalRecord,
  signClinicalRecord,
} from "@/lib/clinical-records/clinical-records-service";
import { createPatient } from "@/lib/patients/patients-service";
import {
  createClinicalRecordAction,
  getClinicalRecordAction,
  updateClinicalRecordAction,
} from "@/app/actions/clinical-records-actions";

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

describe("Clinical records — service layer CRUD", () => {
  it("creates, reads, updates and lists records for a patient", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic CR CRUD");
    await loginAsOwnerOf(clinic.id, "owner@test.local");
    const patient = await createPatient({ name: "Paciente Prontuário" });

    const created = await createClinicalRecord({
      patientId: patient.id,
      recordType: "evolucao",
      content: "Primeira evolução.",
    });
    expect(created.clinicId).toBe(clinic.id);
    expect(created.signedAt).toBeNull();

    const fetched = await getClinicalRecord(created.id);
    expect(fetched?.id).toBe(created.id);

    const updated = await updateClinicalRecord(created.id, "Evolução corrigida.");
    expect(updated.content).toBe("Evolução corrigida.");

    await createClinicalRecord({ patientId: patient.id, content: "Segunda entrada." });
    const timeline = await listClinicalRecords(patient.id);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].content).toBe("Evolução corrigida.");
  });

  it("rejects creating a record with empty content", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic CR Validation");
    await loginAsOwnerOf(clinic.id, "owner2@test.local");
    const patient = await createPatient({ name: "Paciente Validação" });

    await expect(
      createClinicalRecord({ patientId: patient.id, content: "   " })
    ).rejects.toThrow("VALIDATION:content_required");
  });

  it("throws when the caller has no resolved tenant context", async () => {
    await expect(
      createClinicalRecord({ patientId: "00000000-0000-0000-0000-000000000000", content: "x" })
    ).rejects.toThrow("UNAUTHENTICATED_OR_NO_TENANT");
  });
});

describe("Clinical records — signature immutability", () => {
  it("signs a record and then blocks further edits", async () => {
    const owner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic CR Sign");
    await loginAsOwnerOf(clinic.id, "owner3@test.local");
    const patient = await createPatient({ name: "Paciente Assinatura" });

    const record = await createClinicalRecord({ patientId: patient.id, content: "Conteúdo original." });
    const signed = await signClinicalRecord(record.id);
    expect(signed.signedAt).not.toBeNull();
    expect(signed.signedByUserId).toBe(owner.id);

    await expect(updateClinicalRecord(record.id, "Tentativa de alterar histórico.")).rejects.toThrow(
      "IMMUTABLE:already_signed"
    );
  });

  it("rejects signing an already-signed record a second time", async () => {
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic CR Double Sign");
    await loginAsOwnerOf(clinic.id, "owner4@test.local");
    const patient = await createPatient({ name: "Paciente Dupla Assinatura" });

    const record = await createClinicalRecord({ patientId: patient.id, content: "Conteúdo." });
    await signClinicalRecord(record.id);

    await expect(signClinicalRecord(record.id)).rejects.toThrow("IMMUTABLE:already_signed");
  });

  it("still allows adding a NEW entry after a previous one was signed", async () => {
    const owner = await createTestUser({ email: "owner5@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic CR New After Sign");
    await loginAsOwnerOf(clinic.id, "owner5@test.local");
    const patient = await createPatient({ name: "Paciente Nova Entrada" });

    const first = await createClinicalRecord({ patientId: patient.id, content: "Entrada original." });
    await signClinicalRecord(first.id);

    const second = await createClinicalRecord({ patientId: patient.id, content: "Correção via nova entrada." });
    expect(second.id).not.toBe(first.id);

    const timeline = await listClinicalRecords(patient.id);
    expect(timeline).toHaveLength(2);
  });
});

describe("Clinical records — cross-tenant isolation", () => {
  it("never returns a clinical record that belongs to a different clinic", async () => {
    const ownerA = await createTestUser({ email: "ca@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic CR A");
    const ownerB = await createTestUser({ email: "cb@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic CR B");

    await loginAsOwnerOf(clinicA.id, "ca@test.local");
    const patientA = await createPatient({ name: "Paciente CR A" });
    const recordInA = await createClinicalRecord({ patientId: patientA.id, content: "Registro da clínica A." });

    await loginAsOwnerOf(clinicB.id, "cb@test.local");
    const leaked = await getClinicalRecord(recordInA.id);
    expect(leaked).toBeNull();

    await expect(updateClinicalRecord(recordInA.id, "Hackeado")).rejects.toThrow("NOT_FOUND");
    await expect(signClinicalRecord(recordInA.id)).rejects.toThrow("NOT_FOUND");
  });

  it("rejects creating a record for a patientId that belongs to another clinic", async () => {
    const ownerA = await createTestUser({ email: "cc@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic CR C");
    const ownerB = await createTestUser({ email: "cd@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic CR D");

    await loginAsOwnerOf(clinicA.id, "cc@test.local");
    const patientInA = await createPatient({ name: "Paciente Só da A2" });

    await loginAsOwnerOf(clinicB.id, "cd@test.local");
    await expect(
      createClinicalRecord({ patientId: patientInA.id, content: "Tentativa cross-tenant." })
    ).rejects.toThrow("VALIDATION:patient_not_in_tenant");
  });

  it("returns an empty timeline (not another clinic's data) when listing by a cross-tenant patientId", async () => {
    const ownerA = await createTestUser({ email: "ce@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic CR E");
    const ownerB = await createTestUser({ email: "cf@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic CR F");

    await loginAsOwnerOf(clinicA.id, "ce@test.local");
    const patientInA = await createPatient({ name: "Paciente Só da A3" });
    await createClinicalRecord({ patientId: patientInA.id, content: "Só visível na clínica A." });

    await loginAsOwnerOf(clinicB.id, "cf@test.local");
    await expect(listClinicalRecords(patientInA.id)).rejects.toThrow("VALIDATION:patient_not_in_tenant");
  });

  it("does not leak a cross-tenant clinical record through the server action layer either", async () => {
    const ownerA = await createTestUser({ email: "cg@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic CR G");
    const ownerB = await createTestUser({ email: "ch@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic CR H");

    await loginAsOwnerOf(clinicA.id, "cg@test.local");
    const patientA = await createPatient({ name: "Paciente Ação CR A" });
    const created = await createClinicalRecordAction({ patientId: patientA.id, content: "Via action." });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");

    await loginAsOwnerOf(clinicB.id, "ch@test.local");
    const result = await getClinicalRecordAction(created.data.id);
    expect(result.ok).toBe(false);

    const updateResult = await updateClinicalRecordAction(created.data.id, "Tentativa via action.");
    expect(updateResult.ok).toBe(false);
  });
});

describe("Clinical records — RBAC enforcement", () => {
  it("blocks a role without clinical_record.edit from creating a record", async () => {
    const owner = await createTestUser({ email: "ownerR@test.local", password: "Password123!" });
    const { clinic, roles } = await createTestClinic(owner.id, "Clinic CR RBAC");
    await loginAsOwnerOf(clinic.id, "ownerR@test.local");
    const patient = await createPatient({ name: "Paciente RBAC" });

    // RECEPTIONIST role has no clinical_record.* permissions per ROLE_PERMISSION_KEYS.
    const receptionUser = await createTestUser({ email: "receptionCR@test.local", password: "Password123!" });
    const db = await getDb();
    const receptionRole = roles.find((r) => r.key === "RECEPTIONIST")!;
    await db.insert(memberships).values({
      userId: receptionUser.id,
      clinicId: clinic.id,
      roleId: receptionRole.id,
      status: "active",
    });

    await loginAsOwnerOf(clinic.id, "receptionCR@test.local");
    const result = await createClinicalRecordAction({ patientId: patient.id, content: "Não deveria existir." });
    expect(result.ok).toBe(false);
  });

  it("blocks all clinical record actions when the CLINICAL_RECORD module is disabled for the clinic", async () => {
    const owner = await createTestUser({ email: "ownerM@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic CR Module Off");
    const patient0Owner = owner;

    const db = await getDb();
    const { clinicModules, modules } = await import("@/db/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const [crModule] = await db.select().from(modules).where(eqOp(modules.key, "CLINICAL_RECORD")).limit(1);
    await db
      .update(clinicModules)
      .set({ enabled: false })
      .where(andOp(eqOp(clinicModules.clinicId, clinic.id), eqOp(clinicModules.moduleId, crModule.id)));

    await loginAsOwnerOf(clinic.id, "ownerM@test.local");
    const patient = await createPatient({ name: "Paciente Módulo Off" });

    const result = await createClinicalRecordAction({ patientId: patient.id, content: "Bloqueado por módulo." });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/módulo/i);
  });
});
