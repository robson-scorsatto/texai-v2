import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { users, roles, permissions, rolePermissions, modules, memberships } from "./schema";
import { ALL_PERMISSIONS } from "./seed-data/permissions";
import { MODULE_CATALOG } from "./seed-data/modules";
import { ROLE_PERMISSION_KEYS } from "./seed-data/roles";
import { hashPassword } from "@/lib/auth/password";
import { createClinic } from "@/lib/tenant/clinics-service";

/**
 * Idempotent-ish dev seed. Safe to re-run in a fresh dev database; NOT
 * meant to be run against a production database (see prompt mestre item
 * 47, "Não inserir dados reais de pacientes/produção").
 *
 * Creates:
 *  - the global permission catalog + module catalog (platform-wide, not
 *    tenant data)
 *  - ONE platform administrator (super admin, "Sistema Global"), from
 *    env vars — never a hardcoded password
 *  - ONE development clinic (isDevSeedData = true) with all modules
 *    enabled, owned by the admin
 *  - TWO professional users linked to that clinic (PROFESSIONAL role)
 *
 * Patient records are intentionally NOT seeded here: there is no
 * `patients` table yet in Sprint 0 (it belongs to Sprint 6 — see
 * README.md, "Estado do projeto"). Faking rows into a table that
 * doesn't exist would misrepresent what's actually implemented.
 */
async function main() {
  const db = await getDb();

  console.log("→ Seeding global permission catalog...");
  for (const perm of ALL_PERMISSIONS) {
    const [existing] = await db.select().from(permissions).where(eq(permissions.key, perm.key)).limit(1);
    if (!existing) await db.insert(permissions).values(perm);
  }

  console.log("→ Seeding module catalog...");
  for (const mod of MODULE_CATALOG) {
    const [existing] = await db.select().from(modules).where(eq(modules.key, mod.key)).limit(1);
    if (!existing) await db.insert(modules).values(mod);
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administrador TEXAI";

  if (!adminEmail || !adminPassword) {
    console.error(
      "\n❌ SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD são obrigatórios (defina no .env — nunca hardcode).\n" +
        "   Exemplo: SEED_ADMIN_EMAIL=voce@exemplo.com SEED_ADMIN_PASSWORD='senha-forte' npm run db:seed\n"
    );
    process.exit(1);
  }

  console.log("→ Creating platform administrator...");
  let [admin] = await db.select().from(users).where(eq(users.email, adminEmail.toLowerCase())).limit(1);
  if (!admin) {
    const passwordHash = await hashPassword(adminPassword);
    [admin] = await db
      .insert(users)
      .values({
        name: adminName,
        email: adminEmail.toLowerCase(),
        passwordHash,
        isPlatformAdmin: true,
        isAllowedInPrivateBeta: true,
        isActive: true,
      })
      .returning();
  }

  console.log("→ Creating development clinic (isDevSeedData = true)...");
  const clinic = await createClinic({
    name: "Clínica Modelo TEXAI (dev)",
    businessType: "odontologia",
    ownerUserId: admin.id,
    isDevSeedData: true,
    defaultEnabledModules: MODULE_CATALOG.map((m) => m.key), // dev clinic gets everything enabled
  });

  console.log("→ Wiring role → permission grants for the dev clinic...");
  const clinicRoles = await db.select().from(roles).where(eq(roles.clinicId, clinic.id));
  const allPerms = await db.select().from(permissions);
  for (const role of clinicRoles) {
    const grantKeys = ROLE_PERMISSION_KEYS[role.key as keyof typeof ROLE_PERMISSION_KEYS];
    const grantedPermissions = grantKeys === "ALL" ? allPerms : allPerms.filter((p) => (grantKeys as string[]).includes(p.key));
    if (grantedPermissions.length === 0) continue;
    await db
      .insert(rolePermissions)
      .values(grantedPermissions.map((p) => ({ roleId: role.id, permissionId: p.id })))
      .onConflictDoNothing();
  }

  console.log("→ Creating 2 fictitious professionals linked to the dev clinic...");
  const professionalRole = clinicRoles.find((r) => r.key === "PROFESSIONAL")!;
  const fakeProfessionals = [
    { name: "Dra. Ingrid Modelo (dev)", email: "ingrid.dev@texai.local" },
    { name: "Dr. Marcos Modelo (dev)", email: "marcos.dev@texai.local" },
  ];
  for (const prof of fakeProfessionals) {
    let [profUser] = await db.select().from(users).where(eq(users.email, prof.email)).limit(1);
    if (!profUser) {
      const passwordHash = await hashPassword("dev-only-" + Math.random().toString(36).slice(2, 10));
      [profUser] = await db
        .insert(users)
        .values({
          name: prof.name,
          email: prof.email,
          passwordHash,
          isAllowedInPrivateBeta: true,
        })
        .returning();
    }
    const [existingMembership] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, profUser.id))
      .limit(1);
    if (!existingMembership) {
      await db.insert(memberships).values({
        userId: profUser.id,
        clinicId: clinic.id,
        roleId: professionalRole.id,
        status: "active",
      });
    }
  }

  console.log("\n✅ Seed completo.");
  console.log(`   Admin: ${admin.email} (super administrador da plataforma)`);
  console.log(`   Clínica de dev: "${clinic.name}" (slug: ${clinic.slug})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
