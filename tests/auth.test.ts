import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login, logout, getCurrentUser } from "@/lib/auth/auth-service";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

describe("login()", () => {
  it("succeeds with correct credentials and starts a session", async () => {
    await createTestUser({ email: "alice@test.local", password: "CorrectHorse123!" });

    const result = await login("alice@test.local", "CorrectHorse123!");
    expect(result.ok).toBe(true);

    const current = await getCurrentUser();
    expect(current?.user.email).toBe("alice@test.local");
  });

  it("fails with wrong password without revealing whether the email exists", async () => {
    await createTestUser({ email: "bob@test.local", password: "RightPassword123!" });

    const wrongPassword = await login("bob@test.local", "WrongPassword!");
    const unknownEmail = await login("nobody@test.local", "WhateverPassword!");

    expect(wrongPassword.ok).toBe(false);
    expect(unknownEmail.ok).toBe(false);
    if (!wrongPassword.ok) expect(wrongPassword.reason).toBe("invalid_credentials");
    if (!unknownEmail.ok) expect(unknownEmail.reason).toBe("invalid_credentials");
  });

  it("rejects an inactive user even with the correct password", async () => {
    await createTestUser({ email: "inactive@test.local", password: "Password123!", isActive: false });

    const result = await login("inactive@test.local", "Password123!");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("inactive");
  });
});

describe("logout()", () => {
  it("clears the session so getCurrentUser() returns null afterwards", async () => {
    await createTestUser({ email: "carol@test.local", password: "Password123!" });
    await login("carol@test.local", "Password123!");
    expect(await getCurrentUser()).not.toBeNull();

    await logout();
    expect(await getCurrentUser()).toBeNull();
  });
});
