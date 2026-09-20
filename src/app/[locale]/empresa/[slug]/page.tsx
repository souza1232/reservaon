import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { FacebookPixel } from "@/components/facebook-pixel";
import { BookingWizard } from "./booking-wizard";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

async function getPublicCompany(slug: string) {
  const company = await prisma.company.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      logoUrl: true,
      address: true,
      city: true,
      state: true,
      whatsapp: true,
      instagram: true,
      timezone: true,
      status: true,
      seoTitle: true,
      seoDescription: true,
      facebookPixelId: true,
      settings: { select: { waitlistEnabled: true } },
      services: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          priceCents: true,
          durationMinutes: true,
          imageUrl: true,
          professionals: {
            where: { professional: { isActive: true } },
            select: {
              professional: {
                select: { id: true, name: true, photoUrl: true, specialty: true },
              },
            },
          },
        },
      },
    },
  });

  if (!company || company.status !== "ACTIVE") return null;

  return {
    ...company,
    waitlistEnabled: company.settings?.waitlistEnabled ?? false,
    services: company.services
      .map((s) => ({
        ...s,
        professionals: s.professionals.map((sp) => sp.professional),
      }))
      .filter((s) => s.professionals.length > 0),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [company, t] = await Promise.all([getPublicCompany(slug), getTranslations("CompanyPage")]);
  if (!company) return { title: t("notFound") };

  const title = company.seoTitle || t("titleFallback", { name: company.name });
  const description =
    company.seoDescription || company.description || t("descriptionFallback", { name: company.name });

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: company.logoUrl ? [company.logoUrl] : undefined,
    },
  };
}

export default async function PublicCompanyPage({ params }: PageProps) {
  const { slug } = await params;
  const company = await getPublicCompany(slug);
  if (!company) notFound();

  return (
    <>
      {company.facebookPixelId && <FacebookPixel pixelId={company.facebookPixelId} />}
      <BookingWizard company={company} />
    </>
  );
}
