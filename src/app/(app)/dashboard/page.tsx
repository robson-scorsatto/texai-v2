import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext, listUserClinics } from "@/lib/tenant/resolve-tenant";
import { listEnabledModules } from "@/lib/entitlements/modules";
import { getDb } from "@/db/client";
import { clinics as clinicsTable, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logoutAction, switchClinicAction } from "@/app/actions/auth-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/select-clinic");

  const db = await getDb();
  const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, ctx.clinicId)).limit(1);
  const [role] = await db.select().from(roles).where(eq(roles.id, ctx.roleId)).limit(1);

  const [modules, myClinics] = await Promise.all([listEnabledModules(), listUserClinics()]);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <p className="text-sm text-gray-500">Você está trabalhando na clínica</p>
          <h1 className="text-lg font-semibold text-gray-900">{clinic?.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          {myClinics.length > 1 && (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-lg border border-gray-300 px-3 py-2 text-sm">
                Trocar clínica ▾
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                {myClinics.map((c) => (
                  <form key={c.clinicId} action={switchClinicAction.bind(null, c.clinicId)}>
                    <button
                      type="submit"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      {c.clinicName}
                    </button>
                  </form>
                ))}
              </div>
            </details>
          )}
          <form action={logoutAction}>
            <Button variant="secondary" type="submit">Sair</Button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="mb-6 text-sm text-gray-500">
          Bem-vindo(a), <strong>{current.user.name}</strong> — seu papel aqui é <strong>{role?.label}</strong>.
        </p>

        {modules.includes("PATIENTS") && (
          <Card className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-900">Pacientes</h2>
              <p className="text-xs text-gray-500">Gerencie o cadastro de pacientes da clínica.</p>
            </div>
            <Link href="/patients" className="text-sm font-medium text-gray-900 underline">
              Abrir →
            </Link>
          </Card>
        )}

        {modules.includes("AGENDA") && (
          <Card className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-900">Agenda</h2>
              <p className="text-xs text-gray-500">Veja e crie agendamentos da clínica.</p>
            </div>
            <Link href="/agenda" className="text-sm font-medium text-gray-900 underline">
              Abrir →
            </Link>
          </Card>
        )}

        {modules.includes("FINANCE") && (
          <Card className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-900">Financeiro</h2>
              <p className="text-xs text-gray-500">Acompanhe recebíveis, recebidos e atrasos.</p>
            </div>
            <Link href="/financeiro" className="text-sm font-medium text-gray-900 underline">
              Abrir →
            </Link>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-wide text-gray-400">Consultas hoje</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">0</p>
            <p className="mt-1 text-xs text-gray-400">Módulo Agenda ainda não implementado (Sprint 7)</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-gray-400">Pendências</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">0</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-gray-400">Mensagens</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">0</p>
          </Card>
        </div>

        <Card className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-gray-900">Módulos habilitados nesta clínica</h2>
          <div className="flex flex-wrap gap-2">
            {modules.map((m) => (
              <span key={m} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                {m}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
