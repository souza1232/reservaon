import { defineConfig } from "vitest/config";
import path from "node:path";

const dirname = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      "server-only": path.resolve(dirname, "./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Testes de integração fazem várias chamadas sequenciais a um Postgres
    // remoto (Neon); o timeout padrão de 5s é curto demais para isso.
    testTimeout: 30000,
  },
});
