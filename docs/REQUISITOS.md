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

## Sprint 11 — Módulo WhatsApp / Automações

Sexto módulo de negócio real. **Decisão explícita de escopo, confirmada com Robson antes de iniciar**: a entrega de mensagens é simulada (mock provider) nesta sprint — o sandbox não tem acesso de rede externo para nenhum provedor real, e a escolha entre Evolution API (usada pela plataforma legada, ver Auditoria 01 seção 2) e a Meta Cloud API (oficial) é uma decisão de negócio que ainda não foi tomada. Toda a arquitetura ao redor (schema, service layer, UI, log de auditoria) é real e desenhada para produção — trocar o provedor depois significa implementar `MessageProvider` com um provedor real, sem tocar em nenhuma outra camada. Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, roadmap de sprints.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Schema (tenant-scoped) | `src/db/schema/messaging.ts` — `message_templates` (corpo com variáveis `{{nome}}` etc.), `reminder_rules` (gatilho + deslocamento em minutos + template), `outbound_messages` (log append-only de toda tentativa de envio, com `providerMessageId`/`errorMessage`) | ✅ Feito | Migration `drizzle/0006_clumsy_king_bedlam.sql` aplicada com sucesso |
| 2 | Provider adapter substituível | `src/lib/messaging/providers/message-provider.ts` (interface `MessageProvider`) + `mock-provider.ts` (`MockWhatsAppProvider` — não envia nada de verdade, só loga no console e sempre retorna sucesso determinístico) | ✅ Feito | Confirmado nos testes: mensagens simuladas aparecem no log de saída dos testes (`[MockWhatsAppProvider] Would send to...`) |
| 3 | Service layer tenant-safe | `src/lib/messaging/messaging-service.ts` — `listTemplates`/`upsertTemplate`, `listReminderRules`/`upsertReminderRule` (valida `templateId` pertence à clínica), `renderTemplate` (substitui variáveis, deixa desconhecidas intactas em vez de apagar silenciosamente), `sendMessage` (valida paciente/agendamento/template da mesma clínica, chama o provider, grava o log mesmo em caso de falha), `listOutboundMessages` | ✅ Feito | `tests/messaging.test.ts` — blocos "template rendering", "service layer CRUD" e "sending (mocked) and logging" (7 casos) |
| 4 | Server actions + gates de módulo/permissão | `src/app/actions/messaging-actions.ts` — `requireModule('WHATSAPP')` + reaproveita `requirePermission('settings.view'/'settings.manage')` em vez de criar permissões novas (templates/regras são configuração de clínica) | ✅ Feito | `tests/messaging.test.ts` — blocos "cross-tenant isolation" e "RBAC enforcement" |
| 5 | UI — configuração + histórico | Nova página `/automacoes`: gestão de templates, gestão de regras de lembrete, histórico de mensagens simuladas com status; aviso visível de "modo de desenvolvimento" no topo da página; link no `/dashboard` quando o módulo está habilitado | ✅ Feito | Verificado via `next build`; sem E2E de navegador nesta sessão |
| 6 | Seed de templates/regras/mensagens fictícias | `src/db/seed.ts` — 2 templates (confirmação, lembrete 24h), 1 regra de lembrete, 1 mensagem fictícia já "enviada" (simulada) no histórico, `isDevSeedData: true`, idempotente | ✅ Feito | `npm run db:seed` executado com sucesso; verificado manualmente (2 templates, 1 regra, 1 mensagem) |
| 7 | Testes — render, envio mock, permissões, cross-tenant | `tests/messaging.test.ts` (12 casos) | ✅ Feito | 85/85 testes passando no total (`npm run test`) |

### Pendências conhecidas do Sprint 11 — leitura obrigatória antes de qualquer uso em produção

- **Nenhuma mensagem é realmente enviada.** `MockWhatsAppProvider` é o único provider implementado; até uma integração real (Evolution API ou Meta Cloud API) ser conectada, este módulo é uma demonstração funcional da arquitetura, não um canal de comunicação real com pacientes.
- Disparo automático de lembretes (cron/job que lê `reminder_rules` e chama `sendMessage` sozinho, sem ação manual) não foi implementado — hoje `sendMessage` só é chamado explicitamente; o "motor" de automação fica para sprint futura, depois que o provedor real for decidido.
- Sem suporte a outros canais (SMS, e-mail) — `channel` já existe no schema como campo mas só `"whatsapp"` está implementado.
- Sem teste E2E de navegador para os formulários de template/regra (mesma lacuna estrutural documentada nos sprints anteriores).
- Mesma pendência operacional dos Sprints 7-10 sobre `createClinic()` não deduplicar por nome ao reexecutar `npm run db:seed` em um banco já semeado.

