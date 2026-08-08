import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clinicModules, modules } from "@/db/schema";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";

/**
 * Module keys — keep in sync with src/db/seed.ts. CORE is implicitly
 * enabled for every clinic (see hasModule below) and is not something
 * any UI should ever need to check for.
 */
export type ModuleKey =
  | "CORE"
  | "PATIENTS"
  | "AGENDA"
  | "CLINICAL_RECORD"
  | "DENTAL"
  | "WHATSAPP"
  | "AUTOMATIONS"
  | "FINANCE"
  | "STOCK"
  | "REPORTS"
  | "AI"
  | "DOCUMENTS";

/**
 * THE entitlement check. Backend-enforced (never trust a frontend flag) —
 * call this at the top of any route/server action that belongs to a
 * given module, in addition to (not instead of) hasPermission().
 */
export async function hasModule(moduleKey: ModuleKey): Promise<boolean> {
  if (moduleKey === "CORE") return true; // always on, not billable

  const ctx = await resolveTenantContext();
  if (!ctx) return false;

  const db = await getDb();
  const [row] = await db
    .select({ enabled: clinicModules.enabled })
    .from(clinicModules)
    .innerJoin(modules, eq(modules.id, clinicModules.moduleId))
    .where(and(eq(clinicModules.clinicId, ctx.clinicId), eq(modules.key, moduleKey)))
    .limit(1);

  return row?.enabled ?? false;
}

export async function requireModule(moduleKey: ModuleKey): Promise<void> {
  const enabled = await hasModule(moduleKey);
  if (!enabled) throw new Error(`MODULE_NOT_ENABLED:${moduleKey}`);
}

/** All modules enabled for the current tenant — used to render the sidebar. */
export async function listEnabledModules(): Promise<ModuleKey[]> {
  const ctx = await resolveTenantContext();
  if (!ctx) return [];

  const db = await getDb();
  const rows = await db
    .select({ key: modules.key })
    .from(clinicModules)
    .innerJoin(modules, eq(modules.id, clinicModules.moduleId))
    .where(and(eq(clinicModules.clinicId, ctx.clinicId), eq(clinicModules.enabled, true)));

  return ["CORE" as ModuleKey, ...rows.map((r) => r.key as ModuleKey)];
}
