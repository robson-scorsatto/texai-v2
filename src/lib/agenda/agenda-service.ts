import { and, asc, eq, gt, gte, lt, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  appointments,
  patients,
  memberships,
  users,
  services,
  type Appointment,
  type NewAppointment,
  type AppointmentStatus,
  type AppointmentType,
} from "@/db/schema";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";

/**
 * Tenant-safe service layer for Agenda (appointments). Same contract as
 * src/lib/patients/patients-service.ts: every function resolves
 * clinicId from the server-side tenant context, never from a caller
 * argument, so cross-tenant leakage is structurally impossible. Callers
 * (server actions) are responsible for hasModule('AGENDA') and the
 * relevant RBAC permission before calling in here.
 */

export type CreateAppointmentInput = {
  patientId?: string | null; // null/undefined only allowed when type === "bloqueio"
  professionalUserId: string;
  type?: AppointmentType;
  // Optional link to the service catalog (Sprint 12). If serviceName is
  // NOT explicitly provided, it's derived from services.name — pass
  // serviceName to override the display text without changing the link.
  serviceId?: string | null;
  serviceName?: string | null;
  startsAt: string; // ISO datetime
  endsAt: string; // ISO datetime
  notes?: string | null;
};

export type UpdateAppointmentInput = Partial<
  Omit<CreateAppointmentInput, "professionalUserId"> & { professionalUserId?: string }
>;

export type ListAppointmentsOptions = {
  from: string; // ISO datetime, inclusive
  to: string; // ISO datetime, exclusive
  professionalUserId?: string;
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

/** Verifies a patientId belongs to the current tenant. Throws otherwise. */
async function getServiceInTenant(db: Awaited<ReturnType<typeof getDb>>, clinicId: string, serviceId: string) {
  const [row] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.clinicId, clinicId)))
    .limit(1);
  if (!row) throw new Error("VALIDATION:service_not_in_tenant");
  return row;
}

async function assertPatientInTenant(db: Awaited<ReturnType<typeof getDb>>, clinicId: string, patientId: string) {
  const [row] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .limit(1);
  if (!row) throw new Error("VALIDATION:patient_not_in_tenant");
}

/** Verifies a professionalUserId has an active membership in the current tenant. Throws otherwise. */
async function assertProfessionalInTenant(
  db: Awaited<ReturnType<typeof getDb>>,
  clinicId: string,
  professionalUserId: string
) {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, professionalUserId),
        eq(memberships.clinicId, clinicId),
        eq(memberships.status, "active")
      )
    )
    .limit(1);
  if (!row) throw new Error("VALIDATION:professional_not_in_tenant");
}

/**
 * Checks whether a proposed [startsAt, endsAt) interval overlaps any
 * existing non-cancelled appointment for the same professional in this
 * clinic. `excludeAppointmentId` is used by updateAppointment so an
 * appointment doesn't conflict with itself.
 */
async function hasConflict(
  db: Awaited<ReturnType<typeof getDb>>,
  clinicId: string,
  professionalUserId: string,
  startsAt: Date,
  endsAt: Date,
  excludeAppointmentId?: string
): Promise<boolean> {
  const filters = [
    eq(appointments.clinicId, clinicId),
    eq(appointments.professionalUserId, professionalUserId),
    ne(appointments.status, "cancelled"),
    // Overlap test (half-open intervals [starts, ends)): existing.startsAt < newEndsAt
    // AND existing.endsAt > newStartsAt. Strict '>' on the second condition is what
    // allows back-to-back appointments (one ending exactly when the next starts).
    lt(appointments.startsAt, endsAt),
    gt(appointments.endsAt, startsAt),
  ];
  if (excludeAppointmentId) {
    filters.push(ne(appointments.id, excludeAppointmentId));
  }

  const [conflict] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(...filters))
    .limit(1);

  return !!conflict;
}

function validateInterval(startsAt: string, endsAt: string): { starts: Date; ends: Date } {
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    throw new Error("VALIDATION:invalid_datetime");
  }
  if (ends <= starts) {
    throw new Error("VALIDATION:ends_before_starts");
  }
  return { starts, ends };
}

export async function listAppointments(options: ListAppointmentsOptions) {
  const ctx = await requireTenant();
  const db = await getDb();

  const from = new Date(options.from);
  const to = new Date(options.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("VALIDATION:invalid_datetime");
  }

  const filters = [
    eq(appointments.clinicId, ctx.clinicId),
    gte(appointments.startsAt, from),
    lt(appointments.startsAt, to),
  ];
  if (options.professionalUserId) {
    filters.push(eq(appointments.professionalUserId, options.professionalUserId));
  }
  if (!options.includeCancelled) {
    filters.push(ne(appointments.status, "cancelled"));
  }

  return db
    .select()
    .from(appointments)
    .where(and(...filters))
    .orderBy(asc(appointments.startsAt));
}

