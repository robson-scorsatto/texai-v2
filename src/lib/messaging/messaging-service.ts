import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  messageTemplates,
  reminderRules,
  outboundMessages,
  patients,
  appointments,
  type MessageTemplate,
  type NewMessageTemplate,
  type ReminderRule,
  type NewReminderRule,
  type OutboundMessage,
  type ReminderTriggerType,
} from "@/db/schema";
import { resolveTenantContext } from "@/lib/tenant/resolve-tenant";
import { recordAudit } from "@/lib/audit";
import { getMessageProviderForClinic } from "./providers/provider-factory";

/**
 * Tenant-safe service layer for WhatsApp/Automações. Message DELIVERY
 * is mocked (see providers/mock-provider.ts) but everything else here
 * — template CRUD, rule CRUD, rendering, and the outbound log — is real
 * and tenant-isolated exactly like every other module in this codebase.
 */

class TenantResolutionError extends Error {
  constructor() {
    super("UNAUTHENTICATED_OR_NO_TENANT");
  }
}

async function requireTenant() {
  const ctx = await resolveTenantContext();
  if (!ctx) throw new TenantResolutionError();
  return ctx;
}

// ---------- Templates ----------

export type UpsertTemplateInput = {
  id?: string; // if provided, updates; otherwise creates
  key: string;
  bodyTemplate: string;
  isActive?: boolean;
};

export async function listTemplates(): Promise<MessageTemplate[]> {
  const ctx = await requireTenant();
  const db = await getDb();
  return db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.clinicId, ctx.clinicId))
    .orderBy(messageTemplates.key);
}

export async function upsertTemplate(input: UpsertTemplateInput): Promise<MessageTemplate> {
  const ctx = await requireTenant();
  const db = await getDb();

  if (!input.key || input.key.trim().length === 0) throw new Error("VALIDATION:key_required");
  if (!input.bodyTemplate || input.bodyTemplate.trim().length === 0) {
    throw new Error("VALIDATION:body_required");
  }

  if (input.id) {
    const [existing] = await db
      .select({ id: messageTemplates.id })
      .from(messageTemplates)
      .where(and(eq(messageTemplates.id, input.id), eq(messageTemplates.clinicId, ctx.clinicId)))
      .limit(1);
    if (!existing) throw new Error("NOT_FOUND");

    const [updated] = await db
      .update(messageTemplates)
      .set({
        key: input.key.trim(),
        bodyTemplate: input.bodyTemplate.trim(),
        isActive: input.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(and(eq(messageTemplates.id, input.id), eq(messageTemplates.clinicId, ctx.clinicId)))
      .returning();
    return updated;
  }

  const values: NewMessageTemplate = {
    clinicId: ctx.clinicId,
    key: input.key.trim(),
    bodyTemplate: input.bodyTemplate.trim(),
    isActive: input.isActive ?? true,
    createdByUserId: ctx.userId,
  };
  const [created] = await db.insert(messageTemplates).values(values).returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "messaging.template_create",
    objectType: "message_template",
    objectId: created.id,
    result: "success",
  });

  return created;
}

// ---------- Reminder rules ----------

export type UpsertReminderRuleInput = {
  id?: string;
  triggerType: ReminderTriggerType;
  offsetMinutes: number;
  templateId: string;
  isActive?: boolean;
};

export async function listReminderRules(): Promise<ReminderRule[]> {
  const ctx = await requireTenant();
  const db = await getDb();
  return db.select().from(reminderRules).where(eq(reminderRules.clinicId, ctx.clinicId));
}

