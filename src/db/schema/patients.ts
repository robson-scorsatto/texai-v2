import { pgTable, uuid, text, timestamp, boolean, date, index } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { users } from "./users";

/**
 * A patient belongs to EXACTLY ONE clinic (tenant). Every query in
 * src/lib/patients/patients-service.ts filters by clinicId taken from
 * the server-resolved tenant context — never from client input. See
 * tests/patients.test.ts for the cross-tenant guarantees.
 *
 * Deliberately minimal for Sprint 6 (matches the legacy platform audit's
 * finding that a lean patient form reduces friction — see
 * TEXAI_Auditoria_01.docx, seção 23/26). Anamnese, prontuário, imagens,
 * documentos and financeiro-per-patient are separate modules/tables that
 * will reference patients.id later (Sprints 9, 11, 14) — not duplicated
 * here.
 */
export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    phone: text("phone"),
    prefersWhatsapp: boolean("prefers_whatsapp").notNull().default(true),
    email: text("email"),
    cpf: text("cpf"),
    birthDate: date("birth_date"),
    notes: text("notes"),

    // Soft delete only — a patient record is never hard-deleted from the
    // app (health data retention; see prompt mestre item 38, LGPD). What
    // "patients.delete" permission actually does is deactivate.
    isActive: boolean("is_active").notNull().default(true),

    // Marks fixtures created by `npm run db:seed`, same convention as
    // clinics.isDevSeedData — never true in a real clinic's data.
    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every list/search query filters by clinicId first — this index is
    // what keeps that filter cheap as the table grows.
    index("patients_clinic_id_idx").on(table.clinicId),
    index("patients_clinic_id_name_idx").on(table.clinicId, table.name),
  ]
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
