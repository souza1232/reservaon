"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createHolidayAction, deleteHolidayAction } from "@/server/actions/holidays";
import { formatCalendarDate } from "@/lib/format";

interface Holiday {
  id: string;
  date: string; // ISO
  description: string | null;
}

export function HolidaysManager({ holidays }: { holidays: Holiday[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!date) {
      toast.error("Selecione uma data.");
      return;
    }
    setLoading(true);
    const result = await createHolidayAction({ date, description });
    setLoading(false);
    if (!result.success) {
      toast.error(result.message ?? "Não foi possível cadastrar.");
      return;
    }
    toast.success("Feriado cadastrado!");
    setDate("");
    setDescription("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="holiday-date">Data</Label>
            <Input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="holiday-desc">Descrição (opcional)</Label>
            <Input
              id="holiday-desc"
              placeholder="Natal, feriado municipal..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button disabled={loading} onClick={handleAdd}>
            {loading ? "Salvando..." : "Adicionar feriado"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="divide-y p-0">
          {holidays.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum feriado/data indisponível cadastrada.
            </p>
          )}
          {holidays.map((holiday) => (
            <div key={holiday.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{formatCalendarDate(new Date(holiday.date))}</p>
                {holiday.description && (
                  <p className="text-sm text-muted-foreground">{holiday.description}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const result = await deleteHolidayAction(holiday.id);
                  if (!result.success) toast.error(result.message ?? "Erro ao remover.");
                  else {
                    toast.success("Feriado removido.");
                    router.refresh();
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
