import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { hasModule } from "@/lib/entitlements/modules";
import { hasPermission } from "@/lib/rbac/permissions";
import { listTemplates, listReminderRules, listOutboundMessages } from "@/lib/messaging/messaging-service";
import { Card } from "@/components/ui/card";
import { AutomationsClient } from "./automations-client";

export default async function AutomationsPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/select-clinic");

  const moduleEnabled = await hasModule("WHATSAPP");
  if (!moduleEnabled) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">
            O módulo <strong>WhatsApp/Automações</strong> não está habilitado para esta clínica.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-gray-500 underline">
            Voltar ao painel
          </Link>
        </Card>
      </main>
    );
  }

  const canView = await hasPermission("settings.view");
  if (!canView) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <p className="text-sm text-gray-700">Você não tem permissão para ver automações.</p>
        </Card>
      </main>
    );
  }

  const canManage = await hasPermission("settings.manage");

  const [templates, rules, messages] = await Promise.all([
    listTemplates(),
    listReminderRules(),
    listOutboundMessages(),
  ]);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/dashboard" className="text-xs text-gray-400 hover:underline">
          ← Painel
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">WhatsApp / Automações</h1>
        <p className="mt-1 text-xs text-yellow-700">
          Modo de desenvolvimento: as mensagens não são enviadas de verdade (provedor simulado). Ver
          docs/REQUISITOS.md, Sprint 11.
        </p>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <AutomationsClient
          canManage={canManage}
          initialTemplates={templates}
          initialRules={rules}
          initialMessages={messages}
        />
      </div>
    </main>
  );
}
