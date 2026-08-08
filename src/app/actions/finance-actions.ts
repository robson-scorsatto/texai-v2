"use server";

import { requireModule } from "@/lib/entitlements/modules";
import { requirePermission } from "@/lib/rbac/permissions";
import {
  listFinancialEntries,
  getFinancialTotals,
  getFinancialEntry,
  createFinancialEntry,
  updateFinancialEntry,
  markAsPaid,
  cancelFinancialEntry,
  type CreateFinancialEntryInput,
  type UpdateFinancialEntryInput,
  type ListFinancialEntriesOptions,
} from "@/lib/finance/finance-service";

/**
 * Same two-gate pattern as the other business modules: requireModule
 * ('FINANCE') then requirePermission('financial.*'), both re-resolved
 * from the server session on every call. financial.delete maps to
 * "cancel" here (money is never hard-deleted — see IMMUTABLE errors in
 * the service layer for paid/cancelled entries).
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED" || err.message === "UNAUTHENTICATED_OR_NO_TENANT") {
      return "Você precisa estar autenticado e com uma clínica selecionada.";
    }
    if (err.message === "FORBIDDEN") return "Você não tem permissão para esta ação.";
    if (err.message.startsWith("MODULE_NOT_ENABLED")) {
      return "O módulo Financeiro não está habilitado para esta clínica.";
    }
    if (err.message === "NOT_FOUND") return "Lançamento não encontrado.";
    if (err.message === "IMMUTABLE:entry_paid") return "Este lançamento já foi pago e não pode ser alterado.";
    if (err.message === "IMMUTABLE:entry_cancelled") return "Este lançamento foi cancelado e não pode ser alterado.";
    if (err.message.startsWith("VALIDATION:")) {
      const reasons: Record<string, string> = {
        description_required: "A descrição não pode estar vazia.",
        amount_must_be_positive: "O valor deve ser maior que zero.",
        patient_not_in_tenant: "Paciente inválido para esta clínica.",
        appointment_not_in_tenant: "Agendamento inválido para esta clínica.",
      };
      const reason = err.message.split(":")[1];
      return reasons[reason] ?? "Dados inválidos.";
    }
  }
  return "Não foi possível concluir a operação.";
}

export async function listFinancialEntriesAction(
  options: ListFinancialEntriesOptions = {}
): Promise<ActionResult<Awaited<ReturnType<typeof listFinancialEntries>>>> {
  try {
    await requireModule("FINANCE");
    await requirePermission("financial.view");
    const data = await listFinancialEntries(options);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getFinancialTotalsAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof getFinancialTotals>>>
> {
  try {
    await requireModule("FINANCE");
    await requirePermission("financial.view");
    const data = await getFinancialTotals();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getFinancialEntryAction(
  entryId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getFinancialEntry>>>> {
  try {
    await requireModule("FINANCE");
    await requirePermission("financial.view");
    const data = await getFinancialEntry(entryId);
    if (!data) return { ok: false, error: "Lançamento não encontrado." };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function createFinancialEntryAction(
  input: CreateFinancialEntryInput
): Promise<ActionResult<Awaited<ReturnType<typeof createFinancialEntry>>>> {
  try {
    await requireModule("FINANCE");
    await requirePermission("financial.create");
    const data = await createFinancialEntry(input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateFinancialEntryAction(
  entryId: string,
  input: UpdateFinancialEntryInput
): Promise<ActionResult<Awaited<ReturnType<typeof updateFinancialEntry>>>> {
  try {
    await requireModule("FINANCE");
    await requirePermission("financial.edit");
    const data = await updateFinancialEntry(entryId, input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function markAsPaidAction(
  entryId: string
): Promise<ActionResult<Awaited<ReturnType<typeof markAsPaid>>>> {
  try {
    await requireModule("FINANCE");
    await requirePermission("financial.edit");
    const data = await markAsPaid(entryId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function cancelFinancialEntryAction(
  entryId: string
): Promise<ActionResult<Awaited<ReturnType<typeof cancelFinancialEntry>>>> {
  try {
    await requireModule("FINANCE");
    await requirePermission("financial.delete");
    const data = await cancelFinancialEntry(entryId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
