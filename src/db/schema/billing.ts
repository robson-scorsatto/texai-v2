import { pgTable, uuid, text, timestamp, boolean, integer, index, unique } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { modules } from "./modules";

/**
 * Plan/Subscription SCAFFOLDING — explicitly NOT a real billing system.
 * There is no payment gateway integration here (no Stripe, Pagar.me,
 * Iugu, Asaas — none of these were found in the legacy platform either,
 * see Auditoria 01 seção 7). This exists so the concept of "a clinic is
 * on a plan, and a plan includes certain modules" is modeled and
 * testable today, ready to wire to real billing later without another
 * schema migration. See docs/REQUISITOS.md Sprint 14 for the explicit
 * scope decision (mirrors the Sprint 11 WhatsApp mock-provider pattern).
 *
 * Prices here mirror the 3 commercial plans already published on the
 * legacy institutional site (Auditoria 01, seção 3.1): Básico R$97/mês,
 * Profissional R$297/mês, Enterprise sob consulta — reused as realistic
 * seed data, not invented from scratch.
 */

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** The global plan catalog — not tenant-scoped, same pattern as `modules`. */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // e.g. "BASICO", "PROFISSIONAL", "ENTERPRISE"
  name: text("name").notNull(),
  description: text("description").notNull().default(""),

  // Nullable: Enterprise is "sob consulta" (custom quote) in the legacy
  // platform's pricing page — not every plan has a fixed public price.
  priceCents: integer("price_cents"),
  billingInterval: text("billing_interval").notNull().default("monthly"), // BillingInterval

  maxUsers: integer("max_users"), // nullable = unlimited
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Which modules a plan includes — same join-table shape as clinic_modules, applied at the plan level instead. */
export const planModules = pgTable(
  "plan_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
  },
  (table) => [unique().on(table.planId, table.moduleId)]
);

/**
 * One clinic's subscription to a plan. `currentPeriodEnd`/`trialEndsAt`
 * are tracked for completeness but nothing in this codebase actually
 * enforces them yet (no cron job downgrades an expired trial) — see
 * docs/REQUISITOS.md pendências. hasModule() continues to read from
 * clinic_modules, NOT from the subscription's plan — changing a
 * clinic's plan syncs clinic_modules explicitly (see
 * src/lib/billing/billing-service.ts changeSubscriptionPlan), it
 * doesn't replace the entitlement source of truth.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),

    status: text("status").notNull().default("trialing"), // SubscriptionStatus
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One active subscription per clinic — the service layer enforces
    // "replace, don't duplicate" on top of this.
    unique("subscriptions_clinic_unique").on(table.clinicId),
    index("subscriptions_clinic_id_idx").on(table.clinicId),
  ]
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanModule = typeof planModules.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
