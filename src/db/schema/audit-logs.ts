import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";
import { clinics } from "./clinics";

/**
 * Append-only log of security/business-critical actions:
 * login, logout, clinic switch, permission changes, record access, etc.
 * Never update or delete rows here from application code.
 */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  clinicId: uuid("clinic_id").references(() => clinics.id, { onDelete: "set null" }),

  action: text("action").notNull(), // e.g. "auth.login", "tenant.switch", "membership.role_changed"
  objectType: text("object_type"), // e.g. "patient", "membership"
  objectId: text("object_id"),

  result: text("result").notNull(), // "success" | "denied" | "error"
  ipAddress: text("ip_address"),
  metadata: jsonb("metadata").notNull().default({}),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
