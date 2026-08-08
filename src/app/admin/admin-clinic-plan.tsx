"use client";

import { useState } from "react";
import type { Plan } from "@/db/schema";
import type { SubscriptionWithPlan } from "@/lib/billing/billing-service";
import {
  getSubscriptionAction,
  changeSubscriptionPlanAction,
  createSubscriptionAction,
  cancelSubscriptionAction,
} from "@/app/actions/billing-actions";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<string, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  cancelled: "Cancelada",
};

function formatPrice(cents: number | null): string {
  if (cents === null) return "Sob consulta";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Per-clinic plan/subscription management, embedded inside the expanded
 * row of AdminClinicsTable. SCAFFOLDING — changing the plan here does
 * NOT charge anything; it's a manual entitlement action (see
 * billing-service.ts doc comment).
 */
export function AdminClinicPlan({ clinicId, allPlans }: { clinicId: string; allPlans: Plan[] }) {
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null | "loading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  if (subscription === "loading") {
    getSubscriptionAction(clinicId).then((result) => {
      if (!result.ok) {
        setError(result.error);
        setSubscription(null);
        return;
      }
      setSubscription(result.data);
      setSelectedPlanId(result.data?.planId ?? allPlans[0]?.id ?? "");
    });
    return <p className="text-xs text-gray-400">Carregando assinatura...</p>;
  }

  async function handleCreate() {
    if (!selectedPlanId) return;
    setError(null);
    const result = await createSubscriptionAction(clinicId, selectedPlanId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getSubscriptionAction(clinicId);
    if (refreshed.ok) setSubscription(refreshed.data);
  }

  async function handleChangePlan() {
    if (!selectedPlanId) return;
    setError(null);
    const result = await changeSubscriptionPlanAction(clinicId, selectedPlanId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubscription((prev) => (prev && prev !== "loading" ? { ...result.data, plan: allPlans.find((p) => p.id === selectedPlanId)! } : prev));
  }

  async function handleCancel() {
    setError(null);
    const result = await cancelSubscriptionAction(clinicId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubscription((prev) => (prev && prev !== "loading" ? { ...prev, status: "cancelled" } : prev));
  }

  return (
    <div className="space-y-3 text-sm">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {subscription ? (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
          <div>
            <p className="font-medium text-gray-900">{subscription.plan.name}</p>
            <p className="text-xs text-gray-500">
              {formatPrice(subscription.plan.priceCents)} / {subscription.plan.billingInterval === "monthly" ? "mês" : "ano"} —{" "}
              <span className={subscription.status === "cancelled" ? "text-red-600" : "text-green-600"}>
                {STATUS_LABEL[subscription.status] ?? subscription.status}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Esta clínica ainda não possui assinatura.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          value={selectedPlanId}
          onChange={(e) => setSelectedPlanId(e.target.value)}
        >
          {allPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatPrice(p.priceCents)}
            </option>
          ))}
        </select>

        {subscription ? (
          <>
            <Button type="button" variant="secondary" onClick={handleChangePlan}>
              Trocar plano
            </Button>
            {subscription.status !== "cancelled" && (
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Cancelar assinatura
              </Button>
            )}
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={handleCreate}>
            Criar assinatura
          </Button>
        )}
      </div>
    </div>
  );
}
