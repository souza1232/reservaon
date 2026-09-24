/**
 * Testes de integração do papel RECEPTIONIST. Mesmo gate de
 * tests/integration/packages.test.ts — precisa de RUN_DB_TESTS=true e um
 * Postgres real (prefira `npm run test:db`, que roda numa branch efêmera do
 * Neon em vez do banco de produção). `@/auth` é mockado.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { createManualAppointmentAction } from "@/server/actions/appointments";
import { updateCustomerNotesAction } from "@/server/actions/customers";
import { sellPackageToCustomerAction, createPackageAction } from "@/server/actions/packages";
import { createReceptionistAction, deleteReceptionistAction } from "@/server/actions/receptionists";
import { createClinicalRecordAction, uploadClinicalPhotoAction } from "@/server/actions/clinical-records";
import { updateCompanyProfileAction } from "@/server/actions/settings";
import { createProfessionalAction } from "@/server/actions/professionals";

const RUN = process.env.RUN_DB_TESTS === "true";
const TIMEZONE = "America/Sao_Paulo";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (path: string) => ({ url: `https://blob.test/${path}` })),
  del: vi.fn().mockResolvedValue(undefined),
}));

interface MockSession {
  id: string;
  name: string;
  companyId: string;
  role: "COMPANY_ADMIN" | "PROFESSIONAL" | "RECEPTIONIST";
  professionalId: string | null;
}
let mockSession: MockSession | null = null;

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

describe.skipIf(!RUN)("Papel de recepcionista (integração com banco real)", () => {
  let paidPlanId: string;
  let companyId: string;
  let professionalAId: string;
  let professionalBId: string;
  let serviceId: string;
  let packageId: string;
  let customerId: string;

  beforeAll(async () => {
    const paidPlan = await prisma.plan.create({
      data: { name: "Pago Teste Recep", slug: `pago-recep-${Date.now()}`, priceCents: 4990, isActive: true },
    });
    paidPlanId = paidPlan.id;

    const company = await prisma.company.create({
      data: {
        name: "Empresa Teste Recepção",
        ownerName: "Admin",
        email: `empresa-recepcao-${Date.now()}@example.com`,
        whatsapp: "11999999999",
        city: "São Paulo",
        state: "SP",
        slug: `empresa-teste-recepcao-${Date.now()}`,
        planId: paidPlanId,
        settings: { create: {} },
        workingHours: {
          create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startTime: "00:00",
            endTime: "23:59",
          })),
        },
      },
    });
    companyId = company.id;

    const [profA, profB] = await Promise.all([
      prisma.professional.create({
        data: {
          companyId,
          name: "Profissional A",
          workingHours: {
            create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              companyId,
              dayOfWeek,
              startTime: "00:00",
              endTime: "23:59",
            })),
          },
        },
      }),
      prisma.professional.create({
        data: {
          companyId,
          name: "Profissional B",
          workingHours: {
            create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
              companyId,
              dayOfWeek,
              startTime: "00:00",
              endTime: "23:59",
            })),
          },
        },
      }),
    ]);
    professionalAId = profA.id;
    professionalBId = profB.id;

    const service = await prisma.service.create({
      data: {
        companyId,
        name: "Serviço Teste Recepção",
        priceCents: 8000,
        durationMinutes: 30,
        professionals: { create: [{ professionalId: professionalAId }, { professionalId: professionalBId }] },
      },
    });
    serviceId = service.id;

    const customer = await prisma.customer.create({
      data: { companyId, name: "Cliente Recepção", whatsapp: "5511966665555" },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.plan.delete({ where: { id: paidPlanId } });
  });

  it("recepcionista cria agendamento pra profissionais diferentes, sem escopo a um só", async () => {
    mockSession = {
      id: "recep-1",
      name: "Recepcionista",
      companyId,
      role: "RECEPTIONIST",
      professionalId: null,
    };

    const dateISOA = formatInTimeZone(addDays(new Date(), 5), TIMEZONE, "yyyy-MM-dd");
    const startA = new Date(`${dateISOA}T10:00:00.000-03:00`);
    const bookedA = await createManualAppointmentAction({
      customerId,
      serviceId,
      professionalId: professionalAId,
      startAtISO: startA.toISOString(),
      notes: "",
    });
    expect(bookedA.success).toBe(true);

    const dateISOB = formatInTimeZone(addDays(new Date(), 6), TIMEZONE, "yyyy-MM-dd");
    const startB = new Date(`${dateISOB}T10:00:00.000-03:00`);
    const bookedB = await createManualAppointmentAction({
      customerId,
      serviceId,
      professionalId: professionalBId,
      startAtISO: startB.toISOString(),
      notes: "",
    });
    expect(bookedB.success).toBe(true);
  });

  it("recepcionista edita observações do cliente e vende pacote, mas não mexe em catálogo de pacotes nem configurações", async () => {
    mockSession = {
      id: "admin-1",
      name: "Admin",
      companyId,
      role: "COMPANY_ADMIN",
      professionalId: null,
    };
    const pkg = await createPackageAction({
      name: "Pacote Teste Recepção",
      serviceId,
      sessionsCount: 5,
      price: 300,
      isActive: true,
    });
    expect(pkg.success).toBe(true);
    packageId = pkg.data!.id;

    mockSession = {
      id: "recep-1",
      name: "Recepcionista",
      companyId,
      role: "RECEPTIONIST",
      professionalId: null,
    };

    const notes = await updateCustomerNotesAction(customerId, "Prefere atendimento pela manhã.");
    expect(notes.success).toBe(true);

    const sold = await sellPackageToCustomerAction(customerId, packageId);
    expect(sold.success).toBe(true);

    // Catálogo de pacotes (preço/criação) continua exclusivo do admin.
    await expect(
      createPackageAction({ name: "Outro", serviceId, sessionsCount: 1, price: 10, isActive: true }),
    ).rejects.toThrow();

    // Configurações da empresa continuam exclusivas do admin.
    await expect(
      updateCompanyProfileAction({
        name: "Empresa Teste Recepção",
        ownerName: "Admin",
        phone: "",
        whatsapp: "11999999999",
        cnpj: "",
        city: "São Paulo",
        state: "SP",
        address: "",
        description: "",
        instagram: "",
        logoUrl: "",
        seoTitle: "",
        seoDescription: "",
        facebookPixelId: "",
        googleReviewUrl: "",
      }),
    ).rejects.toThrow();

    // Gestão de profissionais continua exclusiva do admin.
    await expect(
      createProfessionalAction({
        name: "Novo Profissional",
        isActive: true,
        serviceIds: [],
        workingHours: [],
        createLogin: false,
      }),
    ).rejects.toThrow();
  });

  it("recepcionista é negada no prontuário clínico mesmo pra cliente que ela gerencia", async () => {
    mockSession = {
      id: "recep-1",
      name: "Recepcionista",
      companyId,
      role: "RECEPTIONIST",
      professionalId: null,
    };

    const record = await createClinicalRecordAction(customerId, "Tentativa de registro clínico");
    expect(record.success).toBe(false);

    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" }));
    formData.append("clinicalRecordId", "algum-id-qualquer");
    const uploaded = await uploadClinicalPhotoAction(formData);
    expect(uploaded.success).toBe(false);
  });

  it("só admin cria/apaga login de recepcionista", async () => {
    mockSession = {
      id: "recep-1",
      name: "Recepcionista",
      companyId,
      role: "RECEPTIONIST",
      professionalId: null,
    };
    await expect(
      createReceptionistAction({
        name: "Outra Recepcionista",
        email: `outra-recep-${Date.now()}@example.com`,
        password: "senha123",
      }),
    ).rejects.toThrow();

    mockSession = {
      id: "admin-1",
      name: "Admin",
      companyId,
      role: "COMPANY_ADMIN",
      professionalId: null,
    };
    const created = await createReceptionistAction({
      name: "Recepcionista de Teste",
      email: `recep-teste-${Date.now()}@example.com`,
      password: "senha123",
    });
    expect(created.success).toBe(true);
    const receptionistUserId = created.data!.id;

    mockSession = {
      id: "recep-1",
      name: "Recepcionista",
      companyId,
      role: "RECEPTIONIST",
      professionalId: null,
    };
    await expect(deleteReceptionistAction(receptionistUserId)).rejects.toThrow();

    mockSession = {
      id: "admin-1",
      name: "Admin",
      companyId,
      role: "COMPANY_ADMIN",
      professionalId: null,
    };
    const deleted = await deleteReceptionistAction(receptionistUserId);
    expect(deleted.success).toBe(true);
  });
});
