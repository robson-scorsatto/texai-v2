import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "./password";
import { createSession, destroySession, getCurrentSession } from "./session";
import { isAllowedToUsePlatform } from "./private-beta";
import { recordAudit } from "@/lib/audit";

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid_credentials" | "not_allowed_in_beta" | "inactive" };

/**
 * Single entry point for email/password login. Deliberately returns the
 * SAME "invalid_credentials" error for "user not found" and "wrong
 * password" so the API never reveals whether an email is registered.
 */
export async function login(email: string, password: string, ipAddress?: string | null): Promise<LoginResult> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);

  if (!user) {
    await recordAudit({ action: "auth.login", result: "denied", metadata: { email, reason: "not_found" } });
    return { ok: false, reason: "invalid_credentials" };
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    await recordAudit({ userId: user.id, action: "auth.login", result: "denied", ipAddress, metadata: { reason: "bad_password" } });
    return { ok: false, reason: "invalid_credentials" };
  }

  if (!user.isActive) {
    await recordAudit({ userId: user.id, action: "auth.login", result: "denied", ipAddress, metadata: { reason: "inactive" } });
    return { ok: false, reason: "inactive" };
  }

  if (!isAllowedToUsePlatform(user)) {
    await recordAudit({ userId: user.id, action: "auth.login", result: "denied", ipAddress, metadata: { reason: "private_beta" } });
    return { ok: false, reason: "not_allowed_in_beta" };
  }

  await createSession(user.id);
  await recordAudit({ userId: user.id, action: "auth.login", result: "success", ipAddress });
  return { ok: true, userId: user.id };
}

export async function logout() {
  const session = await getCurrentSession();
  if (session) {
    await recordAudit({ userId: session.userId, clinicId: session.activeClinicId, action: "auth.logout", result: "success" });
  }
  await destroySession();
}

/**
 * Loads the full current user + session, re-checking private-beta and
 * active status on EVERY call (not just at login time) so a revoked
 * allowlist entry or deactivated user is locked out immediately, even
 * mid-session.
 */
export async function getCurrentUser() {
  const session = await getCurrentSession();
  if (!session) return null;

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;
  if (!isAllowedToUsePlatform(user)) return null;

  return { user, session };
}
