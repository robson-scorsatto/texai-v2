"use client";

import { useState } from "react";
import type { ClinicSummary } from "@/lib/platform-admin/platform-admin-service";
import type { ClinicModuleStatus } from "@/lib/platform-admin/platform-admin-service";
import { listClinicModulesAction, toggleClinicModuleAction } from "@/app/actions/platform-admin-actions";
import { Button } from "@/components/ui/button";
import { AdminClinicPlan } from "./admin-clinic-plan";
import { AdminClinicWhatsApp } from "./admin-clinic-whatsapp";
import type { Plan } from "@/db/schema";

export function AdminClinicsTable({ initialClinics, allPlans }: { initialClinics: ClinicSummary[]; allPlans: Plan[] }) {
  const [expandedClinicId, setExpandedClinicId] = useState<string | null>(null);
  const [expandedPlanClinicId, setExpandedPlanClinicId] = useState<string | null>(null);
  const [expandedWhatsAppClinicId, setExpandedWhatsAppClinicId] = useState<string | null>(null);
  const [modulesByClinic, setModulesByClinic] = useState<Record<string, ClinicModuleStatus[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleExpand(clinicId: string) {
    if (expandedClinicId === clinicId) {
      setExpandedClinicId(null);
      return;
    }
    setExpandedClinicId(clinicId);
    if (!modulesByClinic[clinicId]) {
      setLoading(true);
      const result = await listClinicModulesAction(clinicId);
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setModulesByClinic((prev) => ({ ...prev, [clinicId]: result.data }));
    }
  }

  function togglePlanExpand(clinicId: string) {
    setExpandedPlanClinicId((prev) => (prev === clinicId ? null : clinicId));
  }

  function toggleWhatsAppExpand(clinicId: string) {
    setExpandedWhatsAppClinicId((prev) => (prev === clinicId ? null : clinicId));
  }

  async function handleToggleModule(clinicId: string, moduleKey: string, currentlyEnabled: boolean) {
    setError(null);
    const result = await toggleClinicModuleAction(clinicId, moduleKey, !currentlyEnabled);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setModulesByClinic((prev) => ({
      ...prev,
      [clinicId]: prev[clinicId].map((m) => (m.key === moduleKey ? { ...m, enabled: !currentlyEnabled } : m)),
    }));
  }

  return (
    <div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase text-gray-400">
            <th className="pb-2">Nome</th>
            <th className="pb-2">Tipo</th>
            <th className="pb-2">Status</th>
            <th className="pb-2">Membros</th>
            <th className="pb-2">Pacientes</th>
            <th className="pb-2">Dev seed?</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {initialClinics.map((c) => (
            <>
              <tr key={c.id} className="border-b border-gray-100">
                <td className="py-2">{c.name}</td>
                <td className="py-2 text-gray-500">{c.businessType}</td>
                <td className="py-2">
                  <span className={c.isActive ? "text-green-600" : "text-red-600"}>
                    {c.isActive ? "Ativa" : "Inativa"}
                  </span>
                </td>
                <td className="py-2 text-gray-500">{c.memberCount}</td>
                <td className="py-2 text-gray-500">{c.patientCount}</td>
                <td className="py-2 text-gray-400">{c.isDevSeedData ? "sim" : "não"}</td>
                <td className="py-2 text-right">
                  <Button type="button" variant="secondary" onClick={() => toggleWhatsAppExpand(c.id)}>
                    {expandedWhatsAppClinicId === c.id ? "Fechar" : "WhatsApp"}
                  </Button>{" "}
                  <Button type="button" variant="secondary" onClick={() => togglePlanExpand(c.id)}>
                    {expandedPlanClinicId === c.id ? "Fechar" : "Plano"}
                  </Button>{" "}
                  <Button type="button" variant="secondary" onClick={() => toggleExpand(c.id)}>
                    {expandedClinicId === c.id ? "Fechar" : "Módulos"}
                  </Button>
                </td>
              </tr>
              {expandedClinicId === c.id && (
                <tr key={`${c.id}-modules`} className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={7} className="py-3">
                    {loading && !modulesByClinic[c.id] ? (
                      <p className="text-xs text-gray-400">Carregando módulos...</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(modulesByClinic[c.id] ?? []).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleToggleModule(c.id, m.key, m.enabled)}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                              m.enabled
                                ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                                : "border-gray-300 bg-white text-gray-500 hover:bg-gray-100"
                            }`}
                            title={m.description ?? undefined}
                          >
                            {m.label} {m.enabled ? "✓" : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
              {expandedPlanClinicId === c.id && (
                <tr key={`${c.id}-plan`} className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={7} className="py-3">
                    <AdminClinicPlan clinicId={c.id} allPlans={allPlans} />
                  </td>
                </tr>
              )}
              {expandedWhatsAppClinicId === c.id && (
                <tr key={`${c.id}-whatsapp`} className="border-b border-gray-100 bg-gray-50">
                  <td colSpan={7} className="py-3">
                    <AdminClinicWhatsApp clinicId={c.id} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
