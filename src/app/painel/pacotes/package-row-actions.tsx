"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { togglePackageActiveAction, deletePackageAction } from "@/server/actions/packages";

export function PackageActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [checked, setChecked] = useState(isActive);
  const [loading, setLoading] = useState(false);

  return (
    <Switch
      checked={checked}
      disabled={loading}
      onCheckedChange={async (value) => {
        setLoading(true);
        setChecked(value);
        const result = await togglePackageActiveAction(id, value);
        setLoading(false);
        if (!result.success) {
          setChecked(!value);
          toast.error(result.message ?? "Não foi possível atualizar.");
        }
      }}
    />
  );
}

export function DeletePackageButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={loading || disabled}
      title={disabled ? "Pacote com vendas registradas — desative em vez de excluir." : undefined}
      onClick={async () => {
        if (!confirm("Tem certeza que deseja excluir este pacote?")) return;
        setLoading(true);
        const result = await deletePackageAction(id);
        setLoading(false);
        if (!result.success) {
          toast.error(result.message ?? "Não foi possível excluir.");
        } else {
          toast.success("Pacote excluído.");
        }
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
