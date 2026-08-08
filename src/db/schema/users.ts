import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * A user is a single identity that may be linked to multiple clinics
 * (tenants) through the `memberships` table. Never create a duplicate
 * user per clinic — see docs/ARCHITECTURE.md ("Identidade do usuário").
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),

  // Platform-level flag: TEXAI super administrators (see /admin panel).
  // This is NOT a clinic role — it is independent of any membership.
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),

  // Private Beta allowlist — enforced in the backend (see
  // src/lib/auth/private-beta.ts). Must never be trusted from the client.
  isAllowedInPrivateBeta: boolean("is_allowed_in_private_beta")
    .notNull()
    .default(false),

  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
