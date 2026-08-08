"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MessageTemplate, ReminderRule, OutboundMessage } from "@/db/schema";
import { upsertTemplateAction, upsertReminderRuleAction } from "@/app/actions/messaging-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TRIGGER_LABELS: Record<string, string> = {
  appointment_confirmation: "Confirmação de agendamento",
  appointment_reminder: "Lembrete de agendamento",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  queued: { label: "Na fila", className: "bg-yellow-50 text-yellow-700" },
  sent: { label: "Enviada (simulada)", className: "bg-green-50 text-green-700" },
  failed: { label: "Falhou", className: "bg-red-50 text-red-700" },
};

function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AutomationsClient({
  canManage,
  initialTemplates,
  initialRules,
  initialMessages,
}: {
  canManage: boolean;
  initialTemplates: MessageTemplate[];
  initialRules: ReminderRule[];
  initialMessages: OutboundMessage[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);

  async function handleCreateTemplate(formData: FormData) {
    setError(null);
    setSubmitting(true);
    const result = await upsertTemplateAction({
      key: String(formData.get("key") ?? ""),
      bodyTemplate: String(formData.get("bodyTemplate") ?? ""),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowTemplateForm(false);
    router.refresh();
  }

  async function handleCreateRule(formData: FormData) {
    setError(null);
    setSubmitting(true);
    const result = await upsertReminderRuleAction({
      triggerType: String(formData.get("triggerType") ?? "appointment_reminder") as
        | "appointment_confirmation"
        | "appointment_reminder",
      offsetMinutes: Number(formData.get("offsetMinutes") ?? "0"),
      templateId: String(formData.get("templateId") ?? ""),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowRuleForm(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Card>
        <h2 className="mb-3 text-sm font-medium text-gray-900">Templates de mensagem</h2>
        {initialTemplates.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum template cadastrado ainda.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {initialTemplates.map((t) => (
              <li key={t.id} className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-900">{t.key}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{t.bodyTemplate}</p>
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <>
            {!showTemplateForm ? (
              <Button type="button" variant="secondary" onClick={() => setShowTemplateForm(true)}>
                Novo template
              </Button>
            ) : (
              <form action={handleCreateTemplate} className="space-y-3 rounded-lg border border-gray-200 p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Chave *</label>
                  <Input name="key" required placeholder="Ex.: confirmacao_agendamento" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Conteúdo * (use {"{{nome}}"}, {"{{data}}"}, {"{{hora}}"}, {"{{profissional}}"}, {"{{clinica}}"})
                  </label>
                  <textarea
                    name="bodyTemplate"
                    required
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                    placeholder="Olá {{nome}}, seu agendamento é dia {{data}} às {{hora}} com {{profissional}}."
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Salvando..." : "Salvar template"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowTemplateForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium text-gray-900">Regras de lembrete</h2>
        {initialRules.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma regra cadastrada ainda.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {initialRules.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-200 p-3 text-xs text-gray-700">
                {TRIGGER_LABELS[r.triggerType] ?? r.triggerType} —{" "}
                {r.offsetMinutes === 0
                  ? "no momento do agendamento"
                  : r.offsetMinutes < 0
                    ? `${Math.abs(r.offsetMinutes) / 60}h antes`
                    : `${r.offsetMinutes / 60}h depois`}
              </li>
            ))}
          </ul>
        )}
        {canManage && initialTemplates.length > 0 && (
          <>
            {!showRuleForm ? (
              <Button type="button" variant="secondary" onClick={() => setShowRuleForm(true)}>
                Nova regra
              </Button>
            ) : (
              <form action={handleCreateRule} className="space-y-3 rounded-lg border border-gray-200 p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Gatilho</label>
                  <select
                    name="triggerType"
                    defaultValue="appointment_reminder"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  >
                    <option value="appointment_confirmation">Confirmação de agendamento</option>
                    <option value="appointment_reminder">Lembrete de agendamento</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Deslocamento em minutos (negativo = antes)
                  </label>
                  <Input name="offsetMinutes" type="number" defaultValue="-1440" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Template</label>
                  <select
                    name="templateId"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                  >
                    {initialTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.key}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Salvando..." : "Salvar regra"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowRuleForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium text-gray-900">Histórico de mensagens (simuladas)</h2>
        {initialMessages.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma mensagem enviada ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {initialMessages.map((m) => {
              const statusInfo = STATUS_LABELS[m.status] ?? { label: m.status, className: "" };
              return (
                <li key={m.id} className="py-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-gray-500">{m.toAddress}</span>
                    <span className={`rounded-full px-2 py-1 text-xs ${statusInfo.className}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-xs text-gray-700">{m.body}</p>
                  <p className="mt-1 text-xs text-gray-400">{formatDateTime(m.createdAt)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
