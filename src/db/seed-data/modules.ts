export const MODULE_CATALOG: { key: string; label: string; description: string; isCore: boolean }[] = [
  { key: "CORE", label: "Core", description: "Autenticação, usuários, clínicas e configurações — sempre habilitado.", isCore: true },
  { key: "PATIENTS", label: "Pacientes", description: "Cadastro e gestão de pacientes.", isCore: false },
  { key: "AGENDA", label: "Agenda", description: "Agendamentos, profissionais, salas e horários.", isCore: false },
  { key: "CLINICAL_RECORD", label: "Prontuário", description: "Evoluções, histórico, documentos clínicos.", isCore: false },
  { key: "DENTAL", label: "Odontograma", description: "Especialização odontológica do prontuário.", isCore: false },
  { key: "WHATSAPP", label: "WhatsApp", description: "Mensageria e automações via WhatsApp.", isCore: false },
  { key: "AUTOMATIONS", label: "Automações", description: "Motor de eventos e ações automáticas.", isCore: false },
  { key: "FINANCE", label: "Financeiro", description: "Receitas, despesas, contas e fluxo de caixa.", isCore: false },
  { key: "STOCK", label: "Estoque", description: "Controle de produtos e materiais.", isCore: false },
  { key: "REPORTS", label: "Relatórios", description: "Relatórios e indicadores.", isCore: false },
  { key: "AI", label: "Inteligência Artificial", description: "Assistente de IA e automações inteligentes.", isCore: false },
  { key: "DOCUMENTS", label: "Documentos", description: "Modelos de atestados, receitas e documentos.", isCore: false },
];
