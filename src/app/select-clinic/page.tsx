import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { listUserClinics } from "@/lib/tenant/resolve-tenant";
import { switchClinicAction, logoutAction } from "@/app/actions/auth-actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SelectClinicPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const clinics = await listUserClinics();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Selecione a clínica</h1>
        <p className="mb-6 text-sm text-gray-500">
          Olá, <strong>{current.user.name}</strong>. Você tem acesso a {clinics.length} clínica(s).
        </p>

        <div className="space-y-3">
          {current.user.isPlatformAdmin && (
            <Card className="flex items-center justify-between border-amber-300 bg-amber-50">
              <div>
                <p className="text-sm font-medium text-amber-900">Sistema Global</p>
                <p className="text-xs text-amber-700">Super Administrador — acesso a todas as clínicas</p>
              </div>
              <a href="/admin">
                <Button variant="secondary">Entrar</Button>
              </a>
            </Card>
          )}

          {clinics.map((c) => (
            <Card key={c.clinicId} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{c.clinicName}</p>
                <p className="text-xs text-gray-500">Vínculo ativo</p>
              </div>
              <form action={switchClinicAction.bind(null, c.clinicId)}>
                <Button type="submit">Entrar</Button>
              </form>
            </Card>
          ))}

          {clinics.length === 0 && !current.user.isPlatformAdmin && (
            <Card>
              <p className="text-sm text-gray-600">
                Você ainda não está vinculado a nenhuma clínica. Peça a um administrador para te convidar.
              </p>
            </Card>
          )}
        </div>

        <form action={logoutAction} className="mt-6">
          <Button variant="secondary" type="submit">Sair da conta</Button>
        </form>
      </div>
    </main>
  );
}
