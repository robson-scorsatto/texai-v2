import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { isAllowedToUsePlatform } from "@/lib/auth/private-beta";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
  process.env.PRIVATE_BETA = "true";
});

describe("Private Beta gate — backend enforcement", () => {
  it("blocks a valid, active, non-allowlisted user while PRIVATE_BETA=true", async () => {
    await createTestUser({
      email: "notallowed@test.local",
      password: "Password123!",
      isAllowedInPrivateBeta: false,
    });

    const result = await login("notallowed@test.local", "Password123!");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_allowed_in_beta");
  });

  it("allows an explicitly allowlisted user while PRIVATE_BETA=true", async () => {
    await createTestUser({
      email: "allowed@test.local",
      password: "Password123!",
      isAllowedInPrivateBeta: true,
    });

    const result = await login("allowed@test.local", "Password123!");
    expect(result.ok).toBe(true);
  });

  it("always allows a platform admin, allowlisted or not", () => {
    const admin = { isPlatformAdmin: true, isAllowedInPrivateBeta: false, isActive: true };
    expect(isAllowedToUsePlatform(admin)).toBe(true);
  });

  it("blocks an inactive user even if allowlisted", () => {
    const user = { isPlatformAdmin: false, isAllowedInPrivateBeta: true, isActive: false };
    expect(isAllowedToUsePlatform(user)).toBe(false);
  });
});
