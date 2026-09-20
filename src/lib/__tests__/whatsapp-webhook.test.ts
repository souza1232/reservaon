import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "crypto";
import { verifyMetaWebhookSignature } from "@/lib/whatsapp-webhook";

const TEST_SECRET = "test-app-secret";
let originalSecret: string | undefined;

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyMetaWebhookSignature", () => {
  beforeAll(() => {
    originalSecret = process.env.FACEBOOK_APP_SECRET;
    process.env.FACEBOOK_APP_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.FACEBOOK_APP_SECRET = originalSecret;
  });

  it("aceita uma assinatura válida", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = sign(body, TEST_SECRET);
    expect(verifyMetaWebhookSignature(body, signature)).toBe(true);
  });

  it("rejeita corpo adulterado depois de assinado", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = sign(body, TEST_SECRET);
    const tamperedBody = JSON.stringify({ hello: "adulterado" });
    expect(verifyMetaWebhookSignature(tamperedBody, signature)).toBe(false);
  });

  it("rejeita assinatura gerada com segredo errado", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = sign(body, "segredo-errado");
    expect(verifyMetaWebhookSignature(body, signature)).toBe(false);
  });

  it("rejeita quando não há header de assinatura", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyMetaWebhookSignature(body, null)).toBe(false);
  });

  it("rejeita quando FACEBOOK_APP_SECRET não está configurado", () => {
    process.env.FACEBOOK_APP_SECRET = "";
    const body = JSON.stringify({ hello: "world" });
    const signature = sign(body, TEST_SECRET);
    expect(verifyMetaWebhookSignature(body, signature)).toBe(false);
    process.env.FACEBOOK_APP_SECRET = TEST_SECRET;
  });
});
