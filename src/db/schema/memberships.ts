import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";
import { clinics } from "./clinics";
import { roles } from "./rbac";

/**
 * The core of multi-tenancy: a membership links ONE user to ONE clinic
 * with a role. A user can have many memberships (many clinics); a clinic
 * can have many members. There is no such thing as "the user's clinic" —
 * the active clinic always comes from the session (see
 * src/lib/tenant/resolve-tenant.ts), never from client input.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),

    status: text("status").notNull().default("active"), // "active" | "invited" | "suspended"

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.clinicId)]
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
