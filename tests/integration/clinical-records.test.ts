/**
 * Testes de integração do prontuário clínico. Mesmo gate de
 * tests/integration/packages.test.ts — precisa de RUN_DB_TESTS=true e um
 * Postgres real. `@/auth` é mockado. `@vercel/blob` também é mockado (não
 * sobe nada de verdade); BLOB_READ_WRITE_TOKEN é setado só pra
 * isUploadConfigured() passar.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createClinicalRecordAction,
  uploadClinicalPhotoAction,
} from "@/server/actions/clinical-records";
import { eraseCustomerDataAction } from "@/server/actions/customers";

const RUN = process.env.RUN_DB_TESTS === "true";

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "test-token";

interface MockSession {
  id: string;
  name: string;
  companyId: string;
  role: "COMPANY_ADMIN" | "PROFESSIONAL";
  professionalId: string | null;
}
let mockSession: MockSession | null = null;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const blobDel = vi.fn().mockResolvedValue(undefined);
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string) => ({ url: `https://blob.test/${path}` })),
  del: (...args: unknown[]) => blobDel(...args),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () =>
    mockSession
      ? {
          user: {
            id: mockSession.id,
            name: mockSession.name,
            email: `${mockSession.id}@example.com`,
            role: mockSession.role,
            companyId: mockSession.companyId,
            professionalId: mockSession.professionalId,
          },
        }
      : null,
  ),
}));

describe.skipIf(!RUN)("Prontuário clínico (integração com banco real)", () => {
  let freePlanId: string;
  let paidPlanId: string;
  let companyPaidId: string;
  let companyFreeId: string;
  let professionalTreatedId: string;
  let professionalOtherId: string;
  let customerId: string;

  beforeAll(async () => {
    const [freePlan, paidPlan] = await Promise.all([
      prisma.plan.create({
        data: { name: "Grátis Teste PC", slug: `gratis-pc-${Date.now()}`, priceCents: 0, isActive: true },
      }),
      prisma.plan.create({
        data: { name: "Pago Teste PC", slug: `pago-pc-${Date.now()}`, priceCents: 4990, isActive: true },
      }),
    ]);
    freePlanId = freePlan.id;
    paidPlanId = paidPlan.id;

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Prontuário",
        ownerName: "Admin",
        email: `empresa-prontuario-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-prontuario-${Date.now()}`,
        planId: paidPlanId,
      },
    });
    companyPaidId = company.id;

    const freeCompany = await prisma.company.create({
      data: {
        name: "Empresa Teste Prontuário Grátis",
        ownerName: "Admin",
        email: `empresa-prontuario-gratis-${Date.now()}@example.com`,
        whatsapp: "11988887777",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-prontuario-gratis-${Date.now()}`,
        planId: freePlanId,
      },
    });
    companyFreeId = freeCompany.id;

    const [profTreated, profOther] = await Promise.all([
      prisma.professional.create({ data: { companyId: companyPaidId, name: "Profissional Que Atendeu" } }),
      prisma.professional.create({ data: { companyId: companyPaidId, name: "Profissional Que Não Atendeu" } }),
    ]);
    professionalTreatedId = profTreated.id;
    professionalOtherId = profOther.id;

    const service = await prisma.service.create({
      data: { companyId: companyPaidId, name: "Sessão Teste", priceCents: 10000, durationMinutes: 30 },
    });

    const customer = await prisma.customer.create({
      data: { companyId: companyPaidId, name: "Cliente Prontuário", whatsapp: "5511955554444" },
    });
    customerId = customer.id;

    await prisma.appointment.create({
      data: {
        companyId: companyPaidId,
        customerId,
        serviceId: service.id,
        professionalId: professionalTreatedId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 60000),
        status: "COMPLETED",
        priceCents: 10000,
      },
    });
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyPaidId } });
    await prisma.company.delete({ where: { id: companyFreeId } });
    await prisma.plan.delete({ where: { id: freePlanId } });
    await prisma.plan.delete({ where: { id: paidPlanId } });
  });

  it("requirePaidPlanCompanySession bloqueia empresa no plano grátis e permite no plano pago", async () => {
    mockSession = {
      id: "admin-free",
      name: "Admin Grátis",
      companyId: companyFreeId,
      role: "COMPANY_ADMIN",
      professionalId: null,
    };
    await expect(createClinicalRecordAction(customerId, "nota bloqueada")).rejects.toThrow();

    mockSession = {
      id: "admin-1",
      name: "Admin",
      companyId: companyPaidId,
      role: "COMPANY_ADMIN",
      professionalId: null,
    };
    const created = await createClinicalRecordAction(customerId, "Anamnese inicial");
    expect(created.success).toBe(true);
  });

  it("profissional que atendeu o cliente cria registros; quem nunca atendeu é rejeitado", async () => {
    mockSession = {
      id: "prof-1",
      name: "Prof Que Atendeu",
      companyId: companyPaidId,
      role: "PROFESSIONAL",
      professionalId: professionalTreatedId,
    };
    const created = await createClinicalRecordAction(customerId, "Evolução da sessão 1");
    expect(created.success).toBe(true);

    mockSession = {
      id: "prof-2",
      name: "Prof Que Não Atendeu",
      companyId: companyPaidId,
      role: "PROFESSIONAL",
      professionalId: professionalOtherId,
    };
    const rejected = await createClinicalRecordAction(customerId, "Não deveria salvar");
    expect(rejected.success).toBe(false);
  });

  it("sobe foto sem expor a URL do blob, e a rota de leitura respeita o mesmo escopo", async () => {
    mockSession = {
      id: "admin-1",
      name: "Admin",
      companyId: companyPaidId,
      role: "COMPANY_ADMIN",
      professionalId: null,
    };
    const record = await createClinicalRecordAction(customerId, "Registro com foto");
    expect(record.success).toBe(true);
    const clinicalRecordId = record.data!.id;

    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" }),
    );
    formData.append("clinicalRecordId", clinicalRecordId);
    formData.append("label", "antes");

    const uploaded = await uploadClinicalPhotoAction(formData);
    expect(uploaded.success).toBe(true);
    expect(uploaded.data).toHaveProperty("photoId");
    // A URL do blob nunca deve aparecer no retorno pro cliente.
    expect(JSON.stringify(uploaded)).not.toContain("blob.test");

    const { GET } = await import("@/app/api/prontuario/foto/[photoId]/route");
    const photoId = uploaded.data!.photoId;

    mockSession = {
      id: "prof-2",
      name: "Prof Que Não Atendeu",
      companyId: companyPaidId,
      role: "PROFESSIONAL",
      professionalId: professionalOtherId,
    };
    const denied = await GET(new Request("https://example.com/x"), {
      params: Promise.resolve({ photoId }),
    });
    expect(denied.status).toBe(404);

    const originalFetch = global.fetch;
    global.fetch = vi.fn(
      async () => new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 }),
    ) as typeof fetch;
    try {
      mockSession = {
        id: "prof-1",
        name: "Prof Que Atendeu",
        companyId: companyPaidId,
        role: "PROFESSIONAL",
        professionalId: professionalTreatedId,
      };
      const allowed = await GET(new Request("https://example.com/x"), {
        params: Promise.resolve({ photoId }),
      });
      expect(allowed.status).toBe(200);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("eraseCustomerDataAction apaga registros clínicos, fotos e alergias", async () => {
    mockSession = {
      id: "admin-1",
      name: "Admin",
      companyId: companyPaidId,
      role: "COMPANY_ADMIN",
      professionalId: null,
    };
    const eraseCustomer = await prisma.customer.create({
      data: {
        companyId: companyPaidId,
        name: "Cliente Pra Apagar",
        whatsapp: "5511977776666",
        allergies: "látex",
      },
    });

    const rec = await createClinicalRecordAction(eraseCustomer.id, "Nota antes de apagar");
    expect(rec.success).toBe(true);

    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" }),
    );
    formData.append("clinicalRecordId", rec.data!.id);
    const uploaded = await uploadClinicalPhotoAction(formData);
    expect(uploaded.success).toBe(true);

    blobDel.mockClear();
    const result = await eraseCustomerDataAction(eraseCustomer.id);
    expect(result.success).toBe(true);
    expect(blobDel).toHaveBeenCalledTimes(1);

    const remainingRecords = await prisma.clinicalRecord.findMany({
      where: { customerId: eraseCustomer.id },
    });
    expect(remainingRecords).toHaveLength(0);

    const updated = await prisma.customer.findUniqueOrThrow({ where: { id: eraseCustomer.id } });
    expect(updated.allergies).toBeNull();
  });
});
