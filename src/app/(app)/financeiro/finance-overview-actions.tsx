"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markAsPaidAction, cancelFinancialEntryAction } from "@/app/actions/finance-actions";
import { Button } from "@/components/ui/button";

export function FinanceOverviewActions({
  entryId,
  status,
  canEdit,
  canDelete,
}: {
  entryId: string;
  status: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action(entryId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Erro");
      return;
    }
    router.refresh();
  }

  if (status === "paid" || status === "cancelled") {
    return error ? <p className="text-xs text-red-600">{error}</p> : null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canEdit && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => run(markAsPaidAction)}>
            Marcar pago
          </Button>
        )}
        {canDelete && (
          <Button type="button" variant="danger" disabled={busy} onClick={() => run(cancelFinancialEntryAction)}>
            Cancelar
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
