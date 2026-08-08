import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login, getCurrentUser } from "@/lib/auth/auth-service";
import { registerAndCreateClinic } from "@/lib/auth/register-service";
import { registerAction } from "@/app/actions/register-actions";
import { getDb } from "@/db/client";
import { users, memberships, roles, plans, subscriptions, clinics } from "@/db/schema";
import { eq, and } from "drizzle-orm";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

describe("Register — creates user + clinic + OWNER membership", () => {
  it("creates a real user, a real clinic, and links the user as OWNER", async () => {
    const result = await registerAndCreateClinic({
      name: "Ana Silva",
      email: "ana@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica da Ana",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, result.userId)).limit(1);
    expect(user).toBeDefined();
    expect(user.email).toBe("ana@test.local");
    // Never elevated by self-registration.
    expect(user.isPlatformAdmin).toBe(false);
    expect(user.isAllowedInPrivateBeta).toBe(false);

    const [clinic] = await db.select().from(clinics).where(eq(clinics.id, result.clinicId)).limit(1);
    expect(clinic.name).toBe("Clínica da Ana");

    const [ownerRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.clinicId, clinic.id), eq(roles.key, "OWNER")))
      .limit(1);
    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.clinicId, clinic.id)))
      .limit(1);
    expect(membership).toBeDefined();
    expect(membership.roleId).toBe(ownerRole.id);
    expect(membership.status).toBe("active");
  });

  it("hashes the password (never stores it in plaintext)", async () => {
    const result = await registerAndCreateClinic({
      name: "Bruno",
      email: "bruno@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica do Bruno",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, result.userId)).limit(1);
    expect(user.passwordHash).not.toBe("SenhaForte123");
    expect(user.passwordHash.length).toBeGreaterThan(20);
  });

  it("rejects a duplicate email", async () => {
    await createTestUser({ email: "dup@test.local", password: "Password123!" });

    const result = await registerAndCreateClinic({
      name: "Carla",
      email: "dup@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica da Carla",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("CONFLICT:email_already_registered");
  });

  it("rejects a weak password, invalid email, and empty names", async () => {
    const weakPassword = await registerAndCreateClinic({
      name: "Diego",
      email: "diego@test.local",
      password: "123",
      clinicName: "Clínica do Diego",
    });
    expect(weakPassword.ok).toBe(false);

    const badEmail = await registerAndCreateClinic({
      name: "Elisa",
      email: "not-an-email",
      password: "SenhaForte123",
      clinicName: "Clínica da Elisa",
    });
    expect(badEmail.ok).toBe(false);

    const noName = await registerAndCreateClinic({
      name: "",
      email: "fabio@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica do Fabio",
    });
    expect(noName.ok).toBe(false);

    const noClinicName = await registerAndCreateClinic({
      name: "Gabriela",
      email: "gabriela@test.local",
      password: "SenhaForte123",
      clinicName: "",
    });
    expect(noClinicName.ok).toBe(false);
  });

  it("allows two different clinics with the same display name (unique slugs, not unique names)", async () => {
    const first = await registerAndCreateClinic({
      name: "Owner One",
      email: "owner1dup@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica Sorriso",
    });
    const second = await registerAndCreateClinic({
      name: "Owner Two",
      email: "owner2dup@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica Sorriso",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.clinicId).not.toBe(second.clinicId);

    const db = await getDb();
    const [c1] = await db.select().from(clinics).where(eq(clinics.id, first.clinicId)).limit(1);
    const [c2] = await db.select().from(clinics).where(eq(clinics.id, second.clinicId)).limit(1);
    expect(c1.slug).not.toBe(c2.slug);
  });
});

describe("Register — Private Beta interaction", () => {
  it("does NOT start a session while PRIVATE_BETA=true (default test env)", async () => {
    const result = await registerAndCreateClinic({
      name: "Helena",
      email: "helena@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica da Helena",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessionStarted).toBe(false);

    // No active session was created — getCurrentUser() must be null.
    const current = await getCurrentUser();
    expect(current).toBeNull();
  });

  it("the newly registered user cannot log in until a platform admin grants beta access", async () => {
    await registerAndCreateClinic({
      name: "Igor",
      email: "igor@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica do Igor",
    });

    const attempt = await login("igor@test.local", "SenhaForte123");
    expect(attempt.ok).toBe(false);
    if (attempt.ok) return;
    expect(attempt.reason).toBe("not_allowed_in_beta");
  });

  it("logging in works once a platform admin grants isAllowedInPrivateBeta", async () => {
    const result = await registerAndCreateClinic({
      name: "Julia",
      email: "julia@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica da Julia",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const db = await getDb();
    await db.update(users).set({ isAllowedInPrivateBeta: true }).where(eq(users.id, result.userId));

    const attempt = await login("julia@test.local", "SenhaForte123");
    expect(attempt.ok).toBe(true);
  });
});

describe("Register — billing scaffolding integration", () => {
  it("creates a trialing subscription on the Básico plan when the plan catalog exists", async () => {
    const db = await getDb();
    const [basico] = await db.insert(plans).values({ key: "basico", name: "Básico", priceCents: 9700 }).returning();

    const result = await registerAndCreateClinic({
      name: "Karen",
      email: "karen@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica da Karen",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.clinicId, result.clinicId)).limit(1);
    expect(sub).toBeDefined();
    expect(sub.planId).toBe(basico.id);
    expect(sub.status).toBe("trialing");
  });

  it("still creates the clinic successfully when no plan catalog exists yet", async () => {
    const result = await registerAndCreateClinic({
      name: "Leo",
      email: "leo@test.local",
      password: "SenhaForte123",
      clinicName: "Clínica do Leo",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const db = await getDb();
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.clinicId, result.clinicId)).limit(1);
    expect(sub).toBeUndefined();

    const [clinic] = await db.select().from(clinics).where(eq(clinics.id, result.clinicId)).limit(1);
    expect(clinic).toBeDefined();
  });
});

describe("Register — server action layer", () => {
  it("returns a validation error through the action for a duplicate email", async () => {
    await createTestUser({ email: "actiondup@test.local", password: "Password123!" });

    const formData = new FormData();
    formData.set("name", "Mario");
    formData.set("email", "actiondup@test.local");
    formData.set("password", "SenhaForte123");
    formData.set("clinicName", "Clínica do Mario");

    const state = await registerAction(null, formData);
    expect(state?.error).toBeDefined();
  });
});
