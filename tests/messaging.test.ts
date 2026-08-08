import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import {
  listTemplates,
  upsertTemplate,
  listReminderRules,
  upsertReminderRule,
  renderTemplate,
  sendMessage,
  listOutboundMessages,
} from "@/lib/messaging/messaging-service";
import { createPatient } from "@/lib/patients/patients-service";
import { upsertTemplateAction, sendMessageAction, listOutboundMessagesAction } from "@/app/actions/messaging-actions";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

async function loginAsOwnerOf(clinicId: string, email: string) {
  await login(email, "Password123!");
  await switchActiveClinic(clinicId);
}

describe("Messaging — template rendering", () => {
  it("substitutes known variables and leaves unknown ones untouched", () => {
    const rendered = renderTemplate("Olá {{nome}}, {{data}} às {{hora}} — {{desconhecida}}", {
      nome: "Maria",
      data: "10/08",
      hora: "14:00",
    });
    expect(rendered).toBe("Olá Maria, 10/08 às 14:00 — {{desconhecida}}");
  });
});

describe("Messaging — service layer CRUD", () => {
  it("creates and lists templates", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Messaging CRUD");
    await loginAsOwnerOf(clinic.id, "owner@test.local");

    const template = await upsertTemplate({ key: "teste", bodyTemplate: "Olá {{nome}}!" });
    expect(template.clinicId).toBe(clinic.id);

    const templates = await listTemplates();
    expect(templates.map((t) => t.id)).toContain(template.id);
  });

  it("rejects a template with empty key or body", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Messaging Validation");
    await loginAsOwnerOf(clinic.id, "owner2@test.local");

    await expect(upsertTemplate({ key: "", bodyTemplate: "x" })).rejects.toThrow("VALIDATION:key_required");
    await expect(upsertTemplate({ key: "x", bodyTemplate: "" })).rejects.toThrow("VALIDATION:body_required");
  });

  it("creates a reminder rule linked to a template", async () => {
    const owner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Messaging Rule");
    await loginAsOwnerOf(clinic.id, "owner3@test.local");

    const template = await upsertTemplate({ key: "lembrete", bodyTemplate: "Lembrete: {{data}}" });
    const rule = await upsertReminderRule({
      triggerType: "appointment_reminder",
      offsetMinutes: -1440,
      templateId: template.id,
    });
    expect(rule.templateId).toBe(template.id);

    const rules = await listReminderRules();
    expect(rules.map((r) => r.id)).toContain(rule.id);
  });

  it("rejects a reminder rule pointing at a template from another clinic", async () => {
    const ownerA = await createTestUser({ email: "ma@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Messaging A");
    const ownerB = await createTestUser({ email: "mb@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Messaging B");

    await loginAsOwnerOf(clinicA.id, "ma@test.local");
    const templateInA = await upsertTemplate({ key: "só_da_a", bodyTemplate: "x" });

    await loginAsOwnerOf(clinicB.id, "mb@test.local");
    await expect(
      upsertReminderRule({ triggerType: "appointment_reminder", offsetMinutes: -60, templateId: templateInA.id })
    ).rejects.toThrow("VALIDATION:template_not_in_tenant");
  });
});

