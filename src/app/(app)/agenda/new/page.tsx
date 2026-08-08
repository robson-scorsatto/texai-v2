import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasModule } from "@/lib/entitlements/modules";
import { hasPermission } from "@/lib/rbac/permissions";
import { listClinicProfessionals } from "@/lib/agenda/agenda-service";
import { listPatients } from "@/lib/patients/patients-service";
import { Card } from "@/components/ui/card";
import { NewAppointmentForm } from "./new-appointment-form";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/select-clinic");

  const moduleEnabled = await hasModule("AGENDA");
  const canCreate = moduleEnabled && (await hasPermission("agenda.create"));

  if (!canCreate) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">
            Você não tem permissão para criar agendamentos, ou o módulo Agenda não está
            habilitado para esta clínica.
          </p>
          <Link href="/agenda" className="mt-4 inline-block text-sm text-gray-500 underline">
            Voltar
          </Link>
        </Card>
      </main>
    );
  }

  const patientsModuleEnabled = await hasModule("PATIENTS");
  const [professionals, patientsResult] = await Promise.all([
    listClinicProfessionals(),
    patientsModuleEnabled ? listPatients({ pageSize: 100 }) : Promise.resolve({ patients: [] }),
  ]);

  const params = await searchParams;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/agenda" className="text-xs text-gray-400 hover:underline">
          ← Agenda
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">Novo Agendamento</h1>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-8">
        <Card>
          <NewAppointmentForm
            professionals={professionals}
            patients={patientsResult.patients}
            defaultDate={params.date}
          />
        </Card>
      </div>
    </main>
  );
}
