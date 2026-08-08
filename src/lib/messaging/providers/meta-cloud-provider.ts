import type { MessageProvider, SendResult } from "./message-provider";
import type { MetaWhatsAppConfig } from "@/lib/integrations/integrations-config";

/**
 * REAL implementation of MessageProvider using the official WhatsApp
 * Business Cloud API (Meta). This actually calls the network — it is
 * only ever instantiated once a clinic has configured working
 * credentials via /admin (see docs/GUIA_INTEGRACAO.md for the exact
 * setup steps: Meta Business Manager → WhatsApp → API Setup →
 * Phone Number ID + a permanent Access Token).
 *
 * Deliberately minimal: sends plain-text messages via the
 * /messages endpoint. Does NOT yet support: message templates
 * pre-approved by Meta (required to message a user outside the 24h
 * customer-service window), media messages, or delivery-status
 * webhooks. Those are natural follow-ups once Robson is actively using
 * this with a real WhatsApp Business number and hits the 24h-window
 * limitation in practice.
 */
export class MetaCloudWhatsAppProvider implements MessageProvider {
  constructor(private readonly config: MetaWhatsAppConfig) {}

  async send(to: string, body: string): Promise<SendResult> {
    const url = `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizePhoneForMeta(to),
          type: "text",
          text: { body },
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage =
          data?.error?.message ?? `Meta Cloud API respondeu ${response.status} sem detalhes.`;
        return { status: "failed", errorMessage };
      }

      const providerMessageId = data?.messages?.[0]?.id;
      if (!providerMessageId) {
        return { status: "failed", errorMessage: "Resposta da Meta Cloud API sem id de mensagem." };
      }

      return { status: "sent", providerMessageId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erro de rede desconhecido ao chamar a Meta Cloud API.";
      return { status: "failed", errorMessage };
    }
  }
}

/** Strips everything but digits — Meta expects E.164 without a leading "+". */
function normalizePhoneForMeta(phone: string): string {
  return phone.replace(/\D/g, "");
}
