import { describe, it, expect } from "vitest";
import { assertSameCompany, AuthError } from "@/lib/tenant-guard";

describe("assertSameCompany (proteção multi-tenant)", () => {
  it("não lança erro quando o recurso pertence à empresa da sessão", () => {
    expect(() => assertSameCompany("empresa_001", "empresa_001")).not.toThrow();
  });

  it("lança AuthError 403 quando o recurso pertence a outra empresa", () => {
    expect(() => assertSameCompany("empresa_001", "empresa_002")).toThrow(AuthError);
    try {
      assertSameCompany("empresa_001", "empresa_002");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).status).toBe(403);
    }
  });
});
