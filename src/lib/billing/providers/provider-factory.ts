import type { PaymentProvider } from "./payment-provider";
import { MockPaymentProvider } from "./mock-payment-provider";
import { StripeProvider } from "./stripe-provider";
import { getPlatformIntegrationConfig, type StripeConfig } from "@/lib/integrations/integrations-config";

const STRIPE_PROVIDER_KEY = "stripe";

/**
 * Resolves which PaymentProvider the platform should use RIGHT NOW.
 * Unlike WhatsApp (per-clinic), this reads platform-wide config — see
 * docs/GUIA_INTEGRACAO.md for why Stripe is a single account for the
 * whole platform rather than one per clinic.
 *
 * Falls back to MockPaymentProvider whenever Stripe isn't configured
 * or is deliberately deactivated — never throws.
 */
export async function getPaymentProvider(): Promise<PaymentProvider> {
  try {
    const integration = await getPlatformIntegrationConfig<StripeConfig>(STRIPE_PROVIDER_KEY);
    if (integration?.isActive && integration.config.secretKey) {
      return new StripeProvider(integration.config);
    }
  } catch {
    // Decrypt failure, malformed row, DB hiccup — fall through to mock.
  }
  return new MockPaymentProvider();
}
