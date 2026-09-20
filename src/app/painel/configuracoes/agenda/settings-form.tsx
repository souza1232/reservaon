"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  companySettingsSchema,
  type CompanySettingsInput,
  type CompanySettingsFormValues,
} from "@/lib/validations/company";
import { updateCompanySettingsAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AgendaSettingsForm({ defaultValues }: { defaultValues: CompanySettingsInput }) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CompanySettingsFormValues, unknown, CompanySettingsInput>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues,
  });

  async function onSubmit(data: CompanySettingsInput) {
    setLoading(true);
    const result = await updateCompanySettingsAction(data);
    setLoading(false);
    if (!result.success) toast.error(result.message ?? "Verifique os campos.");
    else toast.success("Configurações de agenda atualizadas!");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras de agendamento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="slotIntervalMinutes">Intervalo entre horários exibidos (min)</Label>
            <Input id="slotIntervalMinutes" type="number" min={5} {...register("slotIntervalMinutes")} />
            {errors.slotIntervalMinutes && (
              <p className="text-sm text-destructive">{errors.slotIntervalMinutes.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bufferBetweenMinutes">Intervalo mínimo entre atendimentos (min)</Label>
            <Input id="bufferBetweenMinutes" type="number" min={0} {...register("bufferBetweenMinutes")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minAdvanceMinutes">Antecedência mínima para agendar (min)</Label>
            <Input id="minAdvanceMinutes" type="number" min={0} {...register("minAdvanceMinutes")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxFutureDays">Limite de dias futuros para reserva</Label>
            <Input id="maxFutureDays" type="number" min={1} {...register("maxFutureDays")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificações</CardTitle>
          <p className="text-sm text-muted-foreground">
            Controla quais eventos disparam e-mail (quando um provedor de e-mail estiver
            configurado) e a disponibilidade do botão de WhatsApp.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {(
            [
              ["notifyOnConfirmation", "Confirmação de agendamento"],
              ["notifyOnReminder", "Lembrete antes do horário"],
              ["notifyOnCancellation", "Cancelamento"],
              ["notifyOnReschedule", "Alteração/remarcação"],
            ] as const
          ).map(([name, label]) => (
            <div key={name} className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor={name}>{label}</Label>
              <Controller
                control={control}
                name={name}
                render={({ field }) => (
                  <Switch id={name} checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de espera</CardTitle>
          <p className="text-sm text-muted-foreground">
            Quando um horário está ocupado, o cliente pode entrar na fila. Se alguém cancelar
            exatamente aquele horário, o primeiro da fila é avisado por WhatsApp automaticamente.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="waitlistEnabled">Ativar lista de espera</Label>
            <Controller
              control={control}
              name="waitlistEnabled"
              render={({ field }) => (
                <Switch id="waitlistEnabled" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="waitlistOfferWindowHours">Prazo para o cliente confirmar a vaga (horas)</Label>
            <Input
              id="waitlistOfferWindowHours"
              type="number"
              min={1}
              max={72}
              {...register("waitlistOfferWindowHours")}
            />
            {errors.waitlistOfferWindowHours && (
              <p className="text-sm text-destructive">{errors.waitlistOfferWindowHours.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
