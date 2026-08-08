"use server";

import { requireModule } from "@/lib/entitlements/modules";
import { requirePermission } from "@/lib/rbac/permissions";
import {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  confirmAppointment,
  completeAppointment,
  markNoShow,
  listClinicProfessionals,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
  type ListAppointmentsOptions,
} from "@/lib/agenda/agenda-service";

/**
 * Same two-gate pattern as src/app/actions/patients-actions.ts:
 * requireModule('AGENDA') then requirePermission('agenda.*'), both
 * re-resolved from the server session on every call. The service layer
 * adds tenant-scoped queries + cross-entity validation (patient and
 * professional must belong to the same clinic) as a third layer.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED" || err.message === "UNAUTHENTICATED_OR_NO_TENANT") {
      return "Você precisa estar autenticado e com uma clínica selecionada.";
    }
    if (err.message === "FORBIDDEN") return "Você não tem permissão para esta ação.";
    if (err.message.startsWith("MODULE_NOT_ENABLED")) {
      return "O módulo de Agenda não está habilitado para esta clínica.";
    }
    if (err.message === "NOT_FOUND") return "Agendamento não encontrado.";
    if (err.message === "CONFLICT:schedule_overlap") {
      return "Este profissional já tem um agendamento nesse horário.";
    }
    if (err.message.startsWith("VALIDATION:")) {
      const reasons: Record<string, string> = {
        patient_required_for_atendimento: "Selecione um paciente para um atendimento.",
        patient_not_in_tenant: "Paciente inválido para esta clínica.",
        professional_not_in_tenant: "Profissional inválido para esta clínica.",
        invalid_datetime: "Data/hora inválida.",
        ends_before_starts: "O horário de término deve ser depois do início.",
      };
      const reason = err.message.split(":")[1];
      return reasons[reason] ?? "Dados inválidos.";
    }
  }
  return "Não foi possível concluir a operação.";
}

export async function listAppointmentsAction(
  options: ListAppointmentsOptions
): Promise<ActionResult<Awaited<ReturnType<typeof listAppointments>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.view");
    const data = await listAppointments(options);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getAppointmentAction(
  appointmentId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getAppointment>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.view");
    const data = await getAppointment(appointmentId);
    if (!data) return { ok: false, error: "Agendamento não encontrado." };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function createAppointmentAction(
  input: CreateAppointmentInput
): Promise<ActionResult<Awaited<ReturnType<typeof createAppointment>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.create");
    const data = await createAppointment(input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateAppointmentAction(
  appointmentId: string,
  input: UpdateAppointmentInput
): Promise<ActionResult<Awaited<ReturnType<typeof updateAppointment>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.edit");
    const data = await updateAppointment(appointmentId, input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function cancelAppointmentAction(
  appointmentId: string
): Promise<ActionResult<Awaited<ReturnType<typeof cancelAppointment>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.cancel");
    const data = await cancelAppointment(appointmentId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function confirmAppointmentAction(
  appointmentId: string
): Promise<ActionResult<Awaited<ReturnType<typeof confirmAppointment>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.edit");
    const data = await confirmAppointment(appointmentId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function completeAppointmentAction(
  appointmentId: string
): Promise<ActionResult<Awaited<ReturnType<typeof completeAppointment>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.edit");
    const data = await completeAppointment(appointmentId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function markNoShowAction(
  appointmentId: string
): Promise<ActionResult<Awaited<ReturnType<typeof markNoShow>>>> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.edit");
    const data = await markNoShow(appointmentId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function listClinicProfessionalsAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof listClinicProfessionals>>>
> {
  try {
    await requireModule("AGENDA");
    await requirePermission("agenda.view");
    const data = await listClinicProfessionals();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
