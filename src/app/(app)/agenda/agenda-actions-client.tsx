"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmAppointmentAction,
  completeAppointmentAction,
  cancelAppointmentAction,
  markNoShowAction,
} from "@/app/actions/agenda-actions";
import { Button } from "@/components/ui/button";

export function AgendaActions({
  appointmentId,
  status,
  canEdit,
  canCancel,
}: {
  appointmentId: string;
  status: string;
  canEdit: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action(appointmentId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Erro");
      return;
    }
    router.refresh();
  }

  if (status === "cancelled" || status === "completed" || status === "no_show") {
    return error ? <p className="text-xs text-red-600">{error}</p> : null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canEdit && status === "scheduled" && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => run(confirmAppointmentAction)}
          >
            Confirmar
          </Button>
        )}
        {canEdit && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => run(completeAppointmentAction)}>
            Concluir
          </Button>
        )}
        {canEdit && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => run(markNoShowAction)}>
            Faltou
          </Button>
        )}
        {canCancel && (
          <Button type="button" variant="danger" disabled={busy} onClick={() => run(cancelAppointmentAction)}>
            Cancelar
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
