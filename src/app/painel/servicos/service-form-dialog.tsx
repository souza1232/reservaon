"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { serviceSchema, type ServiceInput, type ServiceFormValues } from "@/lib/validations/service";
import { createServiceAction, updateServiceAction } from "@/server/actions/services";
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
import { ImageUploadField } from "@/components/dashboard/image-upload-field";

interface Professional {
  id: string;
  name: string;
}

interface ServiceFormDialogProps {
  professionals: Professional[];
  uploadEnabled: boolean;
  service?: {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    durationMinutes: number;
    imageUrl: string | null;
    isActive: boolean;
    professionalIds: string[];
  };
}

export function ServiceFormDialog({ professionals, uploadEnabled, service }: ServiceFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = Boolean(service);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ServiceFormValues, unknown, ServiceInput>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: service?.name ?? "",
      description: service?.description ?? "",
      price: service ? service.priceCents / 100 : 0,
      durationMinutes: service?.durationMinutes ?? 30,
      imageUrl: service?.imageUrl ?? "",
      isActive: service?.isActive ?? true,
      professionalIds: service?.professionalIds ?? [],
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: service?.name ?? "",
        description: service?.description ?? "",
        price: service ? service.priceCents / 100 : 0,
        durationMinutes: service?.durationMinutes ?? 30,
        imageUrl: service?.imageUrl ?? "",
        isActive: service?.isActive ?? true,
        professionalIds: service?.professionalIds ?? [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(data: ServiceInput) {
    setLoading(true);
    const result = isEdit
      ? await updateServiceAction(service!.id, data)
      : await createServiceAction(data);
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Verifique os campos e tente novamente.");
      return;
    }

    toast.success(isEdit ? "Serviço atualizado!" : "Serviço criado!");
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
            <Plus className="mr-2 h-4 w-4" /> Novo serviço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar serviço" : "Novo serviço"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="price">Preço (R$)</Label>
              <Input id="price" type="number" step="0.01" min="0" {...register("price")} />
              {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="durationMinutes">Duração (min)</Label>
              <Input id="durationMinutes" type="number" min="5" step="5" {...register("durationMinutes")} />
              {errors.durationMinutes && (
                <p className="text-sm text-destructive">{errors.durationMinutes.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Imagem do serviço (opcional)</Label>
            <Controller
              control={control}
              name="imageUrl"
              render={({ field }) => (
                <ImageUploadField
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  uploadEnabled={uploadEnabled}
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Profissionais que realizam este serviço</Label>
            <Controller
              control={control}
              name="professionalIds"
              render={({ field }) => (
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {professionals.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Cadastre um profissional primeiro.
                    </p>
                  )}
                  {professionals.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.value.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) field.onChange([...field.value, p.id]);
                          else field.onChange(field.value.filter((id) => id !== p.id));
                        }}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            />
            {errors.professionalIds && (
              <p className="text-sm text-destructive">{errors.professionalIds.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="isActive">Serviço ativo</Label>
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
