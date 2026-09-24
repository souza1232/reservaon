import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isUploadConfigured } from "@/lib/upload";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";
import { CompanyProfileForm } from "./company-profile-form";
import type { CompanyProfileInput } from "@/lib/validations/company";

export const metadata: Metadata = { title: "Configurações" };

export default async function CompanySettingsPage() {
  const session = await auth();
  const companyId = session!.user.companyId!;

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  const defaultValues: CompanyProfileInput = {
    name: company.name,
    ownerName: company.ownerName,
    phone: company.phone ?? "",
    whatsapp: company.whatsapp,
    cnpj: company.cnpj ?? "",
    city: company.city,
    state: company.state as CompanyProfileInput["state"],
    address: company.address ?? "",
    description: company.description ?? "",
    instagram: company.instagram ?? "",
    logoUrl: company.logoUrl ?? "",
    seoTitle: company.seoTitle ?? "",
    seoDescription: company.seoDescription ?? "",
    facebookPixelId: company.facebookPixelId ?? "",
    googleReviewUrl: company.googleReviewUrl ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Página pública:{" "}
          <Link
            href={`/empresa/${company.slug}`}
            target="_blank"
            className="text-primary hover:underline"
          >
            /empresa/{company.slug}
          </Link>
        </p>
      </div>
      <SettingsTabs active="/painel/configuracoes" />
      <CompanyProfileForm defaultValues={defaultValues} uploadEnabled={isUploadConfigured()} />
    </div>
  );
}
