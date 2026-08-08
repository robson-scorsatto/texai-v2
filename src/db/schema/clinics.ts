import { pgTable, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

/**
 * A clinic is a tenant. Every piece of clinical/financial/scheduling data
 * in the system belongs to exactly one clinic. Tenant isolation is
 * enforced in the backend query layer — see src/lib/tenant/resolve-tenant.ts.
 */
export const clinics = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // used by /agendar/:clinicSlug later

  businessType: text("business_type").notNull().default("odontologia"),

  // Free-form settings bag (branding, business hours, etc.) — intentionally
  // NOT used for anything security-sensitive (entitlements live in
  // clinic_modules, not here).
  settings: jsonb("settings").notNull().default({}),

  isActive: boolean("is_active").notNull().default(true),

  // Marks data created by the dev seed script (see src/db/seed.ts) so it's
  // never confused with real clinic data. Must be false in production seeds.
  isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Clinic = typeof clinics.$inferSelect;
export type NewClinic = typeof clinics.$inferInsert;
