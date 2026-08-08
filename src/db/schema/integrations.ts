import { pgTable, uuid, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";

/**
 * Per-clinic third-party integration credentials — currently only
 * WhatsApp (Meta Cloud API). One row per (clinicId, provider): each
 * clinic configures its OWN WhatsApp Business number/token, since a
 * clinic's WhatsApp presence is inherently clinic-specific (decision
 * confirmed with Robson before building this — see docs/GUIA_INTEGRACAO.md).
 *
 * `encryptedConfig` holds a JSON blob (provider-specific fields)
 * encrypted with src/lib/crypto/secret-box.ts — NEVER store plaintext
 * credentials here, and NEVER select this column into anything that
 * reaches the client (see integrations-service.ts: reads always
 * decrypt server-side and return only a masked/boolean status).
 */
export const clinicIntegrations = pgTable(
  "clinic_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // e.g. "meta_whatsapp"
    encryptedConfig: text("encrypted_config").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.clinicId, table.provider)]
);

/**
 * Platform-wide integration credentials — currently only Stripe. Only
 * ONE Stripe account for the whole platform (TEXAI is the merchant of
 * record; individual clinics don't have their own Stripe accounts) —
 * decision confirmed with Robson before building this. There is at
 * most one row per provider (enforced by the unique constraint), not
 * per clinic.
 */
export const platformIntegrations = pgTable("platform_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().unique(), // e.g. "stripe"
  encryptedConfig: text("encrypted_config").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  updatedByUserId: uuid("updated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClinicIntegration = typeof clinicIntegrations.$inferSelect;
export type NewClinicIntegration = typeof clinicIntegrations.$inferInsert;
export type PlatformIntegration = typeof platformIntegrations.$inferSelect;
export type NewPlatformIntegration = typeof platformIntegrations.$inferInsert;

/**
 * Append-only log of inbound Stripe webhook events. This sprint only
 * RECORDS events (for later manual review from /admin) — it does not
 * yet act on them (no automatic status sync back onto `subscriptions`).
 * That's a deliberate scope boundary: acting automatically on webhook
 * events requires deciding exact business rules for e.g. what happens
 * to clinic_modules when a payment fails, which is a product decision,
 * not a technical one. See docs/GUIA_INTEGRACAO.md.
 */
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(), // raw JSON, for manual inspection later
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
