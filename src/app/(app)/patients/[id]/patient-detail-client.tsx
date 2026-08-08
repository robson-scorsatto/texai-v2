"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Patient, ClinicalRecord } from "@/db/schema";
import {
  updatePatientAction,
  deactivatePatientAction,
  reactivatePatientAction,
} from "@/app/actions/patients-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clsx } from "@/lib/clsx";
import { ClinicalRecordsTab } from "./clinical-records-tab";

const TABS = [
  { key: "dados", label: "Dados" },
  { key: "prontuario", label: "Prontuário" },
  { key: "financeiro", label: "Financeiro" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function PatientDetailClient({
  patient,
  canEdit,
  canDelete,
  clinicalRecordModuleEnabled,
  canViewRecords,
  canEditRecords,
  canSignRecords,
  initialClinicalRecords,
}: {
  patient: Patient;
  canEdit: boolean;
  canDelete: boolean;
  clinicalRecordModuleEnabled: boolean;
  canViewRecords: boolean;
  canEditRecords: boolean;
  canSignRecords: boolean;
  initialClinicalRecords: ClinicalRecord[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("dados");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave(formData: FormData) {
    setError(null);
    setSubmitting(true);

    const result = await updatePatientAction(patient.id, {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? "") || null,
      prefersWhatsapp: formData.get("prefersWhatsapp") === "on",
      email: String(formData.get("email") ?? "") || null,
      cpf: String(formData.get("cpf") ?? "") || null,
      birthDate: String(formData.get("birthDate") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function handleToggleActive() {
    setSubmitting(true);
    const result = patient.isActive
      ? await deactivatePatientAction(patient.id)
      : await reactivatePatientAction(patient.id);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "px-4 py-2 text-sm font-medium",
              tab === t.key
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "prontuario" && (
        <>
          {!clinicalRecordModuleEnabled ? (
            <Card>
              <p className="text-sm text-gray-500">
                O módulo Prontuário Clínico não está habilitado para esta clínica.
              </p>
            </Card>
          ) : !canViewRecords ? (
            <Card>
              <p className="text-sm text-gray-500">Você não tem permissão para ver o prontuário.</p>
            </Card>
          ) : (
            <ClinicalRecordsTab
              patientId={patient.id}
              canEdit={canEditRecords}
              canSign={canSignRecords}
              initialRecords={initialClinicalRecords}
            />
          )}
        </>
      )}

      {tab === "financeiro" && (
        <Card>
          <p className="text-sm text-gray-500">
            Módulo Financeiro por paciente ainda não implementado — planejado para um sprint futuro.
          </p>
        </Card>
      )}

      {tab === "dados" && (
        <Card>
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {!editing ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-gray-400">Telefone / WhatsApp</dt>
                  <dd className="text-gray-900">{patient.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">E-mail</dt>
                  <dd className="text-gray-900">{patient.email ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">CPF</dt>
                  <dd className="text-gray-900">{patient.cpf ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Data de nascimento</dt>
                  <dd className="text-gray-900">{patient.birthDate ?? "—"}</dd>
                </div>
              </dl>
              {patient.notes && (
                <div>
                  <dt className="text-xs text-gray-400">Observações</dt>
                  <dd className="text-sm text-gray-900">{patient.notes}</dd>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {canEdit && (
                  <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                    Editar
                  </Button>
                )}
                {canDelete && (
                  <Button type="button" variant="danger" onClick={handleToggleActive} disabled={submitting}>
                    {patient.isActive ? "Desativar paciente" : "Reativar paciente"}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <form action={handleSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Nome completo *</label>
                <Input name="name" required defaultValue={patient.name} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Telefone / WhatsApp</label>
                  <Input name="phone" defaultValue={patient.phone ?? ""} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">E-mail</label>
                  <Input name="email" type="email" defaultValue={patient.email ?? ""} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">CPF</label>
                  <Input name="cpf" defaultValue={patient.cpf ?? ""} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Data de nascimento</label>
                  <Input name="birthDate" type="date" defaultValue={patient.birthDate ?? ""} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="prefersWhatsapp" defaultChecked={patient.prefersWhatsapp} />
                Prefere ser contatado por WhatsApp
              </label>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Observações</label>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={patient.notes ?? ""}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Salvando..." : "Salvar alterações"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
