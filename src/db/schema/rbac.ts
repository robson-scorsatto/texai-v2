import { pgTable, uuid, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";

/**
 * Roles are scoped per clinic so that a clinic can, in the future, define
 * a CUSTOM role without affecting other tenants. A fixed set of "system"
 * roles (isSystem = true) is seeded for every clinic on creation:
 * OWNER, ADMIN, MANAGER, PROFESSIONAL, RECEPTIONIST, FINANCE, ASSISTANT.
 */
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // e.g. "OWNER", "RECEPTIONIST", or custom key
  label: text("label").notNull(),
  isSystem: text("is_system").notNull().default("true"), // "true" | "false" (kept text for simple portability)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Permissions are GLOBAL (not per clinic) — they describe every possible
 * granular action in the system, e.g. "patients.view", "patients.edit",
 * "financial.view", "financial.edit", "settings.manage". Modules gate
 * *availability*; permissions gate *what a member can do* within what's
 * available.
 */
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // e.g. "patients.view"
  module: text("module").notNull(), // e.g. "PATIENTS" — links conceptually to modules.key
  description: text("description").notNull(),
});

/** Many-to-many: which permissions a given (clinic-scoped) role grants. */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
