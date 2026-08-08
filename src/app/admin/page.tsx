import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { getDb } from "@/db/client";
import { clinics } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { logoutAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";

/**
 * "Sistema Global" — TEXAI platform admin panel. Protected independently
 * from clinic-level RBAC: only isPlatformAdmin === true may render this
 * page at all (checked here, on the server, not just by hiding a link).
 * See prompt mestre item 41/42 ("Admin TEXAI" / "Private Admin").
 */
export default async function AdminPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.user.isPlatformAdmin) redirect("/select-clinic");

  const db = await getDb();
  const allClinics = await db.select().from(clinics);

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

      <div className="mx-auto max-w-4xl px-6 py-8">
        <Card>
          <h2 className="mb-4 text-sm font-medium text-gray-900">Clínicas cadastradas ({allClinics.length})</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-400">
                <th className="pb-2">Nome</th>
                <th className="pb-2">Tipo</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Dev seed?</th>
              </tr>
            </thead>
            <tbody>
              {allClinics.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2 text-gray-500">{c.businessType}</td>
                  <td className="py-2">
                    <span className={c.isActive ? "text-green-600" : "text-red-600"}>
                      {c.isActive ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="py-2 text-gray-400">{c.isDevSeedData ? "sim" : "não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </main>
  );
}
