import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { getMyClinicSubscription } from "@/lib/billing/billing-service";
import { Card } from "@/components/ui/card";

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
 * Self-service "current plan" view for a clinic. Read-only — plan
 * changes are a platform-admin action for now (see docs/REQUISITOS.md,
 * Sprint 14: this is scaffolding, not a self-serve billing portal).
 */
export default async function PlanoPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/select-clinic");

  const subscription = await getMyClinicSubscription();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/dashboard" className="text-xs text-gray-400 hover:underline">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-gray-900">Meu plano</h1>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-8">
        <Card>
          {subscription ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Plano atual</p>
              <h2 className="mt-1 text-xl font-semibold text-gray-900">{subscription.plan.name}</h2>
              <p className="mt-1 text-sm text-gray-500">{subscription.plan.description}</p>
              <div className="mt-4 flex items-center gap-4 text-sm">
                <span className="font-medium text-gray-900">
                  {formatPrice(subscription.plan.priceCents)}
                  <span className="text-gray-400"> / {subscription.plan.billingInterval === "monthly" ? "mês" : "ano"}</span>
                </span>
                <span className={subscription.status === "cancelled" ? "text-red-600" : "text-green-600"}>
                  {STATUS_LABEL[subscription.status] ?? subscription.status}
                </span>
              </div>
              {subscription.plan.maxUsers && (
                <p className="mt-2 text-xs text-gray-400">Até {subscription.plan.maxUsers} usuários incluídos.</p>
              )}
              <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Esta é uma versão inicial da área de planos — ainda não há cobrança automática nem
                autoatendimento para troca de plano. Para alterar seu plano, entre em contato com o suporte.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Sua clínica ainda não possui um plano configurado. Entre em contato com o suporte.
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
