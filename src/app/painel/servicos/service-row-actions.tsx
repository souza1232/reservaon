"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toggleServiceActiveAction, deleteServiceAction } from "@/server/actions/services";

export function ServiceActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [checked, setChecked] = useState(isActive);
  const [loading, setLoading] = useState(false);

  return (
    <Switch
      checked={checked}
      disabled={loading}
      onCheckedChange={async (value) => {
        setLoading(true);
        setChecked(value);
        const result = await toggleServiceActiveAction(id, value);
        setLoading(false);
        if (!result.success) {
          setChecked(!value);
          toast.error(result.message ?? "Não foi possível atualizar.");
        }
      }}
    />
  );
}

export function DeleteServiceButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={loading}
      onClick={async () => {
        if (!confirm("Tem certeza que deseja excluir este serviço?")) return;
        setLoading(true);
        const result = await deleteServiceAction(id);
        setLoading(false);
        if (!result.success) {
          toast.error(result.message ?? "Não foi possível excluir.");
        } else {
          toast.success("Serviço excluído.");
        }
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
