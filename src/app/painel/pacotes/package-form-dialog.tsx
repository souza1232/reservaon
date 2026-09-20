"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { packageSchema, type PackageInput, type PackageFormValues } from "@/lib/validations/package";
import { createPackageAction, updatePackageAction } from "@/server/actions/packages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

interface Service {
  id: string;
  name: string;
}

interface PackageFormDialogProps {
  services: Service[];
  pkg?: {
    id: string;
    name: string;
    serviceId: string;
    sessionsCount: number;
    priceCents: number;
    isActive: boolean;
  };
}

export function PackageFormDialog({ services, pkg }: PackageFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = Boolean(pkg);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<PackageFormValues, unknown, PackageInput>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: pkg?.name ?? "",
      serviceId: pkg?.serviceId ?? "",
      sessionsCount: pkg?.sessionsCount ?? 10,
      price: pkg ? pkg.priceCents / 100 : 0,
      isActive: pkg?.isActive ?? true,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: pkg?.name ?? "",
        serviceId: pkg?.serviceId ?? "",
        sessionsCount: pkg?.sessionsCount ?? 10,
        price: pkg ? pkg.priceCents / 100 : 0,
        isActive: pkg?.isActive ?? true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(data: PackageInput) {
    setLoading(true);
    const result = isEdit
      ? await updatePackageAction(pkg!.id, data)
      : await createPackageAction(data);
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Verifique os campos e tente novamente.");
      return;
    }

    toast.success(isEdit ? "Pacote atualizado!" : "Pacote criado!");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Novo pacote
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar pacote" : "Novo pacote"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" placeholder="Ex: 10 sessões de depilação" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Serviço</Label>
            <Controller
              control={control}
              name="serviceId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.serviceId && (
              <p className="text-sm text-destructive">{errors.serviceId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sessionsCount">Quantidade de sessões</Label>
              <Input
                id="sessionsCount"
                type="number"
                min="1"
                step="1"
                {...register("sessionsCount")}
              />
              {errors.sessionsCount && (
                <p className="text-sm text-destructive">{errors.sessionsCount.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Preço total (R$)</Label>
              <Input id="price" type="number" step="0.01" min="0" {...register("price")} />
              {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="isActive">Pacote ativo</Label>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch id="isActive" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
