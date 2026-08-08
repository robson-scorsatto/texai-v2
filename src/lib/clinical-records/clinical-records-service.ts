import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  clinicalRecords,
  patients,
  appointments,
  type ClinicalRecord,
  type NewClinicalRecord,
  type ClinicalRecordType,
} from "@/db/schema";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";

/**
 * Tenant-safe service layer for the Prontuário Clínico (clinical
 * records timeline). Same contract as patients-service.ts and
 * agenda-service.ts: every function resolves clinicId from the
 * server-side tenant context, never from a caller argument.
 *
 * Immutability rule: once a record has `signedAt` set, it can never be
 * edited again — only new entries can be added to the timeline. This
 * mirrors real clinical/legal practice and is enforced here, in one
 * place, rather than scattered across callers.
 */

export type CreateClinicalRecordInput = {
  patientId: string;
  appointmentId?: string | null;
  recordType?: ClinicalRecordType;
  content: string;
};

class TenantResolutionError extends Error {
  constructor() {
    super("UNAUTHENTICATED_OR_NO_TENANT");
  }
}

async function requireTenant() {
  const ctx = await resolveTenantContext();
  if (!ctx) throw new TenantResolutionError();
  return ctx;
}

async function assertPatientInTenant(db: Awaited<ReturnType<typeof getDb>>, clinicId: string, patientId: string) {
  const [row] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .limit(1);
  if (!row) throw new Error("VALIDATION:patient_not_in_tenant");
}

async function assertAppointmentInTenant(
  db: Awaited<ReturnType<typeof getDb>>,
  clinicId: string,
  appointmentId: string
) {
  const [row] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .limit(1);
  if (!row) throw new Error("VALIDATION:appointment_not_in_tenant");
}

/**
 * Lists a patient's clinical record timeline, oldest first. `patientId`
 * is re-verified to belong to the current tenant — a bad id from
 * another clinic returns an empty list, not another clinic's data.
 */
export async function listClinicalRecords(patientId: string): Promise<ClinicalRecord[]> {
  const ctx = await requireTenant();
  const db = await getDb();

  await assertPatientInTenant(db, ctx.clinicId, patientId);

  return db
    .select()
    .from(clinicalRecords)
    .where(and(eq(clinicalRecords.clinicId, ctx.clinicId), eq(clinicalRecords.patientId, patientId)))
    .orderBy(asc(clinicalRecords.createdAt));
}

export async function getClinicalRecord(recordId: string): Promise<ClinicalRecord | null> {
  const ctx = await requireTenant();
  const db = await getDb();

  const [row] = await db
    .select()
    .from(clinicalRecords)
    .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.clinicId, ctx.clinicId)))
    .limit(1);

  return row ?? null;
}

export async function createClinicalRecord(input: CreateClinicalRecordInput): Promise<ClinicalRecord> {
  const ctx = await requireTenant();
  const db = await getDb();

  if (!input.content || input.content.trim().length === 0) {
    throw new Error("VALIDATION:content_required");
  }

  await assertPatientInTenant(db, ctx.clinicId, input.patientId);
  if (input.appointmentId) {
    await assertAppointmentInTenant(db, ctx.clinicId, input.appointmentId);
  }

  const values: NewClinicalRecord = {
    clinicId: ctx.clinicId,
    patientId: input.patientId,
    appointmentId: input.appointmentId ?? null,
    authorUserId: ctx.userId,
    recordType: input.recordType ?? "evolucao",
    content: input.content.trim(),
  };

  const [created] = await db.insert(clinicalRecords).values(values).returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "clinical_record.create",
    objectType: "clinical_record",
    objectId: created.id,
    result: "success",
  });

  return created;
}

/**
 * Edits an UNSIGNED clinical record. Throws IMMUTABLE if the record has
 * already been signed — the only way to "correct" a signed entry is to
 * add a new one, never to alter history.
 */
export async function updateClinicalRecord(recordId: string, content: string): Promise<ClinicalRecord> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getClinicalRecord(recordId);
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.signedAt) {
    await recordAudit({
      userId: ctx.userId,
      clinicId: ctx.clinicId,
      action: "clinical_record.update",
      objectType: "clinical_record",
      objectId: recordId,
      result: "denied",
      metadata: { reason: "record_already_signed" },
    });
    throw new Error("IMMUTABLE:already_signed");
  }

  if (!content || content.trim().length === 0) {
    throw new Error("VALIDATION:content_required");
  }

  const [updated] = await db
    .update(clinicalRecords)
    .set({ content: content.trim(), updatedAt: new Date() })
    .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "clinical_record.update",
    objectType: "clinical_record",
    objectId: recordId,
    result: "success",
  });

  return updated;
}

/** Signs a record, making it permanently immutable. Idempotent-safe: re-signing an already-signed record just throws IMMUTABLE, it never overwrites the original signer/timestamp. */
export async function signClinicalRecord(recordId: string): Promise<ClinicalRecord> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getClinicalRecord(recordId);
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.signedAt) {
    throw new Error("IMMUTABLE:already_signed");
  }

  const [updated] = await db
    .update(clinicalRecords)
    .set({ signedAt: new Date(), signedByUserId: ctx.userId, updatedAt: new Date() })
    .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "clinical_record.sign",
    objectType: "clinical_record",
    objectId: recordId,
    result: "success",
  });

  return updated;
}
