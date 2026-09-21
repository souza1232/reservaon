/**
 * Testa o fluxo de confirmação de e-mail no cadastro público: signup deixa
 * a conta sem confirmar (emailVerified null) e manda o link; verifyEmailAction
 * confirma com token válido e recusa token usado/expirado/inválido;
 * resendVerificationEmailAction não vaza se a conta existe (mesmo raciocínio
 * de requestPasswordResetAction) e não reenvia pra quem já confirmou. Mesmo
 * gate de tests/integration/booking.test.ts — precisa de RUN_DB_TESTS=true.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const RUN = process.env.RUN_DB_TESTS === "true";

const mockSendEmail = vi.fn();

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    isEmailConfigured: () => true,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  };
});

describe.skipIf(!RUN)("Confirmação de e-mail no cadastro (integração com banco real)", () => {
  let planId: string;
  const createdCompanySlugs: string[] = [];
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const plan = await prisma.plan.create({
      data: { name: "Teste Verificação", slug: `teste-verificacao-${Date.now()}`, priceCents: 0, isActive: true, isDefault: false },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    for (const slug of createdCompanySlugs) {
      await prisma.company.deleteMany({ where: { slug } });
    }
    await prisma.plan.delete({ where: { id: planId } });
  });

  beforeEach(() => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ sent: true });
  });

  it("cadastro cria usuário não verificado e envia o link de confirmação", async () => {
    const { signupCompanyAction } = await import("@/server/actions/auth");

    const email = `signup-${Date.now()}@example.com`;
    createdEmails.push(email);
    const slug = `empresa-verificacao-${Date.now()}`;

    const result = await signupCompanyAction({
      companyName: "Empresa Verificação",
      ownerName: "Dona Teste",
      email,
      whatsapp: "11999998888",
      city: "São Paulo",
      state: "SP",
      password: "senhaForte123",
    });

    expect(result.success).toBe(true);
    createdCompanySlugs.push(result.data!.slug);
    expect(result.data!.verificationEmailSent).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBeNull();

    const token = await prisma.emailVerificationToken.findFirst({ where: { userId: user.id } });
    expect(token).not.toBeNull();
    expect(token?.usedAt).toBeNull();
  });

  it("verifyEmailAction confirma com token válido e recusa reuso", async () => {
    const { signupCompanyAction, verifyEmailAction } = await import("@/server/actions/auth");

    const email = `verify-${Date.now()}@example.com`;
    createdEmails.push(email);

    // Intercepta o token real capturando o link enviado no e-mail mockado.
    let capturedToken = "";
    mockSendEmail.mockImplementationOnce(async ({ html }: { html: string }) => {
      const match = html.match(/verificar-email\/([a-f0-9]+)/);
      capturedToken = match?.[1] ?? "";
      return { sent: true };
    });

    const signup = await signupCompanyAction({
      companyName: "Empresa Verify",
      ownerName: "Dono Teste",
      email,
      whatsapp: "11999997777",
      city: "São Paulo",
      state: "SP",
      password: "senhaForte123",
    });
    expect(signup.success).toBe(true);
    createdCompanySlugs.push(signup.data!.slug);
    expect(capturedToken).not.toBe("");

    const verifyResult = await verifyEmailAction(capturedToken);
    expect(verifyResult.success).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).not.toBeNull();

    // Reusar o mesmo token deve falhar (já foi marcado como usado).
    const reuseResult = await verifyEmailAction(capturedToken);
    expect(reuseResult.success).toBe(false);
  });

  it("verifyEmailAction recusa token inválido", async () => {
    const { verifyEmailAction } = await import("@/server/actions/auth");
    const result = await verifyEmailAction("token-que-nao-existe");
    expect(result.success).toBe(false);
  });

  it("resendVerificationEmailAction sempre retorna sucesso genérico, exista ou não a conta", async () => {
    const { resendVerificationEmailAction } = await import("@/server/actions/auth");

    const resultUnknown = await resendVerificationEmailAction({ email: "ninguem@example.com" });
    expect(resultUnknown.success).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("resendVerificationEmailAction não reenvia pra quem já confirmou", async () => {
    const { signupCompanyAction, verifyEmailAction, resendVerificationEmailAction } = await import(
      "@/server/actions/auth"
    );

    const email = `already-verified-${Date.now()}@example.com`;
    createdEmails.push(email);

    let capturedToken = "";
    mockSendEmail.mockImplementationOnce(async ({ html }: { html: string }) => {
      const match = html.match(/verificar-email\/([a-f0-9]+)/);
      capturedToken = match?.[1] ?? "";
      return { sent: true };
    });

    const signup = await signupCompanyAction({
      companyName: "Empresa Já Verificada",
      ownerName: "Dona Teste",
      email,
      whatsapp: "11999996666",
      city: "São Paulo",
      state: "SP",
      password: "senhaForte123",
    });
    createdCompanySlugs.push(signup.data!.slug);
    await verifyEmailAction(capturedToken);

    mockSendEmail.mockClear();
    await resendVerificationEmailAction({ email });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
