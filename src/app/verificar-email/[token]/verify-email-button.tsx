"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { verifyEmailAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Confirma o e-mail só quando o usuário clica de verdade, em vez de
 * consumir o token automaticamente ao carregar a página — muitos clientes
 * de e-mail corporativos pré-carregam/escaneiam links por segurança, e isso
 * consumiria o token antes do usuário clicar de verdade (mesmo raciocínio
 * de não ter efeito colateral num GET puro).
 */
export function VerifyEmailButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    const result = await verifyEmailAction(token);
    if (!result.success) {
      setState("error");
      setMessage(result.message ?? "Não foi possível confirmar seu e-mail.");
      return;
    }
    setState("success");
  }

  if (state === "success") {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <p className="text-sm text-muted-foreground">
          E-mail confirmado com sucesso! Já pode entrar na sua conta.
        </p>
        <Button asChild className="w-full">
          <Link href="/entrar?email=verificado">Ir para o login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <Button className="w-full" disabled={state === "loading"} onClick={handleClick}>
        {state === "loading" ? "Confirmando..." : "Confirmar meu e-mail"}
      </Button>
      {state === "error" && (
        <p className="text-center text-xs text-muted-foreground">
          Peça um novo link tentando entrar normalmente — mandamos a opção de reenviar por lá.
        </p>
      )}
    </div>
  );
}
