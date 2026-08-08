import type { MessageProvider, SendResult } from "./message-provider";

/**
 * MOCK PROVIDER — does not send anything over the network. This sandbox
 * has no outbound internet access to WhatsApp providers, and choosing
 * between Evolution API (used by the legacy platform, see Auditoria 01
 * seção 2) and Meta's official Cloud API is a product/business decision
 * Robson hasn't made yet. This provider exists so the rest of the
 * system (schema, service layer, UI, audit log) can be built and
 * tested end-to-end today, with a real provider swapped in later
 * behind the same MessageProvider interface — no other code changes.
 *
 * Always "succeeds" (deterministic, no flakiness in tests) and logs to
 * the console so a developer running `npm run dev` can see what would
 * have been sent.
 */
export class MockWhatsAppProvider implements MessageProvider {
  async send(to: string, body: string): Promise<SendResult> {
    const providerMessageId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    // eslint-disable-next-line no-console
    console.log(`[MockWhatsAppProvider] Would send to ${to}:\n${body}\n(id: ${providerMessageId})`);
    return { status: "sent", providerMessageId };
  }
}

let providerInstance: MessageProvider | null = null;

/** Returns the currently configured provider. Today this is always the mock. */
export function getMessageProvider(): MessageProvider {
  if (!providerInstance) providerInstance = new MockWhatsAppProvider();
  return providerInstance;
}
