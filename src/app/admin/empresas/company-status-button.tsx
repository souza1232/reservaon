"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setCompanyStatusAction } from "@/server/actions/super-admin";

export function CompanyStatusButton({
  companyId,
  status,
}: {
  companyId: string;
  status: "ACTIVE" | "BLOCKED";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const nextStatus = status === "ACTIVE" ? "BLOCKED" : "ACTIVE";

  return (
    <Button
      size="sm"
      variant={status === "ACTIVE" ? "outline" : "default"}
      className={status === "ACTIVE" ? "text-destructive" : ""}
      disabled={loading}
      onClick={async () => {
        const confirmMsg =
          nextStatus === "BLOCKED"
            ? "Bloquear esta empresa? Ela perderá acesso ao painel imediatamente."
            : "Reativar esta empresa?";
        if (!confirm(confirmMsg)) return;
        setLoading(true);
        const result = await setCompanyStatusAction(companyId, nextStatus);
        setLoading(false);
        if (!result.success) toast.error(result.message ?? "Não foi possível atualizar.");
        else {
          toast.success(nextStatus === "BLOCKED" ? "Empresa bloqueada." : "Empresa ativada.");
          router.refresh();
        }
      }}
    >
      {status === "ACTIVE" ? "Bloquear" : "Ativar"}
    </Button>
  );
}
