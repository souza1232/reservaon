"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
import { signupCompanyAction } from "@/server/actions/auth";
import { BRAZILIAN_STATES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SignupForm() {
  const t = useTranslations("Auth.signup");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(data: SignupInput) {
    setLoading(true);
    setServerError(null);
    const result = await signupCompanyAction(data);
    setLoading(false);

    if (!result.success) {
      setServerError(result.message ?? t("genericError"));
      return;
    }

    router.push("/entrar?cadastro=sucesso");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="companyName">{t("companyName")}</Label>
        <Input id="companyName" {...register("companyName")} />
        {errors.companyName && <p className="text-sm text-destructive">{errors.companyName.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ownerName">{t("ownerName")}</Label>
        <Input id="ownerName" {...register("ownerName")} />
        {errors.ownerName && <p className="text-sm text-destructive">{errors.ownerName.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">{t("whatsapp")}</Label>
        <Input id="whatsapp" placeholder="11999999999" {...register("whatsapp")} />
        {errors.whatsapp && <p className="text-sm text-destructive">{errors.whatsapp.message}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="city">{t("city")}</Label>
          <Input id="city" {...register("city")} />
          {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">{t("state")}</Label>
          <Controller
            control={control}
            name="state"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="state" className="w-full">
                  <SelectValue placeholder={t("state")} />
                </SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_STATES.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.state && <p className="text-sm text-destructive">{errors.state.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("submitting") : t("submit")}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {t("termsPrefix")}{" "}
        <Link href="/termos" className="underline">
          {t("termsLink")}
        </Link>{" "}
        {t("and")}{" "}
        <Link href="/privacidade" className="underline">
          {t("privacyLink")}
        </Link>
        .
      </p>
    </form>
  );
}
