import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { clinics } from "./clinics";

/**
 * Server-side session store. The session cookie only carries an opaque
 * token (see src/lib/auth/session.ts) — the active clinic, user id and
 * expiry all live here, server-side, so the client can never forge or
 * tamper with tenant context.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Nullable: right after login, before the user picks a clinic context
  // (or before entering the platform-admin "Sistema Global" context).
  activeClinicId: uuid("active_clinic_id").references(() => clinics.id, {
    onDelete: "set null",
  }),

  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Session = typeof sessions.$inferSelect;
