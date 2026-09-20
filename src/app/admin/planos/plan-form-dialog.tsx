"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { createPlanAction, updatePlanAction } from "@/server/actions/super-admin";

interface Plan {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  maxProfessionals: number | null;
  maxAppointmentsPerMonth: number | null;
  features: string[];
  isActive: boolean;
  isDefault: boolean;
}

export function PlanFormDialog({ plan }: { plan?: Plan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = Boolean(plan);

  const [name, setName] = useState(plan?.name ?? "");
  const [slug, setSlug] = useState(plan?.slug ?? "");
  const [price, setPrice] = useState(plan ? plan.priceCents / 100 : 0);
  const [unlimitedProfessionals, setUnlimitedProfessionals] = useState(
    plan ? plan.maxProfessionals === null : false,
  );
  const [maxProfessionals, setMaxProfessionals] = useState(plan?.maxProfessionals ?? 1);
  const [unlimitedAppointments, setUnlimitedAppointments] = useState(
    plan ? plan.maxAppointmentsPerMonth === null : false,
  );
  const [maxAppointments, setMaxAppointments] = useState(plan?.maxAppointmentsPerMonth ?? 30);
  const [features, setFeatures] = useState((plan?.features ?? []).join("\n"));
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [isDefault, setIsDefault] = useState(plan?.isDefault ?? false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(plan?.name ?? "");
      setSlug(plan?.slug ?? "");
      setPrice(plan ? plan.priceCents / 100 : 0);
      setUnlimitedProfessionals(plan ? plan.maxProfessionals === null : false);
      setMaxProfessionals(plan?.maxProfessionals ?? 1);
      setUnlimitedAppointments(plan ? plan.maxAppointmentsPerMonth === null : false);
      setMaxAppointments(plan?.maxAppointmentsPerMonth ?? 30);
      setFeatures((plan?.features ?? []).join("\n"));
      setIsActive(plan?.isActive ?? true);
      setIsDefault(plan?.isDefault ?? false);
    }
    setOpen(next);
  }

  async function handleSubmit() {
    const payload = {
      name,
      slug,
      price,
      maxProfessionals: unlimitedProfessionals ? null : maxProfessionals,
      maxAppointmentsPerMonth: unlimitedAppointments ? null : maxAppointments,
      features: features.split("\n").map((f) => f.trim()).filter(Boolean),
      isActive,
      isDefault,
    };

    setLoading(true);
    const result = isEdit ? await updatePlanAction(plan!.id, payload) : await createPlanAction(payload);
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Verifique os campos.");
      return;
    }

    toast.success(isEdit ? "Plano atualizado!" : "Plano criado!");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Novo plano
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar plano" : "Novo plano"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Nome</Label>
              <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-slug">Slug</Label>
              <Input id="plan-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-price">Preço mensal (R$)</Label>
            <Input
              id="plan-price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="unlimited-prof">Profissionais ilimitados</Label>
              <Switch
                id="unlimited-prof"
                checked={unlimitedProfessionals}
                onCheckedChange={setUnlimitedProfessionals}
              />
            </div>
            {!unlimitedProfessionals && (
              <Input
                type="number"
                min={1}
                value={maxProfessionals}
                onChange={(e) => setMaxProfessionals(Number(e.target.value))}
              />
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="unlimited-appt">Agendamentos/mês ilimitados</Label>
              <Switch
                id="unlimited-appt"
                checked={unlimitedAppointments}
                onCheckedChange={setUnlimitedAppointments}
              />
            </div>
            {!unlimitedAppointments && (
              <Input
                type="number"
                min={1}
                value={maxAppointments}
                onChange={(e) => setMaxAppointments(Number(e.target.value))}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-features">Recursos (um por linha)</Label>
            <Textarea
              id="plan-features"
              rows={4}
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="plan-active">Plano ativo (visível na landing page)</Label>
            <Switch id="plan-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="plan-default">Plano padrão para novos cadastros</Label>
            <Switch id="plan-default" checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" disabled={loading} onClick={handleSubmit}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
