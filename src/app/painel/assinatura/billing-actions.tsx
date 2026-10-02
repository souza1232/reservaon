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
  createAsaasSubscriptionAction,
  createAsaasCardCheckoutAction,
  getSubscriptionStatusAction,
} from "@/server/actions/billing";

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

type CardCheckoutStep = "closed" | "form" | "loading";

const EMPTY_ADDRESS = { postalCode: "", address: "", addressNumber: "", province: "" };

/**
 * Checkout de cartão via Asaas — ao contrário do PIX, não fica na tela: o
 * cliente é redirecionado pra página hospedada do próprio Asaas (número do
 * cartão nunca passa pelo nosso servidor), e volta pra cá depois de pagar.
 * A confirmação chega depois, pelo webhook, de forma assíncrona. Sempre pede
 * o endereço de cobrança antes: o Asaas Checkout recusa cliente sem ele.
 */
export function AsaasCardButton({
  planId,
  label,
  hasDocument,
}: {
  planId: string;
  label: string;
  hasDocument: boolean;
}) {
  const [step, setStep] = useState<CardCheckoutStep>("closed");
  const [document, setDocument] = useState("");
  const [address, setAddress] = useState(EMPTY_ADDRESS);

  const documentOk = hasDocument || document.replace(/\D/g, "").length >= 11;
  const addressOk =
    address.postalCode.replace(/\D/g, "").length === 8 &&
    address.address.trim() !== "" &&
    address.addressNumber.trim() !== "" &&
    address.province.trim() !== "";

  async function startCheckout() {
    setStep("loading");
    const result = await createAsaasCardCheckoutAction(planId, document, address);
    if (!result.success || !result.data) {
      toast.error(result.message ?? "Não foi possível iniciar o checkout com cartão.");
      setStep("form");
      return;
    }
    window.location.href = result.data.url;
  }

  function field(key: keyof typeof EMPTY_ADDRESS, id: string, text: string, placeholder?: string) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{text}</Label>
        <Input
          id={id}
          value={address[key]}
          onChange={(e) => setAddress((prev) => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setStep("form")}>
        {label}
      </Button>

      <Dialog open={step !== "closed"} onOpenChange={(open) => !open && setStep("closed")}>
        <DialogContent>
          {step === "form" && (
            <>
              <DialogHeader>
                <DialogTitle>Dados de cobrança</DialogTitle>
                <DialogDescription>
                  Exigidos pelo Asaas pra cobrança no cartão. Depois você vai pra página de
                  pagamento segura do Asaas.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="cardCpfCnpj">CPF ou CNPJ</Label>
                <Input
                  id="cardCpfCnpj"
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                  placeholder={hasDocument ? "Já cadastrado — preencha só se quiser trocar" : "Somente números"}
                />
              </div>
              {field("postalCode", "cardCep", "CEP", "Somente números")}
              {field("address", "cardAddress", "Rua")}
              <div className="grid grid-cols-2 gap-3">
                {field("addressNumber", "cardNumber", "Número")}
                {field("province", "cardProvince", "Bairro")}
              </div>
              <Button
                className="w-full"
                disabled={!documentOk || !addressOk}
                onClick={() => void startCheckout()}
              >
                Continuar para o pagamento
              </Button>
            </>
          )}

          {step === "loading" && (
            <>
              <DialogHeader>
                <DialogTitle>Abrindo checkout...</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Só um instante.</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
