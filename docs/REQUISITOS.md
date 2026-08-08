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