## Sprint 12 — Catálogo de Serviços

Frente estrutural fechando lacunas documentadas nos Sprints 7 e 9: o campo `serviceName` da Agenda era texto livre sem preço padrão associado, e o lançamento financeiro não tinha como se pré-preencher a partir de um serviço. Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, roadmap de sprints.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Schema de Serviços (tenant-scoped) | `src/db/schema/services.ts` — `name`, `defaultPriceCents`, `defaultDurationMinutes`, `isActive`. Nova coluna `service_id` (nullable, FK) em `appointments`; `serviceName` permanece como override opcional de texto livre — nenhum dos dois é obrigatório (bloqueio não tem serviço) | ✅ Feito | Migration `drizzle/0007_unusual_wallop.sql` aplicada com sucesso |
| 2 | Service layer tenant-safe + integração com Agenda | `src/lib/services/services-service.ts` — CRUD completo com soft-delete (`deactivateService`). `agenda-service.ts` atualizado: `createAppointment`/`updateAppointment` aceitam `serviceId` opcional, validam que pertence à clínica, e derivam `serviceName` do serviço quando não informado explicitamente (o texto livre, se passado, sempre tem prioridade) | ✅ Feito | `tests/services.test.ts` — blocos "service layer CRUD" e "integration with Agenda" (7 casos) |
| 3 | Server actions + gates de módulo/permissão | `src/app/actions/services-actions.ts` — vive sob o módulo `AGENDA` (serviços são configuração central de agendamento, sem módulo próprio); leitura usa `agenda.view`, escrita reaproveita `settings.manage` | ✅ Feito | `tests/services.test.ts` — blocos "cross-tenant isolation" e "RBAC enforcement" |
| 4 | UI — gestão de serviços + integração no formulário de agendamento | Nova página `/servicos` (listar/criar/editar/desativar, com preço e duração padrão); formulário `/agenda/new` ganhou um seletor de serviço do catálogo que pré-preenche o horário de término pela duração padrão, mantendo o campo de texto livre como alternativa/override; link no `/dashboard` | ✅ Feito | Verificado via `next build`; sem E2E de navegador nesta sessão |
| 5 | Seed de serviços fictícios | `src/db/seed.ts` — 4 serviços típicos de odontologia (Consulta de rotina, Limpeza, Avaliação, Restauração) com preços e durações, `isDevSeedData: true`, idempotente | ✅ Feito | `npm run db:seed` executado com sucesso; verificado manualmente (4 serviços) |
| 6 | Testes — CRUD, integração, permissões, cross-tenant | `tests/services.test.ts` (11 casos) | ✅ Feito | 96/96 testes passando no total (`npm run test`) |

### Pendências conhecidas do Sprint 12

- O lançamento financeiro ainda não se pré-preenche automaticamente com o preço do serviço vinculado ao agendamento — a integração desta sprint foi limitada a Agenda ↔ Serviços; Financeiro ↔ Serviços fica para uma sprint futura pequena, reaproveitando o mesmo padrão.
- Sem categorização de serviços (ex.: "Preventivo", "Restaurador", "Estético") — lista plana por enquanto, suficiente para o volume esperado de uma clínica individual.
- Sem teste E2E de navegador para o formulário de gestão de serviços nem para o seletor integrado no formulário de agendamento (mesma lacuna estrutural documentada nos sprints anteriores).
- Mesma pendência operacional dos Sprints 7-11 sobre `createClinic()` não deduplicar por nome ao reexecutar `npm run db:seed` em um banco já semeado.

## Sprint 13 — Painel Administrativo interno (Sistema Global) expandido

