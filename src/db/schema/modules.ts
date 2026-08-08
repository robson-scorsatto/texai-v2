import { pgTable, uuid, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";

/**
 * Global catalog of modules the platform can offer (CORE, PATIENTS, AGENDA,
 * CLINICAL_RECORD, DENTAL, WHATSAPP, AUTOMATIONS, FINANCE, STOCK, REPORTS,
 * AI, DOCUMENTS...). CORE is always enabled for every clinic and cannot be
 * disabled — see src/db/seed.ts.
 */
export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // e.g. "PATIENTS", "WHATSAPP"
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  isCore: boolean("is_core").notNull().default(false),
});

/**
 * Which modules are enabled for which clinic. This is the entitlement
 * source of truth — hasModule() (src/lib/entitlements/modules.ts) reads
 * from here, and ONLY from here. It is intentionally independent of
 * `clinics.settings` and of any plan/billing table so entitlements can be
 * granted manually today and wired to real billing later without a
 * schema change.
 */
export const clinicModules = pgTable(
  "clinic_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.clinicId, table.moduleId)]
);

export type ModuleRow = typeof modules.$inferSelect;
export type ClinicModule = typeof clinicModules.$inferSelect;
