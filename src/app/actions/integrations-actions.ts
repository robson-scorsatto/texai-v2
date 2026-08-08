"use server";

import {
  getClinicWhatsAppStatus,
  setClinicWhatsAppCredentials,
  setClinicWhatsAppActive,
  getPlatformStripeStatus,
  setPlatformStripeCredentials,
  setPlatformStripeActive,
} from "@/lib/integrations/integrations-service";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED") return "Você precisa estar autenticado.";
    if (err.message === "FORBIDDEN") return "Você não tem permissão para gerenciar esta integração.";
    if (err.message === "NOT_FOUND") return "Integração ainda não configurada.";
    if (err.message === "VALIDATION:phone_number_id_required") return "Informe o Phone Number ID.";
    if (err.message === "VALIDATION:access_token_required") return "Informe o Access Token.";
    if (err.message === "VALIDATION:secret_key_required") return "Informe a chave secreta do Stripe.";
    if (err.message === "VALIDATION:invalid_stripe_secret_key_format")
      return "A chave secreta do Stripe deve começar com 'sk_'.";
  }
  return "Não foi possível concluir a operação.";
}

export async function getClinicWhatsAppStatusAction(
  clinicId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getClinicWhatsAppStatus>>>> {
  try {
    const data = await getClinicWhatsAppStatus(clinicId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function setClinicWhatsAppCredentialsAction(
  clinicId: string,
  phoneNumberId: string,
  accessToken: string,
  wabaId: string,
  isActive: boolean
): Promise<ActionResult<null>> {
  try {
    await setClinicWhatsAppCredentials(clinicId, { phoneNumberId, accessToken, wabaId: wabaId || undefined, isActive });
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function setClinicWhatsAppActiveAction(clinicId: string, isActive: boolean): Promise<ActionResult<null>> {
  try {
    await setClinicWhatsAppActive(clinicId, isActive);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getPlatformStripeStatusAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof getPlatformStripeStatus>>>
> {
  try {
    const data = await getPlatformStripeStatus();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function setPlatformStripeCredentialsAction(
  secretKey: string,
  webhookSecret: string,
  isActive: boolean
): Promise<ActionResult<null>> {
  try {
    await setPlatformStripeCredentials({ secretKey, webhookSecret: webhookSecret || undefined, isActive });
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function setPlatformStripeActiveAction(isActive: boolean): Promise<ActionResult<null>> {
  try {
    await setPlatformStripeActive(isActive);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
