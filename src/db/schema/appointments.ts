import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { users } from "./users";
import { patients } from "./patients";

/**
 * An appointment belongs to EXACTLY ONE clinic (tenant), same pattern as
 * patients. Every query in src/lib/agenda/agenda-service.ts filters by
 * clinicId from the server-resolved tenant context — never from client
 * input. See tests/agenda.test.ts for the cross-tenant guarantees.
 *
 * `professionalUserId` references `users.id` directly rather than a
 * dedicated "professional" entity — consistent with the Sprint 0
 * decision that "professional" is a membership/role today, not yet its
 * own business entity (see docs/REQUISITOS.md, pendência do Sprint 0).
 *
 * `serviceName` is a free-text field for now (matches the legacy
 * platform's service catalog concept loosely) — a proper `services`
 * catalog table is deferred to a future sprint; not needed to unblock
 * the core scheduling flow.
 */

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_TYPES = ["atendimento", "bloqueio"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),

    // Nullable: a "bloqueio" (time block) has no patient.
    patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),

    professionalUserId: uuid("professional_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: text("type").notNull().default("atendimento"), // AppointmentType
    serviceName: text("service_name"),

    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),

    status: text("status").notNull().default("scheduled"), // AppointmentStatus
    notes: text("notes"),

    // Marks fixtures created by `npm run db:seed`, same convention as
    // clinics.isDevSeedData and patients.isDevSeedData.
    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every calendar view query filters by clinicId + a date range on
    // startsAt — this composite index is what keeps that cheap.
    index("appointments_clinic_id_starts_at_idx").on(table.clinicId, table.startsAt),
    index("appointments_professional_starts_at_idx").on(table.professionalUserId, table.startsAt),
  ]
);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
