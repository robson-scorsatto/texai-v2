import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasModule } from "@/lib/entitlements/modules";
import { hasPermission } from "@/lib/rbac/permissions";
import { Card } from "@/components/ui/card";
import { NewPatientForm } from "./new-patient-form";

export default async function NewPatientPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/select-clinic");

  const moduleEnabled = await hasModule("PATIENTS");
  const canCreate = moduleEnabled && (await hasPermission("patients.create"));

  if (!canCreate) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">
            Você não tem permissão para cadastrar pacientes, ou o módulo Pacientes não está
            habilitado para esta clínica.
          </p>
          <Link href="/patients" className="mt-4 inline-block text-sm text-gray-500 underline">
            Voltar
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/patients" className="text-xs text-gray-400 hover:underline">
          ← Pacientes
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">Novo Paciente</h1>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-8">
        <Card>
          <NewPatientForm />
        </Card>
      </div>
    </main>
  );
}
