import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasModule } from "@/lib/entitlements/modules";
import { hasPermission } from "@/lib/rbac/permissions";
import { getPatient } from "@/lib/patients/patients-service";
import { Card } from "@/components/ui/card";
import { PatientDetailClient } from "./patient-detail-client";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/select-clinic");

  const moduleEnabled = await hasModule("PATIENTS");
  if (!moduleEnabled) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">O módulo Pacientes não está habilitado para esta clínica.</p>
        </Card>
      </main>
    );
  }

  const canView = await hasPermission("patients.view");
  if (!canView) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">Você não tem permissão para ver este paciente.</p>
        </Card>
      </main>
    );
  }

  const { id } = await params;
  // getPatient() is tenant-scoped — if this id belongs to another
  // clinic, it returns null exactly as if it didn't exist. This is the
  // page-level enforcement of the cross-tenant guarantee.
  const patient = await getPatient(id);
  if (!patient) notFound();

  const [canEdit, canDelete] = await Promise.all([
    hasPermission("patients.edit"),
    hasPermission("patients.delete"),
  ]);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/patients" className="text-xs text-gray-400 hover:underline">
          ← Pacientes
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900">{patient.name}</h1>
          {!patient.isActive && (
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">Inativo</span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <PatientDetailClient patient={patient} canEdit={canEdit} canDelete={canDelete} />
      </div>
    </main>
  );
}
