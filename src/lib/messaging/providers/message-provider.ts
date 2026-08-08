/**
 * The provider boundary. ANY real WhatsApp integration (Evolution API,
 * Meta Cloud API, or something else) implements this same interface —
 * nothing above this layer (service, actions, UI, schema) needs to
 * change when a real provider is wired in. See mock-provider.ts for
 * the current (sandbox) implementation and docs/REQUISITOS.md Sprint 11
 * for the explicit decision to mock delivery in this environment.
 */
export type SendResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "failed"; errorMessage: string };

export interface MessageProvider {
  send(to: string, body: string): Promise<SendResult>;
}
