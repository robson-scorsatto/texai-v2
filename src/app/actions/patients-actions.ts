"use server";

import { revalidatePath } from "next/cache";

/**
 * revalidatePath() throws outside a real Next.js request-render scope
 * (e.g. in unit tests that exercise server actions directly, or in any
 * future non-HTTP caller). Cache invalidation failing must never mask
 * an otherwise-successful write — so every call site wraps it here
 * instead of letting the error propagate to the caller.
 */
function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // best-effort only — see comment above
  }
}
import { requireModule } from "@/lib/entitlements/modules";
import { requirePermission } from "@/lib/rbac/permissions";
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deactivatePatient,
  reactivatePatient,
  type CreatePatientInput,
  type UpdatePatientInput,
  type ListPatientsOptions,
} from "@/lib/patients/patients-service";

/**
 * Every action here follows the same two-gate pattern before touching
 * data: requireModule('PATIENTS') (is this clinic entitled to the
 * module at all) THEN requirePermission('patients.*') (can this specific
 * role do this specific action). Both re-resolve tenant context from the
 * server session on every call — nothing here trusts client input for
 * "who am I" / "which clinic". The service layer adds a third layer
 * (tenant-scoped queries) so even a bug in the gates here can't leak
 * cross-tenant data.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED" || err.message === "UNAUTHENTICATED_OR_NO_TENANT") {
      return "Você precisa estar autenticado e com uma clínica selecionada.";
    }
    if (err.message === "FORBIDDEN") return "Você não tem permissão para esta ação.";
    if (err.message.startsWith("MODULE_NOT_ENABLED")) {
      return "O módulo de Pacientes não está habilitado para esta clínica.";
    }
    if (err.message === "NOT_FOUND") return "Paciente não encontrado.";
    if (err.message.startsWith("VALIDATION:")) return "Dados inválidos: " + err.message.split(":")[1];
  }
  return "Não foi possível concluir a operação.";
}

export async function listPatientsAction(
  options: ListPatientsOptions = {}
): Promise<ActionResult<Awaited<ReturnType<typeof listPatients>>>> {
  try {
    await requireModule("PATIENTS");
    await requirePermission("patients.view");
    const data = await listPatients(options);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getPatientAction(
  patientId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getPatient>>>> {
  try {
    await requireModule("PATIENTS");
    await requirePermission("patients.view");
    const data = await getPatient(patientId);
    if (!data) return { ok: false, error: "Paciente não encontrado." };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function createPatientAction(
  input: CreatePatientInput
): Promise<ActionResult<Awaited<ReturnType<typeof createPatient>>>> {
  try {
    await requireModule("PATIENTS");
    await requirePermission("patients.create");
    const data = await createPatient(input);
    safeRevalidate("/patients");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updatePatientAction(
  patientId: string,
  input: UpdatePatientInput
): Promise<ActionResult<Awaited<ReturnType<typeof updatePatient>>>> {
  try {
    await requireModule("PATIENTS");
    await requirePermission("patients.edit");
    const data = await updatePatient(patientId, input);
    safeRevalidate("/patients");
    safeRevalidate(`/patients/${patientId}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deactivatePatientAction(
  patientId: string
): Promise<ActionResult<Awaited<ReturnType<typeof deactivatePatient>>>> {
  try {
    await requireModule("PATIENTS");
    await requirePermission("patients.delete");
    const data = await deactivatePatient(patientId);
    safeRevalidate("/patients");
    safeRevalidate(`/patients/${patientId}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function reactivatePatientAction(
  patientId: string
): Promise<ActionResult<Awaited<ReturnType<typeof reactivatePatient>>>> {
  try {
    await requireModule("PATIENTS");
    await requirePermission("patients.edit");
    const data = await reactivatePatient(patientId);
    safeRevalidate("/patients");
    safeRevalidate(`/patients/${patientId}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
