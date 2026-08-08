"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FinancialEntry } from "@/db/schema";
import {
  createFinancialEntryAction,
  markAsPaidAction,
  cancelFinancialEntryAction,
} from "@/app/actions/finance-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "A receber", className: "bg-yellow-50 text-yellow-700" },
  paid: { label: "Recebido", className: "bg-green-50 text-green-700" },
  overdue: { label: "Em atraso", className: "bg-red-50 text-red-700" },
  cancelled: { label: "Cancelado", className: "bg-gray-100 text-gray-500" },
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FinanceTab({
  patientId,
  canCreate,
  canEdit,
  canDelete,
  initialEntries,
}: {
  patientId: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  initialEntries: FinancialEntry[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  async function handleCreate(formData: FormData) {
    setError(null);
    setSubmitting(true);
    const amountReais = Number(formData.get("amount") ?? "0");
    const result = await createFinancialEntryAction({
      patientId,
      description: String(formData.get("description") ?? ""),
      amountCents: Math.round(amountReais * 100),
      dueDate: String(formData.get("dueDate") ?? "") || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowNewForm(false);
    router.refresh();
  }

  async function handleMarkPaid(entryId: string) {
    setSubmitting(true);
    const result = await markAsPaidAction(entryId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleCancel(entryId: string) {
    setSubmitting(true);
    const result = await cancelFinancialEntryAction(entryId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {canCreate && (
        <div className="mb-4">
          {!showNewForm ? (
            <Button type="button" variant="secondary" onClick={() => setShowNewForm(true)}>
              Novo lançamento
            </Button>
          ) : (
            <form action={handleCreate} className="space-y-3 rounded-lg border border-gray-200 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Descrição *</label>
                <Input name="description" required placeholder="Ex.: Consulta, Limpeza..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Valor (R$) *</label>
                  <Input name="amount" type="number" step="0.01" min="0.01" required placeholder="0,00" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Vencimento</label>
                  <Input name="dueDate" type="date" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Salvando..." : "Salvar lançamento"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowNewForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {initialEntries.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum lançamento financeiro ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {initialEntries.map((entry) => {
            const statusInfo = STATUS_LABELS[entry.status] ?? { label: entry.status, className: "" };
            return (
              <li key={entry.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{entry.description}</p>
                  <p className="text-xs text-gray-500">
                    {formatBRL(entry.amountCents)}
                    {entry.dueDate ? ` · vencimento ${entry.dueDate}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
                  {canEdit && entry.status === "pending" && (
                    <Button type="button" variant="secondary" disabled={submitting} onClick={() => handleMarkPaid(entry.id)}>
                      Marcar pago
                    </Button>
                  )}
                  {canEdit && entry.status === "overdue" && (
                    <Button type="button" variant="secondary" disabled={submitting} onClick={() => handleMarkPaid(entry.id)}>
                      Marcar pago
                    </Button>
                  )}
                  {canDelete && (entry.status === "pending" || entry.status === "overdue") && (
                    <Button type="button" variant="danger" disabled={submitting} onClick={() => handleCancel(entry.id)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
