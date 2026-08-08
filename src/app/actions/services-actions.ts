"use server";

import { requireModule } from "@/lib/entitlements/modules";
import { requirePermission } from "@/lib/rbac/permissions";
import {
  listServices,
  getService,
  createService,
  updateService,
  deactivateService,
  type CreateServiceInput,
  type UpdateServiceInput,
} from "@/lib/services/services-service";

/**
 * Services (catálogo) live under the AGENDA module — there's no
 * dedicated module for them, they're core configuration for scheduling.
 * Read access uses 'agenda.view' (any agenda user needs to see the
 * catalog to pick a service); write access uses 'settings.manage'
 * (reused) since maintaining the price list is clinic configuration.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED" || err.message === "UNAUTHENTICATED_OR_NO_TENANT") {
      return "Você precisa estar autenticado e com uma clínica selecionada.";
    }
    if (err.message === "FORBIDDEN") return "Você não tem permissão para esta ação.";
    if (err.message.startsWith("MODULE_NOT_ENABLED")) {
      return "O módulo Agenda não está habilitado para esta clínica.";
    }
    if (err.message === "NOT_FOUND") return "Serviço não encontrado.";
    if (err.message.startsWith("VALIDATION:")) {
      const reasons: Record<string, string> = {
        name_required: "O nome do serviço não pode estar vazio.",
        price_must_be_positive: "O preço deve ser maior que zero.",
        duration_must_be_positive: "A duração deve ser maior que zero.",
      };
      const reason = err.message.split(":")[1];
      return reasons[reason] ?? "Dados inválidos.";
    }
  }
  return "Não foi possível concluir a operação.";
}

export async function listServicesAction(
  includeInactive = false
): Promise<ActionResult<Awaited<ReturnType<typeof listServices>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.view");
    const data = await listServices(includeInactive);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getServiceAction(
  serviceId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getService>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.view");
    const data = await getService(serviceId);
    if (!data) return { ok: false, error: "Serviço não encontrado." };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function createServiceAction(
  input: CreateServiceInput
): Promise<ActionResult<Awaited<ReturnType<typeof createService>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("settings.manage");
    const data = await createService(input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateServiceAction(
  serviceId: string,
  input: UpdateServiceInput
): Promise<ActionResult<Awaited<ReturnType<typeof updateService>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("settings.manage");
    const data = await updateService(serviceId, input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deactivateServiceAction(
  serviceId: string
): Promise<ActionResult<Awaited<ReturnType<typeof deactivateService>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("settings.manage");
    const data = await deactivateService(serviceId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
