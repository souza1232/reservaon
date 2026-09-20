"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createManualAppointmentAction, getInternalAvailableSlotsAction } from "@/server/actions/appointments";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
}
interface Professional {
  id: string;
  name: string;
}
interface Customer {
  id: string;
  name: string;
  whatsapp: string;
}

export function ManualAppointmentDialog({
  services,
  professionals,
  customers,
  lockedProfessionalId,
  defaultDate,
}: {
  services: Service[];
  professionals: Professional[];
  customers: Customer[];
  lockedProfessionalId?: string;
  defaultDate?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState(lockedProfessionalId ?? "");
  const [date, setDate] = useState(defaultDate ?? "");
  const [slots, setSlots] = useState<{ startAtISO: string; label: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");

  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new");
  const [customerId, setCustomerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [notes, setNotes] = useState("");

  const canPickDate = Boolean(serviceId && professionalId);

  async function refreshSlots(nextDate: string) {
    if (!serviceId || !professionalId || !nextDate) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    const result = await getInternalAvailableSlotsAction(serviceId, professionalId, nextDate);
    setLoadingSlots(false);
    if (result.success && result.data) {
      setSlots(result.data.slots);
    } else {
      setSlots([]);
      if (result.message) toast.error(result.message);
    }
  }

  async function handleSubmit() {
    if (!serviceId || !professionalId || !selectedSlot) {
      toast.error("Preencha serviço, profissional e horário.");
      return;
    }
    if (customerMode === "existing" && !customerId) {
      toast.error("Selecione um cliente.");
      return;
    }
    if (customerMode === "new" && (!newName || !newWhatsapp)) {
      toast.error("Informe nome e WhatsApp do novo cliente.");
      return;
    }

    setLoading(true);
    const result = await createManualAppointmentAction({
      customerId: customerMode === "existing" ? customerId : undefined,
      newCustomerName: customerMode === "new" ? newName : undefined,
      newCustomerWhatsapp: customerMode === "new" ? newWhatsapp : undefined,
      serviceId,
      professionalId,
      startAtISO: selectedSlot,
      notes,
    });
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Não foi possível criar o agendamento.");
      return;
    }

    toast.success("Agendamento criado!");
    setOpen(false);
    router.refresh();
  }

  const availableProfessionals = useMemo(() => professionals, [professionals]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setServiceId("");
          if (!lockedProfessionalId) setProfessionalId("");
          setDate(defaultDate ?? "");
          setSlots([]);
          setSelectedSlot("");
          setCustomerId("");
          setNewName("");
          setNewWhatsapp("");
          setNotes("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Novo agendamento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Serviço</Label>
              <Select
                value={serviceId}
                onValueChange={(v) => {
                  setServiceId(v);
                  setSelectedSlot("");
                  if (date) refreshSlots(date);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select
                value={professionalId}
                disabled={Boolean(lockedProfessionalId)}
                onValueChange={(v) => {
                  setProfessionalId(v);
                  setSelectedSlot("");
                  if (date) refreshSlots(date);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {availableProfessionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              type="date"
              disabled={!canPickDate}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSelectedSlot("");
                refreshSlots(e.target.value);
              }}
            />
          </div>

          {date && canPickDate && (
            <div className="space-y-2">
              <Label>Horário</Label>
              {loadingSlots && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {!loadingSlots && slots.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum horário disponível.</p>
              )}
              <div className="grid grid-cols-4 gap-2">
                {slots.map((slot) => (
                  <Button
                    key={slot.startAtISO}
                    type="button"
                    size="sm"
                    variant={selectedSlot === slot.startAtISO ? "default" : "outline"}
                    onClick={() => setSelectedSlot(slot.startAtISO)}
                  >
                    <Clock className="mr-1 h-3 w-3" /> {slot.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Cliente</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={customerMode === "new" ? "default" : "outline"}
                onClick={() => setCustomerMode("new")}
              >
                Novo cliente
              </Button>
              <Button
                type="button"
                size="sm"
                variant={customerMode === "existing" ? "default" : "outline"}
                onClick={() => setCustomerMode("existing")}
              >
                Cliente existente
              </Button>
            </div>
            {customerMode === "new" ? (
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input
                  placeholder="WhatsApp"
                  value={newWhatsapp}
                  onChange={(e) => setNewWhatsapp(e.target.value)}
                />
              </div>
            ) : (
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.whatsapp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observação (opcional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" disabled={loading} onClick={handleSubmit}>
            {loading ? "Criando..." : "Criar agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
