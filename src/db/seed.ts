import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { getDb } from "./client";
import { users, roles, permissions, rolePermissions, modules, memberships, patients, appointments, clinicalRecords, financialEntries, dentalCharts, toothRecords, messageTemplates, reminderRules, outboundMessages, services, plans, planModules, subscriptions } from "./schema";
import { ALL_PERMISSIONS } from "./seed-data/permissions";
import { MODULE_CATALOG } from "./seed-data/modules";
import { ROLE_PERMISSION_KEYS } from "./seed-data/roles";
import { hashPassword } from "@/lib/auth/password";
import { createClinic } from "@/lib/tenant/clinics-service";

/**
 * Idempotent-ish dev seed. Safe to re-run in a fresh dev database; NOT
 * meant to be run against a production database (see prompt mestre item
 * 47, "Não inserir dados reais de pacientes/produção").
 *
 * Creates:
 *  - the global permission catalog + module catalog (platform-wide, not
 *    tenant data)
 *  - ONE platform administrator (super admin, "Sistema Global"), from
 *    env vars — never a hardcoded password
 *  - ONE development clinic (isDevSeedData = true) with all modules
 *    enabled, owned by the admin
 *  - TWO professional users linked to that clinic (PROFESSIONAL role)
 *  - FIVE fictitious patients (isDevSeedData = true) in the dev clinic,
 *    added in Sprint 6, clearly named/emailed with a "(dev)" suffix and
 *    @texai.local addresses so they can never be confused with real
 *    patient data.
 */
