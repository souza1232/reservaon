"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectGoogleCalendarAction } from "@/server/actions/google-calendar";

export function DisconnectGoogleCalendarButton() {
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
            "Desconectar o Google Agenda? Os bloqueios sincronizados a partir dele serão removidos (bloqueios criados manualmente continuam).",
          )
        )
          return;
        setLoading(true);
        const result = await disconnectGoogleCalendarAction();
        setLoading(false);
        if (!result.success) {
          toast.error(result.message ?? "Não foi possível desconectar.");
        } else {
          toast.success("Google Agenda desconectado.");
          router.refresh();
        }
      }}
    >
      {loading ? "Desconectando..." : "Desconectar"}
    </Button>
  );
}
