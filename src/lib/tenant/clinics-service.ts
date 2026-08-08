import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clinics, roles, memberships, clinicModules, modules, type Clinic } from "@/db/schema";
import { SYSTEM_ROLES } from "@/db/seed-data/roles";
import { recordAudit } from "@/lib/audit";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Creates a new clinic (tenant), seeds its system roles (OWNER, ADMIN,
 * MANAGER, PROFESSIONAL, RECEPTIONIST, FINANCE, ASSISTANT), links the
 * creating user as OWNER, and enables the CORE module bundle
 * (PATIENTS + AGENDA are enabled by default so a new clinic is usable
 * immediately; everything else must be granted explicitly today via the
 * super-admin panel — see prompt mestre item 16/17).
 */
export async function createClinic(params: {
  name: string;
  businessType?: string;
  ownerUserId: string;
  isDevSeedData?: boolean;
  defaultEnabledModules?: string[];
}): Promise<Clinic> {
  const db = await getDb();
  const baseSlug = slugify(params.name) || "clinica";
  let slug = baseSlug;
  let attempt = 1;
  // Ensure slug uniqueness (used later by /agendar/:clinicSlug).
  while (await db.select().from(clinics).where(eq(clinics.slug, slug)).limit(1).then((r) => r.length > 0)) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const [clinic] = await db
    .insert(clinics)
    .values({
      name: params.name,
      slug,
      businessType: params.businessType ?? "odontologia",
      isDevSeedData: params.isDevSeedData ?? false,
    })
    .returning();

  const insertedRoles = await db
    .insert(roles)
    .values(
      SYSTEM_ROLES.map((r) => ({
        clinicId: clinic.id,
        key: r.key,
        label: r.label,
        isSystem: "true",
      }))
    )
    .returning();

  const ownerRole = insertedRoles.find((r) => r.key === "OWNER")!;
  await db.insert(memberships).values({
    userId: params.ownerUserId,
    clinicId: clinic.id,
    roleId: ownerRole.id,
    status: "active",
  });

  const defaultModules = params.defaultEnabledModules ?? ["PATIENTS", "AGENDA"];
  if (defaultModules.length > 0) {
    const allModules = await db.select().from(modules);
    const rowsToInsert = allModules
      .filter((m) => defaultModules.includes(m.key))
      .map((m) => ({ clinicId: clinic.id, moduleId: m.id, enabled: true }));
    if (rowsToInsert.length > 0) await db.insert(clinicModules).values(rowsToInsert);
  }

  await recordAudit({
    userId: params.ownerUserId,
    clinicId: clinic.id,
    action: "tenant.created",
    result: "success",
    metadata: { name: params.name },
  });

  return clinic;
}
