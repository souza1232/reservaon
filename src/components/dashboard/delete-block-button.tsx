"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteBlockedTimeAction } from "@/server/actions/blocked-times";

export function DeleteBlockButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const result = await deleteBlockedTimeAction(id);
        setLoading(false);
        if (!result.success) toast.error(result.message ?? "Não foi possível remover.");
        else {
          toast.success("Bloqueio removido.");
          router.refresh();
        }
      }}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
