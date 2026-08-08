# Matriz de requisitos — Milestone "TEXAI Private Core" (Sprint 0)

Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, item 63.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Login seguro | `src/lib/auth/auth-service.ts` (`login`), bcrypt (12 rounds), sessão server-side opaca em cookie httpOnly | ✅ Feito | `tests/auth.test.ts` (3 casos) |
| 2 | Usuário administrador | `users.isPlatformAdmin`, criado via `npm run db:seed` a partir de `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (nunca hardcoded) | ✅ Feito | Seed validado manualmente (`npm run db:seed` executado com sucesso) |
| 3 | Criação de clínica | `src/lib/tenant/clinics-service.ts` (`createClinic`) — cria clínica + 7 roles de sistema + módulos padrão | ✅ Feito | `tests/cross-tenant.test.ts`, `tests/rbac.test.ts` (via `createTestClinic`) |
| 4 | Criação de profissionais | Usuário + `membership` com role `PROFESSIONAL` (seed cria 2 fictícios) | ✅ Feito (como membership; entidade clínica dedicada — especialidade, CRO/CRM — fica para o módulo Agenda/Prontuário) | Seed validado manualmente |
| 5 | Associação profissional ↔ clínica | Tabela `memberships` (user × clínica × role, único) | ✅ Feito | `tests/rbac.test.ts`, `tests/cross-tenant.test.ts` |
| 6 | Login de usuário | Idem #1 | ✅ Feito | `tests/auth.test.ts` |
| 7 | Seleção de clínica | Tela `/select-clinic`, lista `listUserClinics()` | ✅ Feito (UI) | Verificado via `next build` + inspeção manual do HTML renderizado; sem E2E de navegador nesta sessão |
| 8 | Troca de clínica sem logout | `switchActiveClinic()` — atualiza `sessions.activeClinicId`, revalida membership no banco a cada troca | ✅ Feito | `tests/cross-tenant.test.ts` (recusa trocar para clínica sem vínculo) |
| 9 | RBAC | Roles por clínica + `permissions` global + `role_permissions`, helpers `hasPermission()`/`requirePermission()` | ✅ Feito | `tests/rbac.test.ts` (3 casos) |
| 10 | Sistema de módulos | `modules` + `clinic_modules`, helpers `hasModule()`/`requireModule()`/`listEnabledModules()` | ✅ Feito (esqueleto; ainda sem UI de billing/upgrade) | Coberto indiretamente pelo seed (clínica dev com todos os módulos habilitados) — sem teste unitário dedicado ainda |
| 11 | Private Beta | `PRIVATE_BETA` validado em `src/lib/auth/private-beta.ts`, chamado a cada login **e** a cada `getCurrentUser()` (não só no login) | ✅ Feito | `tests/private-beta.test.ts` (4 casos) |
| 12 | Dashboard inicial | `/dashboard` — clínica ativa, papel do usuário, seletor de clínica, módulos habilitados, KPIs placeholder | ✅ Feito (mínimo, sem dados reais — dependem dos módulos de negócio) | Verificado via `next build`; sem E2E de navegador |
| 13 | Auditoria | Tabela `audit_logs`, `recordAudit()` chamado em login (sucesso/negado), logout, troca de clínica, criação de clínica, permissão negada | ✅ Feito | Coberto indiretamente — todo teste de login/permissão negada exercita `recordAudit()`; sem asserção direta sobre as linhas gravadas ainda |
| 14 | Logs | Mesma tabela `audit_logs` (log de segurança) + logs de console em erros de seed/migração | ✅ Feito (nível básico) | — |
| 15 | Segurança multi-tenant | `resolveTenantContext()` nunca confia em input do cliente; revalida membership no banco a cada chamada; testes cross-tenant obrigatórios | ✅ Feito | `tests/cross-tenant.test.ts` (4 casos, incluindo o cenário explícito do prompt mestre item 13/40) |

## Pendências conhecidas (não bloqueiam o Sprint 0, mas devem entrar no backlog)

- Teste E2E via navegador real (Playwright ou similar) do fluxo de
  login → seleção de clínica → dashboard. Não foi possível instalar um
  navegador headless neste ambiente sandbox nesta sessão; a cobertura
  atual é por testes de unidade/integração nas funções de serviço
  (`login`, `switchActiveClinic`, `hasPermission`) mais a validação de
  que o build de produção (`next build`) compila e pré-renderiza todas
  as rotas sem erro.
- `hasModule()`/`requireModule()` não têm teste unitário dedicado ainda
  (só cobertura indireta via seed) — adicionar no início do Sprint 5
  quando o primeiro módulo de negócio (Pacientes) começar a
  efetivamente checar entitlements.
- Nenhum teste automatizado assevera o conteúdo gravado em `audit_logs`
  linha a linha — hoje só garantimos que a chamada não quebra o fluxo.
- `Professional` como entidade de negócio (com especialidade, registro
  profissional, etc.) ainda não existe — hoje "profissional" é só um
  `membership` com role `PROFESSIONAL`. Isso é suficiente para o Sprint
  0 mas deve ser revisitado no Sprint 7 (Agenda) / Sprint 9 (Prontuário).

## Sprint 6 — Módulo Pacientes

Primeiro módulo de negócio real construído sobre o núcleo do Sprint 0.
Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, roadmap de sprints.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Schema de Pacientes (tenant-scoped) | `src/db/schema/patients.ts` — `clinicId` obrigatório (FK, cascade), índices por `clinicId` e `(clinicId, name)`, soft-delete via `isActive`, marcação `isDevSeedData` | ✅ Feito | Migration `drizzle/0001_clever_pepper_potts.sql` aplicada com sucesso (`npm run db:migrate`) |
| 2 | Service layer tenant-safe | `src/lib/patients/patients-service.ts` — `listPatients` (busca + paginação), `getPatient`, `createPatient`, `updatePatient`, `deactivatePatient`, `reactivatePatient`. Todas resolvem `clinicId` via `resolveTenantContext()`, nunca de argumento do chamador | ✅ Feito | `tests/patients.test.ts` — bloco "service layer CRUD" (5 casos) |
| 3 | Server actions + gates de módulo/permissão | `src/app/actions/patients-actions.ts` — cada action chama `requireModule('PATIENTS')` e `requirePermission('patients.*')` antes de tocar dados; `revalidatePath` isolado em `safeRevalidate()` para nunca mascarar uma escrita bem-sucedida | ✅ Feito | `tests/patients.test.ts` — blocos "cross-tenant isolation" e "RBAC enforcement" |
| 4 | UI — lista, criar, detalhe/editar | `/patients` (lista com busca + paginação), `/patients/new` (formulário), `/patients/[id]` (visão + edição inline, abas placeholder Prontuário/Financeiro), link de acesso no `/dashboard` quando o módulo está habilitado | ✅ Feito | Verificado via `next build` (todas as rotas compilam e pré-renderizam); sem E2E de navegador nesta sessão |
| 5 | Seed de pacientes fictícios | `src/db/seed.ts` — 5 pacientes com sufixo "(dev)", e-mails `@texai.local`, `isDevSeedData: true`, idempotente (não duplica em reexecução) | ✅ Feito | `npm run db:seed` executado com sucesso; verificado manualmente que os 5 registros existem na clínica de dev e só nela |
| 6 | Testes — CRUD, permissões, cross-tenant | `tests/patients.test.ts` (10 casos): CRUD completo, validação de nome vazio, filtro de inativos, busca por nome/telefone/e-mail, chamada sem tenant, isolamento cross-tenant (service e server action), bloqueio por RBAC (`patients.create`, `patients.delete`), bloqueio por módulo desabilitado | ✅ Feito | 25/25 testes passando (`npm run test`) |

### Pendências conhecidas do Sprint 6

- Sem teste E2E de navegador para o formulário de criação/edição de paciente (mesma lacuna estrutural documentada no Sprint 0).
- Anamnese/prontuário clínico e financeiro por paciente permanecem como abas placeholder — implementação prevista para sprints futuros (Prontuário Clínico, Financeiro), conforme roadmap do prompt mestre.
- Import/exportação em massa de pacientes (ex.: migração dos 672 pacientes reais mapeados na auditoria da plataforma legada) não foi implementada nesta sprint — é um pré-requisito para a migração real, não para o MVP técnico do módulo.

## Sprint 7 — Módulo Agenda

Segundo módulo de negócio real, construído sobre o núcleo do Sprint 0 e reaproveitando o padrão de tenant-safety do módulo Pacientes (Sprint 6). Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, roadmap de sprints.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Schema de Agenda (tenant-scoped) | `src/db/schema/appointments.ts` — `clinicId` obrigatório (FK, cascade), `patientId` opcional (nulo para bloqueios), `professionalUserId` obrigatório (referencia `users.id`, hoje sem entidade "profissional" dedicada), `status` (scheduled/confirmed/completed/cancelled/no_show), `type` (atendimento/bloqueio), índices por `(clinicId, startsAt)` e `(professionalUserId, startsAt)` | ✅ Feito | Migration `drizzle/0002_awesome_tony_stark.sql` aplicada com sucesso |
| 2 | Service layer tenant-safe | `src/lib/agenda/agenda-service.ts` — `listAppointments` (por período, filtro por profissional), `getAppointment`, `createAppointment`, `updateAppointment`, `cancelAppointment`, `confirmAppointment`, `completeAppointment`, `markNoShow`, `listClinicProfessionals`. Toda operação resolve `clinicId` via `resolveTenantContext()`; `createAppointment`/`updateAppointment` validam que `patientId` e `professionalUserId` pertencem à mesma clínica antes de gravar | ✅ Feito | `tests/agenda.test.ts` — bloco "service layer CRUD" (5 casos) |
| 3 | Detecção de conflito de horário | `hasConflict()` — impede dois agendamentos não cancelados do mesmo profissional se sobreporem (intervalo semiaberto `[starts, ends)`, permitindo agendamentos consecutivos back-to-back); verificado tanto na criação quanto na atualização de horário/profissional | ✅ Feito | `tests/agenda.test.ts` — bloco "scheduling conflict detection" (5 casos, incluindo back-to-back permitido, profissionais diferentes não conflitam, cancelado libera o horário, conflito detectado em update) |
| 4 | Server actions + gates de módulo/permissão | `src/app/actions/agenda-actions.ts` — cada action chama `requireModule('AGENDA')` e `requirePermission('agenda.*')` antes de tocar dados | ✅ Feito | `tests/agenda.test.ts` — blocos "cross-tenant isolation" e "RBAC enforcement" |
| 5 | UI — visão do dia, criar, ações de status | `/agenda` (visão de um dia por vez, navegação anterior/próximo, ações Confirmar/Concluir/Faltou/Cancelar por item conforme permissão), `/agenda/new` (formulário Paciente/Profissional → Data/Hora → Detalhes, com opção Atendimento ou Bloqueio), link de acesso no `/dashboard` quando o módulo está habilitado | ✅ Feito | Verificado via `next build` (todas as rotas compilam e pré-renderizam); sem E2E de navegador nesta sessão. Visão de Semana/Mês não implementada nesta sprint — ver pendências |
| 6 | Seed de agendamentos fictícios | `src/db/seed.ts` — 4 agendamentos fictícios (3 atendimentos + 1 bloqueio) nos dois profissionais fictícios já semeados, distribuídos em datas futuras próximas, `isDevSeedData: true`, idempotente | ✅ Feito | `npm run db:seed` executado com sucesso; verificado manualmente que os 4 registros existem e só na clínica de dev |
| 7 | Testes — CRUD, conflito, permissões, cross-tenant | `tests/agenda.test.ts` (14 casos) | ✅ Feito | 39/39 testes passando no total (`npm run test`) |

### Bugs pré-existentes encontrados e corrigidos nesta sprint

Ao escrever os testes de conflito de horário e o seed de agendamentos, dois problemas do Sprint 0/6 vieram à tona e foram corrigidos:

- **`hasConflict()` rejeitava agendamentos consecutivos (back-to-back)**: a condição de sobreposição usava `>=` em vez de `>` no limite final do intervalo, então um agendamento que começa exatamente quando o anterior termina era tratado como conflito. Corrigido para intervalo semiaberto `[starts, ends)` — coberto pelo teste "rejects a new appointment that overlaps..." (o próprio teste pegou o bug).
- **`src/db/seed.ts` — vínculo de profissionais fictícios não era escopado por clínica**: a checagem de "já existe membership" filtrava só por `userId`, não por `userId + clinicId`. Em bancos de dev onde o seed já havia rodado antes (criando uma segunda clínica), os profissionais fictícios não eram vinculados à nova clínica, e os agendamentos fictícios ficavam sem profissional válido para associar. Corrigido para escopar a checagem por `and(eq(userId), eq(clinicId))`.

### Pendências conhecidas do Sprint 7

- Visão de Semana e Mês da agenda não implementadas — MVP cobre apenas visão de Dia com navegação anterior/próximo, suficiente para validar o fluxo core de agendamento.
- Sem teste E2E de navegador para o formulário de novo agendamento (mesma lacuna estrutural documentada nos Sprints 0 e 6).
- `createClinic()` (Sprint 0) não deduplica por nome — reexecutar `npm run db:seed` em um banco de dev já semeado cria uma nova clínica a cada vez, em vez de reaproveitar a existente. Não é um problema de segurança (cada clínica continua isolada corretamente), mas é um incômodo operacional para quem já rodou o seed antes; recomenda-se `rm -rf .data && npm run db:migrate && npm run db:seed` para um ambiente de dev limpo. Deixado como pendência para não expandir o escopo desta sprint.
- Catálogo de serviços (`serviceName` é hoje texto livre) e associação de agendamento a um serviço com preço/duração padrão ficam para sprint futura (Financeiro/Serviços).
- Notificação automática de confirmação via WhatsApp (já mapeada como ponto forte da plataforma legada na Auditoria 01) ainda não está conectada — pertence ao módulo WHATSAPP/AUTOMATIONS, fora do escopo desta sprint.

## Sprint 8 — Módulo Prontuário Clínico

Terceiro módulo de negócio real, conectando Pacientes (Sprint 6) e Agenda (Sprint 7) — implementado como uma nova aba dentro da ficha do paciente, substituindo o placeholder que existia desde o Sprint 6. Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, roadmap de sprints.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Schema de Prontuário (tenant-scoped) | `src/db/schema/clinical-records.ts` — `clinicId` e `patientId` obrigatórios, `appointmentId` opcional (vincula a entrada a um atendimento), `recordType` (evolução/anamnese/procedimento), `signedAt`/`signedByUserId` para o mecanismo de imutabilidade, índice composto `(clinicId, patientId)` | ✅ Feito | Migration `drizzle/0003_melted_zarek.sql` aplicada com sucesso |
| 2 | Service layer tenant-safe + imutabilidade após assinatura | `src/lib/clinical-records/clinical-records-service.ts` — `listClinicalRecords`, `getClinicalRecord`, `createClinicalRecord`, `updateClinicalRecord`, `signClinicalRecord`. Uma entrada assinada nunca pode ser editada (só uma nova entrada pode ser adicionada) — reflete prática clínica/legal real; validação de que `patientId`/`appointmentId` pertencem à clínica atual | ✅ Feito | `tests/clinical-records.test.ts` — blocos "service layer CRUD" e "signature immutability" (6 casos) |
| 3 | Server actions + gates de módulo/permissão | `src/app/actions/clinical-records-actions.ts` — `requireModule('CLINICAL_RECORD')` + `requirePermission('clinical_record.view/edit/sign')` conforme a ação | ✅ Feito | `tests/clinical-records.test.ts` — blocos "cross-tenant isolation" e "RBAC enforcement" |
| 4 | UI — aba Prontuário na ficha do paciente | Aba "Prontuário" em `/patients/[id]` agora renderiza uma timeline real (`clinical-records-tab.tsx`): nova entrada, edição de rascunhos, indicação visual de assinado (imutável, verde) vs rascunho (amarelo), botão Assinar | ✅ Feito | Verificado via `next build`; sem E2E de navegador nesta sessão |
| 5 | Seed de entradas fictícias | `src/db/seed.ts` — 3 entradas fictícias (1 anamnese assinada, 1 evolução em rascunho, 1 procedimento assinado) vinculadas aos pacientes/profissional fictícios já semeados, `isDevSeedData: true`, idempotente | ✅ Feito | `npm run db:seed` executado com sucesso; verificado manualmente que os 3 registros existem e só na clínica de dev |
| 6 | Testes — CRUD, imutabilidade, permissões, cross-tenant | `tests/clinical-records.test.ts` (12 casos) | ✅ Feito | 51/51 testes passando no total (`npm run test`) |

### Pendências conhecidas do Sprint 8

- Odontograma / representação gráfica dente-a-dente (mapeado como funcionalidade forte da plataforma legada na Auditoria 01) não foi implementado — é um tipo de registro clínico especializado (módulo DENTAL) que fica para uma sprint futura, construído sobre esta mesma tabela `clinical_records` ou uma tabela companion.
- Modelos de anamnese configuráveis (formulário estruturado, não texto livre) ficam para sprint futura — hoje `content` é texto livre, suficiente para validar o fluxo core de timeline + assinatura.
- Sem teste E2E de navegador para o formulário de nova entrada/assinatura (mesma lacuna estrutural documentada nos Sprints 0, 6 e 7).
- Mesma pendência operacional do Sprint 7 sobre `createClinic()` não deduplicar por nome ao reexecutar `npm run db:seed` em um banco já semeado.

## Sprint 9 — Módulo Financeiro

Quarto módulo de negócio real, fechando o tripé Pacientes + Agenda + Financeiro identificado como o núcleo mais usado na Auditoria 01 da plataforma legada. Substitui o placeholder "Financeiro" na ficha do paciente (desde o Sprint 6) e adiciona uma visão geral consolidada da clínica. Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, roadmap de sprints.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Schema de Financeiro (tenant-scoped) | `src/db/schema/financial-entries.ts` — `clinicId` obrigatório, `patientId`/`appointmentId` opcionais, `type` (receita/despesa), `status` (pending/paid/overdue/cancelled), `amountCents` (inteiro, nunca float), índices por `(clinicId, status)` e `(clinicId, patientId)` | ✅ Feito | Migration `drizzle/0004_woozy_firedrake.sql` aplicada com sucesso |
| 2 | Service layer tenant-safe + imutabilidade | `src/lib/finance/finance-service.ts` — `listFinancialEntries`, `getFinancialTotals` (a receber/recebido/em atraso), `getFinancialEntry`, `createFinancialEntry`, `updateFinancialEntry`, `markAsPaid`, `cancelFinancialEntry`. Lançamento pago ou cancelado nunca pode ser editado; `sweepOverdue()` recalcula `pending` → `overdue` a cada leitura com base na data de vencimento | ✅ Feito | `tests/finance.test.ts` — blocos "service layer CRUD" e "totals and overdue sweep" (6 casos) |
| 3 | Server actions + gates de módulo/permissão | `src/app/actions/finance-actions.ts` — `requireModule('FINANCE')` + `requirePermission('financial.view/create/edit/delete')` conforme a ação (delete mapeia para cancelamento, dinheiro nunca é apagado de verdade) | ✅ Feito | `tests/finance.test.ts` — blocos "cross-tenant isolation" e "RBAC enforcement" |
| 4 | UI — aba Financeiro na ficha do paciente + visão geral da clínica | Aba "Financeiro" em `/patients/[id]` (lista de lançamentos do paciente, novo lançamento, marcar como pago, cancelar); nova página `/financeiro` com cards de totais (A receber / Recebido / Em atraso) e lista de todos os lançamentos da clínica; link no `/dashboard` quando o módulo está habilitado | ✅ Feito | Verificado via `next build`; sem E2E de navegador nesta sessão |
| 5 | Seed de lançamentos fictícios | `src/db/seed.ts` — 3 lançamentos fictícios (1 pago, 1 pendente futuro, 1 já vencido), `isDevSeedData: true`, idempotente | ✅ Feito | `npm run db:seed` executado com sucesso; verificado manualmente que os 3 registros existem e só na clínica de dev |
| 6 | Testes — CRUD, totais, permissões, cross-tenant | `tests/finance.test.ts` (12 casos) | ✅ Feito | 63/63 testes passando no total (`npm run test`) |

### Pendências conhecidas do Sprint 9

- `sweepOverdue()` roda a cada leitura (list/totals) em vez de um job agendado — suficiente para o MVP, mas se o volume de lançamentos crescer muito vale mover para um cron/job de backend.
- Sem suporte a parcelamento (uma cobrança dividida em N lançamentos vinculados) nem a métodos de pagamento (dinheiro/cartão/PIX) — ambos ficam para sprint futura de Financeiro avançado.
- Despesas da clínica (`type: "despesa"`) já têm suporte no schema e no service layer, mas a UI construída nesta sprint só expõe o fluxo de receita por paciente — tela dedicada a despesas fica para sprint futura.
- Sem teste E2E de navegador para os formulários de novo lançamento/marcar pago (mesma lacuna estrutural documentada nos Sprints 0, 6, 7 e 8).
- Mesma pendência operacional dos Sprints 7 e 8 sobre `createClinic()` não deduplicar por nome ao reexecutar `npm run db:seed` em um banco já semeado.

## Sprint 10 — Módulo Odontograma

Quinto módulo de negócio real, construído como extensão do Prontuário Clínico (Sprint 8) em vez de sistema paralelo — reaproveita as permissões `clinical_record.view/edit`. Funcionalidade identificada na Auditoria 01 (seção 3.2) como um dos pontos fortes da plataforma legada. Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, roadmap de sprints.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Schema de Odontograma (tenant-scoped) | `src/db/schema/dental-charts.ts` — `dentalCharts` (1 registro por paciente, `dentitionType` permanente/decíduo, constraint unique em `patientId`) + `toothRecords` (histórico de procedimentos por dente, notação FDI, `status`, vínculo opcional a `clinical_records`), índices apropriados | ✅ Feito | Migration `drizzle/0005_groovy_karnak.sql` aplicada com sucesso |
| 2 | Service layer tenant-safe | `src/lib/dental/dental-service.ts` — `getOrCreateDentalChart` (cria sob demanda), `listToothRecords`, `addToothRecord` (valida número de dente na notação FDI), `getCurrentToothStatuses` (reduz o histórico ao status mais recente por dente para renderizar a arcada). Toda operação resolve `clinicId` via `resolveTenantContext()` e valida `patientId` pertence à clínica | ✅ Feito | `tests/dental.test.ts` — bloco "service layer CRUD" (5 casos) |
| 3 | Server actions + gates de módulo/permissão | `src/app/actions/dental-actions.ts` — `requireModule('DENTAL')` + reaproveita `requirePermission('clinical_record.view/edit')` em vez de criar permissões `dental.*` novas, já que um registro de dente é conceitualmente um registro clínico | ✅ Feito | `tests/dental.test.ts` — blocos "cross-tenant isolation" e "RBAC enforcement" |
| 4 | UI — nova aba Odontograma na ficha do paciente | Aba "Odontograma" em `/patients/[id]` com arcada visual simplificada (32 dentes permanentes, notação FDI, cores por status), clique no dente abre histórico + formulário de novo registro | ✅ Feito | Verificado via `next build`; sem E2E de navegador nesta sessão |
| 5 | Seed de registros fictícios | `src/db/seed.ts` — 1 dental chart + 3 registros de dente fictícios (restaurado, cariado, saudável) para uma paciente já semeada, `isDevSeedData: true`, idempotente | ✅ Feito | `npm run db:seed` executado com sucesso; verificado manualmente que os registros existem e só na clínica de dev |
| 6 | Testes — CRUD, permissões, cross-tenant | `tests/dental.test.ts` (10 casos) | ✅ Feito | 73/73 testes passando no total (`npm run test`) |

### Pendências conhecidas do Sprint 10

- Só dentição permanente tem UI dedicada nesta sprint — dentição decídua (infantil) já tem suporte no schema (`dentitionType`) mas sem seletor visual ainda; fica para sprint futura se/quando pediatria for priorizada.
- Sem vínculo automático entre um registro de dente e uma entrada de prontuário (`clinicalRecordId` existe no schema mas não é preenchido pela UI atual) — registrar um procedimento no odontograma e documentá-lo na timeline do prontuário são hoje duas ações manuais separadas.
- Sem teste E2E de navegador para o clique no dente / formulário de novo registro (mesma lacuna estrutural documentada nos sprints anteriores).
- Mesma pendência operacional dos Sprints 7-9 sobre `createClinic()` não deduplicar por nome ao reexecutar `npm run db:seed` em um banco já semeado.
