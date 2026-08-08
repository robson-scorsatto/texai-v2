import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto/secret-box";
import {
  getClinicWhatsAppStatus,
  setClinicWhatsAppCredentials,
  setClinicWhatsAppActive,
  getPlatformStripeStatus,
  setPlatformStripeCredentials,
  setPlatformStripeActive,
} from "@/lib/integrations/integrations-service";
import { getMessageProviderForClinic } from "@/lib/messaging/providers/provider-factory";
import { MockWhatsAppProvider } from "@/lib/messaging/providers/mock-provider";
import { MetaCloudWhatsAppProvider } from "@/lib/messaging/providers/meta-cloud-provider";
import { getPaymentProvider } from "@/lib/billing/providers/provider-factory";
import { MockPaymentProvider } from "@/lib/billing/providers/mock-payment-provider";
import { StripeProvider } from "@/lib/billing/providers/stripe-provider";
import {
  getClinicWhatsAppStatusAction,
  setClinicWhatsAppCredentialsAction,
  getPlatformStripeStatusAction,
  setPlatformStripeCredentialsAction,
} from "@/app/actions/integrations-actions";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

async function loginAsOwnerOf(clinicId: string, email: string) {
  await login(email, "Password123!");
  await switchActiveClinic(clinicId);
}

describe("Crypto — secret-box round trip", () => {
  it("encrypts and decrypts a value correctly", () => {
    const plain = "EAAB1234567890secrettoken";
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("throws on a tampered ciphertext instead of returning garbage", () => {
    const enc = encryptSecret("some-secret-value");
    const tampered = enc.slice(0, -4) + "abcd";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("masks a secret, showing only the last 4 characters", () => {
    expect(maskSecret("sk_live_abcdef1234")).toBe("••••••••1234");
    expect(maskSecret("ab")).toBe("••••");
  });
});

describe("WhatsApp integration — access control", () => {
  it("allows the clinic's own OWNER to configure and read status", async () => {
    const owner = await createTestUser({ email: "wowner1@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic WA 1");
    await loginAsOwnerOf(clinic.id, "wowner1@test.local");

    await setClinicWhatsAppCredentials(clinic.id, {
      phoneNumberId: "1234567890",
      accessToken: "EAAB_test_token_abcd",
      isActive: true,
    });

    const status = await getClinicWhatsAppStatus(clinic.id);
    expect(status.configured).toBe(true);
    expect(status.isActive).toBe(true);
    expect(status.phoneNumberId).toBe("1234567890");
    // Never the plaintext token.
    expect(status.maskedAccessToken).not.toContain("EAAB_test_token_abcd");
    expect(status.maskedAccessToken).toContain("abcd");
  });

  it("rejects a user from a DIFFERENT clinic trying to configure or read another clinic's WhatsApp", async () => {
    const ownerA = await createTestUser({ email: "wownerA@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic WA A");
    const ownerB = await createTestUser({ email: "wownerB@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic WA B");

    await loginAsOwnerOf(clinicB.id, "wownerB@test.local");

    await expect(
      setClinicWhatsAppCredentials(clinicA.id, { phoneNumberId: "x", accessToken: "y", isActive: true })
    ).rejects.toThrow("FORBIDDEN");
    await expect(getClinicWhatsAppStatus(clinicA.id)).rejects.toThrow("FORBIDDEN");
  });

  it("allows a platform admin to configure any clinic's WhatsApp", async () => {
    const admin = await createTestUser({ email: "wadmin1@test.local", password: "Password123!", isPlatformAdmin: true });
    const owner = await createTestUser({ email: "wowner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic WA 2");

    await login("wadmin1@test.local", "Password123!");
    await setClinicWhatsAppCredentials(clinic.id, { phoneNumberId: "999", accessToken: "tok999", isActive: false });

    const status = await getClinicWhatsAppStatus(clinic.id);
    expect(status.configured).toBe(true);
    expect(status.isActive).toBe(false);
  });

  it("rejects an unauthenticated caller", async () => {
    const owner = await createTestUser({ email: "wowner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic WA 3");

    await expect(getClinicWhatsAppStatus(clinic.id)).rejects.toThrow("UNAUTHENTICATED");
  });

  it("rejects missing phoneNumberId or accessToken", async () => {
    const owner = await createTestUser({ email: "wowner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic WA 4");
    await loginAsOwnerOf(clinic.id, "wowner4@test.local");

    await expect(
      setClinicWhatsAppCredentials(clinic.id, { phoneNumberId: "", accessToken: "tok", isActive: true })
    ).rejects.toThrow("VALIDATION:phone_number_id_required");
    await expect(
      setClinicWhatsAppCredentials(clinic.id, { phoneNumberId: "123", accessToken: "", isActive: true })
    ).rejects.toThrow("VALIDATION:access_token_required");
  });

  it("toggles active state without needing to resend credentials", async () => {
    const owner = await createTestUser({ email: "wowner5@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic WA 5");
    await loginAsOwnerOf(clinic.id, "wowner5@test.local");

    await setClinicWhatsAppCredentials(clinic.id, { phoneNumberId: "1", accessToken: "tok", isActive: true });
    await setClinicWhatsAppActive(clinic.id, false);

    const status = await getClinicWhatsAppStatus(clinic.id);
    expect(status.isActive).toBe(false);
    expect(status.phoneNumberId).toBe("1"); // credentials untouched
  });
});

describe("WhatsApp integration — provider factory fallback", () => {
  it("uses the mock provider when no integration is configured", async () => {
    const owner = await createTestUser({ email: "wowner6@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic WA 6");

    const provider = await getMessageProviderForClinic(clinic.id);
    expect(provider).toBeInstanceOf(MockWhatsAppProvider);
  });

  it("uses the mock provider when configured but NOT active", async () => {
    const owner = await createTestUser({ email: "wowner7@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic WA 7");
    await loginAsOwnerOf(clinic.id, "wowner7@test.local");
    await setClinicWhatsAppCredentials(clinic.id, { phoneNumberId: "1", accessToken: "tok", isActive: false });

    const provider = await getMessageProviderForClinic(clinic.id);
    expect(provider).toBeInstanceOf(MockWhatsAppProvider);
  });

  it("uses the real Meta provider once configured AND active", async () => {
    const owner = await createTestUser({ email: "wowner8@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic WA 8");
    await loginAsOwnerOf(clinic.id, "wowner8@test.local");
    await setClinicWhatsAppCredentials(clinic.id, { phoneNumberId: "1", accessToken: "tok", isActive: true });

    const provider = await getMessageProviderForClinic(clinic.id);
    expect(provider).toBeInstanceOf(MetaCloudWhatsAppProvider);
  });

  it("keeps two clinics' WhatsApp configs fully independent", async () => {
    const ownerA = await createTestUser({ email: "wownerC@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic WA C");
    const ownerB = await createTestUser({ email: "wownerD@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic WA D");

    await loginAsOwnerOf(clinicA.id, "wownerC@test.local");
    await setClinicWhatsAppCredentials(clinicA.id, { phoneNumberId: "AAA", accessToken: "tokA", isActive: true });

    const providerA = await getMessageProviderForClinic(clinicA.id);
    const providerB = await getMessageProviderForClinic(clinicB.id);
    expect(providerA).toBeInstanceOf(MetaCloudWhatsAppProvider);
    expect(providerB).toBeInstanceOf(MockWhatsAppProvider); // never configured
  });
});

describe("Stripe integration — access control", () => {
  it("rejects a regular clinic OWNER, even for their own clinic (platform-wide, not per-clinic)", async () => {
    const owner = await createTestUser({ email: "sowner1@test.local", password: "Password123!" });
    await createTestClinic(owner.id, "Clinic Stripe 1");
    await login("sowner1@test.local", "Password123!");

    await expect(getPlatformStripeStatus()).rejects.toThrow("FORBIDDEN");
    await expect(setPlatformStripeCredentials({ secretKey: "sk_test_123", isActive: true })).rejects.toThrow(
      "FORBIDDEN"
    );
  });

  it("allows a platform admin to configure and read Stripe status, never exposing the raw key", async () => {
    const admin = await createTestUser({ email: "sadmin1@test.local", password: "Password123!", isPlatformAdmin: true });
    await login("sadmin1@test.local", "Password123!");

    await setPlatformStripeCredentials({ secretKey: "sk_test_abcdef123456", webhookSecret: "whsec_xyz", isActive: true });

    const status = await getPlatformStripeStatus();
    expect(status.configured).toBe(true);
    expect(status.isActive).toBe(true);
    expect(status.hasWebhookSecret).toBe(true);
    expect(status.maskedSecretKey).not.toContain("sk_test_abcdef123456");
    expect(status.maskedSecretKey).toContain("3456");
  });

  it("rejects a secret key that doesn't look like a Stripe key", async () => {
    const admin = await createTestUser({ email: "sadmin2@test.local", password: "Password123!", isPlatformAdmin: true });
    await login("sadmin2@test.local", "Password123!");

    await expect(setPlatformStripeCredentials({ secretKey: "not-a-stripe-key", isActive: true })).rejects.toThrow(
      "VALIDATION:invalid_stripe_secret_key_format"
    );
  });

  it("toggles Stripe active state independently of the stored key", async () => {
    const admin = await createTestUser({ email: "sadmin3@test.local", password: "Password123!", isPlatformAdmin: true });
    await login("sadmin3@test.local", "Password123!");

    await setPlatformStripeCredentials({ secretKey: "sk_test_toggletest", isActive: true });
    await setPlatformStripeActive(false);

    const status = await getPlatformStripeStatus();
    expect(status.isActive).toBe(false);
    expect(status.configured).toBe(true);
  });
});

describe("Stripe integration — provider factory fallback", () => {
  it("uses the mock payment provider when Stripe isn't configured", async () => {
    const provider = await getPaymentProvider();
    expect(provider).toBeInstanceOf(MockPaymentProvider);

    const result = await provider.createCheckoutSession({
      clinicId: "any",
      clinicName: "Any",
      planKey: "basico",
      planName: "Básico",
      priceCents: 9700,
      billingInterval: "monthly",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
    });
    expect(result.ok).toBe(false);
  });

  it("uses the real Stripe provider once configured AND active", async () => {
    const admin = await createTestUser({ email: "sadmin4@test.local", password: "Password123!", isPlatformAdmin: true });
    await login("sadmin4@test.local", "Password123!");
    await setPlatformStripeCredentials({ secretKey: "sk_test_realprovider", isActive: true });

    const provider = await getPaymentProvider();
    expect(provider).toBeInstanceOf(StripeProvider);
  });

  it("falls back to mock when Stripe is configured but deactivated", async () => {
    const admin = await createTestUser({ email: "sadmin5@test.local", password: "Password123!", isPlatformAdmin: true });
    await login("sadmin5@test.local", "Password123!");
    await setPlatformStripeCredentials({ secretKey: "sk_test_deactivated", isActive: false });

    const provider = await getPaymentProvider();
    expect(provider).toBeInstanceOf(MockPaymentProvider);
  });
});

describe("Integrations — server action layer", () => {
  it("does not leak Stripe status through the action layer for a non-admin", async () => {
    const owner = await createTestUser({ email: "aowner1@test.local", password: "Password123!" });
    await createTestClinic(owner.id, "Clinic Action 1");
    await login("aowner1@test.local", "Password123!");

    const result = await getPlatformStripeStatusAction();
    expect(result.ok).toBe(false);
  });

  it("round-trips WhatsApp credentials through the action layer for the clinic's own owner", async () => {
    const owner = await createTestUser({ email: "aowner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Action 2");
    await loginAsOwnerOf(clinic.id, "aowner2@test.local");

    const setResult = await setClinicWhatsAppCredentialsAction(clinic.id, "555", "tok555", "", true);
    expect(setResult.ok).toBe(true);

    const statusResult = await getClinicWhatsAppStatusAction(clinic.id);
    expect(statusResult.ok).toBe(true);
    if (statusResult.ok) {
      expect(statusResult.data.configured).toBe(true);
      expect(statusResult.data.phoneNumberId).toBe("555");
    }
  });

  it("round-trips Stripe credentials through the action layer for a platform admin", async () => {
    const admin = await createTestUser({ email: "aadmin1@test.local", password: "Password123!", isPlatformAdmin: true });
    await login("aadmin1@test.local", "Password123!");

    const setResult = await setPlatformStripeCredentialsAction("sk_test_actionlayer", "", true);
    expect(setResult.ok).toBe(true);

    const statusResult = await getPlatformStripeStatusAction();
    expect(statusResult.ok).toBe(true);
    if (statusResult.ok) {
      expect(statusResult.data.configured).toBe(true);
      expect(statusResult.data.isActive).toBe(true);
    }
  });
});