Expande o painel `/admin` mínimo do Sprint 0 para uma ferramenta operacional real, permitindo administrar a plataforma sem tocar diretamente no banco de dados. Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, itens 41/42 ("Admin TEXAI" / "Private Admin").

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Service layer platform-wide (fora do RBAC de clínica) | `src/lib/platform-admin/platform-admin-service.ts` — `listAllClinics` (com contagem de membros e pacientes por clínica), `listClinicModules`/`toggleClinicModule`, `listPrivateBetaAllowlist`/`setUserBetaAccess`. Toda função chama `requirePlatformAdmin()` diretamente (verifica `isPlatformAdmin` via `getCurrentUser()`) — deliberadamente NÃO usa `resolveTenantContext()`, já que é cross-tenant por natureza | ✅ Feito | `tests/platform-admin.test.ts` — blocos "access control" e "clinic listing with counts" (5 casos) |
| 2 | Server actions | `src/app/actions/platform-admin-actions.ts` — não usa `requireModule`/`requirePermission` (está fora do sistema RBAC de clínica por design); a checagem de admin vive inteiramente na service layer | ✅ Feito | `tests/platform-admin.test.ts` — casos de "does not leak platform-admin data through the server action layer" |
| 3 | UI expandida | `/admin` — tabela de clínicas com contagem de membros/pacientes e expansão inline para ver/alternar módulos habilitados (toggles clicáveis); nova seção de allowlist do Private Beta com toggle de permitir/revogar por usuário | ✅ Feito | Verificado via `next build`; sem E2E de navegador nesta sessão |
| 4 | Testes — isolamento de acesso, toggle de módulo, allowlist | `tests/platform-admin.test.ts` (10 casos): rejeita toda função para usuário não-autenticado e para usuário autenticado não-admin (mesmo um OWNER de clínica com todas as permissões), confirma que admin acessa tudo, contagens corretas, toggle liga/desliga módulo corretamente, chave de módulo desconhecida é rejeitada, allowlist concede/revoga acesso corretamente | ✅ Feito | 106/106 testes passando no total (`npm run test`, executado em dois lotes nesta sessão por limite de tempo da ferramenta de shell — todos os arquivos de teste passaram) |

### Pendências conhecidas do Sprint 13

- Sem métricas de uso além de contagem de membros/pacientes (ex.: agendamentos no mês, mensagens enviadas, receita total) — suficiente para operação básica, mas fica para uma sprint futura de "observabilidade da plataforma" se necessário.
- Criação de nova clínica pelo painel admin (hoje só acontece via `createClinic()` chamado programaticamente/seed) não foi implementada — o fluxo real de onboarding de uma nova clínica (sign-up) continua fora do escopo, como documentado desde a Auditoria 02.
- Sem paginação na lista de clínicas nem na allowlist — aceitável no volume atual (ambiente de desenvolvimento/Private Beta), deve ser revisitado se a base de clínicas crescer.
- Sem teste E2E de navegador para os toggles de módulo e allowlist (mesma lacuna estrutural documentada nos sprints anteriores).
- Mesma pendência operacional dos Sprints 7-12 sobre `createClinic()` não deduplicar por nome ao reexecutar `npm run db:seed` em um banco já semeado.

## Sprint 14 — Plan/Subscription (scaffolding de billing)

