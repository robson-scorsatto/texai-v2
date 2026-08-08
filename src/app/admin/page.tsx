import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { listAllClinics, listPrivateBetaAllowlist } from "@/lib/platform-admin/platform-admin-service";
import { listAllPlansForAdmin } from "@/lib/billing/billing-service";
import { Card } from "@/components/ui/card";
import { logoutAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { AdminClinicsTable } from "./admin-clinics-table";
import { AdminBetaAllowlist } from "./admin-beta-allowlist";

/**
 * "Sistema Global" — TEXAI platform admin panel. Protected independently
 * from clinic-level RBAC: only isPlatformAdmin === true may render this
 * page at all (checked here, on the server, not just by hiding a link),
 * and every server action it calls re-checks isPlatformAdmin itself
 * (see src/lib/platform-admin/platform-admin-service.ts). See prompt
 * mestre item 41/42 ("Admin TEXAI" / "Private Admin").
 */
export default async function AdminPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.user.isPlatformAdmin) redirect("/select-clinic");

  const [clinicsList, betaUsers, allPlans] = await Promise.all([
    listAllClinics(),
    listPrivateBetaAllowlist(),
    listAllPlansForAdmin(),
  ]);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-gray-900 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-400">Sistema Global</p>
          <h1 className="text-lg font-semibold text-white">Painel Administrativo TEXAI</h1>
        </div>
        <form action={logoutAction}>
          <Button variant="secondary" type="submit">Sair</Button>
        </form>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <Card>
          <h2 className="mb-4 text-sm font-medium text-gray-900">
            Clínicas cadastradas ({clinicsList.length})
          </h2>
          <AdminClinicsTable initialClinics={clinicsList} allPlans={allPlans} />
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-medium text-gray-900">Private Beta — allowlist</h2>
          <p className="mb-4 text-xs text-gray-500">
            Usuários administradores da plataforma sempre têm acesso, independentemente desta lista (ver
            src/lib/auth/private-beta.ts) — por isso não aparecem aqui.
          </p>
          <AdminBetaAllowlist initialUsers={betaUsers} />
        </Card>
      </div>
    </main>
  );
}
