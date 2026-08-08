"use server";

import {
  listAllClinics,
  listClinicModules,
  toggleClinicModule,
  listPrivateBetaAllowlist,
  setUserBetaAccess,
} from "@/lib/platform-admin/platform-admin-service";

/**
 * Every action here relies on the SERVICE layer's own isPlatformAdmin
 * check (requirePlatformAdmin() in platform-admin-service.ts) — there
 * is deliberately no separate requireModule/requirePermission call
 * here, because this is explicitly OUTSIDE the clinic/tenant RBAC
 * system. A regular clinic OWNER, even with every permission granted,
 * must never be able to call these.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED") return "Você precisa estar autenticado.";
    if (err.message === "FORBIDDEN") return "Acesso restrito a administradores da plataforma.";
    if (err.message === "NOT_FOUND") return "Registro não encontrado.";
    if (err.message.startsWith("VALIDATION:")) return "Dados inválidos.";
  }
  return "Não foi possível concluir a operação.";
}

export async function listAllClinicsAction(): Promise<ActionResult<Awaited<ReturnType<typeof listAllClinics>>>> {
  try {
    const data = await listAllClinics();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function listClinicModulesAction(
  clinicId: string
): Promise<ActionResult<Awaited<ReturnType<typeof listClinicModules>>>> {
  try {
    const data = await listClinicModules(clinicId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function toggleClinicModuleAction(
  clinicId: string,
  moduleKey: string,
  enabled: boolean
): Promise<ActionResult<null>> {
  try {
    await toggleClinicModule(clinicId, moduleKey, enabled);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function listPrivateBetaAllowlistAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof listPrivateBetaAllowlist>>>
> {
  try {
    const data = await listPrivateBetaAllowlist();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function setUserBetaAccessAction(userId: string, allowed: boolean): Promise<ActionResult<null>> {
  try {
    await setUserBetaAccess(userId, allowed);
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