export async function upsertReminderRule(input: UpsertReminderRuleInput): Promise<ReminderRule> {
  const ctx = await requireTenant();
  const db = await getDb();

  const [template] = await db
    .select({ id: messageTemplates.id })
    .from(messageTemplates)
    .where(and(eq(messageTemplates.id, input.templateId), eq(messageTemplates.clinicId, ctx.clinicId)))
    .limit(1);
  if (!template) throw new Error("VALIDATION:template_not_in_tenant");

  if (input.id) {
    const [existing] = await db
      .select({ id: reminderRules.id })
      .from(reminderRules)
      .where(and(eq(reminderRules.id, input.id), eq(reminderRules.clinicId, ctx.clinicId)))
      .limit(1);
    if (!existing) throw new Error("NOT_FOUND");

    const [updated] = await db
      .update(reminderRules)
      .set({
        triggerType: input.triggerType,
        offsetMinutes: input.offsetMinutes,
        templateId: input.templateId,
        isActive: input.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(and(eq(reminderRules.id, input.id), eq(reminderRules.clinicId, ctx.clinicId)))
      .returning();
    return updated;
  }

  const values: NewReminderRule = {
    clinicId: ctx.clinicId,
    triggerType: input.triggerType,
    offsetMinutes: input.offsetMinutes,
    templateId: input.templateId,
    isActive: input.isActive ?? true,
  };
  const [created] = await db.insert(reminderRules).values(values).returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "messaging.reminder_rule_create",
    objectType: "reminder_rule",
    objectId: created.id,
    result: "success",
  });

  return created;
}

// ---------- Rendering + sending ----------

/** Substitutes {{variavel}} placeholders. Unknown variables are left as-is (visible, not silently dropped). */
export function renderTemplate(bodyTemplate: string, variables: Record<string, string>): string {
  return bodyTemplate.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}

export type SendMessageInput = {
  patientId: string;
  appointmentId?: string | null;
  templateId: string;
  variables: Record<string, string>;
};

/**
 * Renders the template, calls the configured provider (mock today),
 * and records the attempt in outbound_messages regardless of outcome —
 * failures are logged, not swallowed. Validates patientId/appointmentId
 * and templateId all belong to the current tenant.
 */
export async function sendMessage(input: SendMessageInput): Promise<OutboundMessage> {
  const ctx = await requireTenant();
  const db = await getDb();

  const [patient] = await db
    .select({ id: patients.id, phone: patients.phone })
    .from(patients)
    .where(and(eq(patients.id, input.patientId), eq(patients.clinicId, ctx.clinicId)))
    .limit(1);
  if (!patient) throw new Error("VALIDATION:patient_not_in_tenant");
  if (!patient.phone) throw new Error("VALIDATION:patient_has_no_phone");

  if (input.appointmentId) {
    const [appt] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.id, input.appointmentId), eq(appointments.clinicId, ctx.clinicId)))
      .limit(1);
    if (!appt) throw new Error("VALIDATION:appointment_not_in_tenant");
  }

  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.id, input.templateId), eq(messageTemplates.clinicId, ctx.clinicId)))
    .limit(1);
  if (!template) throw new Error("VALIDATION:template_not_in_tenant");

  const body = renderTemplate(template.bodyTemplate, input.variables);
  const provider = await getMessageProviderForClinic(ctx.clinicId);
  const result = await provider.send(patient.phone, body);

  const [logged] = await db
    .insert(outboundMessages)
    .values({
      clinicId: ctx.clinicId,
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
      templateId: input.templateId,
      channel: "whatsapp",
      toAddress: patient.phone,
      body,
      status: result.status,
      providerMessageId: result.status === "sent" ? result.providerMessageId : null,
      errorMessage: result.status === "failed" ? result.errorMessage : null,
      sentAt: result.status === "sent" ? new Date() : null,
      createdByUserId: ctx.userId,
    })
    .returning();

  await recordAudit({
    userId: ctx.userId,
    clinicId: ctx.clinicId,
    action: "messaging.send",
    objectType: "outbound_message",
    objectId: logged.id,
    result: result.status === "sent" ? "success" : "denied",
    metadata: { status: result.status },
  });

  return logged;
}

export async function listOutboundMessages(): Promise<OutboundMessage[]> {
  const ctx = await requireTenant();
  const db = await getDb();
  return db
    .select()
    .from(outboundMessages)
    .where(eq(outboundMessages.clinicId, ctx.clinicId))
    .orderBy(desc(outboundMessages.createdAt));
}
