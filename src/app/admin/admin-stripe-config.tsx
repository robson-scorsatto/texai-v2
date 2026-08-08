"use client";

import { useState } from "react";
import type { StripeIntegrationStatus } from "@/lib/integrations/integrations-service";
import {
  getPlatformStripeStatusAction,
  setPlatformStripeCredentialsAction,
  setPlatformStripeActiveAction,
} from "@/app/actions/integrations-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Platform-wide Stripe configuration — one account for the whole
 * platform (see billing-service.ts / docs/GUIA_INTEGRACAO.md). Never
 * shows the saved secret key back, only a masked preview.
 */
export function AdminStripeConfig({ initialStatus }: { initialStatus: StripeIntegrationStatus }) {
  const [status, setStatus] = useState<StripeIntegrationStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  async function handleSave() {
    setError(null);
    setSuccess(null);
    const result = await setPlatformStripeCredentialsAction(secretKey, webhookSecret, true);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess("Credenciais salvas e Stripe ativado.");
    setSecretKey("");
    setWebhookSecret("");
    const refreshed = await getPlatformStripeStatusAction();
    if (refreshed.ok) setStatus(refreshed.data);
  }

  async function handleToggleActive() {
    setError(null);
    const result = await setPlatformStripeActiveAction(!status.isActive);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await getPlatformStripeStatusAction();
    if (refreshed.ok) setStatus(refreshed.data);
  }

  return (
    <div className="space-y-3 text-sm">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {success && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">{success}</p>}

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
        <div>
          <p className="font-medium text-gray-900">Stripe (cobrança)</p>
          {status.configured ? (
            <p className="text-xs text-gray-500">
              Chave: {status.maskedSecretKey} · Webhook: {status.hasWebhookSecret ? "configurado" : "não configurado"} —{" "}
              <span className={status.isActive ? "text-green-600" : "text-gray-400"}>
                {status.isActive ? "Ativo" : "Inativo"}
              </span>
            </p>
          ) : (
            <p className="text-xs text-gray-400">Ainda não configurado — troca de plano continua manual via /admin.</p>
          )}
        </div>
        {status.configured && (
          <Button type="button" variant="secondary" onClick={handleToggleActive}>
            {status.isActive ? "Desativar" : "Ativar"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          placeholder="Chave secreta (sk_...)"
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
        />
        <Input
          placeholder="Webhook signing secret (whsec_..., opcional)"
          type="password"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
        />
      </div>
      <Button type="button" variant="secondary" onClick={handleSave}>
        Salvar credenciais
      </Button>
    </div>
  );
}
