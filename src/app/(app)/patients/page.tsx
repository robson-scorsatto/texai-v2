import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasModule } from "@/lib/entitlements/modules";
import { hasPermission } from "@/lib/rbac/permissions";
import { listPatients } from "@/lib/patients/patients-service";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchParams = { q?: string; page?: string };

export default async function PatientsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
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
          <p className="text-sm text-gray-700">
            O módulo <strong>Pacientes</strong> não está habilitado para esta clínica.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-gray-500 underline">
            Voltar ao painel
          </Link>
        </Card>
      </main>
    );
  }

  const canView = await hasPermission("patients.view");
  if (!canView) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">Você não tem permissão para ver pacientes.</p>
        </Card>
      </main>
    );
  }

  const canCreate = await hasPermission("patients.create");

  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const { patients, total, pageSize } = await listPatients({ search: params.q, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <Link href="/dashboard" className="text-xs text-gray-400 hover:underline">
            ← Painel
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Pacientes</h1>
        </div>
        {canCreate && (
          <Link href="/patients/new">
            <Button type="button">Novo Paciente</Button>
          </Link>
        )}
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <form method="get" className="mb-6 flex gap-2">
          <Input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar por nome, telefone ou e-mail..."
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>

        <Card className="p-0">
          {patients.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Nenhum paciente encontrado.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {patients.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/patients/${p.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        {p.phone ?? "sem telefone"} {p.email ? `· ${p.email}` : ""}
                      </p>
                    </div>
                    {!p.isActive && (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
                        Inativo
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>
              Página {page} de {totalPages} · {total} pacientes
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/patients?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), page: String(page - 1) })}`}
                  className="underline"
                >
                  Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/patients?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), page: String(page + 1) })}`}
                  className="underline"
                >
                  Próxima
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
