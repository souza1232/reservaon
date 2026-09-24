"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { receptionistSchema, type ReceptionistInput } from "@/lib/validations/receptionist";
import { createReceptionistAction } from "@/server/actions/receptionists";
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

export function ReceptionistFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReceptionistInput>({
    resolver: zodResolver(receptionistSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(data: ReceptionistInput) {
    setLoading(true);
    const result = await createReceptionistAction(data);
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Verifique os campos e tente novamente.");
      return;
    }

    toast.success("Recepcionista criada!");
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Nova recepcionista
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova recepcionista</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail (login)</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Ela vai poder ver e gerenciar a agenda e os clientes da empresa inteira, mas não vê
            faturamento, assinatura nem configurações.
          </p>

          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Criando..." : "Criar acesso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
