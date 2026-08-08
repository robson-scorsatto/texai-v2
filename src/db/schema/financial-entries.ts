import { pgTable, uuid, text, timestamp, boolean, integer, date, index } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { users } from "./users";
import { patients } from "./patients";
import { appointments } from "./appointments";

/**
 * A financial entry is one line item (receita/despesa) — tenant-scoped
 * same pattern as patients/appointments/clinical_records. See
 * src/lib/finance/finance-service.ts for the tenant-safety guarantees.
 *
 * Amounts are stored in cents (integer) to avoid floating-point rounding
 * issues — never store money as a float. `type` distinguishes revenue
 * from expense so the same table can back both "a receber" (receivable)
 * and clinic operating costs later, without a schema change.
 */

export const FINANCIAL_ENTRY_TYPES = ["receita", "despesa"] as const;
export type FinancialEntryType = (typeof FINANCIAL_ENTRY_TYPES)[number];

export const FINANCIAL_ENTRY_STATUSES = ["pending", "paid", "overdue", "cancelled"] as const;
export type FinancialEntryStatus = (typeof FINANCIAL_ENTRY_STATUSES)[number];

export const financialEntries = pgTable(
  "financial_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),

    // Nullable: a clinic expense (despesa) has no patient.
    patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),

    type: text("type").notNull().default("receita"), // FinancialEntryType
    status: text("status").notNull().default("pending"), // FinancialEntryStatus

    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),

    dueDate: date("due_date"),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every totals/list query filters by clinicId (+ often status or
    // patientId) — this composite index keeps the common case cheap.
    index("financial_entries_clinic_status_idx").on(table.clinicId, table.status),
    index("financial_entries_clinic_patient_idx").on(table.clinicId, table.patientId),
  ]
);

export type FinancialEntry = typeof financialEntries.$inferSelect;
export type NewFinancialEntry = typeof financialEntries.$inferInsert;
