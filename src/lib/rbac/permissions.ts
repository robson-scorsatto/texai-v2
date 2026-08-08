import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { rolePermissions, permissions as permissionsTable } from "@/db/schema";
import { resolveTenantContext, type TenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";

/**
 * Canonical permission keys. Keep this list in sync with the seed
 * (src/db/seed.ts). Using a union type (instead of a bare string) means
 * a typo in a permission key is a compile error, not a silent
 * always-false check.
 */
export type PermissionKey =
  | "patients.view"
  | "patients.create"
  | "patients.edit"
  | "patients.delete"
  | "agenda.view"
  | "agenda.create"
  | "agenda.edit"
  | "agenda.cancel"
  | "clinical_record.view"
  | "clinical_record.edit"
  | "clinical_record.sign"
  | "financial.view"
  | "financial.create"
  | "financial.edit"
  | "financial.delete"
  | "settings.view"
  | "settings.manage"
  | "members.manage";

/** Returns the set of permission keys granted to a given role. */
export async function getPermissionsForRole(roleId: string): Promise<Set<PermissionKey>> {
  const db = await getDb();
  const rows = await db
    .select({ key: permissionsTable.key })
    .from(rolePermissions)
    .innerJoin(permissionsTable, eq(permissionsTable.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));

  return new Set(rows.map((r) => r.key as PermissionKey));
}

/**
 * Checks whether the CURRENT tenant context's role grants a permission.
 * This is what every server action / route handler should call before
 * doing anything sensitive — it re-resolves the tenant from the session
 * every time, it is never passed in from the client.
 */
export async function hasPermission(permission: PermissionKey): Promise<boolean> {
  const ctx = await resolveTenantContext();
  if (!ctx) return false;
  const granted = await getPermissionsForRole(ctx.roleId);
  const allowed = granted.has(permission);
  if (!allowed) {
    await recordAudit({
      userId: ctx.userId,
      clinicId: ctx.clinicId,
      action: "rbac.permission_denied",
      result: "denied",
      metadata: { permission },
    });
  }
  return allowed;
}

/** Throws if the permission is missing — for use at the top of server actions. */
export async function requirePermission(permission: PermissionKey): Promise<TenantContext> {
  const ctx = await resolveTenantContext();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  const granted = await getPermissionsForRole(ctx.roleId);
  if (!granted.has(permission)) {
    await recordAudit({
      userId: ctx.userId,
      clinicId: ctx.clinicId,
      action: "rbac.permission_denied",
      result: "denied",
      metadata: { permission },
    });
    throw new Error("FORBIDDEN");
  }
  return ctx;
}
