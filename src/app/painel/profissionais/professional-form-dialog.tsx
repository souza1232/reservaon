"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import {
  professionalSchema,
  type ProfessionalInput,
  type ProfessionalFormValues,
} from "@/lib/validations/professional";
import { createProfessionalAction, updateProfessionalAction } from "@/server/actions/professionals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { WeeklyHoursEditor } from "@/components/dashboard/weekly-hours-editor";
import { ImageUploadField } from "@/components/dashboard/image-upload-field";

interface Service {
  id: string;
  name: string;
}

interface ProfessionalFormDialogProps {
  services: Service[];
  uploadEnabled: boolean;
  professional?: {
    id: string;
    name: string;
    photoUrl: string | null;
    email: string | null;
    phone: string | null;
    specialty: string | null;
    isActive: boolean;
    serviceIds: string[];
    workingHours: { dayOfWeek: number; startTime: string; endTime: string }[];
    hasLogin: boolean;
  };
}

const emptyDefaults: ProfessionalFormValues = {
  name: "",
  photoUrl: "",
  email: "",
  phone: "",
  specialty: "",
  isActive: true,
  serviceIds: [],
  workingHours: [],
  createLogin: false,
  loginPassword: "",
};

export function ProfessionalFormDialog({
  services,
  uploadEnabled,
  professional,
}: ProfessionalFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = Boolean(professional);

  const defaultValues: ProfessionalFormValues = professional
    ? {
        name: professional.name,
        photoUrl: professional.photoUrl ?? "",
        email: professional.email ?? "",
        phone: professional.phone ?? "",
        specialty: professional.specialty ?? "",
        isActive: professional.isActive,
        serviceIds: professional.serviceIds,
        workingHours: professional.workingHours,
        createLogin: false,
        loginPassword: "",
      }
    : emptyDefaults;

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProfessionalFormValues, unknown, ProfessionalInput>({
    resolver: zodResolver(professionalSchema),
    defaultValues,
  });

  const createLogin = watch("createLogin");

  useEffect(() => {
    if (open) reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(data: ProfessionalInput) {
    setLoading(true);
    const result = isEdit
      ? await updateProfessionalAction(professional!.id, data)
      : await createProfessionalAction(data);
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Verifique os campos e tente novamente.");
      return;
    }

    toast.success(isEdit ? "Profissional atualizado!" : "Profissional criado!");
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
            <Plus className="mr-2 h-4 w-4" /> Novo profissional
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar profissional" : "Novo profissional"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="specialty">Especialidade</Label>
            <Input id="specialty" {...register("specialty")} />
          </div>

          <div className="space-y-2">
            <Label>Foto (opcional)</Label>
            <Controller
              control={control}
              name="photoUrl"
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
            <Label>Serviços realizados</Label>
            <Controller
              control={control}
              name="serviceIds"
              render={({ field }) => (
                <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border p-3">
                  {services.length === 0 && (
                    <p className="text-sm text-muted-foreground">Cadastre um serviço primeiro.</p>
                  )}
                  {services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(field.value ?? []).includes(s.id)}
                        onChange={(e) => {
                          const current = field.value ?? [];
                          if (e.target.checked) field.onChange([...current, s.id]);
                          else field.onChange(current.filter((id) => id !== s.id));
                        }}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Horários de trabalho</Label>
            <Controller
              control={control}
              name="workingHours"
              render={({ field }) => (
                <WeeklyHoursEditor value={field.value ?? []} onChange={field.onChange} />
              )}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="isActive">Profissional ativo</Label>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch id="isActive" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          {!isEdit && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="createLogin">Criar acesso ao painel para este profissional</Label>
                <Controller
                  control={control}
                  name="createLogin"
                  render={({ field }) => (
                    <Switch id="createLogin" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
              {createLogin && (
                <div className="space-y-2">
                  <Label htmlFor="loginPassword">Senha de acesso</Label>
                  <Input id="loginPassword" type="password" {...register("loginPassword")} />
                  <p className="text-xs text-muted-foreground">
                    O e-mail informado acima será usado como login.
                  </p>
                </div>
              )}
            </div>
          )}
          {isEdit && professional?.hasLogin && (
            <p className="text-xs text-muted-foreground">
              Este profissional já possui acesso ao painel com o e-mail cadastrado.
            </p>
          )}

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
