"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { companyProfileSchema, type CompanyProfileInput } from "@/lib/validations/company";
import { updateCompanyProfileAction } from "@/server/actions/settings";
import { BRAZILIAN_STATES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploadField } from "@/components/dashboard/image-upload-field";

export function CompanyProfileForm({
  defaultValues,
  uploadEnabled,
}: {
  defaultValues: CompanyProfileInput;
  uploadEnabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CompanyProfileInput>({ resolver: zodResolver(companyProfileSchema), defaultValues });

  async function onSubmit(data: CompanyProfileInput) {
    setLoading(true);
    const result = await updateCompanyProfileAction(data);
    setLoading(false);
    if (!result.success) toast.error(result.message ?? "Verifique os campos.");
    else toast.success("Dados da empresa atualizados!");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da empresa</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerName">Responsável</Label>
              <Input id="ownerName" {...register("ownerName")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input id="whatsapp" {...register("whatsapp")} />
              {errors.whatsapp && <p className="text-sm text-destructive">{errors.whatsapp.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone (opcional)</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_100px]">
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" {...register("address")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">UF</Label>
              <Controller
                control={control}
                name="state"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="state" className="w-full">
                      <SelectValue />
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
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ (opcional)</Label>
            <Input id="cnpj" {...register("cnpj")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" rows={3} {...register("description")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram (opcional)</Label>
              <Input id="instagram" placeholder="@sua_empresa" {...register("instagram")} />
            </div>
            <div className="space-y-2">
              <Label>Logo (opcional)</Label>
              <Controller
                control={control}
                name="logoUrl"
                render={({ field }) => (
                  <ImageUploadField
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    uploadEnabled={uploadEnabled}
                  />
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avaliação no Google</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="googleReviewUrl">Link de avaliação do Google (opcional)</Label>
            <Input
              id="googleReviewUrl"
              placeholder="https://g.page/r/..."
              {...register("googleReviewUrl")}
            />
            {errors.googleReviewUrl && (
              <p className="text-sm text-destructive">{errors.googleReviewUrl.message}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Encontre em Perfil da Empresa no Google → Peça avaliações → copiar link. Com o link
              preenchido, o cliente recebe automaticamente um pedido de avaliação por WhatsApp
              depois do atendimento.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="pt-2">
        <h2 className="text-sm font-medium text-muted-foreground">Avançado / Marketing (opcional)</h2>
        <p className="text-xs text-muted-foreground">
          Só preencha se você já usa essas ferramentas — pode pular sem problema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO da página pública</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seoTitle">Título (SEO)</Label>
            <Input id="seoTitle" {...register("seoTitle")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seoDescription">Descrição (SEO)</Label>
            <Textarea id="seoDescription" rows={2} {...register("seoDescription")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meta Pixel (Facebook/Instagram Ads)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="facebookPixelId">Pixel ID (opcional)</Label>
            <Input
              id="facebookPixelId"
              placeholder="123456789012345"
              inputMode="numeric"
              {...register("facebookPixelId")}
            />
            {errors.facebookPixelId && (
              <p className="text-sm text-destructive">{errors.facebookPixelId.message}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Encontre em Gerenciador de Eventos do Meta. Com o ID preenchido, o pixel é
              carregado automaticamente na sua página pública de agendamento e dispara um evento
              de conversão a cada agendamento confirmado.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
