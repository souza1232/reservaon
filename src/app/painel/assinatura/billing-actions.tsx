"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCheckoutSessionAction,
  createBillingPortalSessionAction,
  createAsaasSubscriptionAction,
  getSubscriptionStatusAction,
} from "@/server/actions/billing";

export function UpgradeButton({ planId, label }: { planId: string; label: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      className="w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const result = await createCheckoutSessionAction(planId);
        setLoading(false);
        if (!result.success || !result.data) {
          toast.error(result.message ?? "Não foi possível iniciar o checkout.");
          return;
        }
        window.location.href = result.data.url;
      }}
    >
      {loading ? "Abrindo checkout..." : label}
    </Button>
  );
}

type PixStep = "closed" | "document" | "loading" | "qrcode" | "confirmed";

/**
 * Fluxo de PIX via Asaas — diferente do UpgradeButton (Stripe), não
 * redireciona: mostra o QR Code num diálogo e fica checando em segundo
 * plano (polling, sem websocket) se o pagamento confirmou. Se a empresa
 * ainda não tiver CPF/CNPJ salvo, pede isso antes de gerar o QR — o Asaas
 * exige pra criar o cliente.
 */
export function AsaasPixButton({
  planId,
  label,
  hasDocument,
}: {
  planId: string;
  label: string;
  hasDocument: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<PixStep>("closed");
  const [document, setDocument] = useState("");
  const [qrCode, setQrCode] = useState<{ qrCodeImage: string; copyPaste: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startSubscription(cpfCnpj: string) {
    setStep("loading");
    const result = await createAsaasSubscriptionAction(planId, cpfCnpj);
    if (!result.success || !result.data) {
      toast.error(result.message ?? "Não foi possível gerar o PIX.");
      setStep("closed");
      return;
    }
    setQrCode(result.data);
    setStep("qrcode");

    pollRef.current = setInterval(async () => {
      const statusResult = await getSubscriptionStatusAction();
      if (statusResult.success && statusResult.data?.status === "ACTIVE") {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep("confirmed");
        setTimeout(() => router.refresh(), 1500);
      }
    }, 4000);
  }

  function openFlow() {
    setStep(hasDocument ? "loading" : "document");
    if (hasDocument) void startSubscription("");
  }

  return (
    <>
      <Button variant="outline" className="w-full" onClick={openFlow}>
        {label}
      </Button>

      <Dialog open={step !== "closed"} onOpenChange={(open) => !open && setStep("closed")}>
        <DialogContent>
          {step === "document" && (
            <>
              <DialogHeader>
                <DialogTitle>Confirme o CPF ou CNPJ</DialogTitle>
                <DialogDescription>
                  Necessário para gerar a cobrança PIX pelo Asaas.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="cpfCnpj">CPF ou CNPJ</Label>
                <Input
                  id="cpfCnpj"
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                  placeholder="Somente números"
                />
              </div>
              <Button
                className="w-full"
                disabled={document.replace(/\D/g, "").length < 11}
                onClick={() => void startSubscription(document)}
              >
                Continuar
              </Button>
            </>
          )}

          {step === "loading" && (
            <>
              <DialogHeader>
                <DialogTitle>Gerando cobrança...</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Só um instante.</p>
            </>
          )}

          {step === "qrcode" && qrCode && (
            <>
              <DialogHeader>
                <DialogTitle>Pague com PIX</DialogTitle>
                <DialogDescription>
                  Escaneie o QR Code pelo app do seu banco, ou copie o código abaixo.
                </DialogDescription>
              </DialogHeader>
              <img
                src={`data:image/png;base64,${qrCode.qrCodeImage}`}
                alt="QR Code do PIX"
                className="mx-auto h-56 w-56"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(qrCode.copyPaste);
                  toast.success("Código copiado.");
                }}
              >
                Copiar código
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Aguardando confirmação do pagamento...
              </p>
            </>
          )}

          {step === "confirmed" && (
            <>
              <DialogHeader>
                <DialogTitle>Pagamento confirmado! ✅</DialogTitle>
                <DialogDescription>Sua assinatura já está ativa.</DialogDescription>
              </DialogHeader>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const result = await createBillingPortalSessionAction();
        setLoading(false);
        if (!result.success || !result.data) {
          toast.error(result.message ?? "Não foi possível abrir o portal de cobrança.");
          return;
        }
        window.location.href = result.data.url;
      }}
    >
      {loading ? "Abrindo..." : "Gerenciar cobrança"}
    </Button>
  );
}
