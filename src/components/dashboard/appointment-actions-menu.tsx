"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/constants";
import { updateAppointmentStatusAction, cancelAppointmentAction } from "@/server/actions/appointments";

const STATUS_ORDER: AppointmentStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
];

export function AppointmentActionsMenu({
  appointmentId,
  currentStatus,
}: {
  appointmentId: string;
  currentStatus: AppointmentStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(status: AppointmentStatus) {
    setLoading(true);
    const result = await updateAppointmentStatusAction({ appointmentId, status });
    setLoading(false);
    if (!result.success) toast.error(result.message ?? "Não foi possível atualizar.");
    else {
      toast.success("Status atualizado.");
      router.refresh();
    }
  }

  async function handleCancel() {
    if (!confirm("Cancelar este agendamento?")) return;
    setLoading(true);
    const result = await cancelAppointmentAction(appointmentId);
    setLoading(false);
    if (!result.success) toast.error(result.message ?? "Não foi possível cancelar.");
    else {
      toast.success("Agendamento cancelado.");
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={loading}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {STATUS_ORDER.filter((s) => s !== currentStatus).map((status) => (
          <DropdownMenuItem key={status} onClick={() => setStatus(status)}>
            Marcar como {APPOINTMENT_STATUS_LABELS[status]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCancel} className="text-destructive">
          Cancelar agendamento
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