export async function getAppointment(appointmentId: string): Promise<Appointment | null> {
  const ctx = await requireTenant();
  const db = await getDb();

  const [row] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, ctx.clinicId)))
    .limit(1);

  return row ?? null;
}

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  const ctx = await requireTenant();
  const db = await getDb();

  const type = input.type ?? "atendimento";
  if (type === "atendimento" && !input.patientId) {
    throw new Error("VALIDATION:patient_required_for_atendimento");
  }

  const { starts, ends } = validateInterval(input.startsAt, input.endsAt);

  await assertProfessionalInTenant(db, ctx.clinicId, input.professionalUserId);
  if (input.patientId) {
    await assertPatientInTenant(db, ctx.clinicId, input.patientId);
  }

  let resolvedServiceName = input.serviceName?.trim() || null;
  if (input.serviceId) {
    const service = await getServiceInTenant(db, ctx.clinicId, input.serviceId);
    if (!resolvedServiceName) resolvedServiceName = service.name;
  }

  const conflict = await hasConflict(db, ctx.clinicId, input.professionalUserId, starts, ends);
  if (conflict) {
    throw new Error("CONFLICT:schedule_overlap");
  }

  const values: NewAppointment = {
    clinicId: ctx.clinicId,
    patientId: input.patientId ?? null,
    professionalUserId: input.professionalUserId,
    type,
    serviceId: input.serviceId ?? null,
    serviceName: resolvedServiceName,
    startsAt: starts,
    endsAt: ends,
    status: "scheduled",
    notes: input.notes?.trim() || null,
    createdByUserId: ctx.userId,
  };

  const [created] = await db.insert(appointments).values(values).returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "agenda.create",
    objectType: "appointment",
    objectId: created.id,
    result: "success",
  });

  return created;
}

export async function updateAppointment(
  appointmentId: string,
  input: UpdateAppointmentInput
): Promise<Appointment> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getAppointment(appointmentId);
  if (!existing) {
    await recordAudit({
      userId: ctx.userId,
      clinicId: ctx.clinicId,
      action: "agenda.update",
      objectType: "appointment",
      objectId: appointmentId,
      result: "denied",
      metadata: { reason: "not_found_in_tenant" },
    });
    throw new Error("NOT_FOUND");
  }

  const nextProfessionalUserId = input.professionalUserId ?? existing.professionalUserId;
  const nextStartsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
  const nextEndsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;

  if (nextEndsAt <= nextStartsAt) {
    throw new Error("VALIDATION:ends_before_starts");
  }

  if (input.professionalUserId) {
    await assertProfessionalInTenant(db, ctx.clinicId, input.professionalUserId);
  }
  if (input.patientId) {
    await assertPatientInTenant(db, ctx.clinicId, input.patientId);
  }

  const timeOrProfessionalChanged =
    input.startsAt !== undefined || input.endsAt !== undefined || input.professionalUserId !== undefined;

  if (timeOrProfessionalChanged) {
    const conflict = await hasConflict(
      db,
      ctx.clinicId,
      nextProfessionalUserId,
      nextStartsAt,
      nextEndsAt,
      appointmentId
    );
    if (conflict) throw new Error("CONFLICT:schedule_overlap");
  }

  const patch: Partial<NewAppointment> = { updatedAt: new Date() };
  if (input.patientId !== undefined) patch.patientId = input.patientId;
  if (input.professionalUserId !== undefined) patch.professionalUserId = input.professionalUserId;
  if (input.type !== undefined) patch.type = input.type;
  if (input.serviceId !== undefined) {
    if (input.serviceId) await getServiceInTenant(db, ctx.clinicId, input.serviceId);
    patch.serviceId = input.serviceId;
  }
  if (input.serviceName !== undefined) patch.serviceName = input.serviceName?.trim() || null;
  if (input.startsAt !== undefined) patch.startsAt = nextStartsAt;
  if (input.endsAt !== undefined) patch.endsAt = nextEndsAt;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const [updated] = await db
    .update(appointments)
    .set(patch)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "agenda.update",
    objectType: "appointment",
    objectId: appointmentId,
    result: "success",
  });

  return updated;
}

async function setStatus(appointmentId: string, status: AppointmentStatus, action: string): Promise<Appointment> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getAppointment(appointmentId);
  if (!existing) {
    await recordAudit({
      userId: ctx.userId,
      clinicId: ctx.clinicId,
      action,
      objectType: "appointment",
      objectId: appointmentId,
      result: "denied",
      metadata: { reason: "not_found_in_tenant" },
    });
    throw new Error("NOT_FOUND");
  }

  const [updated] = await db
    .update(appointments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action,
    objectType: "appointment",
    objectId: appointmentId,
    result: "success",
  });

  return updated;
}

export async function cancelAppointment(appointmentId: string): Promise<Appointment> {
  return setStatus(appointmentId, "cancelled", "agenda.cancel");
}

export async function confirmAppointment(appointmentId: string): Promise<Appointment> {
  return setStatus(appointmentId, "confirmed", "agenda.confirm");
}

export async function completeAppointment(appointmentId: string): Promise<Appointment> {
  return setStatus(appointmentId, "completed", "agenda.complete");
}

export async function markNoShow(appointmentId: string): Promise<Appointment> {
  return setStatus(appointmentId, "no_show", "agenda.no_show");
}

/** Active clinic members (id + name) for the current tenant — used to populate the professional picker in the appointment form. */
export async function listClinicProfessionals() {
  const ctx = await requireTenant();
  const db = await getDb();

  return db
    .select({ userId: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.clinicId, ctx.clinicId), eq(memberships.status, "active")))
    .orderBy(asc(users.name));
}