**SCAFFOLDING — NÃO é um sistema de cobrança funcional.** Não há gateway de pagamento, não há cobrança automática, não há cartão salvo, não há webhook de pagamento. Esta sprint constrói o *formato* de dados de um sistema real de planos/assinaturas (`plans`, `plan_modules`, `subscriptions`) para que a plataforma possa adotar cobrança de verdade no futuro sem reescrever o modelo de dados — mas toda mutação hoje é uma ação manual de administrador da plataforma, não um checkout self-service. Mesma decisão arquitetural do Sprint 11 (mock provider de WhatsApp): construir a estrutura real, deixar explícito o que ainda é simulado. Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`, roadmap de sprints; preços espelham os 3 planos documentados na Auditoria 01 (Básico R$97/mês, Profissional R$297/mês, Enterprise sob consulta).

**Importante:** `hasModule()` (`src/lib/entitlements/modules.ts`) continua lendo exclusivamente de `clinic_modules` — nunca de `subscriptions`/`plan_modules`. Trocar o plano de uma clínica sincroniza `clinic_modules` de forma explícita (habilita os módulos incluídos no novo plano), mas não substitui `clinic_modules` como fonte de verdade dos entitlements, e não revoga módulos habilitados manualmente fora do plano.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Schema (plans, plan_modules, subscriptions) | `src/db/schema/billing.ts` — `plans` (key, name, `priceCents` nullable para "sob consulta", `billingInterval`, `maxUsers` nullable = ilimitado, `isActive`), `plan_modules` (join plano↔módulo), `subscriptions` (1 por clínica via unique constraint em `clinicId`, `status`: trialing/active/past_due/cancelled, `trialEndsAt`, `currentPeriodEnd`, `isDevSeedData`) | ✅ Feito | Migration `drizzle/0008_tiresome_masked_marvel.sql` aplicada com sucesso |
| 2 | Service layer | `src/lib/billing/billing-service.ts` — `listPlans` (catálogo público, qualquer usuário autenticado), `listAllPlansForAdmin`, `getSubscription`/`getMyClinicSubscription` (leitura própria da clínica, sem checagem de admin), `createSubscription`/`changeSubscriptionPlan` (sincronizam `clinic_modules` com os módulos do plano — "pelo menos" os módulos do plano, sem revogar extras concedidos manualmente), `cancelSubscription` (não desabilita módulos automaticamente — remoção de acesso por cancelamento fica para decisão futura deliberada) | ✅ Feito | `tests/billing.test.ts` — blocos "access control" e "subscription lifecycle" (9 casos) |
| 3 | Server actions | `src/app/actions/billing-actions.ts` — leituras (`listPlansAction`, `getMyClinicSubscriptionAction`) disponíveis a qualquer membro autenticado da própria clínica; mutações e leitura cross-clínica dependem inteiramente do `requirePlatformAdmin()` da service layer, mesmo padrão do Sprint 13 | ✅ Feito | `tests/billing.test.ts` — bloco "server action layer" (2 casos) |
| 4 | UI — seção de planos no admin + plano atual na clínica | `/admin`: nova ação "Plano" por linha de clínica (expande para mostrar assinatura atual, trocar plano, cancelar, ou criar assinatura se ainda não existir). Nova página `/configuracoes/plano`: visão somente-leitura do plano/status atual da própria clínica, com aviso de que troca de plano hoje é feita via suporte; card "Meu plano" adicionado ao `/dashboard` | ✅ Feito | Verificado via `next build`; sem E2E de navegador nesta sessão |
| 5 | Seed de planos e assinatura fictícia | `src/db/seed.ts` — 3 planos (Básico R$97/mês/3 usuários, Profissional R$297/mês/10 usuários, Enterprise sob consulta/ilimitado) com `plan_modules` populados; assinatura fictícia `trialing` (14 dias) do plano Profissional para a clínica de dev, `isDevSeedData: true`, idempotente | ✅ Feito | `npm run db:seed` executado com sucesso; verificado manualmente (3 planos, 1 assinatura) |
| 6 | Testes — isolamento de acesso, sincronização de módulos, leitura própria | `tests/billing.test.ts` (13 casos): rejeita mutações para não-admin (mesmo OWNER de clínica), criação de assinatura sincroniza `clinic_modules`, troca de plano sincroniza sem revogar módulo extra concedido manualmente, cancelamento bloqueia cancelamento duplo, plano desconhecido é rejeitado, leitura própria (`getMyClinicSubscription`) isolada por clínica, ação de criação não vaza para não-admin | ✅ Feito | 119/119 testes passando no total (`npm run test`, executado em lotes nesta sessão por limite de tempo da ferramenta de shell — todos os 13 arquivos de teste passaram) |

### Pendências conhecidas do Sprint 14 — leitura obrigatória antes de qualquer uso em produção

- **Não há cobrança real.** Nenhum gateway de pagamento (Stripe, Pagar.me, etc.) está integrado; `createSubscription`/`changeSubscriptionPlan`/`cancelSubscription` são ações administrativas manuais, não um fluxo de checkout do cliente.
- Troca de plano pelo próprio cliente (self-service) não foi implementada — hoje só o administrador da plataforma pode alterar o plano de uma clínica; a página `/configuracoes/plano` é somente leitura e direciona para suporte.
- Cancelamento de assinatura não revoga módulos automaticamente — é uma decisão deliberada (ver comentário no código) até haver uma política clara de "o que acontece com os dados/acesso quando o pagamento para").
- Sem histórico de faturas/pagamentos — não existe conceito de fatura neste schema ainda.
- Sem período de cobrança automático (nenhum job recorrente que avança `currentPeriodEnd` ou marca `past_due`).
- Sem teste E2E de navegador para a UI de troca de plano no admin nem para a página `/configuracoes/plano` (mesma lacuna estrutural documentada nos sprints anteriores).
- Mesma pendência operacional dos Sprints 7-13 sobre `createClinic()` não deduplicar por nome ao reexecutar `npm run db:seed` em um banco já semeado.

## Sprint 15 — Onboarding self-service (cadastro público)

Fecha uma lacuna estrutural documentada desde a Auditoria 02: até esta sprint, a ÚNICA forma de criar uma nova clínica era via `npm run db:seed` (dev) ou programaticamente — não existia um fluxo real de cadastro público. Referência: `TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`; Auditoria 02, mapeamento do fluxo de Cadastro do site legado.

**Decisão de design importante — interação com o Private Beta**: um usuário recém-cadastrado nasce com `isAllowedInPrivateBeta = false` (default da coluna, nunca sobrescrito no cadastro). Com `PRIVATE_BETA=true` (padrão), o cadastro cria a conta e a clínica de verdade, mas **não** inicia sessão automaticamente — logar o usuário nesse momento só produziria um "logado mas bloqueado" confuso no próximo request. Em vez disso, o usuário vê uma tela de "aguardando aprovação" e precisa ser liberado por um administrador da plataforma (`/admin` → allowlist, já existente desde o Sprint 13) antes de conseguir entrar. Com `PRIVATE_BETA=false` (lançamento público), o cadastro loga o usuário imediatamente.

| # | Requisito | Implementação | Status | Teste |
|---|---|---|---|---|
| 1 | Service layer de registro | `src/lib/auth/register-service.ts` — `registerAndCreateClinic()`: valida nome/e-mail/senha (mín. 8 caracteres)/nome da clínica, rejeita e-mail duplicado, faz hash da senha, cria usuário (nunca com `isPlatformAdmin`/`isAllowedInPrivateBeta` elevados), cria a clínica via `createClinic()` já existente com o novo usuário como OWNER, cria uma assinatura trial no plano "Básico" se o catálogo de planos existir (billing scaffolding do Sprint 14 é integração opcional, não obrigatória), grava auditoria, e só inicia sessão se `PRIVATE_BETA=false` | ✅ Feito | `tests/register.test.ts` — blocos "creates user + clinic + OWNER" e "billing scaffolding integration" |
| 2 | Server action | `src/app/actions/register-actions.ts` — `registerAction`, mesmo padrão de `loginAction` (FormData + `useActionState`), redireciona para `/select-clinic` (sessão iniciada) ou `/signup/pendente` (aguardando aprovação) | ✅ Feito | `tests/register.test.ts` — bloco "server action layer" |
| 3 | UI — página de cadastro + tela de pendência | Nova página `/signup` (nome, e-mail, senha, nome da clínica) com link a partir de `/login`; nova página `/signup/pendente` explicando o estado de Private Beta quando aplicável | ✅ Feito | Verificado via `next build`; sem E2E de navegador nesta sessão |
| 4 | Testes | `tests/register.test.ts` (11 casos): cria usuário+clínica+OWNER corretamente, nunca eleva privilégios, faz hash de senha, rejeita e-mail duplicado, rejeita senha fraca/e-mail inválido/nomes vazios, permite duas clínicas com o mesmo nome de exibição (slugs únicos, não nomes únicos — corrige a pendência de dedupe documentada desde o Sprint 6), não inicia sessão com `PRIVATE_BETA=true`, usuário recém-cadastrado não consegue logar até ser liberado na allowlist, integra corretamente com o catálogo de planos do Sprint 14 (com e sem catálogo semeado) | ✅ Feito | 130/130 testes passando no total (`npm run test`, executado em lotes nesta sessão por limite de tempo da ferramenta de shell — todos os 14 arquivos de teste passaram) |

### Pendências conhecidas do Sprint 15 — leitura obrigatória antes de qualquer uso em produção

- **Sem verificação de e-mail.** Qualquer endereço é aceito no cadastro sem confirmação por e-mail — não há envio de e-mail transacional na plataforma ainda (mesma lacuna do envio de WhatsApp real, Sprint 11).
- **Sem CAPTCHA/rate limiting no formulário de cadastro** — vulnerável a criação automatizada de contas em massa se exposto publicamente sem proteção adicional na camada de infraestrutura (ex.: Cloudflare, rate limit por IP).
- Com `PRIVATE_BETA=true`, o usuário recém-cadastrado não recebe nenhuma notificação de que foi liberado — precisa tentar logar manualmente depois. Um e-mail de "conta aprovada" fica para quando houver envio de e-mail transacional.
- Não há fluxo de "esqueci minha senha" — outra lacuna herdada do sistema de autenticação original, documentada desde o Sprint 0.
- Sem teste E2E de navegador para o formulário de cadastro (mesma lacuna estrutural documentada nos sprints anteriores).
- Mesma pendência operacional dos Sprints 7-14 sobre `createClinic()` (chamado agora também pelo cadastro) não deduplicar por nome ao reexecutar `npm run db:seed` em um banco já semeado — não é um bug do cadastro, é uma característica aceita e testada nesta sprint (ver teste "allows two different clinics with the same display name").
