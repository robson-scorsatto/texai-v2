export const ALL_PERMISSIONS: { key: string; module: string; description: string }[] = [
  { key: "patients.view", module: "PATIENTS", description: "Ver pacientes" },
  { key: "patients.create", module: "PATIENTS", description: "Criar pacientes" },
  { key: "patients.edit", module: "PATIENTS", description: "Editar pacientes" },
  { key: "patients.delete", module: "PATIENTS", description: "Excluir pacientes" },

  { key: "agenda.view", module: "AGENDA", description: "Ver agenda" },
  { key: "agenda.create", module: "AGENDA", description: "Criar agendamentos" },
  { key: "agenda.edit", module: "AGENDA", description: "Editar agendamentos" },
  { key: "agenda.cancel", module: "AGENDA", description: "Cancelar agendamentos" },

  { key: "clinical_record.view", module: "CLINICAL_RECORD", description: "Ver prontuário" },
  { key: "clinical_record.edit", module: "CLINICAL_RECORD", description: "Editar prontuário" },
  { key: "clinical_record.sign", module: "CLINICAL_RECORD", description: "Assinar evolução/prontuário" },

  { key: "financial.view", module: "FINANCE", description: "Ver financeiro" },
  { key: "financial.create", module: "FINANCE", description: "Criar lançamentos financeiros" },
  { key: "financial.edit", module: "FINANCE", description: "Editar lançamentos financeiros" },
  { key: "financial.delete", module: "FINANCE", description: "Excluir lançamentos financeiros" },

  { key: "settings.view", module: "CORE", description: "Ver configurações" },
  { key: "settings.manage", module: "CORE", description: "Alterar configurações" },
  { key: "members.manage", module: "CORE", description: "Gerenciar usuários/membros da clínica" },
];
