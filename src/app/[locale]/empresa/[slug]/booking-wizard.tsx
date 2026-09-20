"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MapPin, MessageCircle, AtSign, ChevronLeft, Clock, CheckCircle2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCentsToBRL, formatDuration, formatDateLong } from "@/lib/format";
import {
  getPublicAvailableSlotsAction,
  createPublicAppointmentAction,
  joinWaitlistAction,
} from "@/server/actions/public-booking";

interface Professional {
  id: string;
  name: string;
  photoUrl: string | null;
  specialty: string | null;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  durationMinutes: number;
  imageUrl: string | null;
  professionals: Professional[];
}

interface Company {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  address: string | null;
  city: string;
  state: string;
  whatsapp: string;
  instagram: string | null;
  timezone: string;
  waitlistEnabled: boolean;
  services: Service[];
}

function toDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function BookingWizard({ company }: { company: Company }) {
  const t = useTranslations("Booking");
  const STEP_LABELS = [
    t("steps.service"),
    t("steps.professional"),
    t("steps.date"),
    t("steps.time"),
    t("steps.yourData"),
    t("steps.confirmation"),
  ];
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<{ startAtISO: string; label: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ startAtISO: string; label: string } | null>(
    null,
  );

  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [slotTaken, setSlotTaken] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  const selectedService = useMemo(
    () => company.services.find((s) => s.id === serviceId) ?? null,
    [company.services, serviceId],
  );
  const selectedProfessional = useMemo(
    () => selectedService?.professionals.find((p) => p.id === professionalId) ?? null,
    [selectedService, professionalId],
  );

  function goToDateStep(profId: string) {
    setProfessionalId(profId);
    setStep(3);
  }

  function handleSelectDate(d: Date | undefined) {
    setDate(d);
    setSelectedSlot(null);
    if (!d || !serviceId || !professionalId) return;
    setLoadingSlots(true);
    startTransition(async () => {
      const result = await getPublicAvailableSlotsAction({
        slug: company.slug,
        serviceId,
        professionalId,
        dateISO: toDateISO(d),
      });
      setLoadingSlots(false);
      if (result.success && result.data) {
        setSlots(result.data.slots);
      } else {
        setSlots([]);
        toast.error(result.message ?? t("errors.loadSlots"));
      }
    });
  }

  async function handleConfirm() {
    if (!serviceId || !professionalId || !selectedSlot) return;
    setFormError(null);
    setSlotTaken(false);
    setWaitlistJoined(false);

    if (customerName.trim().length < 2) {
      setFormError(t("yourData.errorName"));
      return;
    }
    if (customerWhatsapp.trim().length < 10) {
      setFormError(t("yourData.errorWhatsapp"));
      return;
    }

    startTransition(async () => {
      const result = await createPublicAppointmentAction(company.slug, {
        serviceId,
        professionalId,
        startAtISO: selectedSlot.startAtISO,
        customerName,
        customerWhatsapp,
        customerEmail,
        notes,
      });

      if (!result.success || !result.data) {
        setFormError(result.message ?? t("errors.confirm"));
        // As duas mensagens de horário indisponível (assertSlotAvailable e a
        // corrida de concorrência) sempre mencionam "horário" — é assim que
        // distinguimos "vale oferecer lista de espera" de outros erros (ex:
        // limite de tentativas), sem precisar de um código de erro dedicado.
        setSlotTaken(Boolean(result.message?.includes("horário")));
        return;
      }

      router.push(`/empresa/${company.slug}/confirmacao/${result.data.appointmentId}`);
    });
  }

  function handleJoinWaitlist() {
    if (!serviceId || !professionalId || !selectedSlot) return;
    startTransition(async () => {
      const result = await joinWaitlistAction(company.slug, {
        serviceId,
        professionalId,
        startAtISO: selectedSlot.startAtISO,
        customerName,
        customerWhatsapp,
      });
      if (!result.success) {
        setFormError(result.message ?? t("errors.confirm"));
        return;
      }
      setWaitlistJoined(true);
    });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-8 text-center sm:px-6">
          <Avatar className="h-16 w-16">
            <AvatarImage src={company.logoUrl ?? undefined} alt={company.name} />
            <AvatarFallback className="text-lg">{company.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
          {company.description && (
            <p className="max-w-md text-sm text-muted-foreground">{company.description}</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            {company.address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {company.address}, {company.city}/{company.state}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" /> {company.whatsapp}
            </span>
            {company.instagram && (
              <span className="flex items-center gap-1">
                <AtSign className="h-3.5 w-3.5" /> {company.instagram}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <ol className="mb-8 flex items-center justify-between text-[11px] text-muted-foreground sm:text-xs">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <li key={label} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "border-2 border-primary text-primary"
                        : "border text-muted-foreground"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
                </span>
                <span className="hidden text-center sm:block">{label}</span>
              </li>
            );
          })}
        </ol>

        {step > 1 && step < 6 && (
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> {t("back")}
          </Button>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t("chooseService.title")}</h2>
            {company.services.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("chooseService.empty")}</p>
            )}
            {company.services.map((service) => (
              <Card
                key={service.id}
                className="cursor-pointer flex-row items-center gap-4 p-4 transition hover:border-primary"
                onClick={() => {
                  setServiceId(service.id);
                  setProfessionalId(null);
                  setStep(2);
                }}
              >
                {service.imageUrl && (
                  <Image
                    src={service.imageUrl}
                    alt={service.name}
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-md object-cover"
                  />
                )}
                <div className="flex-1">
                  <p className="font-medium">{service.name}</p>
                  {service.description && (
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDuration(service.durationMinutes)}
                  </p>
                </div>
                <p className="font-semibold">{formatCentsToBRL(service.priceCents)}</p>
              </Card>
            ))}
          </div>
        )}

        {step === 2 && selectedService && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t("chooseProfessional.title")}</h2>
            {selectedService.professionals.map((professional) => (
              <Card
                key={professional.id}
                className="cursor-pointer flex-row items-center gap-4 p-4 transition hover:border-primary"
                onClick={() => goToDateStep(professional.id)}
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={professional.photoUrl ?? undefined} alt={professional.name} />
                  <AvatarFallback>{professional.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{professional.name}</p>
                  {professional.specialty && (
                    <p className="text-sm text-muted-foreground">{professional.specialty}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t("chooseDate.title")}</h2>
            <Card className="flex justify-center p-2">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleSelectDate}
                disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                locale={undefined}
              />
            </Card>
            {date && (
              <Button className="w-full" disabled={isPending} onClick={() => setStep(4)}>
                {t("chooseDate.continue")}
              </Button>
            )}
          </div>
        )}

        {step === 4 && date && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t("chooseTime.title")}</h2>
            <p className="text-sm text-muted-foreground capitalize">
              {formatDateLong(date, company.timezone)}
            </p>
            {loadingSlots && <p className="text-sm text-muted-foreground">{t("chooseTime.loading")}</p>}
            {!loadingSlots && slots.length === 0 && (
              <p className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
                {t("chooseTime.empty")}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((slot) => (
                <Button
                  key={slot.startAtISO}
                  variant={selectedSlot?.startAtISO === slot.startAtISO ? "default" : "outline"}
                  onClick={() => setSelectedSlot(slot)}
                >
                  <Clock className="mr-1 h-3.5 w-3.5" /> {slot.label}
                </Button>
              ))}
            </div>
            {selectedSlot && (
              <Button className="w-full" onClick={() => setStep(5)}>
                {t("chooseTime.continue")}
              </Button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t("yourData.title")}</h2>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="space-y-2">
              <Label htmlFor="customerName">{t("yourData.name")}</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerWhatsapp">{t("yourData.whatsapp")}</Label>
              <Input
                id="customerWhatsapp"
                placeholder="11999999999"
                value={customerWhatsapp}
                onChange={(e) => setCustomerWhatsapp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerEmail">{t("yourData.email")}</Label>
              <Input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{t("yourData.notes")}</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => setStep(6)}>
              {t("yourData.continue")}
            </Button>
          </div>
        )}

        {step === 6 && selectedService && selectedProfessional && selectedSlot && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t("confirm.title")}</h2>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Card className="space-y-2 p-4 text-sm">
              <Row label={t("confirm.service")} value={selectedService.name} />
              <Row label={t("confirm.professional")} value={selectedProfessional.name} />
              <Row label={t("confirm.date")} value={date ? formatDateLong(date, company.timezone) : ""} />
              <Row label={t("confirm.time")} value={selectedSlot.label} />
              <Row label={t("confirm.price")} value={formatCentsToBRL(selectedService.priceCents)} />
            </Card>
            <Button className="w-full" size="lg" disabled={isPending} onClick={handleConfirm}>
              {isPending ? t("confirm.submitting") : t("confirm.submit")}
            </Button>
            {slotTaken && company.waitlistEnabled && (
              <div className="rounded-md border bg-background p-4 text-sm">
                {waitlistJoined ? (
                  <p className="text-emerald-600">{t("waitlist.joined")}</p>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isPending}
                    onClick={handleJoinWaitlist}
                  >
                    {isPending ? t("waitlist.joining") : t("waitlist.join")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
