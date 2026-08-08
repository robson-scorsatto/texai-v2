/**
 * System roles seeded for every new clinic. Keep keys UPPER_SNAKE — they
 * are treated as stable identifiers (never rename in place; add a new
 * key and migrate instead).
 */
export const SYSTEM_ROLES = [
  { key: "OWNER", label: "Proprietário" },
  { key: "ADMIN", label: "Administrador" },
  { key: "MANAGER", label: "Gestor" },
  { key: "PROFESSIONAL", label: "Profissional" },
  { key: "RECEPTIONIST", label: "Recepcionista" },
  { key: "FINANCE", label: "Financeiro" },
  { key: "ASSISTANT", label: "Assistente" },
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]["key"];

/**
 * Default permission grants per system role. OWNER and ADMIN get
 * everything; other roles get a deliberately narrower set, mirroring
 * (and improving on) the 4 fixed profiles found in the legacy platform
 * audit (Proprietário/Administrador/Profissional/Atendente) — see
 * TEXAI_Auditoria_01.docx, seção 9.
 */
export const ROLE_PERMISSION_KEYS: Record<SystemRoleKey, string[] | "ALL"> = {
  OWNER: "ALL",
  ADMIN: "ALL",
  MANAGER: [
    "patients.view", "patients.create", "patients.edit",
    "agenda.view", "agenda.create", "agenda.edit", "agenda.cancel",
    "clinical_record.view",
    "financial.view", "financial.create", "financial.edit",
    "settings.view",
    "members.manage",
  ],
  PROFESSIONAL: [
    "patients.view", "patients.edit",
    "agenda.view", "agenda.create", "agenda.edit",
    "clinical_record.view", "clinical_record.edit", "clinical_record.sign",
  ],
  RECEPTIONIST: [
    "patients.view", "patients.create", "patients.edit",
    "agenda.view", "agenda.create", "agenda.edit", "agenda.cancel",
  ],
  FINANCE: [
    "financial.view", "financial.create", "financial.edit", "financial.delete",
    "patients.view",
  ],
  ASSISTANT: [
    "patients.view",
    "agenda.view",
    "clinical_record.view",
  ],
};
