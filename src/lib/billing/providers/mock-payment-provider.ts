import type { PaymentProvider, CreateCheckoutSessionInput, CreateCheckoutSessionResult } from "./payment-provider";

/**
 * MOCK PROVIDER — never talks to a real payment gateway, never
 * generates a real checkout URL. This is the automatic fallback used
 * whenever Stripe hasn't been configured (or has been deactivated) via
 * /admin — see provider-factory.ts. Mirrors the exact same pattern as
 * MockWhatsAppProvider (Sprint 11): the rest of the system (schema,
 * service layer) is real and testable today, with real payment wired
 * in later behind the same PaymentProvider interface.
 */
export class MockPaymentProvider implements PaymentProvider {
  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionResult> {
    return {
      ok: false,
      error:
        "Pagamento real ainda não foi configurado para esta plataforma. Configure a chave do Stripe em /admin para ativar cobrança.",
    };
  }
}
