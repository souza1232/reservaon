# ReservaOn

Plataforma multiempresa (multi-tenant) de agendamentos online. Cada empresa
cadastrada tem sua própria página pública de agendamento, agenda, serviços,
profissionais e clientes — totalmente isolados dos dados de outras empresas.

## Sumário

- [Stack utilizada](#stack-utilizada)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como rodar localmente](#como-rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Dados de demonstração (seed)](#dados-de-demonstração-seed)
- [Testes](#testes)
- [Segurança e multi-tenant](#segurança-e-multi-tenant)
- [Deploy em produção](#deploy-em-produção)
- [Integrações preparadas para o futuro](#integrações-preparadas-para-o-futuro)
- [Limitações conhecidas](#limitações-conhecidas)

---

## Stack utilizada

- **Next.js 16** (App Router, Server Actions, Turbopack)
- **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (base Radix)
- **PostgreSQL** + **Prisma ORM 6**
- **Auth.js (NextAuth v5)** com Credentials Provider + bcrypt
- **React Hook Form** + **Zod**
- **date-fns / date-fns-tz** para tudo relacionado a fuso horário
- **Recharts** (gráfico do dashboard)
- **Vitest** para testes

## Estrutura do projeto

```
prisma/
  schema.prisma        # modelo de dados completo
  seed.ts               # dados de DESENVOLVIMENTO (Clínica Exemplo)
src/
  app/
    (landing, /entrar, /cadastro, /privacidade, /termos)
    empresa/[slug]/                 # página pública de agendamento
    painel/                         # painel da empresa (COMPANY_ADMIN)
    profissional/                   # área do profissional (PROFESSIONAL)
    admin/                          # Super Admin da plataforma
    api/
      auth/[...nextauth]/           # rota do Auth.js
      public/agendamentos/[id]/ics  # geração do arquivo .ics
  auth.ts                # configuração do Auth.js
  middleware.ts           # proteção de rotas por papel
  components/
    ui/                   # componentes shadcn/ui
    dashboard/             # componentes compartilhados do painel/agenda
    site/                  # landing page / auth shell
  lib/
    prisma.ts             # client Prisma singleton
    guards.ts              # autorização + isolamento multi-tenant
    tenant-guard.ts         # núcleo puro do isolamento multi-tenant (testável)
    availability.ts         # motor de disponibilidade (usa Prisma)
    availability-core.ts     # núcleo puro do cálculo (testável sem banco)
    whatsapp.ts             # geração do link wa.me
    ics.ts                  # geração do arquivo .ics
    notifications.ts         # e-mail preparado (no-op se não configurado)
    validations/            # schemas Zod
  server/
    actions/               # Server Actions (mutações, sempre com guarda de tenant)
    queries/                # leituras mais complexas (dashboard, agenda)
tests/
  integration/             # testes que precisam de um Postgres real
  stubs/                   # stub de "server-only" para rodar em Vitest
```

---

## Como rodar localmente

### 1. Pré-requisitos

- Node.js 20+
- Um PostgreSQL acessível (veja [Banco de dados](#banco-de-dados))

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Preencha pelo menos `DATABASE_URL` e `AUTH_SECRET` (veja a seção abaixo).

### 4. Criar o schema no banco

```bash
npx prisma migrate dev --name init
```

Isso cria as tabelas a partir de `prisma/schema.prisma`. Em produção, use
`npm run db:deploy` (equivalente a `prisma migrate deploy`) em vez de
`migrate dev`.

### 5. Popular com dados de demonstração (opcional, mas recomendado)

```bash
npm run db:seed
```

Cria os planos, um Super Admin e a empresa fictícia **Clínica Exemplo** (ver
[Dados de demonstração](#dados-de-demonstração-seed)).

### 6. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse `http://localhost:3000`.

---

## Variáveis de ambiente

Todas estão documentadas em `.env.example`. Resumo:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | String de conexão do PostgreSQL. |
| `AUTH_SECRET` | ✅ | Segredo usado pelo Auth.js para assinar sessões. Gere com `openssl rand -base64 32`. |
| `AUTH_URL` / `NEXT_PUBLIC_APP_URL` | ✅ | URL pública da aplicação (`http://localhost:3000` em dev). |
| `EMAIL_SERVER_HOST/PORT/USER/PASSWORD`, `EMAIL_FROM` | opcional | Credenciais SMTP. Sem elas, o sistema funciona normalmente e apenas registra a notificação como `SKIPPED` em vez de enviar e-mail. |
| `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` | opcional / futuro | Reservadas para a futura integração com a WhatsApp Business API oficial. A v1 usa apenas link `wa.me`, sem custo e sem credenciais. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | opcional / futuro | Reservadas para cobrança real via Stripe. |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` | opcional / futuro | Reservadas para cobrança real via Mercado Pago. |
| `BLOB_READ_WRITE_TOKEN` | opcional | Upload de imagens (logo, fotos). Sem isso, use URLs de imagens já hospedadas nos campos correspondentes. |

## Banco de dados

### Opção A — Docker (recomendado para desenvolvimento)

Este repositório já inclui um `docker-compose.yml`:

```bash
docker compose up -d
```

Isso sobe um PostgreSQL local na porta `5432` com as credenciais já
compatíveis com o `DATABASE_URL` padrão do `.env.example`:

```
postgresql://agendapro:agendapro@localhost:5432/agendapro?schema=public
```

### Opção B — Banco gerenciado na nuvem

Funciona com qualquer PostgreSQL gerenciado (Neon, Supabase, Railway, RDS
etc.). Basta colocar a connection string fornecida pelo provedor em
`DATABASE_URL` no `.env` (ou nas variáveis de ambiente da plataforma de
deploy) e rodar `npx prisma migrate deploy`.

> O projeto foi validado ponta a ponta contra um PostgreSQL real (Neon):
> `prisma migrate deploy`, `db:seed` e a suíte completa de testes de
> integração (`RUN_DB_TESTS=true npm test`) rodaram com sucesso — 27/27
> testes passando, incluindo os cenários de conflito de horário, isolamento
> multi-tenant e prevenção de dupla reserva. Aponte seu próprio
> `DATABASE_URL` (Docker ou nuvem) e rode
> `npx prisma migrate deploy && npm run db:seed && npm run dev` normalmente.

## Dados de demonstração (seed)

`npm run db:seed` cria (dados **apenas para desenvolvimento**, deixados
explícitos na descrição da empresa):

- Planos **Gratuito** e **Profissional**
- Super Admin: `admin@reservaon.com`
- Empresa **Clínica Exemplo** (`/empresa/clinica-exemplo`) com:
  - Admin da empresa: `admin@clinicaexemplo.com.br`
  - 2 profissionais (João, com login em `joao@clinicaexemplo.com.br`; Maria, sem login)
  - 5 serviços, horários de funcionamento, 3 clientes, agendamentos em
    diferentes status, 1 feriado (25/12) e 1 bloqueio de horário
- **Senha para todas as contas de demonstração:** `Senha123!`

## Testes

```bash
npm test
```

Isso roda os testes unitários (sempre habilitados, sem precisar de banco):

- `src/lib/__tests__/availability-core.test.ts` — a lógica pura de cálculo
  de horários disponíveis (interseção de horários, geração de slots,
  detecção de conflito, buffer entre atendimentos).
- `src/lib/__tests__/tenant-guard.test.ts` — a checagem de isolamento
  multi-tenant (`assertSameCompany`).

### Testes de integração (precisam de um Postgres real)

`tests/integration/booking.test.ts` cobre os cenários de ponta a ponta
pedidos no escopo: criar empresa/profissional/serviço, gerar disponibilidade,
criar agendamento, impedir agendamento em horário ocupado / fora do
expediente / no passado, liberar horário ao cancelar, bloqueio de dia
inteiro e isolamento entre empresas. Eles ficam **desabilitados por padrão**
para não quebrar `npm test` em quem ainda não tem um banco configurado.

Para rodá-los:

```bash
# aponte DATABASE_URL para um banco de TESTE (nunca produção) e rode:
npx prisma db push
RUN_DB_TESTS=true npm test
```

## Segurança e multi-tenant

- **Isolamento por empresa**: todo modelo de negócio (`Service`,
  `Professional`, `Customer`, `Appointment`, `WorkingHour`, `BlockedTime`,
  `Holiday`, `CompanySettings`) tem uma coluna `companyId` obrigatória.
  Nenhuma Server Action confia em um `companyId` vindo do cliente — o
  `companyId` sempre vem da sessão autenticada (`src/lib/guards.ts`), e cada
  mutação revalida que o recurso pertence a essa empresa antes de alterá-lo.
- **Três papéis** (`SUPER_ADMIN`, `COMPANY_ADMIN`, `PROFESSIONAL`) — checados
  em três camadas: middleware (`src/middleware.ts`), layout de cada área
  (`/painel`, `/profissional`, `/admin`) e, de novo, dentro de cada Server
  Action.
- **Senhas** com hash `bcrypt` (nunca armazenadas em texto puro).
- **Prevenção de dupla reserva**: a checagem final de disponibilidade
  acontece dentro da mesma transação Postgres (`isolationLevel: Serializable`)
  que cria o agendamento — se dois clientes tentarem reservar o mesmo
  horário ao mesmo tempo, o Postgres detecta o conflito de leitura/escrita e
  aborta uma das transações (`P2034`), que a aplicação trata mostrando
  "este horário acabou de ser reservado por outra pessoa".
- **Reforço a nível de banco**: um índice único parcial em
  `("professionalId", "startAt")` (ignorando `CANCELED`/`NO_SHOW`) garante,
  direto no Postgres, que duas linhas de `Appointment` ativas nunca coexistam
  para o mesmo profissional no mesmo horário — mesmo numa condição de corrida
  que a transação Serializable não cubra. Como o Prisma Schema não tem
  sintaxe nativa para índices únicos parciais, ele foi escrito como SQL puro
  em `prisma/migrations/20260915194500_appointment_no_double_booking/` e é
  aplicado automaticamente pelo `prisma migrate deploy`/`migrate dev`, junto
  com o resto do schema — validado com testes de integração reais.
- **Validação sempre no backend**: todos os schemas Zod usados nos
  formulários são reaplicados nas Server Actions; nada depende apenas da
  validação do formulário no cliente.

## Deploy em produção

**Já está publicado**: https://agendapro-mu-olive.vercel.app (projeto Vercel
`agendapro`, time `jesus-projects-b43978a7`). O banco atual é um projeto
Neon **temporário** (criado via Claimable Neon para permitir testar tudo
sem esperar cadastro) — precisa ser reivindicado para uma conta Neon de
verdade antes de expirar, veja o aviso que foi dado na conversa. Depois de
reivindicado, o `DATABASE_URL` muda; atualize a env var na Vercel e rode
`prisma migrate deploy` de novo contra o banco definitivo.

Para publicar do zero (ou em outra conta):

1. Crie o banco gerenciado (Neon ou Supabase) e copie a connection string.
2. Configure no projeto da Vercel as variáveis de `.env.example`
   (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`/`NEXT_PUBLIC_APP_URL` com o
   domínio real, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` se for usar
   cobrança, e as demais opcionais que for usar).
3. Rode as migrations contra o banco de produção **antes** do primeiro
   deploy (ou como um passo de build):
   ```bash
   npx prisma migrate deploy
   ```
4. Deploy normal (`vercel --prod` ou integração com Git).
   - Este repositório **não está conectado a nenhum Git remoto** (GitHub/
     GitLab/Bitbucket) — os deploys até agora foram feitos publicando os
     arquivos locais diretamente via `vercel --prod` (Vercel CLI). Conectar
     um repositório Git ao projeto na Vercel habilita deploy automático a
     cada push e é o caminho recomendado para o dia a dia.
5. Depois de criar o produto/preço reais no Stripe (ou usar os já criados em
   modo teste — ver seção acima), registre o webhook em **Developers →
   Webhooks** apontando para `https://SEU_DOMINIO/api/webhooks/stripe`,
   ouvindo `checkout.session.completed`, `customer.subscription.updated` e
   `customer.subscription.deleted`, e cole o "Signing secret" em
   `STRIPE_WEBHOOK_SECRET`.
6. **Não rode `npm run db:seed` em produção** — ele existe apenas para
   desenvolvimento.

Qualquer outro host Node.js (Railway, Render, um VPS com PM2) funciona da
mesma forma: `npm run build && npm run start`, com `prisma migrate deploy`
rodando antes do primeiro boot.

## Integrações preparadas para o futuro

O escopo pediu para **não implementar** pagamento e WhatsApp Business API
reais sem credenciais, mas deixar a estrutura pronta:

- **WhatsApp Business API oficial**: `WHATSAPP_API_TOKEN` etc. já estão em
  `.env.example`; hoje `src/lib/whatsapp.ts` gera apenas o link `wa.me`
  (sem custo). Trocar por envio automático via API oficial não exige mudar
  o restante do fluxo de agendamento.
- **Pagamentos (Stripe / Mercado Pago)**: o modelo `Subscription` já tem
  `externalProvider`, `externalCustomerId`, `externalSubId` e os estados
  `trial/active/past_due/canceled/expired` prontos para receber webhooks
  reais assim que as chaves forem configuradas.
- **Google/Outlook Calendar**: a confirmação já gera um arquivo `.ics`
  padrão (`/api/public/agendamentos/[id]/ics`), compatível com qualquer
  calendário; a integração direta por API pode reaproveitar os mesmos dados.
- **E-mail transacional**: `src/lib/notifications.ts` já sabe registrar e
  enviar e-mails (com fallback seguro quando não configurado) — falta só
  chamar essa função nos pontos do fluxo em que se quiser notificar por
  e-mail além do WhatsApp.
- Demais itens do roadmap (cupons, avaliações, lembretes automáticos,
  recorrência, lista de espera, múltiplas unidades, PWA, IA/chatbot,
  Instagram, API pública) foram deixados fora do escopo desta entrega, mas o
  modelo multi-tenant e a separação em `lib/`/`server/actions/`/`server/queries/`
  foram pensados para comportar essas extensões sem reescrita.

## Cobrança (Stripe), recuperação de senha e upload de imagem

Além do escopo original, o projeto já inclui:

- **Cobrança recorrente via Stripe**: o produto/preço do plano "Profissional"
  já existem no Stripe (modo teste), o checkout (`/painel/assinatura`) e o
  webhook (`/api/webhooks/stripe`) estão implementados e atualizam
  `Subscription` automaticamente (`checkout.session.completed`,
  `customer.subscription.updated/deleted`). Só falta colar
  `STRIPE_SECRET_KEY` (Dashboard → Developers → API keys) nas variáveis de
  ambiente — sem ela, a página de assinatura mostra um aviso em vez de
  quebrar.
- **Recuperação de senha** (`/esqueci-senha`, `/redefinir-senha/[token]`):
  token de uso único com expiração de 60 minutos, hash `sha256` no banco,
  sem revelar se o e-mail existe (proteção contra enumeration). Precisa de
  `EMAIL_SERVER_*` configurado para o e-mail sair de verdade.
- **Upload de imagem** (logo, foto de profissional, imagem de serviço) via
  Vercel Blob, com fallback para colar uma URL quando `BLOB_READ_WRITE_TOKEN`
  não está configurado.
- **Rate limiting** persistente (tabela `RateLimitHit`) nas Server Actions
  públicas — sobrevive a múltiplas instâncias serverless, sem precisar de
  Redis.
- **Checklist de onboarding** no dashboard, apontando o que falta configurar
  (horários, serviço, profissional, dados da empresa) antes da página
  pública começar a receber agendamentos de verdade.

## Limitações conhecidas

Sendo direto sobre o que **não** está 100% pronto para produção real:

- **`next-auth` está em versão beta** (`5.0.0-beta.32`, a única com suporte
  completo ao App Router no momento). Isso também faz o `npm audit` reportar
  uma dependência transitiva de `nodemailer` antiga usada apenas pelo
  provedor de e-mail do Auth.js — **não utilizado por este projeto** (login
  é só por credenciais). O `nodemailer` usado por `src/lib/notifications.ts`
  foi fixado na versão mais recente e corrigida. Por causa do bundle do
  Credentials provider (bcrypt, Prisma), a config do Auth.js foi dividida em
  `src/auth.config.ts` (leve, usada pelo middleware no Edge Runtime) e
  `src/auth.ts` (completa, usada nas rotas Node.js) — sem essa separação o
  middleware ultrapassa o limite de tamanho de Edge Function da Vercel.
- **`STRIPE_PUBLISHABLE_KEY`** não é obtida via API pelo Stripe (por design,
  para segurança) — precisa ser colada manualmente do Dashboard. Hoje o
  código nem chega a usá-la (o Checkout é 100% server-side), mas ela fica
  reservada em `.env.example` caso o app passe a usar Stripe.js/Elements
  diretamente no futuro.
- Migração da convenção `middleware.ts` para a nova convenção `proxy.ts`
  do Next.js 16 (aviso de depreciação não bloqueante) ainda não foi feita.
- O `.npmrc` deste projeto fixa `legacy-peer-deps=true` — necessário porque
  `next-auth@5.0.0-beta.32` declara um peer opcional de `nodemailer` numa
  faixa antiga (`^7 || ^8`) incompatível com o `nodemailer@10` usado aqui por
  segurança. Sem essa flag, `npm install` falha com ERESOLVE (inclusive no
  build da Vercel — foi o que aconteceu no primeiro deploy deste projeto).
