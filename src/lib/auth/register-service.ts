import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, plans, subscriptions } from "@/db/schema";
import { hashPassword } from "./password";
import { createSession } from "./session";
import { createClinic } from "@/lib/tenant/clinics-service";
import { recordAudit } from "@/lib/audit";
import { env } from "@/config/env";

export type RegisterResult =
  | { ok: true; userId: string; clinicId: string; sessionStarted: boolean }
  | { ok: false; error: string };

/**
 * Self-service sign-up: creates a new user + a new clinic in one step,
 * with the user as OWNER. This is the first time a clinic can be
 * created WITHOUT going through the dev seed or the platform-admin
 * panel — see docs/REQUISITOS.md Sprint 15.
 *
 * Private Beta interaction: a brand-new user is created with
 * isAllowedInPrivateBeta = false (the column default — never
 * overridden here). When PRIVATE_BETA=true, registering does NOT log
 * the user in automatically: isAllowedToUsePlatform() would reject
 * them on the very next request anyway, so starting a session here
 * would just produce a confusing "logged in but locked out" state.
 * Instead the caller is told sessionStarted: false and the UI shows a
 * "pending approval" message. When PRIVATE_BETA=false, the user is
 * logged in immediately after registering, same as a normal launch.
 *
 * The new clinic gets a trialing subscription on the "basico" plan if
 * that plan exists in the catalog (dev/seeded environments); if it
 * doesn't exist (e.g. a bare production DB before any seed), the
 * clinic is still created successfully — billing scaffolding is
 * optional infrastructure, not a hard dependency of onboarding.
 */
export async function registerAndCreateClinic(params: {
  name: string;
  email: string;
  password: string;
  clinicName: string;
}): Promise<RegisterResult> {
  const name = params.name.trim();
  const email = params.email.toLowerCase().trim();
  const clinicName = params.clinicName.trim();

  if (!name) return { ok: false, error: "VALIDATION:name_required" };
  if (!email || !email.includes("@")) return { ok: false, error: "VALIDATION:invalid_email" };
  if (!params.password || params.password.length < 8) return { ok: false, error: "VALIDATION:weak_password" };
  if (!clinicName) return { ok: false, error: "VALIDATION:clinic_name_required" };

  const db = await getDb();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { ok: false, error: "CONFLICT:email_already_registered" };

  const passwordHash = await hashPassword(params.password);
  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
      // isPlatformAdmin and isAllowedInPrivateBeta both default to
      // false at the column level — deliberately not set here, so a
      // self-registered user NEVER gets elevated access by accident.
    })
    .returning();

  // createClinic() already ensures slug uniqueness by appending a
  // numeric suffix (see slugify() in clinics-service.ts); it does NOT
  // dedupe by display name, which is fine here — two different clinics
  // legitimately named "Clínica Sorriso" are a normal real-world case,
  // not a bug, as long as their slugs (and thus URLs) don't collide.
  const clinic = await createClinic({
    name: clinicName,
    ownerUserId: user.id,
    defaultEnabledModules: ["PATIENTS", "AGENDA"],
  });

  const [basico] = await db.select().from(plans).where(eq(plans.key, "basico")).limit(1);
  if (basico) {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    await db.insert(subscriptions).values({
      clinicId: clinic.id,
      planId: basico.id,
      status: "trialing",
      trialEndsAt,
    });
  }

  await recordAudit({
    userId: user.id,
    clinicId: clinic.id,
    action: "auth.register",
    result: "success",
    metadata: { email, clinicName },
  });

  let sessionStarted = false;
  if (!env.PRIVATE_BETA) {
    await createSession(user.id);
    sessionStarted = true;
  }

  return { ok: true, userId: user.id, clinicId: clinic.id, sessionStarted };
}
