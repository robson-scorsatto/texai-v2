import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memberships, clinics } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { setActiveClinic as persistActiveClinic } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export type TenantContext = {
  userId: string;
  clinicId: string;
  membershipId: string;
  roleId: string;
};

/**
 * Resolves the CURRENT tenant context strictly from the server-side
 * session — never from a header, query string or request body supplied
 * by the client. This is the one function every module/route MUST go
 * through before touching clinic-scoped data.
 *
 * Returns null if there's no logged-in user, no active clinic selected,
 * or — critically — if the session's active clinic no longer has a
 * membership for this user (e.g. it was revoked mid-session).
 */
export async function resolveTenantContext(): Promise<TenantContext | null> {
  const current = await getCurrentUser();
  if (!current) return null;
  const { user, session } = current;
  if (!session.activeClinicId) return null;

  const db = await getDb();
  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.clinicId, session.activeClinicId),
        eq(memberships.status, "active")
      )
    )
    .limit(1);

  if (!membership) {
    // Defense in depth: this catches the case where a membership was
    // deleted/suspended after the clinic was selected in this session.
    await recordAudit({
      userId: user.id,
      clinicId: session.activeClinicId,
      action: "tenant.resolve",
      result: "denied",
      metadata: { reason: "no_active_membership" },
    });
    return null;
  }

  return {
    userId: user.id,
    clinicId: membership.clinicId,
    membershipId: membership.id,
    roleId: membership.roleId,
  };
}

/**
 * Switches the active clinic for the current session — WITHOUT logging
 * out — after verifying the user actually has an active membership in
 * the target clinic. This is the only legitimate way to change tenant
 * context; it is always re-verified server-side.
 */
export async function switchActiveClinic(clinicId: string) {
  const current = await getCurrentUser();
  if (!current) throw new Error("Not authenticated");

  const db = await getDb();
  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, current.user.id),
        eq(memberships.clinicId, clinicId),
        eq(memberships.status, "active")
      )
    )
    .limit(1);

  if (!membership) {
    await recordAudit({
      userId: current.user.id,
      clinicId,
      action: "tenant.switch",
      result: "denied",
      metadata: { reason: "no_membership_for_target_clinic" },
    });
    throw new Error("No active membership for this clinic");
  }

  await persistActiveClinic(current.session.id, clinicId);
  await recordAudit({ userId: current.user.id, clinicId, action: "tenant.switch", result: "success" });

  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  return clinic;
}

/** All clinics (id, name, role) the current user can switch into. */
export async function listUserClinics() {
  const current = await getCurrentUser();
  if (!current) return [];

  const db = await getDb();
  return db
    .select({
      clinicId: clinics.id,
      clinicName: clinics.name,
      clinicSlug: clinics.slug,
      roleId: memberships.roleId,
      membershipStatus: memberships.status,
    })
    .from(memberships)
    .innerJoin(clinics, eq(clinics.id, memberships.clinicId))
    .where(and(eq(memberships.userId, current.user.id), eq(memberships.status, "active")));
}
