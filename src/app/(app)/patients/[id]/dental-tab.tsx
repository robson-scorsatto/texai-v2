"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ToothRecord, ToothStatus } from "@/db/schema";
import { addToothRecordAction } from "@/app/actions/dental-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";

// FDI notation, permanent dentition, in visual arcade order (upper right
// -> upper left, then lower left -> lower right — matches how the
// legacy platform's odontograma laid it out, see Auditoria 01 seção 3.2).
const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const STATUS_COLORS: Record<string, string> = {
  saudavel: "bg-white border-gray-300 text-gray-700",
  cariado: "bg-red-100 border-red-400 text-red-700",
  restaurado: "bg-blue-100 border-blue-400 text-blue-700",
  extraido: "bg-gray-300 border-gray-400 text-gray-500 line-through",
  implante: "bg-purple-100 border-purple-400 text-purple-700",
  em_tratamento: "bg-yellow-100 border-yellow-400 text-yellow-700",
};

const STATUS_LABELS: Record<string, string> = {
  saudavel: "Saudável",
  cariado: "Cariado",
  restaurado: "Restaurado",
  extraido: "Extraído",
  implante: "Implante",
  em_tratamento: "Em tratamento",
};

function ToothButton({
  toothNumber,
  status,
  onClick,
}: {
  toothNumber: number;
  status: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex h-10 w-10 flex-col items-center justify-center rounded-md border text-[10px] font-medium transition-colors hover:opacity-75",
        STATUS_COLORS[status] ?? STATUS_COLORS.saudavel
      )}
      title={`Dente ${toothNumber} — ${STATUS_LABELS[status] ?? status}`}
    >
      {toothNumber}
    </button>
  );
}

export function DentalTab({
  patientId,
  canEdit,
  initialRecords,
}: {
  patientId: string;
  canEdit: boolean;
  initialRecords: ToothRecord[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);

  const currentStatusByTooth = new Map<number, string>();
  for (const r of initialRecords) {
    currentStatusByTooth.set(r.toothNumber, r.status);
  }

  async function handleAddRecord(formData: FormData) {
    if (!selectedTooth) return;
    setError(null);
    setSubmitting(true);
    const result = await addToothRecordAction(patientId, {
      toothNumber: selectedTooth,
      status: String(formData.get("status") ?? "saudavel") as ToothStatus,
      procedureNote: String(formData.get("procedureNote") ?? "") || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelectedTooth(null);
    router.refresh();
  }

  const historyForSelected = selectedTooth
    ? initialRecords.filter((r) => r.toothNumber === selectedTooth).reverse()
    : [];

  return (
    <Card>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <p className="mb-3 text-xs text-gray-400">Dentição permanente — notação FDI. Clique em um dente para ver/registrar procedimentos.</p>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {UPPER_TEETH.map((n) => (
            <ToothButton
              key={n}
              toothNumber={n}
              status={currentStatusByTooth.get(n) ?? "saudavel"}
              onClick={() => setSelectedTooth(n)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {LOWER_TEETH.map((n) => (
            <ToothButton
              key={n}
              toothNumber={n}
              status={currentStatusByTooth.get(n) ?? "saudavel"}
              onClick={() => setSelectedTooth(n)}
            />
          ))}
        </div>
      </div>

      {selectedTooth && (
        <div className="mt-6 rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Dente {selectedTooth}</h3>
            <button type="button" onClick={() => setSelectedTooth(null)} className="text-xs text-gray-400 underline">
              Fechar
            </button>
          </div>

          {historyForSelected.length > 0 && (
            <ul className="mb-4 space-y-2">
              {historyForSelected.map((r) => (
                <li key={r.id} className="text-xs text-gray-600">
                  <span className="font-medium">{STATUS_LABELS[r.status] ?? r.status}</span>
                  {r.procedureNote ? ` — ${r.procedureNote}` : ""}
                  {" · "}
                  {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                </li>
              ))}
            </ul>
          )}

          {canEdit && (
            <form action={handleAddRecord} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
                <select
                  name="status"
                  defaultValue="saudavel"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                >
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Observação do procedimento</label>
                <textarea
                  name="procedureNote"
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Registrar procedimento"}
              </Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
