import { pgTable, uuid, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { users } from "./users";

/**
 * The clinic's service catalog — closes the gap documented in Sprints 7
 * and 9 where appointments.serviceName was free text and financial
 * entries had no default price to pre-fill from. `defaultPriceCents`
 * and `defaultDurationMinutes` are just DEFAULTS: the agenda/financeiro
 * flows still let staff override the actual value per appointment, this
 * table only reduces typing for the common case.
 */
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    defaultPriceCents: integer("default_price_cents").notNull(),
    defaultDurationMinutes: integer("default_duration_minutes").notNull().default(30),

    isActive: boolean("is_active").notNull().default(true),
    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("services_clinic_id_idx").on(table.clinicId)]
);

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
