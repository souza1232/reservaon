import { CalendarCheck2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold text-lg", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <CalendarCheck2 className="h-5 w-5" />
      </span>
      ReservaOn
    </Link>
  );
}
