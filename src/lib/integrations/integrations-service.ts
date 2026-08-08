import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { clinics, clinicIntegrations, platformIntegrations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";
import { maskSecret } from "@/lib/crypto/secret-box";
import {
  getClinicIntegrationConfig,
  setClinicIntegrationConfig,
  getPlatformIntegrationConfig,
  setPlatformIntegrationConfig,
  type MetaWhatsAppConfig,
  type StripeConfig,
} from "./integrations-config";

/**
 * Access-controlled surface for managing integration credentials from
 * /admin. Every read here returns a STATUS, never the plaintext secret
 * — once a credential is saved, the only way to see it again is to
 * overwrite it with a new value. This mirrors how every real SaaS
 * admin panel handles API keys (GitHub, Stripe itself, etc.): "configured,
 * ending in ...ab12", never a decrypt-and-display action.
 *
 * WhatsApp (Meta Cloud API) mutations require platform-admin — same
 * decision as Sprint 13/14 for anything touching another clinic's
 * configuration, EXCEPT that unlike billing, an OWNER of the clinic
 * itself may also manage their own clinic's WhatsApp credentials
 * (confirmed scope: "token da meta deve ser individual" — a clinic
 * self-manages its own WhatsApp number). Stripe is platform-admin-only,
 * full stop, since it's a single platform-wide account.
 */

async function requirePlatformAdmin() {
  const current = await getCurrentUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  if (!current.user.isPlatformAdmin) throw new Error("FORBIDDEN");
  return current.user;
}

/** A caller may manage clinicId's WhatsApp config if they're a platform admin OR an active member of that clinic. */
async function requireClinicAccessOrPlatformAdmin(clinicId: string) {
  const current = await getCurrentUser();
  if (!current) throw new Error("UNAUTHENTICATED");
  if (current.user.isPlatformAdmin) return current.user;

  const ctx = await resolveTenantContext();
  if (ctx && ctx.clinicId === clinicId) return current.user;

  throw new Error("FORBIDDEN");
}

const META_WHATSAPP = "meta_whatsapp";
const STRIPE = "stripe";

export type WhatsAppIntegrationStatus = {
  configured: boolean;
  isActive: boolean;
  maskedAccessToken: string | null;
  phoneNumberId: string | null;
};

/** Status for a specific clinic's WhatsApp integration — never returns the access token. */
export async function getClinicWhatsAppStatus(clinicId: string): Promise<WhatsAppIntegrationStatus> {
  await requireClinicAccessOrPlatformAdmin(clinicId);
  const db = await getDb();
  const [row] = await db
    .select()
    .from(clinicIntegrations)
    .where(and(eq(clinicIntegrations.clinicId, clinicId), eq(clinicIntegrations.provider, META_WHATSAPP)))
    .limit(1);

  if (!row) return { configured: false, isActive: false, maskedAccessToken: null, phoneNumberId: null };

  const integration = await getClinicIntegrationConfig<MetaWhatsAppConfig>(clinicId, META_WHATSAPP);
  return {
    configured: true,
    isActive: row.isActive,
    maskedAccessToken: integration ? maskSecret(integration.config.accessToken) : null,
    phoneNumberId: integration?.config.phoneNumberId ?? null,
  };
}

/** Saves (creates or overwrites) a clinic's WhatsApp credentials. Setting isActive=true here is what makes provider-factory.ts start using Meta instead of the mock. */
export async function setClinicWhatsAppCredentials(
  clinicId: string,
  input: { phoneNumberId: string; accessToken: string; wabaId?: string; isActive: boolean }
): Promise<void> {
  const caller = await requireClinicAccessOrPlatformAdmin(clinicId);
  const db = await getDb();

  const [clinic] = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  if (!clinic) throw new Error("NOT_FOUND");

  if (!input.phoneNumberId.trim()) throw new Error("VALIDATION:phone_number_id_required");
  if (!input.accessToken.trim()) throw new Error("VALIDATION:access_token_required");

  const config: MetaWhatsAppConfig = {
    phoneNumberId: input.phoneNumberId.trim(),
    accessToken: input.accessToken.trim(),
    wabaId: input.wabaId?.trim() || undefined,
  };

  await setClinicIntegrationConfig(clinicId, META_WHATSAPP, config, input.isActive, caller.id);

  await recordAudit({
    userId: caller.id,
    clinicId,
    action: "integrations.set_whatsapp_credentials",
    objectType: "clinic_integration",
    result: "success",
    metadata: { isActive: input.isActive }, // never log the secret itself
  });
}

/** Turns a clinic's WhatsApp integration on/off without touching the stored credentials. */
export async function setClinicWhatsAppActive(clinicId: string, isActive: boolean): Promise<void> {
  const caller = await requireClinicAccessOrPlatformAdmin(clinicId);
  const db = await getDb();

  const [existing] = await db
    .select({ id: clinicIntegrations.id })
    .from(clinicIntegrations)
    .where(and(eq(clinicIntegrations.clinicId, clinicId), eq(clinicIntegrations.provider, META_WHATSAPP)))
    .limit(1);
  if (!existing) throw new Error("NOT_FOUND");

  await db
    .update(clinicIntegrations)
    .set({ isActive, updatedByUserId: caller.id, updatedAt: new Date() })
    .where(eq(clinicIntegrations.id, existing.id));

  await recordAudit({
    userId: caller.id,
    clinicId,
    action: "integrations.toggle_whatsapp",
    result: "success",
    metadata: { isActive },
  });
}

export type StripeIntegrationStatus = {
  configured: boolean;
  isActive: boolean;
  maskedSecretKey: string | null;
  hasWebhookSecret: boolean;
};

/** Status of the platform's single Stripe integration — platform-admin only, never returns the secret key. */
export async function getPlatformStripeStatus(): Promise<StripeIntegrationStatus> {
  await requirePlatformAdmin();
  const db = await getDb();
  const [row] = await db.select().from(platformIntegrations).where(eq(platformIntegrations.provider, STRIPE)).limit(1);

  if (!row) return { configured: false, isActive: false, maskedSecretKey: null, hasWebhookSecret: false };

  const integration = await getPlatformIntegrationConfig<StripeConfig>(STRIPE);
  return {
    configured: true,
    isActive: row.isActive,
    maskedSecretKey: integration ? maskSecret(integration.config.secretKey) : null,
    hasWebhookSecret: Boolean(integration?.config.webhookSecret),
  };
}

/** Saves (creates or overwrites) the platform's Stripe credentials. Setting isActive=true is what makes provider-factory.ts start using Stripe instead of the mock. */
export async function setPlatformStripeCredentials(input: {
  secretKey: string;
  webhookSecret?: string;
  isActive: boolean;
}): Promise<void> {
  const caller = await requirePlatformAdmin();

  if (!input.secretKey.trim()) throw new Error("VALIDATION:secret_key_required");
  if (!input.secretKey.trim().startsWith("sk_")) throw new Error("VALIDATION:invalid_stripe_secret_key_format");

  const config: StripeConfig = {
    secretKey: input.secretKey.trim(),
    webhookSecret: input.webhookSecret?.trim() || undefined,
  };

  await setPlatformIntegrationConfig(STRIPE, config, input.isActive, caller.id);

  await recordAudit({
    userId: caller.id,
    action: "integrations.set_stripe_credentials",
    objectType: "platform_integration",
    result: "success",
    metadata: { isActive: input.isActive },
  });
}

/** Turns Stripe on/off without touching the stored credentials. */
export async function setPlatformStripeActive(isActive: boolean): Promise<void> {
  const caller = await requirePlatformAdmin();
  const db = await getDb();

  const [existing] = await db
    .select({ id: platformIntegrations.id })
    .from(platformIntegrations)
    .where(eq(platformIntegrations.provider, STRIPE))
    .limit(1);
  if (!existing) throw new Error("NOT_FOUND");

  await db
    .update(platformIntegrations)
    .set({ isActive, updatedByUserId: caller.id, updatedAt: new Date() })
    .where(eq(platformIntegrations.id, existing.id));

  await recordAudit({ userId: caller.id, action: "integrations.toggle_stripe", result: "success", metadata: { isActive } });
}
