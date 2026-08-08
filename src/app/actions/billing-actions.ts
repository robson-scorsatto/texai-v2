"use server";

import {
  listPlans,
  listAllPlansForAdmin,
  getSubscription,
  getMyClinicSubscription,
  createSubscription,
  changeSubscriptionPlan,
  cancelSubscription,
  getPlanModules,
} from "@/lib/billing/billing-service";
import type { SubscriptionStatus } from "@/db/schema/billing";

/**
 * Read actions (listPlans, getMyClinicSubscription) are available to any
 * authenticated user of their own clinic. Every mutation and every
 * cross-clinic read relies on the SERVICE layer's own isPlatformAdmin
 * check — same pattern as platform-admin-actions.ts. There is no real
 * billing here: no payment gateway, no checkout. See doc comment in
 * billing-service.ts.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED") return "Você precisa estar autenticado.";
    if (err.message === "FORBIDDEN") return "Acesso restrito a administradores da plataforma.";
    if (err.message === "NOT_FOUND") return "Assinatura ou plano não encontrado.";
    if (err.message === "VALIDATION:unknown_plan") return "Plano inválido.";
    if (err.message === "CONFLICT:subscription_already_exists") return "Esta clínica já possui uma assinatura.";
    if (err.message === "IMMUTABLE:already_cancelled") return "Esta assinatura já está cancelada.";
    if (err.message.startsWith("VALIDATION:")) return "Dados inválidos.";
  }
  return "Não foi possível concluir a operação.";
}

export async function listPlansAction(): Promise<ActionResult<Awaited<ReturnType<typeof listPlans>>>> {
  try {
    const data = await listPlans();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function listAllPlansForAdminAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof listAllPlansForAdmin>>>
> {
  try {
    const data = await listAllPlansForAdmin();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getSubscriptionAction(
  clinicId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getSubscription>>>> {
  try {
    const data = await getSubscription(clinicId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getMyClinicSubscriptionAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof getMyClinicSubscription>>>
> {
  try {
    const data = await getMyClinicSubscription();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function createSubscriptionAction(
  clinicId: string,
  planId: string,
  status?: SubscriptionStatus
): Promise<ActionResult<Awaited<ReturnType<typeof createSubscription>>>> {
  try {
    const data = await createSubscription(clinicId, planId, status);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function changeSubscriptionPlanAction(
  clinicId: string,
  newPlanId: string
): Promise<ActionResult<Awaited<ReturnType<typeof changeSubscriptionPlan>>>> {
  try {
    const data = await changeSubscriptionPlan(clinicId, newPlanId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function cancelSubscriptionAction(
  clinicId: string
): Promise<ActionResult<Awaited<ReturnType<typeof cancelSubscription>>>> {
  try {
    const data = await cancelSubscription(clinicId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function getPlanModulesAction(
  planId: string
): Promise<ActionResult<Awaited<ReturnType<typeof getPlanModules>>>> {
  try {
    const data = await getPlanModules(planId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
