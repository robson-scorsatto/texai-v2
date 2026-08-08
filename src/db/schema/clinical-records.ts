import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { users } from "./users";
import { patients } from "./patients";
import { appointments } from "./appointments";

/**
 * A clinical record is one timeline entry in a patient's prontuário
 * (evolução, anamnese, procedimento realizado, etc.) — tenant-scoped
 * same pattern as patients/appointments. See src/lib/clinical-records/
 * clinical-records-service.ts for the tenant-safety guarantees.
 *
 * Once `signedAt` is set, the entry is immutable — this mirrors real
 * clinical practice (a signed record is a legal document; corrections
 * happen via a NEW entry, never by editing history). The service layer
 * enforces this, not a DB constraint, so the reasoning is visible and
 * testable in one place.
 */

export const CLINICAL_RECORD_TYPES = ["evolucao", "anamnese", "procedimento"] as const;
export type ClinicalRecordType = (typeof CLINICAL_RECORD_TYPES)[number];

export const clinicalRecords = pgTable(
  "clinical_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),

    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),

    // Optional link to the appointment this entry documents — nullable
    // because not every record originates from a scheduled visit (e.g.
    // a phone consult note, or migrated legacy history).
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),

    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    recordType: text("record_type").notNull().default("evolucao"), // ClinicalRecordType
    content: text("content").notNull(),

    // Immutability gate — see module doc comment above.
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedByUserId: uuid("signed_by_user_id").references(() => users.id, { onDelete: "set null" }),

    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Timeline queries always filter by clinicId + patientId, ordered
    // by createdAt — this composite index is what keeps that cheap.
    index("clinical_records_clinic_patient_idx").on(table.clinicId, table.patientId),
  ]
);

export type ClinicalRecord = typeof clinicalRecords.$inferSelect;
export type NewClinicalRecord = typeof clinicalRecords.$inferInsert;
