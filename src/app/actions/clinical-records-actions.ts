"use server";

import { requireModule } from "@/lib/entitlements/modules";
import { requirePermission } from "@/lib/rbac/permissions";
import {
  listClinicalRecords,
  getClinicalRecord,
  createClinicalRecord,
  updateClinicalRecord,
  signClinicalRecord,
  type CreateClinicalRecordInput,
} from "@/lib/clinical-records/clinical-records-service";

/**
 * Same two-gate pattern as patients/agenda actions: requireModule
 * ('CLINICAL_RECORD') then requirePermission('clinical_record.*'), both
 * re-resolved from the server session on every call.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED" || err.message === "UNAUTHENTICATED_OR_NO_TENANT") {
      return "Você precisa estar autenticado e com uma clínica selecionada.";
    }
    if (err.message === "FORBIDDEN") return "Você não tem permissão para esta ação.";
    if (err.message.startsWith("MODULE_NOT_ENABLED")) {
      return "O módulo de Prontuário Clínico não está habilitado para esta clínica.";
    }
    if (err.message === "NOT_FOUND") return "Registro não encontrado.";
    if (err.message === "IMMUTABLE:already_signed") {
      return "Este registro já foi assinado e não pode mais ser editado.";
    }
    if (err.message.startsWith("VALIDATION:")) {
      const reasons: Record<string, string> = {
        content_required: "O conteúdo do registro não pode estar vazio.",
        patient_not_in_tenant: "Paciente inválido para esta clínica.",
        appointment_not_in_tenant: "Agendamento inválido para esta clínica.",
      };
      const reason = err.message.split(":")[1];
      return reasons[reason] ?? "Dados inválidos.";
    }
  }
  return "Não foi possível concluir a operação.";
}

export async function listClinicalRecordsAction(
  patientId: string
): Promise<ActionResult<Awaited<ReturnType<typeof listClinicalRecords>>>> {
  try {
    await requireModule("CLINICAL_RECORD");
    await requirePermission("clinical_record.view");
    const data = await listClinicalRecords(patientId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getClinicalRecordAction(
  recordId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getClinicalRecord>>>> {
  try {
    await requireModule("CLINICAL_RECORD");
    await requirePermission("clinical_record.view");
    const data = await getClinicalRecord(recordId);
    if (!data) return { ok: false, error: "Registro não encontrado." };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function createClinicalRecordAction(
  input: CreateClinicalRecordInput
): Promise<ActionResult<Awaited<ReturnType<typeof createClinicalRecord>>>> {
  try {
    await requireModule("CLINICAL_RECORD");
    await requirePermission("clinical_record.edit");
    const data = await createClinicalRecord(input);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateClinicalRecordAction(
  recordId: string,
  content: string
): Promise<ActionResult<Awaited<ReturnType<typeof updateClinicalRecord>>>> {
  try {
    await requireModule("CLINICAL_RECORD");
    await requirePermission("clinical_record.edit");
    const data = await updateClinicalRecord(recordId, content);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function signClinicalRecordAction(
  recordId: string
): Promise<ActionResult<Awaited<ReturnType<typeof signClinicalRecord>>>> {
  try {
    await requireModule("CLINICAL_RECORD");
    await requirePermission("clinical_record.sign");
    const data = await signClinicalRecord(recordId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
