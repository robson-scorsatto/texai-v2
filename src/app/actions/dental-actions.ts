"use server";

import { requireModule } from "@/lib/entitlements/modules";
import { requirePermission } from "@/lib/rbac/permissions";
import {
  getOrCreateDentalChart,
  listToothRecords,
  addToothRecord,
  getCurrentToothStatuses,
  type AddToothRecordInput,
} from "@/lib/dental/dental-service";

/**
 * Odontograma is treated as an extension of Prontuário Clínico — it
 * reuses clinical_record.view/edit permissions rather than a separate
 * dental.* permission set, since a tooth record IS a clinical note in
 * spirit (see dental-service.ts doc comment). requireModule('DENTAL')
 * still gates the module independently, so a clinic can have
 * CLINICAL_RECORD without DENTAL (e.g. a non-dental vertical later).
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED" || err.message === "UNAUTHENTICATED_OR_NO_TENANT") {
      return "Você precisa estar autenticado e com uma clínica selecionada.";
    }
    if (err.message === "FORBIDDEN") return "Você não tem permissão para esta ação.";
    if (err.message.startsWith("MODULE_NOT_ENABLED")) {
      return "O módulo Odontograma não está habilitado para esta clínica.";
    }
    if (err.message.startsWith("VALIDATION:")) {
      const reasons: Record<string, string> = {
        patient_not_in_tenant: "Paciente inválido para esta clínica.",
        invalid_tooth_number: "Número de dente inválido (use a notação FDI, ex.: 11 a 48).",
      };
      const reason = err.message.split(":")[1];
      return reasons[reason] ?? "Dados inválidos.";
    }
  }
  return "Não foi possível concluir a operação.";
}

export async function getOrCreateDentalChartAction(
  patientId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getOrCreateDentalChart>>>> {
  try {
    await requireModule("DENTAL");
    await requirePermission("clinical_record.view");
    const data = await getOrCreateDentalChart(patientId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function listToothRecordsAction(
  patientId: string
): Promise<ActionResult<Awaited<ReturnType<typeof listToothRecords>>>> {
  try {
    await requireModule("DENTAL");
    await requirePermission("clinical_record.view");
    const data = await listToothRecords(patientId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getCurrentToothStatusesAction(
  patientId: string
): Promise<ActionResult<Array<[number, string]>>> {
  try {
    await requireModule("DENTAL");
    await requirePermission("clinical_record.view");
    const data = await getCurrentToothStatuses(patientId);
    return { ok: true, data: [...data.entries()] };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function addToothRecordAction(
  patientId: string,
  input: AddToothRecordInput
): Promise<ActionResult<Awaited<ReturnType<typeof addToothRecord>>>> {
  try {
    await requireModule("DENTAL");
    await requirePermission("clinical_record.edit");
    const data = await addToothRecord(patientId, input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
