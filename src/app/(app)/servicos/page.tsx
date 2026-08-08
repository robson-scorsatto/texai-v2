import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasModule } from "@/lib/entitlements/modules";
import { hasPermission } from "@/lib/rbac/permissions";
import { listServices } from "@/lib/services/services-service";
import { Card } from "@/components/ui/card";
import { ServicesClient } from "./services-client";

export default async function ServicesPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/select-clinic");

  const moduleEnabled = await hasModule("AGENDA");
  if (!moduleEnabled) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">
            O módulo <strong>Agenda</strong> não está habilitado para esta clínica.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-gray-500 underline">
            Voltar ao painel
          </Link>
        </Card>
      </main>
    );
  }

  const canView = await hasPermission("agenda.view");
  if (!canView) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">Você não tem permissão para ver o catálogo de serviços.</p>
        </Card>
      </main>
    );
  }

  const canManage = await hasPermission("settings.manage");
  const services = await listServices(true);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/dashboard" className="text-xs text-gray-400 hover:underline">
          ← Painel
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">Catálogo de Serviços</h1>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <ServicesClient canManage={canManage} initialServices={services} />
      </div>
    </main>
  );
}
