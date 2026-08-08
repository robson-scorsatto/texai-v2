import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { patients, type Patient, type NewPatient } from "@/db/schema";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";

/**
 * Tenant-safe service layer for Patients. Every exported function here
 * resolves clinicId from the server-side tenant context (never from a
 * caller-supplied argument) — this is what makes cross-tenant leakage
 * structurally impossible rather than just "usually correct". Callers
 * (server actions) are responsible for checking hasModule('PATIENTS')
 * and the relevant RBAC permission BEFORE calling into this file; this
 * file's job is tenant isolation, not authorization.
 */

export type CreatePatientInput = {
  name: string;
  phone?: string | null;
  prefersWhatsapp?: boolean;
  email?: string | null;
  cpf?: string | null;
  birthDate?: string | null; // ISO date string (YYYY-MM-DD)
  notes?: string | null;
};

export type UpdatePatientInput = Partial<CreatePatientInput>;

export type ListPatientsOptions = {
  search?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
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

export async function listPatients(options: ListPatientsOptions = {}) {
  const ctx = await requireTenant();
  const db = await getDb();

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const filters = [eq(patients.clinicId, ctx.clinicId)];
  if (!options.includeInactive) {
    filters.push(eq(patients.isActive, true));
  }
  if (options.search && options.search.trim().length > 0) {
    const term = `%${options.search.trim()}%`;
    filters.push(
      or(ilike(patients.name, term), ilike(patients.phone, term), ilike(patients.email, term))!
    );
  }

  const where = and(...filters);

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(patients)
      .where(where)
      .orderBy(asc(patients.name))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(patients).where(where),
  ]);

  return { patients: rows, total, page, pageSize };
}

/**
 * Fetches a single patient scoped to the current tenant. Returns null
 * (not the row from another clinic) if the id belongs to a different
 * clinic — this is the crux of the cross-tenant guarantee and is
 * covered by tests/patients.test.ts.
 */
export async function getPatient(patientId: string): Promise<Patient | null> {
  const ctx = await requireTenant();
  const db = await getDb();

  const [row] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, ctx.clinicId)))
    .limit(1);

  return row ?? null;
}

export async function createPatient(input: CreatePatientInput): Promise<Patient> {
  const ctx = await requireTenant();
  const db = await getDb();

  if (!input.name || input.name.trim().length === 0) {
    throw new Error("VALIDATION:name_required");
  }

  const values: NewPatient = {
    clinicId: ctx.clinicId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    prefersWhatsapp: input.prefersWhatsapp ?? true,
    email: input.email?.trim() || null,
    cpf: input.cpf?.trim() || null,
    birthDate: input.birthDate || null,
    notes: input.notes?.trim() || null,
    createdByUserId: ctx.userId,
  };

  const [created] = await db.insert(patients).values(values).returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "patients.create",
    objectType: "patient",
    objectId: created.id,
    result: "success",
  });

  return created;
}

export async function updatePatient(patientId: string, input: UpdatePatientInput): Promise<Patient> {
  const ctx = await requireTenant();
  const db = await getDb();

  // Re-fetch scoped to tenant first — guarantees we never even attempt
  // to update a row belonging to another clinic.
  const existing = await getPatient(patientId);
  if (!existing) {
    await recordAudit({
      userId: ctx.userId,
      clinicId: ctx.clinicId,
      action: "patients.update",
      objectType: "patient",
      objectId: patientId,
      result: "denied",
      metadata: { reason: "not_found_in_tenant" },
    });
    throw new Error("NOT_FOUND");
  }

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new Error("VALIDATION:name_required");
  }

  const patch: Partial<NewPatient> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.prefersWhatsapp !== undefined) patch.prefersWhatsapp = input.prefersWhatsapp;
  if (input.email !== undefined) patch.email = input.email?.trim() || null;
  if (input.cpf !== undefined) patch.cpf = input.cpf?.trim() || null;
  if (input.birthDate !== undefined) patch.birthDate = input.birthDate || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const [updated] = await db
    .update(patients)
    .set(patch)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "patients.update",
    objectType: "patient",
    objectId: patientId,
    result: "success",
  });

  return updated;
}

/** Soft-delete: sets isActive = false. Patients are never hard-deleted. */
export async function deactivatePatient(patientId: string): Promise<Patient> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getPatient(patientId);
  if (!existing) {
    await recordAudit({
      userId: ctx.userId,
      clinicId: ctx.clinicId,
      action: "patients.deactivate",
      objectType: "patient",
      objectId: patientId,
      result: "denied",
      metadata: { reason: "not_found_in_tenant" },
    });
    throw new Error("NOT_FOUND");
  }

  const [updated] = await db
    .update(patients)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "patients.deactivate",
    objectType: "patient",
    objectId: patientId,
    result: "success",
  });

  return updated;
}

export async function reactivatePatient(patientId: string): Promise<Patient> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getPatient(patientId);
  if (!existing) throw new Error("NOT_FOUND");

  const [updated] = await db
    .update(patients)
    .set({ isActive: true, updatedAt: new Date() })
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "patients.reactivate",
    objectType: "patient",
    objectId: patientId,
    result: "success",
  });

  return updated;
}
