/**
 * The payment provider boundary. Any real payment gateway (Stripe,
 * Pagar.me, Mercado Pago) implements this same interface — nothing
 * above this layer (billing-service.ts, server actions, UI) needs to
 * change when a real provider is wired in or swapped out. See
 * stripe-provider.ts for the current real implementation and
 * mock-payment-provider.ts for the automatic fallback used until
 * Stripe credentials are configured via /admin.
 *
 * Deliberately narrow scope for this sprint: creating a hosted
 * checkout session for a subscription. Reading back payment status,
 * upgrading/downgrading, and proration are NOT implemented — the
 * source of truth for "what plan is this clinic on" remains the
 * `subscriptions` table, updated manually via /admin (see Sprint 14).
 * This provider only handles the "customer pays" leg; syncing that
 * back onto `subscriptions` automatically is future work once webhook
 * handling grows past "log the event" (see stripe-provider.ts).
 */
export type CreateCheckoutSessionInput = {
  clinicId: string;
  clinicName: string;
  planKey: string;
  planName: string;
  priceCents: number;
  billingInterval: "monthly" | "yearly";
  successUrl: string;
  cancelUrl: string;
};

export type CreateCheckoutSessionResult =
  | { ok: true; checkoutUrl: string; providerSessionId: string }
  | { ok: false; error: string };

export interface PaymentProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult>;
}
