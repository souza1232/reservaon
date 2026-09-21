/**
 * Seed de DESENVOLVIMENTO apenas. Cria dados fictícios para permitir testar
 * o sistema localmente: planos, um Super Admin, e a empresa de demonstração
 * "Clínica Exemplo" com profissionais, serviços, clientes e agendamentos.
 *
 * Nunca rode este script contra um banco de produção.
 *
 * Uso: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Senha123!";

function at(daysFromNow: number, hour: number, minute = 0): Date {
  const base = addDays(new Date(), daysFromNow);
  return setMilliseconds(setSeconds(setMinutes(setHours(base, hour), minute), 0), 0);
}

async function main() {
  console.log("Seeding banco de dados (dados de DESENVOLVIMENTO)...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // --- Planos -------------------------------------------------------------
  const freePlan = await prisma.plan.upsert({
    where: { slug: "gratuito" },
    update: {},
    create: {
      name: "Gratuito",
      slug: "gratuito",
      priceCents: 0,
      maxProfessionals: 1,
      maxAppointmentsPerMonth: 30,
      features: ["Página pública de agendamento", "Agenda", "Cadastro de serviços"],
      isActive: true,
      isDefault: true,
    },
  });

  // IDs reais criados no Stripe (modo teste) para a conta conectada a este projeto.
  // Se você usar outra conta Stripe, gere seu próprio produto/preço e troque os IDs abaixo
  // (ou apague-os para o plano ficar "sem cobrança online" até você configurar o seu).
  const PROFISSIONAL_STRIPE_PRODUCT_ID = "prod_VGYQRQRDrGGrCG";
  const PROFISSIONAL_STRIPE_PRICE_ID = "price_1UG1JvD2gMqIX6N5tzLsw5s4";

  const proPlan = await prisma.plan.upsert({
    where: { slug: "profissional" },
    update: {
      stripeProductId: PROFISSIONAL_STRIPE_PRODUCT_ID,
      stripePriceId: PROFISSIONAL_STRIPE_PRICE_ID,
    },
    create: {
      name: "Profissional",
      slug: "profissional",
      priceCents: 4990,
      maxProfessionals: null,
      maxAppointmentsPerMonth: null,
      features: [
        "Profissionais ilimitados",
        "Agendamentos ilimitados",
        "Relatórios avançados",
        "Personalização da página pública",
      ],
      isActive: true,
      isDefault: false,
      stripeProductId: PROFISSIONAL_STRIPE_PRODUCT_ID,
      stripePriceId: PROFISSIONAL_STRIPE_PRICE_ID,
    },
  });

  // --- Super Admin ----------------------------------------------------------
  await prisma.user.upsert({
    where: { email: "admin@reservaon.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "admin@reservaon.com",
      passwordHash,
      role: "SUPER_ADMIN",
      emailVerified: new Date(),
    },
  });

  // --- Empresa de demonstração ---------------------------------------------
  const company = await prisma.company.upsert({
    where: { slug: "clinica-exemplo" },
    update: {},
    create: {
      name: "Clínica Exemplo",
      ownerName: "Ana Paula Souza",
      email: "contato@clinicaexemplo.com.br",
      phone: "1130001000",
      whatsapp: "11999990000",
      city: "São Paulo",
      state: "SP",
      address: "Rua das Flores, 123 - Jardim Paulista",
      description:
        "Clínica de estética e bem-estar. Empresa de DEMONSTRAÇÃO — dados fictícios para fins de desenvolvimento.",
      slug: "clinica-exemplo",
      instagram: "@clinicaexemplo",
      timezone: "America/Sao_Paulo",
      status: "ACTIVE",
      planId: proPlan.id,
      seoTitle: "Agende seu horário — Clínica Exemplo",
      seoDescription: "Agende online seu horário na Clínica Exemplo. Rápido, fácil e sem espera.",
    },
  });

  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      slotIntervalMinutes: 30,
      minAdvanceMinutes: 60,
      maxFutureDays: 60,
      bufferBetweenMinutes: 0,
    },
  });

  await prisma.subscription.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      planId: proPlan.id,
      status: "ACTIVE",
      startDate: addDays(new Date(), -30),
      renewalDate: addDays(new Date(), 30),
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@clinicaexemplo.com.br" },
    update: {},
    create: {
      name: "Ana Paula Souza",
      email: "admin@clinicaexemplo.com.br",
      passwordHash,
      role: "COMPANY_ADMIN",
      companyId: company.id,
      emailVerified: new Date(),
    },
  });

  // --- Horário de funcionamento da empresa ---------------------------------
  await prisma.workingHour.deleteMany({ where: { companyId: company.id, professionalId: null } });
  const companyHours: { dayOfWeek: number; startTime: string; endTime: string }[] = [
    { dayOfWeek: 1, startTime: "08:00", endTime: "18:00" },
    { dayOfWeek: 2, startTime: "08:00", endTime: "18:00" },
    { dayOfWeek: 3, startTime: "08:00", endTime: "18:00" },
    { dayOfWeek: 4, startTime: "08:00", endTime: "18:00" },
    { dayOfWeek: 5, startTime: "08:00", endTime: "18:00" },
    { dayOfWeek: 6, startTime: "08:00", endTime: "13:00" },
  ];
  await prisma.workingHour.createMany({
    data: companyHours.map((h) => ({ companyId: company.id, professionalId: null, ...h })),
  });

  // --- Profissionais --------------------------------------------------------
  const joaoUser = await prisma.user.upsert({
    where: { email: "joao@clinicaexemplo.com.br" },
    update: {},
    create: {
      name: "João Pereira",
      email: "joao@clinicaexemplo.com.br",
      passwordHash,
      role: "PROFESSIONAL",
      companyId: company.id,
      emailVerified: new Date(),
    },
  });

  const joao = await prisma.professional.upsert({
    where: { userId: joaoUser.id },
    update: {},
    create: {
      companyId: company.id,
      userId: joaoUser.id,
      name: "João Pereira",
      email: "joao@clinicaexemplo.com.br",
      phone: "11988880001",
      specialty: "Massoterapeuta",
      isActive: true,
      workingHours: {
        create: [
          { companyId: company.id, dayOfWeek: 1, startTime: "08:00", endTime: "18:00" },
          { companyId: company.id, dayOfWeek: 2, startTime: "08:00", endTime: "18:00" },
          { companyId: company.id, dayOfWeek: 3, startTime: "08:00", endTime: "18:00" },
          { companyId: company.id, dayOfWeek: 4, startTime: "08:00", endTime: "18:00" },
          { companyId: company.id, dayOfWeek: 5, startTime: "08:00", endTime: "18:00" },
        ],
      },
    },
  });

  const maria =
    (await prisma.professional.findFirst({ where: { companyId: company.id, name: "Maria Silva" } })) ??
    (await prisma.professional.create({
      data: {
        companyId: company.id,
        name: "Maria Silva",
        email: "maria@clinicaexemplo.com.br",
        phone: "11988880002",
        specialty: "Esteticista",
        isActive: true,
        workingHours: {
          create: [
            { companyId: company.id, dayOfWeek: 2, startTime: "09:00", endTime: "19:00" },
            { companyId: company.id, dayOfWeek: 3, startTime: "09:00", endTime: "19:00" },
            { companyId: company.id, dayOfWeek: 4, startTime: "09:00", endTime: "19:00" },
            { companyId: company.id, dayOfWeek: 5, startTime: "09:00", endTime: "19:00" },
            { companyId: company.id, dayOfWeek: 6, startTime: "09:00", endTime: "13:00" },
          ],
        },
      },
    }));

  // --- Serviços ---------------------------------------------------------------
  async function upsertService(
    name: string,
    priceCents: number,
    durationMinutes: number,
    description: string,
    professionalIds: string[],
  ) {
    const existing = await prisma.service.findFirst({ where: { companyId: company.id, name } });
    if (existing) return existing;
    return prisma.service.create({
      data: {
        companyId: company.id,
        name,
        description,
        priceCents,
        durationMinutes,
        isActive: true,
        professionals: { create: professionalIds.map((professionalId) => ({ professionalId })) },
      },
    });
  }

  const corte = await upsertService(
    "Corte de cabelo",
    5000,
    30,
    "Corte moderno com finalização.",
    [joao.id],
  );
  const consulta = await upsertService(
    "Consulta de avaliação",
    15000,
    60,
    "Avaliação completa com profissional especializado.",
    [joao.id, maria.id],
  );
  const limpezaPele = await upsertService(
    "Limpeza de pele",
    12000,
    60,
    "Limpeza de pele profunda com extração.",
    [maria.id],
  );
  await upsertService("Manicure", 4000, 45, "Manicure completa.", [maria.id]);
  await upsertService(
    "Massagem relaxante",
    13000,
    50,
    "Massagem relaxante corporal.",
    [joao.id],
  );

  // --- Clientes e agendamentos de exemplo -----------------------------------
  async function upsertCustomer(name: string, whatsapp: string, email?: string) {
    return prisma.customer.upsert({
      where: { companyId_whatsapp: { companyId: company.id, whatsapp } },
      update: {},
      create: { companyId: company.id, name, whatsapp, email },
    });
  }

  const cliente1 = await upsertCustomer("Carla Mendes", "11977770001", "carla@example.com");
  const cliente2 = await upsertCustomer("Bruno Alves", "11977770002");
  const cliente3 = await upsertCustomer("Fernanda Lima", "11977770003", "fernanda@example.com");

  async function upsertAppointment(
    customerId: string,
    serviceId: string,
    professionalId: string,
    startAt: Date,
    durationMinutes: number,
    priceCents: number,
    status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED",
  ) {
    const existing = await prisma.appointment.findFirst({
      where: { companyId: company.id, professionalId, startAt },
    });
    if (existing) return existing;
    return prisma.appointment.create({
      data: {
        companyId: company.id,
        customerId,
        serviceId,
        professionalId,
        startAt,
        endAt: new Date(startAt.getTime() + durationMinutes * 60_000),
        status,
        priceCents,
      },
    });
  }

  // Um atendimento concluído na semana passada
  await upsertAppointment(cliente1.id, corte.id, joao.id, at(-3, 10, 0), 30, corte.priceCents, "COMPLETED");
  // Um atendimento confirmado para amanhã
  await upsertAppointment(cliente2.id, consulta.id, joao.id, at(1, 14, 0), 60, consulta.priceCents, "CONFIRMED");
  // Um atendimento pendente para depois de amanhã
  await upsertAppointment(
    cliente3.id,
    limpezaPele.id,
    maria.id,
    at(2, 11, 0),
    60,
    limpezaPele.priceCents,
    "PENDING",
  );
  // Um atendimento cancelado (para exercitar a lógica de "horário liberado")
  await upsertAppointment(cliente1.id, consulta.id, maria.id, at(2, 15, 0), 60, consulta.priceCents, "CANCELED");
  // Um atendimento confirmado para hoje mais tarde
  await upsertAppointment(cliente2.id, corte.id, joao.id, at(0, 17, 0), 30, corte.priceCents, "CONFIRMED");

  // --- Feriado de exemplo -----------------------------------------------------
  const christmas = new Date(Date.UTC(new Date().getFullYear(), 11, 25));
  await prisma.holiday.upsert({
    where: { companyId_date: { companyId: company.id, date: christmas } },
    update: {},
    create: { companyId: company.id, date: christmas, description: "Natal — empresa fechada" },
  });

  // --- Bloqueio de horário de exemplo (reunião do João) ------------------------
  const meetingStart = at(4, 15, 0);
  const meetingEnd = at(4, 16, 0);
  const existingBlock = await prisma.blockedTime.findFirst({
    where: { professionalId: joao.id, startAt: meetingStart },
  });
  if (!existingBlock) {
    await prisma.blockedTime.create({
      data: {
        companyId: company.id,
        professionalId: joao.id,
        scope: "SPECIFIC_TIME",
        startAt: meetingStart,
        endAt: meetingEnd,
        reason: "Reunião interna",
      },
    });
  }

  console.log("\nSeed concluído! Contas de DEMONSTRAÇÃO (senha para todas: %s):", DEMO_PASSWORD);
  console.log("  Super Admin:        admin@reservaon.com");
  console.log("  Admin da empresa:   admin@clinicaexemplo.com.br");
  console.log("  Profissional:       joao@clinicaexemplo.com.br");
  console.log("  Página pública:     /empresa/clinica-exemplo");
  console.log("\nPlanos criados:", freePlan.name, "e", proPlan.name);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
