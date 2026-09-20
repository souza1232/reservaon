import type { AppointmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <Badge variant="outline" className={cn("border", APPOINTMENT_STATUS_COLORS[status])}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
