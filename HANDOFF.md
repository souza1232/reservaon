# ReservaOn — Resumo pra continuar em outra conversa

**Pasta do projeto:** `c:\Users\Desktop\OneDrive\Desktop\reservaoline`
**No ar:** https://agendapro-mu-olive.vercel.app (URL técnica ainda diz "agendapro", a marca exibida é "ReservaOn")
**Deploy:** `vercel deploy --prod --yes` direto pela CLI — sem Git remoto conectado, sem histórico de commits ainda (repo local sem nenhum commit feito).

## Status geral
Tudo abaixo está **implementado, testado e publicado em produção**, exceto onde marcado "⏳ pendente". Cada funcionalidade grande foi feita com um plano técnico aprovado antes de codar — os planos ficam em `C:\Users\Desktop\.claude\plans\` (`jiggly-toasting-swing.md` = Pacote de sessões; `fancy-swimming-waffle.md` = Pedido de avaliação no Google + Sincronização com Google Agenda, nessa ordem — o mesmo arquivo foi reaproveitado pras duas por serem consecutivas na mesma sessão).

## O que já está pronto e no ar

### 1. WhatsApp Business API — mensagens automáticas
- Confirmação, cancelamento, remarcação e lembrete via WhatsApp, tudo funcionando com token real
- Token de acesso (60 dias) renovado **sozinho** por cron (`/api/cron/whatsapp-token-refresh`, diário) — nunca mais precisa gerar manualmente
- **WhatsApp bidirecional**: lembrete pode vir com botões "Confirmar presença"/"Cancelar" — cliente toca e o agendamento muda sozinho, sem abrir o site
- ⏳ **Pendente**: template `agendamento_lembrete_confirmacao` (o com botões) está **PENDING** de aprovação na Meta. Sem aprovar, o lembrete continua no formato simples de sempre (sem quebrar nada). Quando aprovar, falta só setar `WHATSAPP_TEMPLATE_REMINDER_INTERACTIVE` no `.env`/Vercel com o nome aprovado e reimplantar.

### 2. Segurança
Auditoria completa feita; os 3 pontos de risco "Alto" já corrigidos e no ar:
- Headers de segurança (HSTS, X-Frame-Options, etc)
- Rate limit no login (por IP e por e-mail)
- Link do `.ics` protegido por token assinado
- Bloqueio automático de empresa inadimplente (Stripe/Asaas cancelado ou atrasado → `Company.status = BLOCKED` sozinho via webhook, e a sessão já logada é derrubada na próxima requisição, não só no próximo login)
- ⏳ Pendente (risco médio/baixo, não urgente): CSP, exigir e-mail verificado, senha mínima maior que 6 caracteres, `next-auth` ainda em beta, restringir hosts de imagem.

### 3. Cobrança da assinatura da plataforma (empresa paga a gente)
- **Stripe**: código pronto, mas **as chaves nunca foram preenchidas** (`STRIPE_SECRET_KEY` etc vazias) — decisão consciente de deixar "pro final".
- **Asaas (PIX)**: **funcionando de verdade em produção**, com credenciais reais (não sandbox) — botão "Assinar com PIX" em `/painel/assinatura` gera QR Code na hora, webhook confirma pagamento e ativa a assinatura sozinho.
- Plano Gratuito: 10 agendamentos/mês (era 30, reduzido de propósito pra empurrar conversão pro pago). Plano Profissional: R$49,90/mês.

### 4. Lista de espera automática
- Cliente que não consegue um horário pode entrar na fila; quando alguém cancela aquele horário exato, o sistema avisa o primeiro da fila por WhatsApp (botões "Quero o horário!"/"Não, obrigado"), e avança pro próximo se recusar ou não responder a tempo (varredura diária, reaproveitando o cron do lembrete — não criou cron novo)
- Fica **desligada por padrão** por empresa — precisa ativar em Configurações → Agenda
- ⏳ **Pendente**: template `agendamento_vaga_disponivel` ainda **nem foi submetido** pra aprovação na Meta. Texto sugerido já está pronto (perguntar ao Claude se precisar, ou ver o plano antigo no histórico da conversa anterior).

### 5. Pacote de sessões (recurso do plano pago)
- Empresa cria um pacote (ex: "10 sessões de depilação por R$800") em `/painel/pacotes`, vende pro cliente na ficha dele, e cada agendamento do mesmo serviço desconta 1 sessão automaticamente (cancelar devolve o saldo; concluir/faltar consome de vez, porque o desconto acontece na hora de agendar, não de concluir)
- `requirePaidPlan()` novo em `src/lib/guards.ts` — primeira trava de "só plano pago" do sistema; empresa no plano grátis vê um card de upgrade em vez da lista de pacotes
- Funciona no agendamento público, no agendamento manual pelo painel e na confirmação de vaga vinda da lista de espera
- Não precisou de gateway de pagamento novo: o sistema não processa pagamento de cliente nenhum hoje (nem pra agendamento normal) — a empresa recebe por fora e só registra a venda; o app só controla o saldo

### 6. Pedido de avaliação no Google
- Agendamento cujo horário já passou vira **CONCLUÍDO sozinho** (via cron diário — antes só acontecia se alguém clicasse manualmente no painel, então na prática quase nunca disparava nada)
- Ao auto-concluir, dispara um pedido de avaliação por WhatsApp — só se a empresa tiver colado o próprio link de avaliação do Google em Configurações → Dados da empresa (`Company.googleReviewUrl`); sem link cadastrado, não manda nada
- ⏳ **Pendente**: template `WHATSAPP_TEMPLATE_REVIEW_REQUEST` ainda **nem foi submetido** pra aprovação na Meta. Texto sugerido está no `.env.example`.
- Trade-off aceito conscientemente: um no-show também vira CONCLUÍDO sozinho (a empresa pode corrigir pra "Não compareceu" manualmente depois; o pedido de avaliação já vai ter sido disparado)

### 7. Sincronização com Google Agenda
- Cada profissional conecta a **própria** conta do Google em `/profissional/configuracoes` (não uma conta única da empresa)
- **Dois sentidos**: agendamento do ReservaOn vira evento no Google Agenda do profissional (tempo real); e compromisso que o profissional criar direto no Google bloqueia aquele horário no ReservaOn (varredura 1x/dia, mesmo cron diário de sempre)
- ⏳ **Pendente**: precisa criar um projeto no Google Cloud Console, ativar a Google Calendar API, configurar a tela de consentimento OAuth, e preencher `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` na Vercel (passo a passo completo no `.env.example`). Sem isso, a tela de conexão mostra "ainda não configurado" e nada quebra.
- Limitação aceita: só profissional com login próprio (`Professional.userId` preenchido) consegue conectar — quem não tem conta de usuário fica de fora por enquanto.

## Fila de ideias discutidas (não começadas)
8. Stripe (preencher chaves reais) — deixado pro final de propósito. Único item que sobrou da lista original.

## Credenciais e acessos configurados nesta sessão
- **Meta/WhatsApp**: App "ReservaOn" (`1607109597782704`), WABA "Broken Ads" (`1446234654089281`), número +55 73 9903-8551. Token renovado automaticamente (ver acima).
- **Asaas produção**: conta real do usuário (CPF pessoa física, aprovada), chave Pix cadastrada, webhook registrado.
- **Neon (banco)**: reivindicado, permanente, sem risco de expirar.
- **Vercel**: projeto `agendapro`, time `jesus-projects-b43978a7`, deploy via CLI local já autenticada.

⚠️ Se abrir uma conversa nova, essas integrações (Vercel MCP em especial, que
caiu no meio desta sessão) podem não estar conectadas — a CLI da Vercel
local costuma continuar funcionando (`vercel env ls`, `vercel deploy`)
mesmo sem o MCP.

## Detalhes técnicos que valem lembrar
- Não existe commit Git nenhum neste repositório — todo o histórico de
  decisões está só nesta conversa (e agora, resumido aqui).
- `.npmrc` tem `legacy-peer-deps=true` (necessário, não mexer).
- `src/auth.config.ts` (leve, roda no Edge/middleware) vs `src/auth.ts`
  (completo, roda em Node) — separados por limite de tamanho do Edge Runtime.
- Padrão de webhook do projeto: Stripe usa assinatura HMAC do SDK; Meta
  (WhatsApp) usa `X-Hub-Signature-256` HMAC manual
  (`src/lib/whatsapp-webhook.ts`); Asaas usa token estático no header
  `asaas-access-token` (mais simples, sem HMAC).
- Testes: `npx vitest run` (unitários, rápido) e
  `RUN_DB_TESTS=true npx vitest run` (integração, banco real, ~40s) — sempre
  rodar os dois depois de mexer em algo. A suíte de integração roda contra o
  **mesmo Neon de produção** (não existe banco de teste separado) — os
  arquivos limpam o que criam no `afterAll`, mas a suíte completa em
  paralelo tem flakiness pré-existente (conflito de transação Serializable
  sob carga concorrente, blips transitórios de conexão) que não é bug —
  rodar o arquivo isolado sempre resolve.
- **Migração do Prisma**: `prisma migrate dev` trava neste ambiente (pede
  shadow database e dá erro de checksum mismatch, arriscando pedir reset —
  **nunca aceitar** um reset num banco com dado real). Fluxo seguro usado em
  todas as migrações desta sessão: gerar o SQL com
  `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`,
  colocar numa pasta nova em `prisma/migrations/<timestamp>_nome`, e aplicar
  com `prisma migrate deploy` (só aplica, nunca reseta).
- `googleapis` (SDK oficial do Google) virou dependência nesta sessão, pra
  sincronização com o Google Agenda.
