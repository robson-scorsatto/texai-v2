"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPatientAction } from "@/app/actions/patients-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function NewPatientForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSubmitting(true);

    const result = await createPatientAction({
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

    router.push(`/patients/${result.data.id}`);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Nome completo *</label>
        <Input name="name" required placeholder="Nome do paciente" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Telefone / WhatsApp</label>
          <Input name="phone" placeholder="(11) 99999-9999" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">E-mail</label>
          <Input name="email" type="email" placeholder="paciente@email.com" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">CPF</label>
          <Input name="cpf" placeholder="000.000.000-00" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Data de nascimento</label>
          <Input name="birthDate" type="date" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="prefersWhatsapp" defaultChecked />
        Prefere ser contatado por WhatsApp
      </label>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Observações</label>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          placeholder="Anotações gerais (não clínicas)"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando..." : "Salvar paciente"}
        </Button>
      </div>
    </form>
  );
}
