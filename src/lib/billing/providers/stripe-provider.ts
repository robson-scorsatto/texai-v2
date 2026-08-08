import Stripe from "stripe";
import type { PaymentProvider, CreateCheckoutSessionInput, CreateCheckoutSessionResult } from "./payment-provider";
import type { StripeConfig } from "@/lib/integrations/integrations-config";

/**
 * REAL implementation of PaymentProvider using Stripe Checkout. Only
 * ever instantiated once a platform admin has saved a working Stripe
 * secret key via /admin (see docs/GUIA_INTEGRACAO.md for the exact
 * setup: Stripe Dashboard → Developers → API keys → Secret key,
 * plus creating a webhook endpoint pointing at
 * <APP_URL>/api/webhooks/stripe and saving its signing secret).
 *
 * Uses Stripe's dynamic `price_data` instead of pre-created Stripe
 * Price objects, so a plan created in TEXAI's own `plans` table (see
 * Sprint 14) doesn't require a matching manual setup step in the
 * Stripe Dashboard — the price is described inline on every checkout
 * session from data TEXAI already has.
 */
export class StripeProvider implements PaymentProvider {
  private readonly client: Stripe;

  constructor(config: StripeConfig) {
    this.client = new Stripe(config.secretKey);
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    try {
      const session = await this.client.checkout.sessions.create({
        mode: "subscription",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.clinicId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: input.priceCents,
              recurring: { interval: input.billingInterval === "monthly" ? "month" : "year" },
              product_data: {
                name: `TEXAI 2.0 — Plano ${input.planName}`,
                metadata: { planKey: input.planKey, clinicId: input.clinicId },
              },
            },
          },
        ],
        metadata: { clinicId: input.clinicId, planKey: input.planKey },
      });

      if (!session.url) {
        return { ok: false, error: "Stripe criou a sessão de checkout, mas não retornou uma URL." };
      }

      return { ok: true, checkoutUrl: session.url, providerSessionId: session.id };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao criar sessão de checkout no Stripe.";
      return { ok: false, error: errorMessage };
    }
  }
}
