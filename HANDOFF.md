# ReservaOn — Resumo pra continuar em outra conversa

**Pasta do projeto:** `c:\Users\Desktop\OneDrive\Desktop\reservaoline`
**No ar:** https://agendapro-mu-olive.vercel.app (URL técnica ainda diz "agendapro", a marca exibida é "ReservaOn")
**Deploy:** `vercel deploy --prod --yes` direto pela CLI.
**Git:** repositório em https://github.com/souza1232/reservaon (branch `main`), commitado e sincronizado.

## Status geral
Tudo abaixo está **implementado, testado e publicado em produção**, exceto onde marcado "⏳ pendente". Cada funcionalidade grande foi feita com um plano técnico aprovado antes de codar — os planos ficam em `C:\Users\Desktop\.claude\plans\` (`jiggly-toasting-swing.md` = Pacote de sessões; `fancy-swimming-waffle.md` = Pedido de avaliação no Google + Sincronização com Google Agenda, nessa ordem — o mesmo arquivo foi reaproveitado pras duas por serem consecutivas na mesma sessão; `refactored-brewing-moonbeam.md` = Prontuário/histórico clínico e, depois, Papel de recepcionista — reaproveitado de novo por serem consecutivos na mesma sessão).

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
- ✅ Template `agendamento_vaga_disponivel` foi **APROVADO** pela Meta — `WHATSAPP_TEMPLATE_WAITLIST_OFFER` já setado no `.env`/Vercel e reimplantado. Ativo em produção.

### 5. Pacote de sessões (recurso do plano pago)
- Empresa cria um pacote (ex: "10 sessões de depilação por R$800") em `/painel/pacotes`, vende pro cliente na ficha dele, e cada agendamento do mesmo serviço desconta 1 sessão automaticamente (cancelar devolve o saldo; concluir/faltar consome de vez, porque o desconto acontece na hora de agendar, não de concluir)
- `requirePaidPlan()` novo em `src/lib/guards.ts` — primeira trava de "só plano pago" do sistema; empresa no plano grátis vê um card de upgrade em vez da lista de pacotes
- Funciona no agendamento público, no agendamento manual pelo painel e na confirmação de vaga vinda da lista de espera
- Não precisou de gateway de pagamento novo: o sistema não processa pagamento de cliente nenhum hoje (nem pra agendamento normal) — a empresa recebe por fora e só registra a venda; o app só controla o saldo

### 6. Pedido de avaliação no Google
- Agendamento cujo horário já passou vira **CONCLUÍDO sozinho** (via cron diário — antes só acontecia se alguém clicasse manualmente no painel, então na prática quase nunca disparava nada)
- Ao auto-concluir, dispara um pedido de avaliação por WhatsApp — só se a empresa tiver colado o próprio link de avaliação do Google em Configurações → Dados da empresa (`Company.googleReviewUrl`); sem link cadastrado, não manda nada
- ✅ Template `agendamento_pedido_avaliacao` foi **APROVADO** pela Meta — `WHATSAPP_TEMPLATE_REVIEW_REQUEST` já setado no `.env`/Vercel e reimplantado. Ativo em produção. ⚠️ Ficou categorizado como **MARKETING** (não UTILITY, que foi o que submetemos) — custa mais por mensagem e exige opt-in de marketing do cliente. Vale reconsiderar o texto no futuro pra tentar reclassificar como UTILITY, se o custo incomodar — decisão de negócio, não urgente.
- Trade-off aceito conscientemente: um no-show também vira CONCLUÍDO sozinho (a empresa pode corrigir pra "Não compareceu" manualmente depois; o pedido de avaliação já vai ter sido disparado)

### 7. Sincronização com Google Agenda
- Cada profissional conecta a **própria** conta do Google em `/profissional/configuracoes` (não uma conta única da empresa)
- **Dois sentidos**: agendamento do ReservaOn vira evento no Google Agenda do profissional (tempo real); e compromisso que o profissional criar direto no Google bloqueia aquele horário no ReservaOn (varredura 1x/dia, mesmo cron diário de sempre)
- ⏳ **Pendente**: precisa criar um projeto no Google Cloud Console, ativar a Google Calendar API, configurar a tela de consentimento OAuth, e preencher `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` na Vercel (passo a passo completo no `.env.example`). Sem isso, a tela de conexão mostra "ainda não configurado" e nada quebra.
- Limitação aceita: só profissional com login próprio (`Professional.userId` preenchido) consegue conectar — quem não tem conta de usuário fica de fora por enquanto.

### 8. Página institucional e credibilidade
- `/sobre` — missão, visão, valores e política de atendimento do ReservaOn (a plataforma, não uma empresa cliente)
- Rodapé e `/sobre` mostram um canal de suporte real por WhatsApp (`(73) 99903-2652`) e o CNPJ (`66.173.608/0001-26`) — sinais de confiança pra quem avalia assinar
- Linkado no rodapé em pt/en/es

### 9. Relatórios (`/painel/relatorios`)
- Página nova, separada do Dashboard (que continua igual, pra visão rápida do dia) — filtro de período (este mês, mês passado, últimos 30/90 dias, personalizado) via `PeriodSelector`, tudo por link/form GET, sem client JS
- Faturamento (soma agendamento **+** pacote vendido no período — sem isso, empresa que vende pacote apareceria com faturamento artificialmente baixo, já que a sessão individual do pacote sai com `priceCents: 0`), quantidade de agendamentos e taxa de comparecimento — todos comparados com o período anterior de mesma duração
- Ranking dos 5 serviços e 5 profissionais mais rentáveis no período
- Clientes novos x recorrentes no período
- `src/server/queries/reports.ts` — toda a lógica de cálculo, testada em `tests/integration/reports.test.ts`

### 10. Prontuário / Histórico clínico
- Motivação: ao avaliar criticamente o que falta pro ReservaOn convencer uma clínica renomada, o maior furo era não ter onde registrar histórico clínico do cliente (anamnese, evolução, alergias, fotos antes/depois) — só existia um campo único de "Observações" livre.
- Empresa em **plano pago** ganha, na ficha do cliente (`/painel/clientes/[id]` e novo `/profissional/clientes/[id]`), um card de Prontuário: campo fixo de alergias/contraindicações + linha do tempo de registros (texto + fotos), com autoria e data.
- **Quem escreve**: admin da empresa ou o profissional que já atendeu aquele cliente especificamente (reaproveita o mesmo filtro de `appointments: { some: { professionalId } }` já usado na lista de clientes do profissional) — por isso foi criado um novo guard `requirePaidPlanCompanySession` em `src/lib/guards.ts` (igual a `requirePaidPlan`, mas também permite `PROFESSIONAL`, não só admin).
- **Fotos nunca ficam com link público exposto**: sobem pro Vercel Blob (mesma infra já usada pra logo), mas a URL fica só no banco — o cliente só recebe o id da foto e ela é servida por uma rota autenticada (`/api/prontuario/foto/[photoId]`) que confere sessão/escopo antes de fazer streaming dos bytes. Decisão tomada porque foto de paciente é dado sensível (LGPD art. 5º, II), diferente de logo.
- **Exclusão LGPD** (`eraseCustomerDataAction`) agora também apaga de vez (não só anonimiza) todos os registros de prontuário e as fotos no Blob do cliente — diferente do histórico de agendamento, que continua só anonimizado (motivo contábil não se aplica a dado clínico).
- Fora do escopo desta rodada, de propósito: termo de consentimento assinado digitalmente, prontuário eletrônico nível CFM, integração com convênio, multi-unidade.
- Testado em `tests/integration/clinical-records.test.ts` (criação por admin/profissional, bloqueio de profissional que nunca atendeu o cliente, upload/leitura de foto sem vazar URL, e exclusão LGPD apagando tudo) e revisado manualmente no navegador antes de subir.
- **Achado nessa sessão**: o Vercel Blob nunca tinha sido conectado ao projeto em produção (`BLOB_READ_WRITE_TOKEN` não existia nas env vars da Vercel) — upload de imagem (logo, foto de profissional/serviço, e agora prontuário) sempre dependeu só de colar URL manualmente, sem ninguém notar porque nada exigia upload de verdade até agora. Criado e conectado o Blob Store `reservaon-blob` via `vercel blob create-store` (ver seção de credenciais abaixo) — upload de imagem funciona de verdade em produção a partir de agora, inclusive pros campos antigos de logo/foto.

### 11. Papel de recepcionista
- Motivação: discutindo como vender pra clínica que já tem recepcionista, ficou claro que não tinha login pra ela — só dono (vê tudo, inclusive faturamento) ou profissional (só a própria agenda). Sem isso, o discurso "o sistema trabalha com sua recepcionista" não se sustentava na implantação real.
- Novo papel `RECEPTIONIST`: vê e gerencia agenda e clientes da **empresa inteira** (todos os profissionais), mas não vê faturamento, assinatura, configurações, nem prontuário clínico.
- **Área própria `/recepcao`**, espelhando `/profissional` — não reaproveita `/painel` de propósito: hoje toda página sob `/painel` confia cegamente no guard do layout (nenhuma tem guard próprio), então admitir recepcionista ali exigiria re-travar cada página financeira/admin uma por uma manualmente, um esquecimento vira vazamento. Com área separada, ela nunca alcança `/painel/relatorios` etc. nem digitando a URL.
- Admin cria/remove login em **Painel → Recepcionistas** (`/painel/recepcionistas`).
- **Correção crítica de segurança feita junto**: o guard do prontuário (`assertCustomerAccess` em `clinical-records.ts`, e a rota de foto) tinha um fallthrough implícito pra acesso total que, até então, só admin alcançava. Sem essa correção, admitir recepcionista no guard geral (`requireCompanySession`) teria liberado prontuário/foto de paciente pra ela sem nenhuma decisão de produto por trás — corrigido pra negar explicitamente.
- Ajustes menores de guard pra recepcionista conseguir trabalhar de verdade: `updateCustomerNotesAction` (observação do cliente) e `sellPackageToCustomerAction` (vender pacote já cadastrado) passaram de admin-only pra admin+recepcionista — criar/editar/apagar pacote (preço/catálogo) continua admin-only.
- Testado em `tests/integration/receptionist.test.ts` (agendamento cross-profissional, observação/venda de pacote funcionando, bloqueio de prontuário/faturamento/configurações/gestão de profissionais, e que só admin cria/apaga recepcionista).

## Fila de ideias discutidas (não começadas)
9. Stripe (preencher chaves reais) — deixado pro final de propósito. Único item técnico que sobrou da lista original.
10. Prova social (depoimento de cliente real ou "X empresas usam") — combinado deixar pra quando tiver 1-2 clientes dispostos a dar depoimento; não inventar isso.
11. **Cliente pagar sinal/valor na hora de agendar** (discutido em detalhe, não implementado) — hoje o sistema não cobra nada do cliente final, só do dono da empresa (assinatura). Decisão que ficou em aberto após discussão: a empresa **já tem meio de pagamento próprio** (PIX/maquininha) e não vai querer abrir conta em gateway novo (Asaas/Stripe) só pra isso — então a versão vencedora é PIX **estático**, usando a própria chave PIX que a empresa já usa no dia a dia (ela só cola a chave em Configurações, sem criar conta em lugar nenhum). Trade-off aceito: **sem confirmação automática** — a empresa (ou o cliente, mandando comprovante) confirma manualmente que caiu, o sistema não sabe sozinho. Se o usuário topar essa limitação, é a próxima a implementar; a alternativa com confirmação automática (cada empresa conectando a própria conta Asaas) foi descartada por exigir cadastro extra que a empresa provavelmente não vai querer fazer.

## Credenciais e acessos configurados nesta sessão
- **Meta/WhatsApp**: App "ReservaOn" (`1607109597782704`), WABA "Broken Ads" (`1446234654089281`), número +55 73 9903-8551. Token renovado automaticamente (ver acima).
- **Asaas produção**: conta real do usuário (CPF pessoa física, aprovada), chave Pix cadastrada, webhook registrado.
- **Neon (banco)**: reivindicado, permanente, sem risco de expirar.
- **Vercel**: projeto `agendapro`, time `jesus-projects-b43978a7`, deploy via CLI local já autenticada.
- **Vercel Blob**: store `reservaon-blob` (`store_MMQKp59wnRrYYwn7`, região `iad1`, acesso público), conectado ao projeto em produção/preview/development — `BLOB_READ_WRITE_TOKEN` já injetado pela própria Vercel nas env vars. Local, o token vem por `.env.local` (`vercel env pull`, arquivo no `.gitignore`, nunca commitar).

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
- Testes: `npx vitest run` (unitários, rápido) e **`npm run test:db`**
  (integração, banco real) — sempre rodar os dois depois de mexer em algo.
  ⚠️ **Não usar mais `RUN_DB_TESTS=true npx vitest run` direto** — isso roda
  contra o Neon de **produção** de verdade, e foi exatamente isso que causou
  um incidente real (planos de teste vazando na página pública `/planos`
  depois de uma suíte travar antes do `afterAll` limpar — resolvido numa
  sessão, mas não deveria poder acontecer de novo).
  `npm run test:db` (`scripts/test-with-branch.mjs`) resolve isso: cria uma
  **branch efêmera do Neon** (`neon branches create --parent main`, cópia
  copy-on-write instantânea, já vem com schema/migrações/dados de produção),
  aplica migrações pendentes nela, roda os testes, e **sempre apaga a branch
  no final** — inclusive se os testes falharem ou o processo for morto no
  meio (testado nos dois cenários). Aceita os mesmos argumentos do vitest:
  `npm run test:db -- tests/integration/clinical-records.test.ts` pra rodar
  só um arquivo. Requer a CLI `neon` instalada e autenticada (já está neste
  ambiente) e o arquivo `.neon` na raiz (projectId).
  - **Limitação conhecida**: rodando a suíte completa de uma vez (não um
    arquivo isolado), 2 testes (`booking.test.ts` e `packages.test.ts`)
    falham de forma intermitente numa branch recém-criada — mesma
    flakiness pré-existente de sempre (conflito de transação Serializable /
    timing), só que a branch nova, mais "fria" que o banco de produção
    (que nunca desliga), parece deixar isso mais provável. Investigado
    parcialmente (não é sobre paralelismo — falha até rodando em série com
    `--no-file-parallelism`, já incluído no script); não aprofundado além
    disso por ora. **Rodar o arquivo isolado continua 100% confiável** (é o
    caminho recomendado quando só se mexeu numa área específica).
- **Migração do Prisma**: `prisma migrate dev` trava neste ambiente (pede
  shadow database e dá erro de checksum mismatch, arriscando pedir reset —
  **nunca aceitar** um reset num banco com dado real). Fluxo seguro usado em
  todas as migrações desta sessão: gerar o SQL com
  `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`,
  colocar numa pasta nova em `prisma/migrations/<timestamp>_nome`, e aplicar
  com `prisma migrate deploy` (só aplica, nunca reseta).
- `googleapis` (SDK oficial do Google) virou dependência nesta sessão, pra
  sincronização com o Google Agenda.
