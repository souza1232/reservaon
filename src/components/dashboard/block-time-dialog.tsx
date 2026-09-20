"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBlockedTimeAction } from "@/server/actions/blocked-times";

interface Professional {
  id: string;
  name: string;
}

export function BlockTimeDialog({
  professionals,
  lockedProfessionalId,
  defaultDate,
}: {
  professionals: Professional[];
  lockedProfessionalId?: string;
  defaultDate?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [professionalId, setProfessionalId] = useState(lockedProfessionalId ?? "all");
  const [scope, setScope] = useState<"SPECIFIC_TIME" | "PERIOD" | "FULL_DAY">("SPECIFIC_TIME");
  const [date, setDate] = useState(defaultDate ?? "");
  const [endDate, setEndDate] = useState(defaultDate ?? "");
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");

  async function handleSubmit() {
    if (!date) {
      toast.error("Selecione uma data.");
      return;
    }
    if (scope === "PERIOD" && !endDate) {
      toast.error("Selecione a data final do período.");
      return;
    }

    let startAtISO: string;
    let endAtISO: string;
    if (scope === "FULL_DAY") {
      startAtISO = `${date}T00:00:00`;
      endAtISO = `${date}T23:59:59`;
    } else if (scope === "PERIOD") {
      startAtISO = `${date}T00:00:00`;
      endAtISO = `${endDate}T23:59:59`;
    } else {
      startAtISO = `${date}T${startTime}:00`;
      endAtISO = `${date}T${endTime}:00`;
    }

    if (new Date(startAtISO) >= new Date(endAtISO)) {
      toast.error("O fim do período deve ser depois do início.");
      return;
    }

    setLoading(true);
    const result = await createBlockedTimeAction({
      professionalId: professionalId === "all" ? "" : professionalId,
      scope,
      startAtISO,
      endAtISO,
      reason,
    });
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Não foi possível bloquear o horário.");
      return;
    }

    toast.success("Horário bloqueado.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Ban className="mr-2 h-4 w-4" /> Bloquear horário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bloquear horário</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!lockedProfessionalId && (
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda a empresa</SelectItem>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tipo de bloqueio</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SPECIFIC_TIME">Horário específico</SelectItem>
                <SelectItem value="PERIOD">Período (várias datas, ex: férias)</SelectItem>
                <SelectItem value="FULL_DAY">Dia inteiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="block-date">{scope === "PERIOD" ? "Data inicial" : "Data"}</Label>
            <Input id="block-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {scope === "PERIOD" && (
            <div className="space-y-2">
              <Label htmlFor="block-end-date">Data final</Label>
              <Input
                id="block-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}

          {scope === "SPECIFIC_TIME" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="block-start">Início</Label>
                <Input
                  id="block-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-end">Fim</Label>
                <Input
                  id="block-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="block-reason">Motivo (opcional)</Label>
            <Input
              id="block-reason"
              placeholder="Almoço, reunião, férias..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" disabled={loading} onClick={handleSubmit}>
            {loading ? "Bloqueando..." : "Bloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
