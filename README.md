# TEXAI 2.0 — Private Core (Sprint 0)

Núcleo privado, multi-tenant e modular da nova plataforma TEXAI. Este
repositório implementa o **Milestone 1 — "TEXAI Private Core"** do
`TEXAI 2.0 — MASTER DEVELOPMENT PROMPT`: login seguro, administrador da
plataforma, criação de clínicas, profissionais, troca de clínica, RBAC,
sistema de módulos, Private Beta e auditoria. Módulos de negócio
(Pacientes, Agenda, Prontuário, WhatsApp, Financeiro...) ainda **não**
foram implementados — ver "Estado do projeto" abaixo.

## Stack

- **Next.js 16** (App Router, Server Actions) + **TypeScript** (strict)
- **Drizzle ORM**, com dois drivers intercambiáveis via `DATABASE_URL`:
  - `pglite://...` — Postgres embarcado (WASM), sem servidor externo.
    Usado em desenvolvimento/testes; roda 100% offline.
  - `postgres://...` — Postgres real (staging/produção), via `postgres-js`.
  - **O schema/migrations são SQL Postgres padrão em ambos os casos** —
    trocar de ambiente é só mudar a variável de ambiente, sem tocar em código.
- **Tailwind CSS v4** para estilos utilitários.
- **Vitest** para testes (incluindo os testes obrigatórios de segurança
  cross-tenant).

> Por que Drizzle e não Prisma? No ambiente sandbox usado para construir
> este Sprint 0, o download do binário nativo do Prisma
> (`binaries.prisma.sh`) estava bloqueado pela rede. Drizzle é TypeScript
> puro (sem binário nativo) e funciona sem Docker nem instalação de
> banco — decisão registrada aqui para não ser perdida.

## Como rodar localmente

```bash
cp .env.example .env.local   # ajuste SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm install
npm run db:migrate           # aplica as migrations no Postgres embarcado (pglite)
npm run db:seed              # cria o super admin + 1 clínica de dev + 2 profissionais fictícios
npm run dev                  # http://localhost:3000
```

```bash
npm run test                 # suíte de testes (auth, RBAC, private beta, cross-tenant)
npm run build                # build de produção (roda type-check)
```

## Estado do projeto (o que existe hoje vs. o que falta)

Implementado nesta sessão (Sprint 0 — ver `docs/REQUISITOS.md` para a
matriz completa requisito → implementação → status → teste):

- Autenticação por e-mail/senha (bcrypt, sessão server-side em cookie
  httpOnly opaco — nunca um JWT com claims sensíveis no cliente).
- **Private Beta** validado no backend (`src/lib/auth/private-beta.ts`),
  não só escondido no frontend — reavaliado a cada requisição.
- **Multi-tenant real**: um usuário, várias clínicas (`memberships`),
  troca de clínica sem novo login, tenant sempre resolvido a partir da
  sessão do servidor (nunca de um campo enviado pelo cliente).
- **RBAC granular**: papéis por clínica (OWNER, ADMIN, MANAGER,
  PROFESSIONAL, RECEPTIONIST, FINANCE, ASSISTANT) com permissões
  atômicas por módulo/ação — mais granular que os 4 perfis fixos da
  plataforma legada (ver auditoria).
- **Sistema de módulos/entitlements** (`hasModule()`), com catálogo
  global e habilitação por clínica — ainda sem UI de billing.
- **Painel "Sistema Global"** (`/admin`) para o super administrador da
  TEXAI, protegido por `isPlatformAdmin` verificado no servidor.
- **Auditoria** (`audit_logs`) de login, logout, troca de clínica e
  permissões negadas.
- `/api/health` — liveness check público, sem vazar dados de negócio.
- 15 testes automatizados, incluindo os testes obrigatórios de
  **isolamento cross-tenant** (usuário da Clínica A nunca acessa dados
  da Clínica B).

**Ainda não implementado** (fora do escopo do Sprint 0, ver roadmap no
prompt mestre): Pacientes, Agenda, Prontuário/Odontograma, Documentos,
WhatsApp, Automações, Financeiro, IA, billing real (Plan/Subscription/
Invoice), agendamento público (`/agendar/:clinicSlug`), testes E2E via
navegador (as Server Actions usam multipart/form-data com tokens de ação
gerados pelo Next — validadas via testes de unidade/integração e via
`next build`, mas não via um navegador real automatizado nesta sessão).

## Segurança — decisões importantes

- Toda checagem de tenant/permissão/módulo acontece no **servidor**,
  nunca só na UI. `resolveTenantContext()` é o único caminho legítimo
  para obter a clínica ativa, e sempre revalida a *membership* no banco.
- O middleware (`src/middleware.ts`) é só a primeira barreira (cookie
  presente?) — a barreira real é o par
  `getCurrentUser()` + `resolveTenantContext()` chamado em toda
  Server Component/Server Action sensível.
- Nenhuma senha, token ou segredo está hardcoded — tudo vem de variáveis
  de ambiente validadas em `src/config/env.ts` (que falha alto e cedo se
  algo obrigatório estiver faltando).
- `.env` está no `.gitignore`; `.env.example` documenta as chaves sem
  valores reais.

## Estrutura de pastas

```
src/
  db/               schema (Drizzle), client, migrate, seed, seed-data
  lib/
    auth/           password, session, private-beta, auth-service
    tenant/         resolve-tenant (troca de clínica), clinics-service
    rbac/           permissions
    entitlements/   modules (hasModule/requireModule)
  app/
    (auth)/login    tela de login
    select-clinic   seletor de clínica (multi-tenant)
    (app)/dashboard dashboard mínimo
    admin           painel "Sistema Global" (super admin)
    api/health      healthcheck
tests/              vitest — auth, rbac, private-beta, cross-tenant
drizzle/            migrations SQL geradas
```
