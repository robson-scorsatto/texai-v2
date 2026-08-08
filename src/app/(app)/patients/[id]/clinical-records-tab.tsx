"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClinicalRecord } from "@/db/schema";
import {
  createClinicalRecordAction,
  updateClinicalRecordAction,
  signClinicalRecordAction,
} from "@/app/actions/clinical-records-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const RECORD_TYPE_LABELS: Record<string, string> = {
  evolucao: "Evolução",
  anamnese: "Anamnese",
  procedimento: "Procedimento",
};

function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ClinicalRecordsTab({
  patientId,
  canEdit,
  canSign,
  initialRecords,
}: {
  patientId: string;
  canEdit: boolean;
  canSign: boolean;
  initialRecords: ClinicalRecord[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  async function handleCreate(formData: FormData) {
    setError(null);
    setSubmitting(true);
    const result = await createClinicalRecordAction({
      patientId,
      recordType: String(formData.get("recordType") ?? "evolucao") as "evolucao" | "anamnese" | "procedimento",
      content: String(formData.get("content") ?? ""),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowNewForm(false);
    router.refresh();
  }

  async function handleUpdate(recordId: string, formData: FormData) {
    setError(null);
    setSubmitting(true);
    const result = await updateClinicalRecordAction(recordId, String(formData.get("content") ?? ""));
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleSign(recordId: string) {
    setError(null);
    setSubmitting(true);
    const result = await signClinicalRecordAction(recordId);
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

      {canEdit && (
        <div className="mb-4">
          {!showNewForm ? (
            <Button type="button" variant="secondary" onClick={() => setShowNewForm(true)}>
              Nova entrada
            </Button>
          ) : (
            <form action={handleCreate} className="space-y-3 rounded-lg border border-gray-200 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Tipo</label>
                <select
                  name="recordType"
                  defaultValue="evolucao"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                >
                  <option value="evolucao">Evolução</option>
                  <option value="anamnese">Anamnese</option>
                  <option value="procedimento">Procedimento</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Conteúdo *</label>
                <textarea
                  name="content"
                  required
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  placeholder="Descreva a evolução, anamnese ou procedimento..."
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Salvando..." : "Salvar entrada"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowNewForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {initialRecords.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma entrada de prontuário ainda.</p>
      ) : (
        <ul className="space-y-4">
          {[...initialRecords].reverse().map((record) => (
            <li key={record.id} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {RECORD_TYPE_LABELS[record.recordType] ?? record.recordType}
                </span>
                <span className="text-xs text-gray-400">{formatDateTime(record.createdAt)}</span>
              </div>

              {editingId === record.id ? (
                <form action={(fd) => handleUpdate(record.id, fd)} className="space-y-3">
                  <textarea
                    name="content"
                    required
                    rows={4}
                    defaultValue={record.content}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Salvando..." : "Salvar alterações"}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-gray-900">{record.content}</p>
                  <div className="mt-3 flex items-center justify-between">
                    {record.signedAt ? (
                      <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
                        Assinado em {formatDateTime(record.signedAt)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                        Rascunho — não assinado
                      </span>
                    )}
                    {!record.signedAt && (
                      <div className="flex gap-2">
                        {canEdit && (
                          <Button type="button" variant="secondary" onClick={() => setEditingId(record.id)}>
                            Editar
                          </Button>
                        )}
                        {canSign && (
                          <Button type="button" disabled={submitting} onClick={() => handleSign(record.id)}>
                            Assinar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
