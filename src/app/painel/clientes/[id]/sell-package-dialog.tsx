"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackagePlus } from "lucide-react";
import { sellPackageToCustomerAction } from "@/server/actions/packages";
import { formatCentsToBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

interface PackageOption {
  id: string;
  name: string;
  sessionsCount: number;
  priceCents: number;
  serviceName: string;
}

export function SellPackageDialog({
  customerId,
  packages,
}: {
  customerId: string;
  packages: PackageOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleSell() {
    if (!packageId) return;
    setLoading(true);
    const result = await sellPackageToCustomerAction(customerId, packageId);
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Não foi possível registrar a venda.");
      return;
    }

    toast.success("Pacote vendido!");
    setOpen(false);
    setPackageId("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PackagePlus className="mr-2 h-4 w-4" /> Vender pacote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Vender pacote</DialogTitle>
        </DialogHeader>

        {packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum pacote ativo cadastrado. Cadastre um em Pacotes primeiro.
          </p>
        ) : (
          <div className="space-y-4">
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um pacote" />
              </SelectTrigger>
              <SelectContent>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.sessionsCount}x {p.serviceName} ({formatCentsToBRL(p.priceCents)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O sistema não cobra o cliente — registre a venda depois de receber o pagamento por
              fora.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            className="w-full"
            disabled={loading || !packageId}
            onClick={handleSell}
          >
            {loading ? "Registrando..." : "Confirmar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
