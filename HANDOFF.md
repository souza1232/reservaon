# ReservaOn — Resumo pra continuar em outra conversa

**Pasta do projeto:** `c:\Users\Desktop\OneDrive\Desktop\reservaoline`
**No ar:** https://agendapro-mu-olive.vercel.app (URL técnica ainda diz "agendapro", a marca exibida é "ReservaOn")
**Deploy:** `vercel deploy --prod --yes` direto pela CLI.
**Git:** repositório em https://github.com/souza1232/reservaon (branch `main`), commitado e sincronizado.

## Status geral
Tudo abaixo está **implementado, testado e publicado em produção**, exceto onde marcado "⏳ pendente". Cada funcionalidade grande foi feita com um plano técnico aprovado antes de codar — os planos ficam em `C:\Users\Desktop\.claude\plans\` (`jiggly-toasting-swing.md` = Pacote de sessões; `fancy-swimming-waffle.md` = Pedido de avaliação no Google + Sincronização com Google Agenda, nessa ordem — o mesmo arquivo foi reaproveitado pras duas por serem consecutivas na mesma sessão).

## O que já está pronto e no ar

### 1. WhatsApp Business API — mensagens automáticas
- Confirmação, cancelamento, remarcação e lembrete via WhatsApp, tudo funcionando com token real
- Token de acesso (60 dias) renovado **sozinho** por cron (`/api/cron/whatsapp-token-refresh`, diário) — nunca mais precisa gerar manualmente
- **WhatsApp bidirecional**: lembrete pode vir com botões "Confirmar presença"/"Cancelar" — cliente toca e o agendamento muda sozinho, sem abrir o site
- ✅ Template `agendamento_lembrete_confirmacao` (o com botões) foi **APROVADO** pela Meta — `WHATSAPP_TEMPLATE_REMINDER_INTERACTIVE` já setado no `.env`/Vercel e reimplantado. Lembrete com botões está ativo em produção.

### 2. Segurança
Auditoria completa feita; os 3 pontos de risco "Alto" e os 5 itens de risco médio/baixo que restavam já foram tratados:
- Headers de segurança (HSTS, X-Frame-Options, etc)
- Rate limit no login (por IP e por e-mail)
- Link do `.ics` protegido por token assinado
- Bloqueio automático de empresa inadimplente (Stripe/Asaas cancelado ou atrasado → `Company.status = BLOCKED` sozinho via webhook, e a sessão já logada é derrubada na próxima requisição, não só no próximo login)
- **E-mail verificado obrigatório pra cadastros novos**: quem se auto-cadastra em `/cadastro` recebe um link de confirmação (`/verificar-email/[token]`, válido 24h) e não consegue entrar até confirmar. Contas já existentes foram "avozinhadas" como verificadas na migração (ninguém foi trancado pra fora); contas criadas por um admin (profissionais) ou pelo seed também já nascem verificadas. Se `EMAIL_SERVER_*` não estiver configurado, a exigência é ignorada (senão todo cadastro novo ficaria trancado pra sempre sem poder confirmar).
- **Senha mínima 8 caracteres** em cadastro e redefinição (login continua aceitando 6+, pra não bloquear quem já tem conta com senha mais curta).
- **CSP em modo Report-Only**: `Content-Security-Policy-Report-Only` já no ar (`next.config.ts`), violações caem em `/api/csp-report` (log do servidor, visível na Vercel). Nada é bloqueado ainda de propósito — depois de um tempo sem achar nada inesperado nos logs, trocar pra `Content-Security-Policy` de verdade (só isso, a política já foi calculada considerando tudo que a aplicação carrega hoje: Facebook Pixel é o único script externo real).
- `next-auth`: **não tinha o que fazer** — `5.0.0-beta.32` (a versão já instalada) é a versão mais recente publicada; a lib ainda não tem release estável. Reavaliar quando sair uma versão `5.x` não-beta.
- Hosts de imagem: **mantido como está** de propósito — restringir a uma lista fixa quebraria empresas colando o link do próprio logo de qualquer lugar (não há vulnerabilidade real aqui, o Next.js já faz proxy seguro de qualquer imagem https).

### 3. Cobrança da assinatura da plataforma (empresa paga a gente)
- **Stripe**: código pronto, mas **as chaves nunca foram preenchidas** (`STRIPE_SECRET_KEY` etc vazias) — decisão consciente de deixar "pro final".
- **Asaas (PIX)**: **funcionando de verdade em produção**, com credenciais reais (não sandbox) — botão "Assinar com PIX" em `/painel/assinatura` gera QR Code na hora, webhook confirma pagamento e ativa a assinatura sozinho.
- Plano Gratuito: 10 agendamentos/mês (era 30, reduzido de propósito pra empurrar conversão pro pago). Plano Profissional: R$49,90/mês.

### 4. Lista de espera automática
- Cliente que não consegue um horário pode entrar na fila; quando alguém cancela aquele horário exato, o sistema avisa o primeiro da fila por WhatsApp (botões "Quero o horário!"/"Não, obrigado"), e avança pro próximo se recusar ou não responder a tempo (varredura diária, reaproveitando o cron do lembrete — não criou cron novo)
- Fica **desligada por padrão** por empresa — precisa ativar em Configurações → Agenda
- ⏳ **Pendente**: template `agendamento_vaga_disponivel` **já submetido** pra revisão da Meta (status **PENDING**, id `1428640439193200`). Quando aprovar, falta só setar `WHATSAPP_TEMPLATE_WAITLIST_OFFER=agendamento_vaga_disponivel` no `.env`/Vercel e reimplantar.

### 5. Pacote de sessões (recurso do plano pago)
- Empresa cria um pacote (ex: "10 sessões de depilação por R$800") em `/painel/pacotes`, vende pro cliente na ficha dele, e cada agendamento do mesmo serviço desconta 1 sessão automaticamente (cancelar devolve o saldo; concluir/faltar consome de vez, porque o desconto acontece na hora de agendar, não de concluir)
- `requirePaidPlan()` novo em `src/lib/guards.ts` — primeira trava de "só plano pago" do sistema; empresa no plano grátis vê um card de upgrade em vez da lista de pacotes
- Funciona no agendamento público, no agendamento manual pelo painel e na confirmação de vaga vinda da lista de espera
- Não precisou de gateway de pagamento novo: o sistema não processa pagamento de cliente nenhum hoje (nem pra agendamento normal) — a empresa recebe por fora e só registra a venda; o app só controla o saldo

### 6. Pedido de avaliação no Google
- Agendamento cujo horário já passou vira **CONCLUÍDO sozinho** (via cron diário — antes só acontecia se alguém clicasse manualmente no painel, então na prática quase nunca disparava nada)
- Ao auto-concluir, dispara um pedido de avaliação por WhatsApp — só se a empresa tiver colado o próprio link de avaliação do Google em Configurações → Dados da empresa (`Company.googleReviewUrl`); sem link cadastrado, não manda nada
- ⏳ **Pendente**: template `agendamento_pedido_avaliacao` **já submetido** pra revisão da Meta (status **PENDING**, id `1095092156231367`). Quando aprovar, falta só setar `WHATSAPP_TEMPLATE_REVIEW_REQUEST=agendamento_pedido_avaliacao` no `.env`/Vercel e reimplantar. ⚠️ A Meta **recategorizou de UTILITY pra MARKETING** durante a revisão (categoria original submetida foi UTILITY) — templates MARKETING custam mais por mensagem e exigem opt-in de marketing do cliente (diferente de UTILITY, que é tratado como transacional). Vale reconsiderar o texto pra tentar reclassificar como UTILITY, ou aceitar o custo maior — decisão de negócio, não técnica.
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
- Repositório Git em https://github.com/souza1232/reservaon (branch `main`) —
  commitar e dar push quando pedido explicitamente (não é automático).
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
