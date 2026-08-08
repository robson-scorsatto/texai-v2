import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, type Session } from "@/db/schema";

const SESSION_COOKIE_NAME = "texai_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Creates a new server-side session row and sets an httpOnly, secure,
 * SameSite=lax cookie holding ONLY an opaque random token — never the
 * user id, clinic id or any claim the client could tamper with.
 */
export async function createSession(userId: string): Promise<Session> {
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [session] = await db
    .insert(sessions)
    .values({ token, userId, expiresAt })
    .returning();

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return session;
}

/** Reads and validates the current session from the request cookie. */
export async function getCurrentSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const db = await getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await destroySession();
    return null;
  }
  return session;
}

/** Updates the session's active clinic — this is THE clinic-switch primitive. */
export async function setActiveClinic(sessionId: string, clinicId: string) {
  const db = await getDb();
  await db.update(sessions).set({ activeClinicId: clinicId }).where(eq(sessions.id, sessionId));
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  store.delete(SESSION_COOKIE_NAME);
}
