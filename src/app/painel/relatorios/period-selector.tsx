import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  { value: "este-mes", label: "Este mês" },
  { value: "mes-passado", label: "Mês passado" },
  { value: "30-dias", label: "Últimos 30 dias" },
  { value: "90-dias", label: "Últimos 90 dias" },
  { value: "personalizado", label: "Personalizado" },
] as const;

/**
 * Puro server component — cada preset é um link com query string (mesmo
 * padrão das abas Dia/Semana/Mês em AgendaView), e o período personalizado
 * usa um <form method="GET"> comum, sem precisar de client JS pra navegar.
 */
export function PeriodSelector({
  basePath,
  active,
  inicio,
  fim,
}: {
  basePath: string;
  active: string;
  inicio?: string;
  fim?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.value} variant={active === preset.value ? "default" : "outline"} size="sm" asChild>
            <Link href={`${basePath}?periodo=${preset.value}`}>{preset.label}</Link>
          </Button>
        ))}
      </div>

      {active === "personalizado" && (
        <form method="GET" action={basePath} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="periodo" value="personalizado" />
          <div className="space-y-1">
            <Label htmlFor="inicio" className="text-xs">
              De
            </Label>
            <Input id="inicio" name="inicio" type="date" defaultValue={inicio} required className="w-auto" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fim" className="text-xs">
              Até
            </Label>
            <Input id="fim" name="fim" type="date" defaultValue={fim} required className="w-auto" />
          </div>
          <Button type="submit" size="sm">
            Aplicar
          </Button>
        </form>
      )}
    </div>
  );
}
