import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  dentalCharts,
  toothRecords,
  patients,
  type DentalChart,
  type ToothRecord,
  type NewToothRecord,
  type DentitionType,
  type ToothStatus,
} from "@/db/schema";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";

/**
 * Tenant-safe service layer for the Odontograma (dental chart). This
 * module is an extension of Prontuário Clínico (Sprint 8), reusing its
 * clinical_record.* RBAC permissions rather than inventing a parallel
 * permission set — a dental chart entry IS a clinical record in spirit.
 *
 * Same contract as every other service in this codebase: clinicId is
 * always resolved from the server-side tenant context, never passed in
 * by the caller.
 */

export type AddToothRecordInput = {
  toothNumber: number;
  status: ToothStatus;
  procedureNote?: string | null;
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

function assertValidToothNumber(toothNumber: number) {
  // FDI notation: quadrants 1-8 (permanent 1-4, deciduous 5-8), positions 1-8.
  const quadrant = Math.floor(toothNumber / 10);
  const position = toothNumber % 10;
  const validQuadrants = [1, 2, 3, 4, 5, 6, 7, 8];
  if (!validQuadrants.includes(quadrant) || position < 1 || position > 8) {
    throw new Error("VALIDATION:invalid_tooth_number");
  }
}

/**
 * Returns the patient's dental chart, creating one (defaulting to
 * "permanente" dentition) if it doesn't exist yet. `patientId` is
 * re-verified to belong to the current tenant.
 */
export async function getOrCreateDentalChart(
  patientId: string,
  dentitionType: DentitionType = "permanente"
): Promise<DentalChart> {
  const ctx = await requireTenant();
  const db = await getDb();

  await assertPatientInTenant(db, ctx.clinicId, patientId);

  const [existing] = await db
    .select()
    .from(dentalCharts)
    .where(and(eq(dentalCharts.patientId, patientId), eq(dentalCharts.clinicId, ctx.clinicId)))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(dentalCharts)
    .values({ clinicId: ctx.clinicId, patientId, dentitionType })
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "dental.chart_create",
    objectType: "dental_chart",
    objectId: created.id,
    result: "success",
  });

  return created;
}

/** Lists all tooth records for a patient's chart, oldest first, tenant-scoped. */
export async function listToothRecords(patientId: string): Promise<ToothRecord[]> {
  const ctx = await requireTenant();
  const db = await getDb();

  await assertPatientInTenant(db, ctx.clinicId, patientId);

  const [chart] = await db
    .select()
    .from(dentalCharts)
    .where(and(eq(dentalCharts.patientId, patientId), eq(dentalCharts.clinicId, ctx.clinicId)))
    .limit(1);
  if (!chart) return [];

  return db
    .select()
    .from(toothRecords)
    .where(and(eq(toothRecords.dentalChartId, chart.id), eq(toothRecords.clinicId, ctx.clinicId)))
    .orderBy(asc(toothRecords.createdAt));
}

export async function addToothRecord(
  patientId: string,
  input: AddToothRecordInput
): Promise<ToothRecord> {
  const ctx = await requireTenant();
  const db = await getDb();

  assertValidToothNumber(input.toothNumber);

  const chart = await getOrCreateDentalChart(patientId);

  const values: NewToothRecord = {
    clinicId: ctx.clinicId,
    dentalChartId: chart.id,
    toothNumber: input.toothNumber,
    status: input.status,
    procedureNote: input.procedureNote?.trim() || null,
    authorUserId: ctx.userId,
  };

  const [created] = await db.insert(toothRecords).values(values).returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "dental.tooth_record_create",
    objectType: "tooth_record",
    objectId: created.id,
    result: "success",
    metadata: { toothNumber: input.toothNumber, status: input.status },
  });

  return created;
}

/**
 * Returns the CURRENT status of every tooth that has at least one
 * record — i.e. the most recent status per toothNumber — used to
 * render the chart's visual state without the UI having to reduce the
 * full history itself.
 */
export async function getCurrentToothStatuses(patientId: string): Promise<Map<number, ToothStatus>> {
  const records = await listToothRecords(patientId);
  const byTooth = new Map<number, ToothStatus>();
  for (const r of records) {
    byTooth.set(r.toothNumber, r.status as ToothStatus);
  }
  return byTooth;
}
