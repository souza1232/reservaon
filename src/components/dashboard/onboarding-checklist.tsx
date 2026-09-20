import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  label: string;
  done: boolean;
  href: string;
  cta: string;
}

export function OnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  const pending = items.filter((i) => !i.done);
  if (pending.length === 0) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">Vamos configurar sua empresa</CardTitle>
        <p className="text-sm text-muted-foreground">
          Complete estes passos para sua página pública começar a receber agendamentos.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border bg-background p-3",
              item.done && "opacity-60",
            )}
          >
            <div className="flex items-center gap-2 text-sm">
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={item.done ? "line-through" : ""}>{item.label}</span>
            </div>
            {!item.done && (
              <Button size="sm" variant="outline" asChild>
                <Link href={item.href}>
                  {item.cta} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
