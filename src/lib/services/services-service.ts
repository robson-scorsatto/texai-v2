import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { services, type Service, type NewService } from "@/db/schema";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";

/**
 * Tenant-safe service layer for the clinic's service catalog. Named
 * services-service.ts / functions to disambiguate from the generic
 * word "service" used elsewhere in this codebase (service LAYER vs.
 * clinic SERVICE/procedure) — same tenant-isolation contract as every
 * other module here.
 */

export type CreateServiceInput = {
  name: string;
  defaultPriceCents: number;
  defaultDurationMinutes?: number;
};

export type UpdateServiceInput = Partial<CreateServiceInput>;

class TenantResolutionError extends Error {
  constructor() {
    super("UNAUTHENTICATED_OR_NO_TENANT");
  }
}

async function requireTenant() {
  const ctx = await resolveTenantContext();
  if (!ctx) throw new TenantResolutionError();
  return ctx;
}

function validate(input: Partial<CreateServiceInput>) {
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new Error("VALIDATION:name_required");
  }
  if (
    input.defaultPriceCents !== undefined &&
    (!Number.isInteger(input.defaultPriceCents) || input.defaultPriceCents <= 0)
  ) {
    throw new Error("VALIDATION:price_must_be_positive");
  }
  if (
    input.defaultDurationMinutes !== undefined &&
    (!Number.isInteger(input.defaultDurationMinutes) || input.defaultDurationMinutes <= 0)
  ) {
    throw new Error("VALIDATION:duration_must_be_positive");
  }
}

export async function listServices(includeInactive = false): Promise<Service[]> {
  const ctx = await requireTenant();
  const db = await getDb();

  const filters = [eq(services.clinicId, ctx.clinicId)];
  if (!includeInactive) filters.push(eq(services.isActive, true));

  return db
    .select()
    .from(services)
    .where(and(...filters))
    .orderBy(asc(services.name));
}

export async function getService(serviceId: string): Promise<Service | null> {
  const ctx = await requireTenant();
  const db = await getDb();

  const [row] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.clinicId, ctx.clinicId)))
    .limit(1);

  return row ?? null;
}

export async function createService(input: CreateServiceInput): Promise<Service> {
  const ctx = await requireTenant();
  const db = await getDb();

  validate(input);

  const values: NewService = {
    clinicId: ctx.clinicId,
    name: input.name.trim(),
    defaultPriceCents: input.defaultPriceCents,
    defaultDurationMinutes: input.defaultDurationMinutes ?? 30,
    createdByUserId: ctx.userId,
  };

  const [created] = await db.insert(services).values(values).returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "services.create",
    objectType: "service",
    objectId: created.id,
    result: "success",
  });

  return created;
}

export async function updateService(serviceId: string, input: UpdateServiceInput): Promise<Service> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getService(serviceId);
  if (!existing) throw new Error("NOT_FOUND");

  validate(input);

  const patch: Partial<NewService> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.defaultPriceCents !== undefined) patch.defaultPriceCents = input.defaultPriceCents;
  if (input.defaultDurationMinutes !== undefined) patch.defaultDurationMinutes = input.defaultDurationMinutes;

  const [updated] = await db
    .update(services)
    .set(patch)
    .where(and(eq(services.id, serviceId), eq(services.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "services.update",
    objectType: "service",
    objectId: serviceId,
    result: "success",
  });

  return updated;
}

export async function deactivateService(serviceId: string): Promise<Service> {
  const ctx = await requireTenant();
  const db = await getDb();

  const existing = await getService(serviceId);
  if (!existing) throw new Error("NOT_FOUND");

  const [updated] = await db
    .update(services)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(services.id, serviceId), eq(services.clinicId, ctx.clinicId)))
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "services.deactivate",
    objectType: "service",
    objectId: serviceId,
    result: "success",
  });

  return updated;
}
