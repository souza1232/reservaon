#!/usr/bin/env node
/**
 * Roda a suíte de testes de integração numa branch efêmera do Neon, isolada
 * de produção — em vez de rodar direto contra o banco de produção (como a
 * suíte fazia até aqui, ver nota em HANDOFF.md). Cria a branch a partir da
 * `main` atual (copy-on-write, já vem com schema/migrações/dados de
 * produção), aplica qualquer migração pendente do schema.prisma local nela,
 * roda os testes, e sempre apaga a branch no final — mesmo se os testes
 * falharem. `--expires-at` é só uma rede de segurança pro caso deste script
 * ser interrompido antes do cleanup.
 *
 * Uso: node scripts/test-with-branch.mjs [args do vitest, ex: caminho de um arquivo]
 * Ou via npm: npm run test:db -- tests/integration/clinical-records.test.ts
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const { projectId } = JSON.parse(readFileSync(new URL("../.neon", import.meta.url), "utf8"));
const branchName = `test-${Date.now()}`;
const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

function neon(args) {
  return execFileSync("neon", args, { encoding: "utf8", shell: true });
}

console.log(`Criando branch de teste efêmera "${branchName}" a partir da main...`);
neon([
  "branches",
  "create",
  "--project-id",
  projectId,
  "--name",
  branchName,
  "--parent",
  "main",
  "--expires-at",
  expiresAt,
]);

let exitCode = 1;
try {
  const databaseUrl = neon([
    "connection-string",
    branchName,
    "--project-id",
    projectId,
    "--role-name",
    "neondb_owner",
    "--pooled",
    "--prisma",
  ]).trim();

  const testEnv = { ...process.env, DATABASE_URL: databaseUrl, RUN_DB_TESTS: "true" };

  // O compute de uma branch recém-criada pode estar frio, ou a máquina local
  // pode ter acabado de sair de um período parado (rede/DNS ainda
  // estabilizando) — em ambos os casos a primeira tentativa de conexão pode
  // falhar com P1001. Tenta algumas vezes antes de desistir.
  console.log("Aplicando migrações na branch de teste...");
  const MAX_ATTEMPTS = 5;
  let migrateOk = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      shell: true,
      env: testEnv,
    });
    if (migrate.status === 0) {
      migrateOk = true;
      break;
    }
    if (attempt < MAX_ATTEMPTS) {
      console.log(`Falhou (tentativa ${attempt}/${MAX_ATTEMPTS}), aguardando o banco acordar...`);
      await sleep(5000);
    }
  }
  if (!migrateOk) {
    throw new Error("Falha ao aplicar migrações na branch de teste após várias tentativas.");
  }

  console.log("Rodando testes de integração contra a branch isolada...");
  const args = process.argv.slice(2);
  // hookTimeout maior que o padrão (10s): o compute de uma branch recém-criada
  // pode estar frio, e os beforeAll/afterAll desses testes fazem várias
  // chamadas ao Prisma em sequência. --no-file-parallelism: os arquivos de
  // integração já têm flakiness conhecida (conflito de transação
  // Serializable) rodando em paralelo contra o MESMO banco — numa branch
  // recém-criada (compute mais "frio" que produção) isso piora; rodar em
  // série evita a disputa de vez.
  const result = spawnSync(
    "npx",
    ["vitest", "run", "--hookTimeout=30000", "--no-file-parallelism", ...args],
    { stdio: "inherit", shell: true, env: testEnv },
  );
  exitCode = result.status ?? 1;
} finally {
  console.log(`Apagando branch de teste "${branchName}"...`);
  try {
    neon(["branches", "delete", branchName, "--project-id", projectId]);
    console.log("Branch apagada.");
  } catch (error) {
    console.error(
      `Não foi possível apagar a branch "${branchName}" automaticamente — apague com ` +
        `"neon branches delete ${branchName} --project-id ${projectId}", ou espere expirar ` +
        `(${expiresAt}).`,
      error.message,
    );
  }
}

process.exit(exitCode);
