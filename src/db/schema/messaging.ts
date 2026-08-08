import { pgTable, uuid, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { users } from "./users";
import { patients } from "./patients";
import { appointments } from "./appointments";

/**
 * WhatsApp / Automações module — tenant-scoped, same pattern as every
 * other module. THIS MODULE'S ACTUAL MESSAGE DELIVERY IS MOCKED (see
 * src/lib/messaging/providers/mock-provider.ts): the schema, service
 * layer, and UI are real and production-shaped, but no message ever
 * leaves this sandbox. Swapping in a real provider (Evolution API, Meta
 * Cloud API) later means implementing the same MessageProvider
 * interface — no schema or service-layer change needed. See
 * docs/REQUISITOS.md, Sprint 11 for the explicit scope decision.
 */

export const MESSAGE_CHANNELS = ["whatsapp"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const REMINDER_TRIGGER_TYPES = ["appointment_confirmation", "appointment_reminder"] as const;
export type ReminderTriggerType = (typeof REMINDER_TRIGGER_TYPES)[number];

export const OUTBOUND_MESSAGE_STATUSES = ["queued", "sent", "failed"] as const;
export type OutboundMessageStatus = (typeof OUTBOUND_MESSAGE_STATUSES)[number];

/** A reusable message body with {{variavel}} placeholders (nome, data, hora, profissional, clinica). */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),

    key: text("key").notNull(), // e.g. "confirmacao_agendamento", "lembrete_24h"
    channel: text("channel").notNull().default("whatsapp"), // MessageChannel
    bodyTemplate: text("body_template").notNull(),
    isActive: boolean("is_active").notNull().default(true),

    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("message_templates_clinic_id_idx").on(table.clinicId)]
);

/** When to automatically fire a template relative to an appointment's startsAt. */
export const reminderRules = pgTable(
  "reminder_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),

    triggerType: text("trigger_type").notNull(), // ReminderTriggerType
    // Minutes relative to appointment.startsAt — negative means "before".
    // e.g. -1440 = 24h before, 0 = at booking time (confirmation).
    offsetMinutes: integer("offset_minutes").notNull().default(0),
    templateId: uuid("template_id")
      .notNull()
      .references(() => messageTemplates.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),

    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reminder_rules_clinic_id_idx").on(table.clinicId)]
);

/** Append-only log of every message the system attempted to send (mocked or real). */
export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),

    patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => messageTemplates.id, { onDelete: "set null" }),

    channel: text("channel").notNull().default("whatsapp"), // MessageChannel
    toAddress: text("to_address").notNull(), // phone number as dialed, no formatting assumptions
    body: text("body").notNull(), // fully rendered, variables already substituted

    status: text("status").notNull().default("queued"), // OutboundMessageStatus
    providerMessageId: text("provider_message_id"), // opaque id from whatever provider handled it
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),

    isDevSeedData: boolean("is_dev_seed_data").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("outbound_messages_clinic_id_idx").on(table.clinicId, table.createdAt)]
);

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;
export type ReminderRule = typeof reminderRules.$inferSelect;
export type NewReminderRule = typeof reminderRules.$inferInsert;
export type OutboundMessage = typeof outboundMessages.$inferSelect;
export type NewOutboundMessage = typeof outboundMessages.$inferInsert;
