import type { MessageProvider, SendResult } from "./message-provider";

/**
 * MOCK PROVIDER — does not send anything over the network. Used as the
 * automatic fallback whenever a clinic has NOT configured a real
 * WhatsApp integration yet (see provider-factory.ts) — so the rest of
 * the system (schema, service layer, UI, audit log) keeps working
 * end-to-end even before Robson activates Meta Cloud API for a clinic.
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
