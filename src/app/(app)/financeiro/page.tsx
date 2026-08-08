import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasModule } from "@/lib/entitlements/modules";
import { hasPermission } from "@/lib/rbac/permissions";
import { listFinancialEntries, getFinancialTotals } from "@/lib/finance/finance-service";
import { getDb } from "@/db/client";
import { patients as patientsTable } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { FinanceOverviewActions } from "./finance-overview-actions";

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "A receber", className: "bg-yellow-50 text-yellow-700" },
  paid: { label: "Recebido", className: "bg-green-50 text-green-700" },
  overdue: { label: "Em atraso", className: "bg-red-50 text-red-700" },
  cancelled: { label: "Cancelado", className: "bg-gray-100 text-gray-500" },
};

export default async function FinanceOverviewPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/select-clinic");

  const moduleEnabled = await hasModule("FINANCE");
  if (!moduleEnabled) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">
            O módulo <strong>Financeiro</strong> não está habilitado para esta clínica.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-gray-500 underline">
            Voltar ao painel
          </Link>
        </Card>
      </main>
    );
  }

  const canView = await hasPermission("financial.view");
  if (!canView) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">Você não tem permissão para ver o financeiro.</p>
        </Card>
      </main>
    );
  }

  const [canEdit, canDelete] = await Promise.all([
    hasPermission("financial.edit"),
    hasPermission("financial.delete"),
  ]);

  const [totals, entries] = await Promise.all([
    getFinancialTotals(),
    listFinancialEntries({ includeCancelled: true }),
  ]);

  const db = await getDb();
  const patientIds = [...new Set(entries.map((e) => e.patientId).filter((v): v is string => !!v))];
  const patientRows = patientIds.length
    ? await db.select({ id: patientsTable.id, name: patientsTable.name }).from(patientsTable).where(inArray(patientsTable.id, patientIds))
    : [];
  const patientNameById = new Map(patientRows.map((p) => [p.id, p.name]));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/dashboard" className="text-xs text-gray-400 hover:underline">
          ← Painel
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">Financeiro</h1>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-wide text-gray-400">A receber</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{formatBRL(totals.receivableCents)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-gray-400">Recebido</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{formatBRL(totals.receivedCents)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-gray-400">Em atraso</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{formatBRL(totals.overdueCents)}</p>
          </Card>
        </div>

        <Card className="p-0">
          {entries.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Nenhum lançamento financeiro ainda.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {entries.map((entry) => {
                const statusInfo = STATUS_LABELS[entry.status] ?? { label: entry.status, className: "" };
                return (
                  <li key={entry.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                      <p className="text-xs text-gray-500">
                        {formatBRL(entry.amountCents)}
                        {entry.patientId && patientNameById.get(entry.patientId)
                          ? ` · ${patientNameById.get(entry.patientId)}`
                          : ""}
                        {entry.dueDate ? ` · vencimento ${entry.dueDate}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                      <FinanceOverviewActions
                        entryId={entry.id}
                        status={entry.status}
                        canEdit={canEdit}
                        canDelete={canDelete}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
