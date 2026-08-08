"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Service } from "@/db/schema";
import { createServiceAction, updateServiceAction, deactivateServiceAction } from "@/app/actions/services-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ServicesClient({
  canManage,
  initialServices,
}: {
  canManage: boolean;
  initialServices: Service[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    setError(null);
    setSubmitting(true);
    const priceReais = Number(formData.get("price") ?? "0");
    const result = await createServiceAction({
      name: String(formData.get("name") ?? ""),
      defaultPriceCents: Math.round(priceReais * 100),
      defaultDurationMinutes: Number(formData.get("duration") ?? "30"),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowForm(false);
    router.refresh();
  }

  async function handleUpdate(serviceId: string, formData: FormData) {
    setError(null);
    setSubmitting(true);
    const priceReais = Number(formData.get("price") ?? "0");
    const result = await updateServiceAction(serviceId, {
      name: String(formData.get("name") ?? ""),
      defaultPriceCents: Math.round(priceReais * 100),
      defaultDurationMinutes: Number(formData.get("duration") ?? "30"),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleDeactivate(serviceId: string) {
    setSubmitting(true);
    const result = await deactivateServiceAction(serviceId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {canManage && (
        <div>
          {!showForm ? (
            <Button type="button" onClick={() => setShowForm(true)}>
              Novo serviço
            </Button>
          ) : (
            <Card>
              <form action={handleCreate} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Nome *</label>
                  <Input name="name" required placeholder="Ex.: Consulta de rotina" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Preço padrão (R$) *</label>
                    <Input name="price" type="number" step="0.01" min="0.01" required placeholder="0,00" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Duração padrão (min)</label>
                    <Input name="duration" type="number" min="1" defaultValue="30" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Salvando..." : "Salvar serviço"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      <Card className="p-0">
        {initialServices.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Nenhum serviço cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {initialServices.map((s) => (
              <li key={s.id} className="px-6 py-4">
                {editingId === s.id ? (
                  <form action={(fd) => handleUpdate(s.id, fd)} className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Nome</label>
                      <Input name="name" required defaultValue={s.name} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Preço (R$)</label>
                        <Input
                          name="price"
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          defaultValue={(s.defaultPriceCents / 100).toFixed(2)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Duração (min)</label>
                        <Input name="duration" type="number" min="1" defaultValue={s.defaultDurationMinutes} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={submitting}>
                        Salvar
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {s.name} {!s.isActive && <span className="text-xs text-gray-400">(inativo)</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatBRL(s.defaultPriceCents)} · {s.defaultDurationMinutes} min
                      </p>
                    </div>
                    {canManage && s.isActive && (
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={() => setEditingId(s.id)}>
                          Editar
                        </Button>
                        <Button type="button" variant="danger" disabled={submitting} onClick={() => handleDeactivate(s.id)}>
                          Desativar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
