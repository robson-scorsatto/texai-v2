"use client";

import { useState } from "react";
import type { WhatsAppIntegrationStatus } from "@/lib/integrations/integrations-service";
import {
  getClinicWhatsAppStatusAction,
  setClinicWhatsAppCredentialsAction,
  setClinicWhatsAppActiveAction,
} from "@/app/actions/integrations-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Per-clinic WhatsApp (Meta Cloud API) credential form, embedded in the
 * expanded row of AdminClinicsTable. Never shows a saved token back —
 * only a masked preview ("configurado, terminando em ...ab12"). See
 * docs/GUIA_INTEGRACAO.md for where Robson gets these values.
 */
export function AdminClinicWhatsApp({ clinicId }: { clinicId: string }) {
  const [status, setStatus] = useState<WhatsAppIntegrationStatus | "loading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wabaId, setWabaId] = useState("");

  if (status === "loading") {
    getClinicWhatsAppStatusAction(clinicId).then((result) => {
      if (!result.ok) {
        setError(result.error);
        setStatus({ configured: false, isActive: false, maskedAccessToken: null, phoneNumberId: null });
        return;
      }
      setStatus(result.data);
    });
    return <p className="text-xs text-gray-400">Carregando integração...</p>;
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);
    const result = await setClinicWhatsAppCredentialsAction(clinicId, phoneNumberId, accessToken, wabaId, true);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess("Credenciais salvas e integração ativada.");
    setAccessToken("");
    const refreshed = await getClinicWhatsAppStatusAction(clinicId);
    if (refreshed.ok) setStatus(refreshed.data);
  }

  async function handleToggleActive() {
    if (status === "loading") return;
    setError(null);
    const result = await setClinicWhatsAppActiveAction(clinicId, !status.isActive);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getClinicWhatsAppStatusAction(clinicId);
    if (refreshed.ok) setStatus(refreshed.data);
  }

  return (
    <div className="space-y-3 text-sm">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {success && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{success}</p>}

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
        <div>
          <p className="font-medium text-gray-900">WhatsApp (Meta Cloud API)</p>
          {status.configured ? (
            <p className="text-xs text-gray-500">
              Phone Number ID: {status.phoneNumberId} · Token: {status.maskedAccessToken} —{" "}
              <span className={status.isActive ? "text-green-600" : "text-gray-400"}>
                {status.isActive ? "Ativo" : "Inativo"}
              </span>
            </p>
          ) : (
            <p className="text-xs text-gray-400">Ainda não configurado — mensagens usam o provedor simulado.</p>
          )}
        </div>
        {status.configured && (
          <Button type="button" variant="secondary" onClick={handleToggleActive}>
            {status.isActive ? "Desativar" : "Ativar"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input
          placeholder="Phone Number ID"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
        />
        <Input
          placeholder="Access Token"
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
        />
        <Input placeholder="WABA ID (opcional)" value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
      </div>
      <Button type="button" variant="secondary" onClick={handleSave}>
        Salvar credenciais
      </Button>
    </div>
  );
}