async function main() {
  const db = await getDb();

  console.log("→ Seeding global permission catalog...");
  for (const perm of ALL_PERMISSIONS) {
    const [existing] = await db.select().from(permissions).where(eq(permissions.key, perm.key)).limit(1);
    if (!existing) await db.insert(permissions).values(perm);
  }

  console.log("→ Seeding module catalog...");
  for (const mod of MODULE_CATALOG) {
    const [existing] = await db.select().from(modules).where(eq(modules.key, mod.key)).limit(1);
    if (!existing) await db.insert(modules).values(mod);
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administrador TEXAI";

  if (!adminEmail || !adminPassword) {
    console.error(
      "\n❌ SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD são obrigatórios (defina no .env — nunca hardcode).\n" +
        "   Exemplo: SEED_ADMIN_EMAIL=voce@exemplo.com SEED_ADMIN_PASSWORD='senha-forte' npm run db:seed\n"
    );
    process.exit(1);
  }

  console.log("→ Creating platform administrator...");
  let [admin] = await db.select().from(users).where(eq(users.email, adminEmail.toLowerCase())).limit(1);
  if (!admin) {
    const passwordHash = await hashPassword(adminPassword);
    [admin] = await db
      .insert(users)
      .values({
        name: adminName,
        email: adminEmail.toLowerCase(),
        passwordHash,
        isPlatformAdmin: true,
        isAllowedInPrivateBeta: true,
        isActive: true,
      })
      .returning();
  }

  console.log("→ Creating development clinic (isDevSeedData = true)...");
  const clinic = await createClinic({
    name: "Clínica Modelo TEXAI (dev)",
    businessType: "odontologia",
    ownerUserId: admin.id,
    isDevSeedData: true,
    defaultEnabledModules: MODULE_CATALOG.map((m) => m.key), // dev clinic gets everything enabled
  });

  console.log("→ Wiring role → permission grants for the dev clinic...");
  const clinicRoles = await db.select().from(roles).where(eq(roles.clinicId, clinic.id));
  const allPerms = await db.select().from(permissions);
  for (const role of clinicRoles) {
    const grantKeys = ROLE_PERMISSION_KEYS[role.key as keyof typeof ROLE_PERMISSION_KEYS];
    const grantedPermissions = grantKeys === "ALL" ? allPerms : allPerms.filter((p) => (grantKeys as string[]).includes(p.key));
    if (grantedPermissions.length === 0) continue;
    await db
      .insert(rolePermissions)
      .values(grantedPermissions.map((p) => ({ roleId: role.id, permissionId: p.id })))
      .onConflictDoNothing();
  }

  console.log("→ Creating 2 fictitious professionals linked to the dev clinic...");
  const professionalRole = clinicRoles.find((r) => r.key === "PROFESSIONAL")!;
  const fakeProfessionals = [
    { name: "Dra. Ingrid Modelo (dev)", email: "ingrid.dev@texai.local" },
    { name: "Dr. Marcos Modelo (dev)", email: "marcos.dev@texai.local" },
  ];
  for (const prof of fakeProfessionals) {
    let [profUser] = await db.select().from(users).where(eq(users.email, prof.email)).limit(1);
    if (!profUser) {
      const passwordHash = await hashPassword("dev-only-" + Math.random().toString(36).slice(2, 10));
      [profUser] = await db
        .insert(users)
        .values({
          name: prof.name,
          email: prof.email,
          passwordHash,
          isAllowedInPrivateBeta: true,
        })
        .returning();
    }
    const [existingMembership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, profUser.id), eq(memberships.clinicId, clinic.id)))
      .limit(1);
    if (!existingMembership) {
      await db.insert(memberships).values({
        userId: profUser.id,
        clinicId: clinic.id,
        roleId: professionalRole.id,
        status: "active",
      });
    }
  }

  console.log("→ Seeding 5 fictitious patients (isDevSeedData = true)...");
  const fakePatients = [
    {
      name: "Ana Beatriz Souza (dev)",
      phone: "11988887001",
      email: "ana.souza.dev@texai.local",
      cpf: "111.111.111-11",
      birthDate: "1990-03-14",
      notes: "Paciente fictício de desenvolvimento — não é uma pessoa real.",
    },
    {
      name: "Carlos Eduardo Lima (dev)",
      phone: "11988887002",
      email: "carlos.lima.dev@texai.local",
      cpf: "222.222.222-22",
      birthDate: "1985-07-22",
      notes: "Paciente fictício de desenvolvimento — não é uma pessoa real.",
    },
    {
      name: "Fernanda Costa Ribeiro (dev)",
      phone: "11988887003",
      email: "fernanda.ribeiro.dev@texai.local",
      cpf: "333.333.333-33",
      birthDate: "2001-11-05",
      notes: "Paciente fictício de desenvolvimento — não é uma pessoa real.",
    },
    {
      name: "João Pedro Martins (dev)",
      phone: "11988887004",
      email: null,
      cpf: null,
      birthDate: "1978-01-30",
      notes: "Paciente fictício de desenvolvimento — sem e-mail cadastrado, propositalmente, para testar campos opcionais.",
    },
    {
      name: "Mariana Alves Pereira (dev)",
      phone: "11988887005",
      email: "mariana.pereira.dev@texai.local",
      cpf: "555.555.555-55",
      birthDate: "1995-09-18",
      notes: "Paciente fictício de desenvolvimento — não é uma pessoa real.",
    },
  ];
  const existingClinicPatients = await db
    .select({ name: patients.name })
    .from(patients)
    .where(eq(patients.clinicId, clinic.id));
  const existingNames = new Set(existingClinicPatients.map((p) => p.name));

  for (const fp of fakePatients) {
    if (existingNames.has(fp.name)) continue;
    await db.insert(patients).values({
      clinicId: clinic.id,
      name: fp.name,
      phone: fp.phone,
      prefersWhatsapp: true,
      email: fp.email,
      cpf: fp.cpf,
      birthDate: fp.birthDate,
      notes: fp.notes,
      isDevSeedData: true,
      createdByUserId: admin.id,
    });
  }

  console.log("→ Seeding fictitious appointments (isDevSeedData = true)...");
  // Fetch the two fictitious professionals + first two fictitious
  // patients created above, and schedule a small mix of past/future
  // appointments across them, tomorrow and the day after — enough to
  // exercise the day-view UI without needing a huge dataset.
  const devProfessionals = await db
    .select({ userId: memberships.userId, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.clinicId, clinic.id));
  const professionalByEmailFragment = (fragment: string) =>
    devProfessionals.find((p) => p.name.includes(fragment))?.userId;

  const seededPatients = await db.select().from(patients).where(eq(patients.clinicId, clinic.id));
  const patientByName = (name: string) => seededPatients.find((p) => p.name === name)?.id;

  const profIngrid = professionalByEmailFragment("Ingrid");
  const profMarcos = professionalByEmailFragment("Marcos");

  function atHour(daysFromNow: number, hour: number, minute = 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysFromNow);
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  }

  if (profIngrid && profMarcos) {
    const fakeAppointments: Array<{
      patientId: string | undefined;
      professionalUserId: string;
      type: "atendimento" | "bloqueio";
      serviceName: string | null;
      startsAt: Date;
      endsAt: Date;
      status: "scheduled" | "confirmed" | "completed";
      notes: string | null;
    }> = [
      {
        patientId: patientByName("Ana Beatriz Souza (dev)"),
        professionalUserId: profIngrid,
        type: "atendimento",
        serviceName: "Consulta de rotina",
        startsAt: atHour(1, 9, 0),
        endsAt: atHour(1, 9, 30),
        status: "scheduled",
        notes: "Agendamento fictício de desenvolvimento.",
      },
      {
        patientId: patientByName("Carlos Eduardo Lima (dev)"),
        professionalUserId: profIngrid,
        type: "atendimento",
        serviceName: "Limpeza",
        startsAt: atHour(1, 10, 0),
        endsAt: atHour(1, 10, 45),
        status: "confirmed",
        notes: "Agendamento fictício de desenvolvimento.",
      },
      {
        patientId: patientByName("Fernanda Costa Ribeiro (dev)"),
        professionalUserId: profMarcos,
        type: "atendimento",
        serviceName: "Avaliação",
        startsAt: atHour(2, 14, 0),
        endsAt: atHour(2, 14, 30),
        status: "scheduled",
        notes: "Agendamento fictício de desenvolvimento.",
      },
      {
        patientId: undefined,
        professionalUserId: profMarcos,
        type: "bloqueio",
        serviceName: null,
        startsAt: atHour(2, 12, 0),
        endsAt: atHour(2, 13, 0),
        status: "confirmed",
        notes: "Horário de almoço (bloqueio fictício de desenvolvimento).",
      },
    ];

    for (const fa of fakeAppointments) {
      const [existing] = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.clinicId, clinic.id),
            eq(appointments.professionalUserId, fa.professionalUserId),
            eq(appointments.startsAt, fa.startsAt)
          )
        )
        .limit(1);
      if (existing) continue;

      await db.insert(appointments).values({
        clinicId: clinic.id,
        patientId: fa.patientId ?? null,
        professionalUserId: fa.professionalUserId,
        type: fa.type,
        serviceName: fa.serviceName,
        startsAt: fa.startsAt,
        endsAt: fa.endsAt,
        status: fa.status,
        notes: fa.notes,
        isDevSeedData: true,
        createdByUserId: admin.id,
      });
    }
  }

  console.log("→ Seeding fictitious clinical records (isDevSeedData = true)...");
  if (profIngrid) {
    const anaId = patientByName("Ana Beatriz Souza (dev)");
    const carlosId = patientByName("Carlos Eduardo Lima (dev)");

    const fakeRecords: Array<{
      patientId: string | undefined;
      recordType: "evolucao" | "anamnese" | "procedimento";
      content: string;
      signed: boolean;
    }> = [
      {
        patientId: anaId,
        recordType: "anamnese",
        content:
          "Anamnese fictícia de desenvolvimento — paciente sem histórico de alergias relevantes, nega uso de medicação contínua.",
        signed: true,
      },
      {
        patientId: anaId,
        recordType: "evolucao",
        content: "Evolução fictícia de desenvolvimento — retorno de rotina, sem queixas.",
        signed: false,
      },
      {
        patientId: carlosId,
        recordType: "procedimento",
        content: "Procedimento fictício de desenvolvimento — profilaxia realizada sem intercorrências.",
        signed: true,
      },
    ];

    for (const fr of fakeRecords) {
      if (!fr.patientId) continue;

      const [existing] = await db
        .select({ id: clinicalRecords.id })
        .from(clinicalRecords)
        .where(
          and(
            eq(clinicalRecords.clinicId, clinic.id),
            eq(clinicalRecords.patientId, fr.patientId),
            eq(clinicalRecords.content, fr.content)
          )
        )
        .limit(1);
      if (existing) continue;

      await db.insert(clinicalRecords).values({
        clinicId: clinic.id,
        patientId: fr.patientId,
        authorUserId: profIngrid,
        recordType: fr.recordType,
        content: fr.content,
        signedAt: fr.signed ? new Date() : null,
        signedByUserId: fr.signed ? profIngrid : null,
        isDevSeedData: true,
      });
    }
  }

  console.log("→ Seeding fictitious financial entries (isDevSeedData = true)...");
  {
    const anaId = patientByName("Ana Beatriz Souza (dev)");
    const carlosId = patientByName("Carlos Eduardo Lima (dev)");
    const fernandaId = patientByName("Fernanda Costa Ribeiro (dev)");

    function pastDate(daysAgo: number) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    }
    function futureDate(daysFromNow: number) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + daysFromNow);
      return d.toISOString().slice(0, 10);
    }

    const fakeEntries: Array<{
      patientId: string | undefined;
      description: string;
      amountCents: number;
      status: "pending" | "paid" | "overdue";
      dueDate: string;
      paidAt: Date | null;
    }> = [
      {
        patientId: anaId,
        description: "Consulta de rotina (fictício de desenvolvimento)",
        amountCents: 15000,
        status: "paid",
        dueDate: pastDate(10),
        paidAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      },
      {
        patientId: carlosId,
        description: "Limpeza (fictício de desenvolvimento)",
        amountCents: 12000,
        status: "pending",
        dueDate: futureDate(5),
        paidAt: null,
      },
      {
        patientId: fernandaId,
        description: "Avaliação (fictício de desenvolvimento)",
        amountCents: 8000,
        status: "overdue",
        dueDate: pastDate(5),
        paidAt: null,
      },
    ];

    for (const fe of fakeEntries) {
      if (!fe.patientId) continue;

      const [existing] = await db
        .select({ id: financialEntries.id })
        .from(financialEntries)
        .where(
          and(
            eq(financialEntries.clinicId, clinic.id),
            eq(financialEntries.patientId, fe.patientId),
            eq(financialEntries.description, fe.description)
          )
        )
        .limit(1);
      if (existing) continue;

      await db.insert(financialEntries).values({
        clinicId: clinic.id,
        patientId: fe.patientId,
        type: "receita",
        status: fe.status,
        description: fe.description,
        amountCents: fe.amountCents,
        dueDate: fe.dueDate,
        paidAt: fe.paidAt,
        isDevSeedData: true,
        createdByUserId: admin.id,
      });
    }
  }

  console.log("→ Seeding fictitious dental chart records (isDevSeedData = true)...");
  if (profIngrid) {
    const anaId = patientByName("Ana Beatriz Souza (dev)");

    if (anaId) {
      let [chart] = await db
        .select()
        .from(dentalCharts)
        .where(and(eq(dentalCharts.patientId, anaId), eq(dentalCharts.clinicId, clinic.id)))
        .limit(1);
      if (!chart) {
        [chart] = await db
          .insert(dentalCharts)
          .values({ clinicId: clinic.id, patientId: anaId, dentitionType: "permanente" })
          .returning();
      }

      const fakeToothRecords: Array<{ toothNumber: number; status: string; procedureNote: string | null }> = [
        { toothNumber: 16, status: "restaurado", procedureNote: "Restauração fictícia de desenvolvimento." },
        { toothNumber: 26, status: "cariado", procedureNote: "Cárie fictícia de desenvolvimento — aguardando tratamento." },
        { toothNumber: 11, status: "saudavel", procedureNote: null },
      ];

      for (const ftr of fakeToothRecords) {
        const [existing] = await db
          .select({ id: toothRecords.id })
          .from(toothRecords)
          .where(
            and(
              eq(toothRecords.dentalChartId, chart.id),
              eq(toothRecords.toothNumber, ftr.toothNumber),
              eq(toothRecords.status, ftr.status)
            )
          )
          .limit(1);
        if (existing) continue;

        await db.insert(toothRecords).values({
          clinicId: clinic.id,
          dentalChartId: chart.id,
          toothNumber: ftr.toothNumber,
          status: ftr.status,
          procedureNote: ftr.procedureNote,
          authorUserId: profIngrid,
          isDevSeedData: true,
        });
      }
    }
  }

  console.log("→ Seeding fictitious messaging templates, rules and log (isDevSeedData = true)...");
  {
    let [confirmTemplate] = await db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.clinicId, clinic.id), eq(messageTemplates.key, "confirmacao_agendamento")))
      .limit(1);
    if (!confirmTemplate) {
      [confirmTemplate] = await db
        .insert(messageTemplates)
        .values({
          clinicId: clinic.id,
          key: "confirmacao_agendamento",
          bodyTemplate:
            "Olá {{nome}}! Seu agendamento na {{clinica}} foi confirmado para {{data}} às {{hora}} com {{profissional}}.",
          isActive: true,
          isDevSeedData: true,
          createdByUserId: admin.id,
        })
        .returning();
    }

    let [reminderTemplate] = await db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.clinicId, clinic.id), eq(messageTemplates.key, "lembrete_24h")))
      .limit(1);
    if (!reminderTemplate) {
      [reminderTemplate] = await db
        .insert(messageTemplates)
        .values({
          clinicId: clinic.id,
          key: "lembrete_24h",
          bodyTemplate: "Oi {{nome}}, lembrando do seu horário amanhã ({{data}} às {{hora}}) na {{clinica}}. Até lá!",
          isActive: true,
          isDevSeedData: true,
          createdByUserId: admin.id,
        })
        .returning();
    }

    const [existingRule] = await db
      .select({ id: reminderRules.id })
      .from(reminderRules)
      .where(and(eq(reminderRules.clinicId, clinic.id), eq(reminderRules.templateId, reminderTemplate.id)))
      .limit(1);
    if (!existingRule) {
      await db.insert(reminderRules).values({
        clinicId: clinic.id,
        triggerType: "appointment_reminder",
        offsetMinutes: -1440,
        templateId: reminderTemplate.id,
        isActive: true,
        isDevSeedData: true,
      });
    }

    const anaId = patientByName("Ana Beatriz Souza (dev)");
    if (anaId) {
      const [existingMessage] = await db
        .select({ id: outboundMessages.id })
        .from(outboundMessages)
        .where(and(eq(outboundMessages.clinicId, clinic.id), eq(outboundMessages.patientId, anaId)))
        .limit(1);
      if (!existingMessage) {
        const renderedBody =
          "Olá Ana Beatriz Souza (dev)! Seu agendamento na Clínica Modelo TEXAI (dev) foi confirmado para amanhã às 09:00 com Dra. Ingrid Modelo (dev).";
        await db.insert(outboundMessages).values({
          clinicId: clinic.id,
          patientId: anaId,
          templateId: confirmTemplate.id,
          channel: "whatsapp",
          toAddress: "11988887001",
          body: renderedBody,
          status: "sent",
          providerMessageId: "mock_seed_" + Math.random().toString(36).slice(2, 10),
          sentAt: new Date(),
          isDevSeedData: true,
          createdByUserId: admin.id,
        });
      }
    }
  }

  console.log("→ Seeding fictitious service catalog (isDevSeedData = true)...");
  {
    const fakeServices: Array<{ name: string; defaultPriceCents: number; defaultDurationMinutes: number }> = [
      { name: "Consulta de rotina", defaultPriceCents: 15000, defaultDurationMinutes: 30 },
      { name: "Limpeza", defaultPriceCents: 12000, defaultDurationMinutes: 45 },
      { name: "Avaliação", defaultPriceCents: 8000, defaultDurationMinutes: 30 },
      { name: "Restauração", defaultPriceCents: 25000, defaultDurationMinutes: 60 },
    ];

    for (const fs of fakeServices) {
      const [existing] = await db
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.clinicId, clinic.id), eq(services.name, fs.name)))
        .limit(1);
      if (existing) continue;

      await db.insert(services).values({
        clinicId: clinic.id,
        name: fs.name,
        defaultPriceCents: fs.defaultPriceCents,
        defaultDurationMinutes: fs.defaultDurationMinutes,
        isDevSeedData: true,
        createdByUserId: admin.id,
      });
    }
  }

  console.log("→ Seeding plan catalog (Básico, Profissional, Enterprise)...");
  {
    const allModules = await db.select().from(modules);
    const moduleByKey = new Map(allModules.map((m) => [m.key, m]));

    const planDefs: Array<{
      key: string;
      name: string;
      description: string;
      priceCents: number | null;
      maxUsers: number | null;
      moduleKeys: string[];
    }> = [
      {
        key: "basico",
        name: "Básico",
        description: "Ideal para consultórios individuais começando a organizar o dia a dia.",
        priceCents: 9700,
        maxUsers: 3,
        moduleKeys: ["CORE", "PATIENTS", "AGENDA"],
      },
      {
        key: "profissional",
        name: "Profissional",
        description: "Para clínicas em crescimento que precisam de prontuário, financeiro e automações.",
        priceCents: 29700,
        maxUsers: 10,
        moduleKeys: [
          "CORE",
          "PATIENTS",
          "AGENDA",
          "CLINICAL_RECORD",
          "DENTAL",
          "FINANCE",
          "WHATSAPP",
          "AUTOMATIONS",
        ],
      },
      {
        key: "enterprise",
        name: "Enterprise",
        description: "Para redes de clínicas com necessidades personalizadas — condições sob consulta.",
        priceCents: null,
        maxUsers: null,
        moduleKeys: MODULE_CATALOG.map((m) => m.key),
      },
    ];

    for (const def of planDefs) {
      let [plan] = await db.select().from(plans).where(eq(plans.key, def.key)).limit(1);
      if (!plan) {
        [plan] = await db
          .insert(plans)
          .values({
            key: def.key,
            name: def.name,
            description: def.description,
            priceCents: def.priceCents,
            billingInterval: "monthly",
            maxUsers: def.maxUsers,
            isActive: true,
          })
          .returning();
      }

      for (const moduleKey of def.moduleKeys) {
        const mod = moduleByKey.get(moduleKey);
        if (!mod) continue;
        const [existingLink] = await db
          .select({ id: planModules.id })
          .from(planModules)
          .where(and(eq(planModules.planId, plan.id), eq(planModules.moduleId, mod.id)))
          .limit(1);
        if (!existingLink) {
          await db.insert(planModules).values({ planId: plan.id, moduleId: mod.id });
        }
      }
    }
  }

  console.log("→ Seeding fictitious subscription for the dev clinic (Profissional, trialing)...");
  {
    const [profissional] = await db.select().from(plans).where(eq(plans.key, "profissional")).limit(1);
    if (profissional) {
      const [existingSub] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.clinicId, clinic.id))
        .limit(1);
      if (!existingSub) {
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);
        await db.insert(subscriptions).values({
          clinicId: clinic.id,
          planId: profissional.id,
          status: "trialing",
          trialEndsAt,
          isDevSeedData: true,
        });
      }
    }
  }

  console.log("\n✅ Seed completo.");
  console.log(`   Admin: ${admin.email} (super administrador da plataforma)`);
  console.log(`   Clínica de dev: "${clinic.name}" (slug: ${clinic.slug})`);
  console.log(`   Pacientes fictícios: ${fakePatients.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
