import type { MessageProvider } from "./message-provider";
import { MockWhatsAppProvider } from "./mock-provider";
import { MetaCloudWhatsAppProvider } from "./meta-cloud-provider";
import { getClinicIntegrationConfig, type MetaWhatsAppConfig } from "@/lib/integrations/integrations-config";

const META_WHATSAPP_PROVIDER_KEY = "meta_whatsapp";

/**
 * Resolves which MessageProvider a given clinic should use RIGHT NOW.
 * This is the one place that decides mock vs. real — nothing else in
 * the messaging module needs to know an integration system exists.
 *
 * Falls back to MockWhatsAppProvider whenever:
 *  - the clinic has no meta_whatsapp row in clinic_integrations, OR
 *  - it exists but isActive is false (configured but deliberately
 *    turned off — e.g. Robson pasted credentials but hasn't flipped
 *    the switch in /admin yet), OR
 *  - the stored config is missing required fields (defensive — should
 *    never happen given how integrations-service.ts validates on
 *    write, but a provider must never crash message sending because
 *    of a malformed config row).
 *
 * This function deliberately never throws — sending a message must
 * always resolve to SOME provider.
 */
export async function getMessageProviderForClinic(clinicId: string): Promise<MessageProvider> {
  try {
    const integration = await getClinicIntegrationConfig<MetaWhatsAppConfig>(clinicId, META_WHATSAPP_PROVIDER_KEY);
    if (integration?.isActive && integration.config.phoneNumberId && integration.config.accessToken) {
      return new MetaCloudWhatsAppProvider(integration.config);
    }
  } catch {
    // Decrypt failure, malformed row, DB hiccup — fall through to mock
    // rather than blocking message sending entirely.
  }
  return new MockWhatsAppProvider();
}