describe("Messaging — sending (mocked) and logging", () => {
  it("sends a message via the mock provider and logs it with rendered body", async () => {
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Messaging Send");
    await loginAsOwnerOf(clinic.id, "owner4@test.local");
    const patient = await createPatient({ name: "Paciente Mensagem", phone: "11999998888" });
    const template = await upsertTemplate({ key: "confirmacao", bodyTemplate: "Olá {{nome}}, confirmado!" });

    const sent = await sendMessage({
      patientId: patient.id,
      templateId: template.id,
      variables: { nome: patient.name },
    });

    expect(sent.status).toBe("sent");
    expect(sent.body).toBe("Olá Paciente Mensagem, confirmado!");
    expect(sent.toAddress).toBe("11999998888");
    expect(sent.providerMessageId).not.toBeNull();

    const log = await listOutboundMessages();
    expect(log.map((m) => m.id)).toContain(sent.id);
  });

  it("rejects sending to a patient with no phone number", async () => {
    const owner = await createTestUser({ email: "owner5@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Messaging No Phone");
    await loginAsOwnerOf(clinic.id, "owner5@test.local");
    const patient = await createPatient({ name: "Paciente Sem Telefone" });
    const template = await upsertTemplate({ key: "x", bodyTemplate: "x" });

    await expect(
      sendMessage({ patientId: patient.id, templateId: template.id, variables: {} })
    ).rejects.toThrow("VALIDATION:patient_has_no_phone");
  });
});

describe("Messaging — cross-tenant isolation", () => {
  it("never returns templates or messages that belong to a different clinic", async () => {
    const ownerA = await createTestUser({ email: "mc@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Messaging C");
    const ownerB = await createTestUser({ email: "md@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Messaging D");

    await loginAsOwnerOf(clinicA.id, "mc@test.local");
    const patientA = await createPatient({ name: "Paciente A Msg", phone: "11911112222" });
    const templateA = await upsertTemplate({ key: "só_a", bodyTemplate: "Olá {{nome}}" });
    await sendMessage({ patientId: patientA.id, templateId: templateA.id, variables: { nome: patientA.name } });

    await loginAsOwnerOf(clinicB.id, "md@test.local");
    const templatesInB = await listTemplates();
    expect(templatesInB.map((t) => t.id)).not.toContain(templateA.id);

    const messagesInB = await listOutboundMessages();
    expect(messagesInB).toHaveLength(0);
  });

  it("rejects sending using a patientId from another clinic", async () => {
    const ownerA = await createTestUser({ email: "me@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Messaging E");
    const ownerB = await createTestUser({ email: "mf@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Messaging F");

    await loginAsOwnerOf(clinicA.id, "me@test.local");
    const patientInA = await createPatient({ name: "Paciente Só da A Msg", phone: "11900001111" });

    await loginAsOwnerOf(clinicB.id, "mf@test.local");
    const templateInB = await upsertTemplate({ key: "x", bodyTemplate: "x" });
    await expect(
      sendMessage({ patientId: patientInA.id, templateId: templateInB.id, variables: {} })
    ).rejects.toThrow("VALIDATION:patient_not_in_tenant");
  });

  it("does not leak cross-tenant messaging data through the server action layer either", async () => {
    const ownerA = await createTestUser({ email: "mg@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Messaging G");
    const ownerB = await createTestUser({ email: "mh@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Messaging H");

    await loginAsOwnerOf(clinicA.id, "mg@test.local");
    const templateResult = await upsertTemplateAction({ key: "via_action", bodyTemplate: "Olá {{nome}}" });
    expect(templateResult.ok).toBe(true);
    if (!templateResult.ok) throw new Error("unreachable");
    const patientA = await createPatient({ name: "Paciente Ação Msg A", phone: "11922223333" });
    const sendResult = await sendMessageAction({
      patientId: patientA.id,
      templateId: templateResult.data.id,
      variables: { nome: patientA.name },
    });
    expect(sendResult.ok).toBe(true);

    await loginAsOwnerOf(clinicB.id, "mh@test.local");
    const listResult = await listOutboundMessagesAction();
    expect(listResult.ok).toBe(true);
    if (listResult.ok) expect(listResult.data).toHaveLength(0);
  });
});

describe("Messaging — RBAC enforcement", () => {
  it("blocks a role without settings.manage from creating a template", async () => {
    const owner = await createTestUser({ email: "ownerR@test.local", password: "Password123!" });
    const { clinic, roles } = await createTestClinic(owner.id, "Clinic Messaging RBAC");

    // RECEPTIONIST has no settings.* permissions per ROLE_PERMISSION_KEYS.
    const receptionUser = await createTestUser({ email: "receptionMsg@test.local", password: "Password123!" });
    const db = await getDb();
    const receptionRole = roles.find((r) => r.key === "RECEPTIONIST")!;
    await db.insert(memberships).values({
      userId: receptionUser.id,
      clinicId: clinic.id,
      roleId: receptionRole.id,
      status: "active",
    });

    await loginAsOwnerOf(clinic.id, "receptionMsg@test.local");
    const result = await upsertTemplateAction({ key: "não_deveria", bodyTemplate: "x" });
    expect(result.ok).toBe(false);
  });

  it("blocks all messaging actions when the WHATSAPP module is disabled for the clinic", async () => {
    const owner = await createTestUser({ email: "ownerM@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Messaging Module Off");

    const db = await getDb();
    const { clinicModules, modules } = await import("@/db/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const [whatsappModule] = await db.select().from(modules).where(eqOp(modules.key, "WHATSAPP")).limit(1);
    await db
      .update(clinicModules)
      .set({ enabled: false })
      .where(andOp(eqOp(clinicModules.clinicId, clinic.id), eqOp(clinicModules.moduleId, whatsappModule.id)));

    await loginAsOwnerOf(clinic.id, "ownerM@test.local");
    const result = await upsertTemplateAction({ key: "bloqueado", bodyTemplate: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/módulo/i);
  });
});
