# Guia de Integração — WhatsApp (Meta) e Pagamento (Stripe)

Este guia explica como ativar as integrações reais que já estão construídas na TEXAI 2.0, mas que hoje operam em modo simulado (mock). Toda a ativação é feita pela interface do painel `/admin` — não é necessário mexer em código nem fazer deploy para ligar essas integrações.

**Resumo do que já está pronto:** o código que envia mensagens de verdade pelo WhatsApp (Meta Cloud API) e que cria cobranças de verdade (Stripe) já existe e já foi testado (ver `tests/integrations.test.ts`). O que falta é só colar as credenciais reais no `/admin` quando você decidir ativar.

## 1. WhatsApp — Meta Cloud API (por clínica)

Cada clínica tem sua própria configuração de WhatsApp — o token de uma clínica nunca é usado por outra. Isso significa que cada clínica precisa ter sua própria conta comercial no WhatsApp Business.

### Passo a passo para obter as credenciais

1. Acesse o [Meta for Developers](https://developers.facebook.com/) e crie (ou entre em) um app do tipo "Business".
2. Dentro do app, adicione o produto **WhatsApp**.
3. Em **WhatsApp → Configuração da API**, você vai encontrar:
   - **Phone Number ID** — o identificador do número de telefone que vai enviar as mensagens.
   - **Temporary access token** — um token de teste que expira em 24h. Para produção, gere um **token permanente** (associando um usuário do sistema com permissão `whatsapp_business_messaging`, em **Configurações do Negócio → Usuários do Sistema**).
4. (Opcional) **WABA ID** (WhatsApp Business Account ID) aparece na mesma tela — útil para gerenciamento futuro, mas não é obrigatório para enviar mensagens.
5. Anote os 2-3 valores acima.

### Ativando no /admin

1. Entre em `/admin` como administrador da plataforma.
2. Localize a clínica na tabela e clique em **"WhatsApp"** para expandir a seção de configuração.
3. Preencha **Phone Number ID**, **Access Token** e opcionalmente **WABA ID**.
4. Clique em **"Salvar credenciais"** — isso já ativa a integração automaticamente.
5. O status muda para "Ativo" e a partir daí, todo envio de mensagem feito pela clínica (módulo Automações) passa a usar a Meta Cloud API de verdade em vez do simulador.

### Como desativar (voltar ao modo simulado)

Clique em **"Desativar"** na mesma seção — as credenciais continuam salvas (criptografadas), só o envio real é pausado. Não é necessário apagar nada.

### O que ainda NÃO está implementado

- **Mensagens de template pré-aprovadas pela Meta.** A Meta exige o uso de templates aprovados para iniciar conversa fora da janela de 24h de atendimento ao cliente. Hoje o provider só envia mensagens de texto livre, que só funcionam dentro dessa janela (ex.: resposta a uma mensagem recebida do paciente nas últimas 24h). Isso é a próxima extensão natural quando você começar a usar isso de verdade.
- Mensagens com mídia (imagem, PDF, áudio).
- Recebimento de mensagens do paciente (webhook de entrada) — hoje é só envio.
- Status de entrega/leitura via webhook.

## 2. Pagamento — Stripe (única para toda a plataforma)

Diferente do WhatsApp, o Stripe é configurado **uma única vez** para toda a plataforma — não por clínica. A TEXAI é a única "loja" no Stripe; as clínicas não têm conta própria.

### Passo a passo para obter as credenciais

1. Crie (ou entre em) uma conta em [dashboard.stripe.com](https://dashboard.stripe.com/).
2. Em **Desenvolvedores → Chaves de API**, copie a **Chave secreta** (`sk_live_...` em produção, `sk_test_...` para testar primeiro).
3. Em **Desenvolvedores → Webhooks**, clique em **"Adicionar endpoint"**:
   - URL do endpoint: `https://SEU_DOMINIO/api/webhooks/stripe`
   - Eventos a ouvir: pelo menos `checkout.session.completed` (pode adicionar outros depois).
   - Depois de criar, copie o **Signing secret** (`whsec_...`) — ele confirma que os eventos realmente vieram do Stripe.

### Ativando no /admin

1. Entre em `/admin` como administrador da plataforma.
2. Na seção **"Integrações — Pagamento (Stripe)"**, preencha a **Chave secreta** e (opcionalmente, mas recomendado) o **Webhook signing secret**.
3. Clique em **"Salvar credenciais"** — isso já ativa a integração.
4. A partir daí, sessões de checkout criadas para um plano usam o Stripe de verdade.

### Como desativar

Clique em **"Desativar"** na mesma seção. As credenciais continuam salvas, só a cobrança real é pausada — trocar de plano no `/admin` volta a ser 100% manual (como é hoje).

### O que ainda NÃO está implementado — leitura obrigatória antes de usar em produção

- **O checkout do Stripe ainda não está conectado a nenhum botão na interface do cliente.** O `StripeProvider` (código) sabe criar uma sessão de checkout, mas isso ainda não foi ligado a um fluxo "cliente clica em Assinar" na página `/configuracoes/plano`. Essa é a próxima peça a construir quando você decidir ativar cobrança de verdade.
- **O webhook só grava o evento recebido — não age automaticamente.** Quando o Stripe confirma um pagamento (`checkout.session.completed`), o evento é salvo na tabela `stripe_webhook_events` para consulta manual, mas o status da assinatura em `subscriptions` **não muda sozinho**. Isso é proposital: decidir o que acontece automaticamente (ex.: o que fazer se um pagamento falha — bloquear a clínica? dar um prazo de tolerância?) é uma decisão de negócio, não técnica, e fica para quando você tiver essa resposta.
- Sem suporte a cupons, período de teste pago pelo Stripe (hoje o trial é só um campo de data no nosso banco, não algo que o Stripe controla), ou mudança de plano vinda do lado do cliente.
- Sem PIX ou boleto — Stripe no Brasil suporta, mas não foi configurado neste código ainda (ficaria em `stripe-provider.ts`, no método `createCheckoutSession`, adicionando `payment_method_types`).

## 3. Segurança das credenciais

Todas as credenciais (token do WhatsApp, chave do Stripe) são criptografadas antes de serem salvas no banco de dados (AES-256-GCM, ver `src/lib/crypto/secret-box.ts`). A tela de admin nunca mostra o valor salvo de volta — só um preview mascarado tipo `••••••••ab12`, para você conseguir confirmar que é a credencial certa sem expor o valor completo.

**Importante para produção:** a variável de ambiente `INTEGRATIONS_ENCRYPTION_KEY` precisa ser definida com um valor real gerado (`openssl rand -base64 32`) antes de qualquer credencial real ser salva. Em desenvolvimento, um valor fixo (inseguro, conhecido por qualquer um que leia este repositório) é usado automaticamente — nunca use esse valor padrão em produção.

## 4. Onde está o código, se precisar ajustar algo depois

| O que | Arquivo |
|---|---|
| Interface comum de provedor de mensagem | `src/lib/messaging/providers/message-provider.ts` |
| Implementação real (Meta) | `src/lib/messaging/providers/meta-cloud-provider.ts` |
| Implementação simulada (fallback) | `src/lib/messaging/providers/mock-provider.ts` |
| Escolhe qual provider usar por clínica | `src/lib/messaging/providers/provider-factory.ts` |
| Interface comum de provedor de pagamento | `src/lib/billing/providers/payment-provider.ts` |
| Implementação real (Stripe) | `src/lib/billing/providers/stripe-provider.ts` |
| Implementação simulada (fallback) | `src/lib/billing/providers/mock-payment-provider.ts` |
| Escolhe qual provider usar (plataforma toda) | `src/lib/billing/providers/provider-factory.ts` |
| Salvar/ler credenciais (criptografado) | `src/lib/integrations/integrations-service.ts` |
| Endpoint que recebe eventos do Stripe | `src/app/api/webhooks/stripe/route.ts` |
| Criptografia | `src/lib/crypto/secret-box.ts` |
