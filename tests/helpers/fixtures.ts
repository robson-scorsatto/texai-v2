import { getDb } from "@/db/client";
import { users, permissions, modules, roles, rolePermissions } from "@/db/schema";
import { ALL_PERMISSIONS } from "@/db/seed-data/permissions";
import { MODULE_CATALOG } from "@/db/seed-data/modules";
import { ROLE_PERMISSION_KEYS } from "@/db/seed-data/roles";
import { hashPassword } from "@/lib/auth/password";
import { createClinic } from "@/lib/tenant/clinics-service";
import { eq } from "drizzle-orm";

/** Seeds the platform-wide permission + module catalogs (once per test db). */
export async function seedCatalogs() {
  const db = await getDb();
  await db.insert(permissions).values(ALL_PERMISSIONS);
  await db.insert(modules).values(MODULE_CATALOG);
}

export async function createTestUser(overrides: Partial<{ email: string; name: string; password: string; isPlatformAdmin: boolean; isAllowedInPrivateBeta: boolean; isActive: boolean }> = {}) {
  const db = await getDb();
  const email = overrides.email ?? `user-${Math.random().toString(36).slice(2)}@test.local`;
  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? "Test User",
      email: email.toLowerCase().trim(),
      passwordHash: await hashPassword(overrides.password ?? "Password123!"),
      isPlatformAdmin: overrides.isPlatformAdmin ?? false,
      isAllowedInPrivateBeta: overrides.isAllowedInPrivateBeta ?? true,
      isActive: overrides.isActive ?? true,
    })
    .returning();
  return user;
}

/** Creates a clinic owned by `ownerUserId`, with role→permission grants wired (mirrors src/db/seed.ts). */
export async function createTestClinic(ownerUserId: string, name = "Test Clinic") {
  const clinic = await createClinic({
    name,
    ownerUserId,
    isDevSeedData: true,
    defaultEnabledModules: MODULE_CATALOG.map((m) => m.key),
  });

  const db = await getDb();
  const clinicRoles = await db.select().from(roles).where(eq(roles.clinicId, clinic.id));
  const allPerms = await db.select().from(permissions);
  for (const role of clinicRoles) {
    const grantKeys = ROLE_PERMISSION_KEYS[role.key as keyof typeof ROLE_PERMISSION_KEYS];
    const granted = grantKeys === "ALL" ? allPerms : allPerms.filter((p) => (grantKeys as string[]).includes(p.key));
    if (granted.length === 0) continue;
    await db.insert(rolePermissions).values(granted.map((p) => ({ roleId: role.id, permissionId: p.id })));
  }

  return { clinic, roles: clinicRoles };
}
