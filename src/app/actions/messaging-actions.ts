"use server";

import { requireModule } from "@/lib/entitlements/modules";
import { requirePermission } from "@/lib/rbac/permissions";
import {
  listTemplates,
  upsertTemplate,
  listReminderRules,
  upsertReminderRule,
  sendMessage,
  listOutboundMessages,
  type UpsertTemplateInput,
  type UpsertReminderRuleInput,
  type SendMessageInput,
} from "@/lib/messaging/messaging-service";

/**
 * requireModule('WHATSAPP') gates everything here — Automações
 * (reminder rules) is conceptually a sub-feature of the WhatsApp
 * channel in this MVP (there's only one channel today), so it shares
 * the same module gate rather than requiring both WHATSAPP and
 * AUTOMATIONS to be enabled. Configuration actions require
 * 'settings.manage' (reused, not a new permission) since templates and
 * rules are clinic configuration, not day-to-day clinical/financial data.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED" || err.message === "UNAUTHENTICATED_OR_NO_TENANT") {
      return "Você precisa estar autenticado e com uma clínica selecionada.";
    }
    if (err.message === "FORBIDDEN") return "Você não tem permissão para esta ação.";
    if (err.message.startsWith("MODULE_NOT_ENABLED")) {
      return "O módulo WhatsApp/Automações não está habilitado para esta clínica.";
    }
    if (err.message === "NOT_FOUND") return "Registro não encontrado.";
    if (err.message.startsWith("VALIDATION:")) {
      const reasons: Record<string, string> = {
        key_required: "A chave do template não pode estar vazia.",
        body_required: "O conteúdo do template não pode estar vazio.",
        template_not_in_tenant: "Template inválido para esta clínica.",
        patient_not_in_tenant: "Paciente inválido para esta clínica.",
        patient_has_no_phone: "Este paciente não tem telefone cadastrado.",
        appointment_not_in_tenant: "Agendamento inválido para esta clínica.",
      };
      const reason = err.message.split(":")[1];
      return reasons[reason] ?? "Dados inválidos.";
    }
  }
  return "Não foi possível concluir a operação.";
}

export async function listTemplatesAction(): Promise<ActionResult<Awaited<ReturnType<typeof listTemplates>>>> {
  try {
    await requireModule("WHATSAPP");
    await requirePermission("settings.view");
    const data = await listTemplates();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function upsertTemplateAction(
  input: UpsertTemplateInput
): Promise<ActionResult<Awaited<ReturnType<typeof upsertTemplate>>>> {
  try {
    await requireModule("WHATSAPP");
    await requirePermission("settings.manage");
    const data = await upsertTemplate(input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function listReminderRulesAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof listReminderRules>>>
> {
  try {
    await requireModule("WHATSAPP");
    await requirePermission("settings.view");
    const data = await listReminderRules();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function upsertReminderRuleAction(
  input: UpsertReminderRuleInput
): Promise<ActionResult<Awaited<ReturnType<typeof upsertReminderRule>>>> {
  try {
    await requireModule("WHATSAPP");
    await requirePermission("settings.manage");
    const data = await upsertReminderRule(input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function sendMessageAction(
  input: SendMessageInput
): Promise<ActionResult<Awaited<ReturnType<typeof sendMessage>>>> {
  try {
    await requireModule("WHATSAPP");
    await requirePermission("settings.manage");
    const data = await sendMessage(input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function listOutboundMessagesAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof listOutboundMessages>>>
> {
  try {
    await requireModule("WHATSAPP");
    await requirePermission("settings.view");
    const data = await listOutboundMessages();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
