import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clinicIntegrations, platformIntegrations } from "@/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";

/**
 * Low-level read/write helpers for encrypted integration config —
 * shared internal plumbing used by both the messaging provider
 * (per-clinic) and the payment provider (platform-wide). NOT exported
 * outside src/lib/integrations — the public, access-controlled surface
 * is integrations-service.ts (mutations are platform-admin-only there).
 * Providers call the read helpers directly since they run on the "hot
 * path" of sending a message / creating a checkout, not through the
 * admin-gated service layer.
 */

export type MetaWhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
};

export type StripeConfig = {
  secretKey: string;
  webhookSecret?: string;
};

export async function getClinicIntegrationConfig<T>(clinicId: string, provider: string): Promise<{ config: T; isActive: boolean } | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(clinicIntegrations)
    .where(and(eq(clinicIntegrations.clinicId, clinicId), eq(clinicIntegrations.provider, provider)))
    .limit(1);
  if (!row) return null;
  const config = JSON.parse(decryptSecret(row.encryptedConfig)) as T;
  return { config, isActive: row.isActive };
}

export async function setClinicIntegrationConfig(
  clinicId: string,
  provider: string,
  config: unknown,
  isActive: boolean,
  updatedByUserId: string
): Promise<void> {
  const db = await getDb();
  const encryptedConfig = encryptSecret(JSON.stringify(config));

  const [existing] = await db
    .select({ id: clinicIntegrations.id })
    .from(clinicIntegrations)
    .where(and(eq(clinicIntegrations.clinicId, clinicId), eq(clinicIntegrations.provider, provider)))
    .limit(1);

  if (existing) {
    await db
      .update(clinicIntegrations)
      .set({ encryptedConfig, isActive, updatedByUserId, updatedAt: new Date() })
      .where(eq(clinicIntegrations.id, existing.id));
  } else {
    await db.insert(clinicIntegrations).values({ clinicId, provider, encryptedConfig, isActive, updatedByUserId });
  }
}

export async function getPlatformIntegrationConfig<T>(provider: string): Promise<{ config: T; isActive: boolean } | null> {
  const db = await getDb();
  const [row] = await db.select().from(platformIntegrations).where(eq(platformIntegrations.provider, provider)).limit(1);
  if (!row) return null;
  const config = JSON.parse(decryptSecret(row.encryptedConfig)) as T;
  return { config, isActive: row.isActive };
}

export async function setPlatformIntegrationConfig(
  provider: string,
  config: unknown,
  isActive: boolean,
  updatedByUserId: string
): Promise<void> {
  const db = await getDb();
  const encryptedConfig = encryptSecret(JSON.stringify(config));

  const [existing] = await db
    .select({ id: platformIntegrations.id })
    .from(platformIntegrations)
    .where(eq(platformIntegrations.provider, provider))
    .limit(1);

  if (existing) {
    await db
      .update(platformIntegrations)
      .set({ encryptedConfig, isActive, updatedByUserId, updatedAt: new Date() })
      .where(eq(platformIntegrations.id, existing.id));
  } else {
    await db.insert(platformIntegrations).values({ provider, encryptedConfig, isActive, updatedByUserId });
  }
}
