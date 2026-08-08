import { pgTable, uuid, text, timestamp, boolean, integer, index, unique } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { users } from "./users";
import { patients } from "./patients";
import { clinicalRecords } from "./clinical-records";

/**
 * Dental module — an extension of Prontuário Clínico (Sprint 8), not a
 * parallel system. `dentalCharts` is a 1:1 record per patient marking
 * which dentition applies (permanente/decídua) — matches the legacy
 * platform's odontograma screen (see Auditoria 01, seção 3.2). Each
 * individual procedure on a tooth is a `toothRecords` row; it may
 * optionally point at a `clinical_records` entry that documents it in
 * the prontuário timeline, but does not require one (a quick chart
 * update doesn't always need a full clinical note).
 *
 * Tooth numbering uses the FDI two-digit notation (11–18, 21–28, 31–38,
 * 41–48 for permanent; 51–55, 61–65, 71–75, 81–85 for deciduous) — the
 * international dental standard, stored as plain integers.
 */

export const DENTITION_TYPES = ["permanente", "deciduo"] as const;
export type DentitionType = (typeof DENTITION_TYPES)[number];

export const TOOTH_STATUSES = [
  "saudavel",
  "cariado",
  "restaurado",
  "extraido",
  "implante",
  "em_tratamento",
] as const;
export type ToothStatus = (typeof TOOTH_STATUSES)[number];

export const dentalCharts = pgTable(
  "dental_charts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),

    dentitionType: text("dentition_type").notNull().default("permanente"), // DentitionType

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One chart per patient — getOrCreateDentalChart() relies on this.
    unique("dental_charts_patient_unique").on(table.patientId),
    index("dental_charts_clinic_id_idx").on(table.clinicId),
  ]
);

export const toothRecords = pgTable(
  "tooth_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    dentalChartId: uuid("dental_chart_id")
      .notNull()
      .references(() => dentalCharts.id, { onDelete: "cascade" }),

    toothNumber: integer("tooth_number").notNull(), // FDI notation
    status: text("status").notNull().default("saudavel"), // ToothStatus
    procedureNote: text("procedure_note"),

    // Optional link into the prontuário timeline (Sprint 8) — a tooth
    // record can document itself there without requiring it.
    clinicalRecordId: uuid("clinical_record_id").references(() => clinicalRecords.id, {
      onDelete: "set null",
    }),

    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Timeline-per-tooth queries filter by dentalChartId + toothNumber.
    index("tooth_records_chart_tooth_idx").on(table.dentalChartId, table.toothNumber),
  ]
);

export type DentalChart = typeof dentalCharts.$inferSelect;
export type NewDentalChart = typeof dentalCharts.$inferInsert;
export type ToothRecord = typeof toothRecords.$inferSelect;
export type NewToothRecord = typeof toothRecords.$inferInsert;
