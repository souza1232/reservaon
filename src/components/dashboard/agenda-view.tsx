import Link from "next/link";
import { ChevronLeft, ChevronRight, Ban } from "lucide-react";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCentsToBRL, formatTime } from "@/lib/format";
import { WEEKDAY_LABELS_SHORT } from "@/lib/constants";
import { AppointmentStatusBadge } from "@/components/dashboard/appointment-status-badge";
import { AppointmentActionsMenu } from "@/components/dashboard/appointment-actions-menu";
import { ManualAppointmentDialog } from "@/components/dashboard/manual-appointment-dialog";
import { BlockTimeDialog } from "@/components/dashboard/block-time-dialog";
import { DeleteBlockButton } from "@/components/dashboard/delete-block-button";
import { getDayAgenda, getPeriodCounts, getWeekDays, getMonthDays } from "@/server/queries/agenda";

type View = "dia" | "semana" | "mes";

interface AgendaViewProps {
  basePath: string;
  timezone: string;
  view: View;
  dateISO: string;
  scope: { companyId: string; professionalId?: string };
  services: { id: string; name: string; durationMinutes: number }[];
  professionals: { id: string; name: string }[];
  customers: { id: string; name: string; whatsapp: string }[];
  lockedProfessionalId?: string;
}

function buildHref(basePath: string, view: View, dateISO: string) {
  return `${basePath}?view=${view}&date=${dateISO}`;
}

export async function AgendaView({
  basePath,
  timezone,
  view,
  dateISO,
  scope,
  services,
  professionals,
  customers,
  lockedProfessionalId,
}: AgendaViewProps) {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const refDate = new Date(`${dateISO}T12:00:00`);

  let prevDate = dateISO;
  let nextDate = dateISO;
  if (view === "dia") {
    prevDate = format(addDays(refDate, -1), "yyyy-MM-dd");
    nextDate = format(addDays(refDate, 1), "yyyy-MM-dd");
  } else if (view === "semana") {
    prevDate = format(addWeeks(refDate, -1), "yyyy-MM-dd");
    nextDate = format(addWeeks(refDate, 1), "yyyy-MM-dd");
  } else {
    prevDate = format(addMonths(refDate, -1), "yyyy-MM-dd");
    nextDate = format(addMonths(refDate, 1), "yyyy-MM-dd");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {formatInTimeZone(refDate, timezone, "EEEE, d 'de' MMMM 'de' yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BlockTimeDialog
            professionals={professionals}
            lockedProfessionalId={lockedProfessionalId}
            defaultDate={dateISO}
          />
          <ManualAppointmentDialog
            services={services}
            professionals={professionals}
            customers={customers}
            lockedProfessionalId={lockedProfessionalId}
            defaultDate={dateISO}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Tabs value={view}>
          <TabsList>
            <TabsTrigger value="dia" asChild>
              <Link href={buildHref(basePath, "dia", dateISO)}>Dia</Link>
            </TabsTrigger>
            <TabsTrigger value="semana" asChild>
              <Link href={buildHref(basePath, "semana", dateISO)}>Semana</Link>
            </TabsTrigger>
            <TabsTrigger value="mes" asChild>
              <Link href={buildHref(basePath, "mes", dateISO)}>Mês</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" asChild>
            <Link href={buildHref(basePath, view, prevDate)}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(basePath, view, today)}>Hoje</Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={buildHref(basePath, view, nextDate)}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {view === "dia" && (
        <DayAgenda dateISO={dateISO} timezone={timezone} scope={scope} />
      )}
      {view === "semana" && (
        <WeekAgenda basePath={basePath} dateISO={dateISO} timezone={timezone} scope={scope} />
      )}
      {view === "mes" && (
        <MonthAgenda basePath={basePath} dateISO={dateISO} timezone={timezone} scope={scope} />
      )}
    </div>
  );
}

async function DayAgenda({
  dateISO,
  timezone,
  scope,
}: {
  dateISO: string;
  timezone: string;
  scope: { companyId: string; professionalId?: string };
}) {
  const { appointments, blockedTimes } = await getDayAgenda(dateISO, timezone, scope);

  const items = [
    ...appointments.map((a) => ({ type: "appointment" as const, startAt: a.startAt, data: a })),
    ...blockedTimes.map((b) => ({ type: "block" as const, startAt: b.startAt, data: b })),
  ].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return (
    <Card>
      <CardContent className="divide-y p-0">
        {items.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nenhum agendamento ou bloqueio neste dia.
          </p>
        )}
        {items.map((item) =>
          item.type === "appointment" ? (
            <div key={item.data.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-4">
                <div className="w-14 shrink-0 text-sm font-medium">
                  {formatTime(item.data.startAt, timezone)}
                </div>
                <div>
                  <p className="font-medium">{item.data.customer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.data.service.name} · {item.data.professional.name} ·{" "}
                    {formatCentsToBRL(item.data.priceCents)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AppointmentStatusBadge status={item.data.status} />
                <AppointmentActionsMenu appointmentId={item.data.id} currentStatus={item.data.status} />
              </div>
            </div>
          ) : (
            <div key={item.data.id} className="flex items-center justify-between gap-4 bg-muted/40 p-4">
              <div className="flex items-center gap-4">
                <div className="w-14 shrink-0 text-sm font-medium">
                  {item.data.scope === "FULL_DAY" || item.data.scope === "PERIOD"
                    ? "Dia todo"
                    : formatTime(item.data.startAt, timezone)}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Ban className="h-3.5 w-3.5" />
                  {item.data.reason || "Horário bloqueado"} ·{" "}
                  {item.data.professional?.name ?? "Toda a empresa"}
                </div>
              </div>
              <DeleteBlockButton id={item.data.id} />
            </div>
          ),
        )}
      </CardContent>
    </Card>
  );
}

async function WeekAgenda({
  basePath,
  dateISO,
  timezone,
  scope,
}: {
  basePath: string;
  dateISO: string;
  timezone: string;
  scope: { companyId: string; professionalId?: string };
}) {
  const days = getWeekDays(dateISO);
  const counts = await getPeriodCounts(days, timezone, scope);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        return (
          <Link key={key} href={buildHref(basePath, "dia", key)}>
            <Card className="h-full transition hover:border-primary">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{WEEKDAY_LABELS_SHORT[day.getDay()]}</p>
                <p className="text-lg font-semibold">{format(day, "dd/MM")}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {counts.get(key) ?? 0} agendamento(s)
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

async function MonthAgenda({
  basePath,
  dateISO,
  timezone,
  scope,
}: {
  basePath: string;
  dateISO: string;
  timezone: string;
  scope: { companyId: string; professionalId?: string };
}) {
  const days = getMonthDays(dateISO);
  const counts = await getPeriodCounts(days, timezone, scope);
  const leadingBlanks = days[0].getDay();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS_SHORT.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const count = counts.get(key) ?? 0;
            return (
              <Link
                key={key}
                href={buildHref(basePath, "dia", key)}
                className="flex aspect-square flex-col items-center justify-center rounded-md border p-1 text-sm transition hover:border-primary"
              >
                <span>{format(day, "d")}</span>
                {count > 0 && (
                  <span className="mt-1 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
