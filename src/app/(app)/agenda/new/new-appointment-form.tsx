"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAppointmentAction } from "@/app/actions/agenda-actions";
import type { Service } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function NewAppointmentForm({
  professionals,
  patients,
  services,
  defaultDate,
}: {
  professionals: { userId: string; name: string }[];
  patients: { id: string; name: string }[];
  services: Service[];
  defaultDate?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<"atendimento" | "bloqueio">("atendimento");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");

  const today = defaultDate ?? new Date().toISOString().slice(0, 10);

  function handleServiceChange(serviceId: string) {
    setSelectedServiceId(serviceId);
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    // Auto-fill end time from the service's default duration, based on
    // whatever start time is currently set.
    const [h, m] = startTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + service.defaultDurationMinutes;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);

    const date = String(formData.get("date") ?? "");

    const result = await createAppointmentAction({
      patientId: type === "atendimento" ? String(formData.get("patientId") ?? "") || null : null,
      professionalUserId: String(formData.get("professionalUserId") ?? ""),
      type,
      serviceId: type === "atendimento" ? selectedServiceId || null : null,
      serviceName: String(formData.get("serviceName") ?? "") || null,
      startsAt: new Date(`${date}T${startTime}:00`).toISOString(),
      endsAt: new Date(`${date}T${endTime}:00`).toISOString(),
      notes: String(formData.get("notes") ?? "") || null,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push(`/agenda?date=${date}`);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="typeRadio"
            checked={type === "atendimento"}
            onChange={() => setType("atendimento")}
          />
          Atendimento
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="typeRadio"
            checked={type === "bloqueio"}
            onChange={() => setType("bloqueio")}
          />
          Bloqueio de horário
        </label>
      </div>

      {type === "atendimento" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Paciente *</label>
          <select
            name="patientId"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          >
            <option value="">Selecione...</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {patients.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">
              Nenhum paciente cadastrado ainda — cadastre um paciente primeiro.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Profissional *</label>
        <select
          name="professionalUserId"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
        >
          <option value="">Selecione...</option>
          {professionals.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Data *</label>
          <Input name="date" type="date" required defaultValue={today} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Início *</label>
          <Input
            name="startTime"
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Término *</label>
          <Input
            name="endTime"
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      {type === "atendimento" && (
        <>
          {services.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Serviço do catálogo</label>
              <select
                value={selectedServiceId}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              >
                <option value="">Nenhum (usar texto livre abaixo)</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {(s.defaultPriceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Selecionar um serviço preenche o horário de término automaticamente pela duração padrão.
              </p>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              {selectedServiceId ? "Descrição (opcional, sobrepõe o nome do serviço)" : "Serviço"}
            </label>
            <Input name="serviceName" placeholder="Ex.: Consulta, Limpeza, Avaliação..." />
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Observações</label>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando..." : "Salvar agendamento"}
        </Button>
      </div>
    </form>
  );
}
