import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasModule } from "@/lib/entitlements/modules";
import { hasPermission } from "@/lib/rbac/permissions";
import { listAppointments } from "@/lib/agenda/agenda-service";
import { getDb } from "@/db/client";
import { patients as patientsTable, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgendaActions } from "./agenda-actions-client";

type SearchParams = { date?: string };

function startOfDay(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}
function endOfDay(dateStr: string) {
  const d = startOfDay(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
function shiftDate(dateStr: string, days: number) {
  const d = startOfDay(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Faltou",
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
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
          <p className="text-sm text-gray-700">Você não tem permissão para ver a agenda.</p>
        </Card>
      </main>
    );
  }

  const [canCreate, canEdit, canCancel] = await Promise.all([
    hasPermission("agenda.create"),
    hasPermission("agenda.edit"),
    hasPermission("agenda.cancel"),
  ]);

  const params = await searchParams;
  const date = params.date ?? todayISODate();

  const items = await listAppointments({
    from: startOfDay(date).toISOString(),
    to: endOfDay(date).toISOString(),
    includeCancelled: true,
  });

  const db = await getDb();
  const patientIds = [...new Set(items.map((i) => i.patientId).filter((v): v is string => !!v))];
  const professionalIds = [...new Set(items.map((i) => i.professionalUserId))];

  const [patientRows, professionalRows] = await Promise.all([
    patientIds.length
      ? db.select({ id: patientsTable.id, name: patientsTable.name }).from(patientsTable).where(inArray(patientsTable.id, patientIds))
      : Promise.resolve([]),
    professionalIds.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, professionalIds))
      : Promise.resolve([]),
  ]);
  const patientNameById = new Map(patientRows.map((p) => [p.id, p.name]));
  const professionalNameById = new Map(professionalRows.map((p) => [p.id, p.name]));

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <Link href="/dashboard" className="text-xs text-gray-400 hover:underline">
            ← Painel
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Agenda</h1>
        </div>
        {canCreate && (
          <Link href={`/agenda/new?date=${date}`}>
            <Button type="button">Novo Agendamento</Button>
          </Link>
        )}
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link href={`/agenda?date=${shiftDate(date, -1)}`} className="text-sm text-gray-500 underline">
            ← Dia anterior
          </Link>
          <span className="text-sm font-medium text-gray-900">{date}</span>
          <Link href={`/agenda?date=${shiftDate(date, 1)}`} className="text-sm text-gray-500 underline">
            Próximo dia →
          </Link>
        </div>

        <Card className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Nenhum agendamento neste dia.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((appt) => {
                const time = new Date(appt.startsAt).toISOString().slice(11, 16);
                const endTime = new Date(appt.endsAt).toISOString().slice(11, 16);
                const label =
                  appt.type === "bloqueio"
                    ? "Bloqueio de horário"
                    : (appt.patientId && patientNameById.get(appt.patientId)) || "Paciente";
                return (
                  <li key={appt.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {time}–{endTime} · {label}
                      </p>
                      <p className="text-xs text-gray-500">
                        {professionalNameById.get(appt.professionalUserId) ?? "Profissional"}
                        {appt.serviceName ? ` · ${appt.serviceName}` : ""} ·{" "}
                        <span className="capitalize">{STATUS_LABELS[appt.status] ?? appt.status}</span>
                      </p>
                    </div>
                    <AgendaActions
                      appointmentId={appt.id}
                      status={appt.status}
                      canEdit={canEdit}
                      canCancel={canCancel}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
