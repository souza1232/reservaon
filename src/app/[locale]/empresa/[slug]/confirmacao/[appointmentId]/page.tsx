import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, MapPin, CalendarPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCentsToBRL, formatDateLong, formatTime } from "@/lib/format";
import { buildAppointmentConfirmationWhatsappLink } from "@/lib/whatsapp";
import { signAppointmentId } from "@/lib/appointment-access-token";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FacebookPixel } from "@/components/facebook-pixel";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Confirmation");
  return { title: t("title") };
}

interface PageProps {
  params: Promise<{ slug: string; appointmentId: string; locale: string }>;
}

export default async function ConfirmationPage({ params }: PageProps) {
  const { slug, appointmentId } = await params;
  const t = await getTranslations("Confirmation");

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { company: true, service: true, professional: true, customer: true },
  });

  if (!appointment || appointment.company.slug !== slug) notFound();

  const { company, service, professional, customer } = appointment;

  const whatsappLink = buildAppointmentConfirmationWhatsappLink(company.whatsapp, {
    customerName: customer.name,
    companyName: company.name,
    serviceName: service.name,
    professionalName: professional.name,
    startAt: appointment.startAt,
    priceCents: appointment.priceCents,
    timezone: company.timezone,
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      {company.facebookPixelId && (
        <FacebookPixel pixelId={company.facebookPixelId} event="Schedule" />
      )}
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("statusLabel")} <strong>{APPOINTMENT_STATUS_LABELS[appointment.status]}</strong>
          </p>
        </div>

        <Card className="space-y-3 p-6 text-sm">
          <Row label={t("company")} value={company.name} />
          <Row label={t("service")} value={service.name} />
          <Row label={t("professional")} value={professional.name} />
          <Row label={t("date")} value={formatDateLong(appointment.startAt, company.timezone)} />
          <Row label={t("time")} value={formatTime(appointment.startAt, company.timezone)} />
          <Row
            label={t("price")}
            value={
              appointment.customerPackageId
                ? t("includedInPackage")
                : formatCentsToBRL(appointment.priceCents)
            }
            normalCase={Boolean(appointment.customerPackageId)}
          />
          {company.address && (
            <div className="flex items-start justify-between gap-4 border-t pt-3">
              <span className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {t("address")}
              </span>
              <span className="text-right font-medium">
                {company.address}, {company.city}/{company.state}
              </span>
            </div>
          )}
        </Card>

        <div className="space-y-2">
          <Button className="w-full" asChild>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
              {t("whatsappButton")}
            </a>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <a
              href={`/api/public/agendamentos/${appointment.id}/ics?token=${signAppointmentId(appointment.id)}`}
            >
              <CalendarPlus className="mr-2 h-4 w-4" /> {t("calendarButton")}
            </a>
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link href={`/empresa/${company.slug}`}>{t("newBooking")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  normalCase,
}: {
  label: string;
  value: string;
  normalCase?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${normalCase ? "" : "capitalize"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
