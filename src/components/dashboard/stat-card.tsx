import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  /** Comparação com o período anterior — `positive` decide a cor (verde/vermelho), não o sinal de `value`. */
  trend?: { value: string; positive: boolean };
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-row items-center justify-between gap-3 p-4", className)}>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {trend && (
          <p
            className={cn(
              "mt-1 flex items-center gap-0.5 text-xs font-medium",
              trend.positive ? "text-emerald-600" : "text-red-600",
            )}
          >
            {trend.positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {trend.value}
          </p>
        )}
      </div>
      {Icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      )}
    </Card>
  );
}
