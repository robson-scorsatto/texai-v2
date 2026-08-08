import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  financialEntries,
  patients,
  appointments,
  type FinancialEntry,
  type NewFinancialEntry,
  type FinancialEntryType,
  type FinancialEntryStatus,
} from "@/db/schema";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";

/**
 * Tenant-safe service layer for Finance (financial entries). Same
 * contract as patients/agenda/clinical-records services: every
 * function resolves clinicId from the server-side tenant context,
 * never from a caller argument.
 *
 * Amounts are always integer cents — see schema doc comment for why.
 * Helpers `toCents`/`fromCents` at the bottom convert to/from the
 * decimal reais values the UI works with, in exactly one place.
 */

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}
export function fromCents(cents: number): number {
  return cents / 100;
}

export type CreateFinancialEntryInput = {
  patientId?: string | null;
  appointmentId?: string | null;
  type?: FinancialEntryType;
  description: string;
  amountCents: number;
  dueDate?: string | null; // ISO date string
};

export type UpdateFinancialEntryInput = Partial<
  Omit<CreateFinancialEntryInput, "type"> & { type?: FinancialEntryType }
>;

export type ListFinancialEntriesOptions = {
  patientId?: string;
  status?: FinancialEntryStatus;
  includeCancelled?: boolean;
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
 * Recomputes any `pending` entries whose dueDate has passed into
 * `overdue`. Called at the top of list/totals reads so the status is
 * always accurate without needing a cron job for this MVP. Scoped to
 * the current tenant only.
 */
async function sweepOverdue(db: Awaited<ReturnType<typeof getDb>>, clinicId: string) {
  const today = new Date().toISOString().slice(0, 10);
  await db
    .update(financialEntries)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        eq(financialEntries.clinicId, clinicId),
        eq(financialEntries.status, "pending"),
        sql`${financialEntries.dueDate} < ${today}`
      )
    );
}

export async function listFinancialEntries(options: ListFinancialEntriesOptions = {}) {
  const ctx = await requireTenant();
  const db = await getDb();
  await sweepOverdue(db, ctx.clinicId);

  const filters = [eq(financialEntries.clinicId, ctx.clinicId)];
  if (options.patientId) filters.push(eq(financialEntries.patientId, options.patientId));
  if (options.status) filters.push(eq(financialEntries.status, options.status));
  if (!options.includeCancelled && !options.status) {
    // default view excludes cancelled entries from the working list
  }

  const rows = await db
    .select()
    .from(financialEntries)
    .where(and(...filters))
    .orderBy(desc(financialEntries.createdAt));

  return options.includeCancelled || options.status
    ? rows
    : rows.filter((r) => r.status !== "cancelled");
}

/** Aggregate totals for the clinic's dashboard/overview: a receber, recebido, em atraso. */
export async function getFinancialTotals() {
  const ctx = await requireTenant();
  const db = await getDb();
  await sweepOverdue(db, ctx.clinicId);

  const rows = await db
    .select({ status: financialEntries.status, amountCents: financialEntries.amountCents, type: financialEntries.type })
    .from(financialEntries)
    .where(and(eq(financialEntries.clinicId, ctx.clinicId), eq(financialEntries.type, "receita")));

  let receivable = 0;
  let received = 0;
  let overdue = 0;
  for (const row of rows) {
    if (row.status === "pending") receivable += row.amountCents;
    else if (row.status === "paid") received += row.amountCents;
    else if (row.status === "overdue") overdue += row.amountCents;
  }

  return { receivableCents: receivable, receivedCents: received, overdueCents: overdue };
}

export async function getFinancialEntry(entryId: string): Promise<FinancialEntry | null> {
  const ctx = await requireTenant();
  const db = await getDb();

  const [row] = await db
    .select()
    .from(financialEntries)
    .where(and(eq(financialEntries.id, entryId), eq(financialEntries.clinicId, ctx.clinicId)))
    .limit(1);

  return row ?? null;
}

export async function createFinancialEntry(input: CreateFinancialEntryInput): Promise<FinancialEntry> {
  const ctx = await requireTenant();
  const db = await getDb();

  if (!input.description || input.description.trim().length === 0) {
    throw new Error("VALIDATION:description_required");
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("VALIDATION:amount_must_be_positive");
  }

  if (input.patientId) await assertPatientInTenant(db, ctx.clinicId, input.patientId);
  if (input.appointmentId) await assertAppointmentInTenant(db, ctx.clinicId, input.appointmentId);

  const values: NewFinancialEntry = {
    clinicId: ctx.clinicId,
    patientId: input.patientId ?? null,
    appointmentId: input.appointmentId ?? null,
    type: input.type ?? "receita",
    status: "pending",
    description: input.description.trim(),
    amountCents: input.amountCents,
    dueDate: input.dueDate ?? null,
    createdByUserId: ctx.userId,
  };

  const [created] = await db.insert(financialEntries).values(values).returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "financial.create",
    objectType: "financial_entry",
    objectId: created.id,
    result: "success",
  });

  return created;
}

export async function updateFinancialEntry(
  entryId: string,
  input: UpdateFinancialEntryInput
): Promise<FinancialEntry> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getFinancialEntry(entryId);
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status === "paid" || existing.status === "cancelled") {
    throw new Error(`IMMUTABLE:entry_${existing.status}`);
  }

  if (input.amountCents !== undefined && (!Number.isInteger(input.amountCents) || input.amountCents <= 0)) {
    throw new Error("VALIDATION:amount_must_be_positive");
  }
  if (input.patientId) await assertPatientInTenant(db, ctx.clinicId, input.patientId);
  if (input.appointmentId) await assertAppointmentInTenant(db, ctx.clinicId, input.appointmentId);

  const patch: Partial<NewFinancialEntry> = { updatedAt: new Date() };
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.amountCents !== undefined) patch.amountCents = input.amountCents;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.patientId !== undefined) patch.patientId = input.patientId;
  if (input.appointmentId !== undefined) patch.appointmentId = input.appointmentId;
  if (input.type !== undefined) patch.type = input.type;

  const [updated] = await db
    .update(financialEntries)
    .set(patch)
    .where(and(eq(financialEntries.id, entryId), eq(financialEntries.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "financial.update",
    objectType: "financial_entry",
    objectId: entryId,
    result: "success",
  });

  return updated;
}

export async function markAsPaid(entryId: string): Promise<FinancialEntry> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getFinancialEntry(entryId);
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status === "cancelled") throw new Error("IMMUTABLE:entry_cancelled");
  if (existing.status === "paid") throw new Error("IMMUTABLE:entry_paid");

  const [updated] = await db
    .update(financialEntries)
    .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(financialEntries.id, entryId), eq(financialEntries.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "financial.mark_paid",
    objectType: "financial_entry",
    objectId: entryId,
    result: "success",
  });

  return updated;
}

export async function cancelFinancialEntry(entryId: string): Promise<FinancialEntry> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getFinancialEntry(entryId);
  if (!existing) {
    await recordAudit({
      userId: ctx.userId,
      clinicId: ctx.clinicId,
      action: "financial.cancel",
      objectType: "financial_entry",
      objectId: entryId,
      result: "denied",
      metadata: { reason: "not_found_in_tenant" },
    });
    throw new Error("NOT_FOUND");
  }
  if (existing.status === "paid") throw new Error("IMMUTABLE:entry_paid");

  const [updated] = await db
    .update(financialEntries)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(financialEntries.id, entryId), eq(financialEntries.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "financial.cancel",
    objectType: "financial_entry",
    objectId: entryId,
    result: "success",
  });

  return updated;
}
