"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteReceptionistAction } from "@/server/actions/receptionists";

/**
 * Sem window.confirm(): não suportado em alguns navegadores embutidos (ver
 * mesma correção em clinical-record-card.tsx). Primeiro clique arma,
 * segundo confirma.
 */
export function DeleteReceptionistButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const result = await deleteReceptionistAction(id);
    setLoading(false);
    setConfirming(false);
    if (!result.success) {
      toast.error(result.message ?? "Não foi possível excluir.");
    } else {
      toast.success("Recepcionista removida.");
      router.refresh();
    }
  }

  return (
    <Button
      variant={confirming ? "destructive" : "ghost"}
      size="sm"
      disabled={loading}
      onClick={() => (confirming ? handleDelete() : setConfirming(true))}
      onBlur={() => setConfirming(false)}
    >
      {confirming ? (
        "Confirmar exclusão?"
      ) : (
        <Trash2 className="h-4 w-4 text-destructive" />
      )}
    </Button>
  );
}
