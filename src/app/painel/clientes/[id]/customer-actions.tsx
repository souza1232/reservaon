"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateCustomerNotesAction, eraseCustomerDataAction } from "@/server/actions/customers";

export function CustomerNotesForm({ customerId, notes }: { customerId: string; notes: string }) {
  const [value, setValue] = useState(notes);
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-2">
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={4} />
      <Button
        size="sm"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const result = await updateCustomerNotesAction(customerId, value);
          setLoading(false);
          if (!result.success) toast.error(result.message ?? "Erro ao salvar.");
          else toast.success("Observações salvas.");
        }}
      >
        {loading ? "Salvando..." : "Salvar observações"}
      </Button>
    </div>
  );
}

export function EraseCustomerButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      className="text-destructive"
      disabled={loading}
      onClick={async () => {
        if (
          !confirm(
            "Isso vai anonimizar os dados pessoais deste cliente (nome, WhatsApp e e-mail), mantendo o histórico de agendamentos para fins operacionais. Esta ação não pode ser desfeita. Continuar?",
          )
        )
          return;
        setLoading(true);
        const result = await eraseCustomerDataAction(customerId);
        setLoading(false);
        if (!result.success) {
          toast.error(result.message ?? "Erro ao processar solicitação.");
        } else {
          toast.success("Dados do cliente anonimizados.");
          router.push("/painel/clientes");
        }
      }}
    >
      {loading ? "Processando..." : "Excluir dados do cliente (LGPD)"}
    </Button>
  );
}
