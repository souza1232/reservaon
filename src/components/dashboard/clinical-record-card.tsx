"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import {
  createClinicalRecordAction,
  deleteClinicalRecordPhotoAction,
  updateAllergiesAction,
  uploadClinicalPhotoAction,
} from "@/server/actions/clinical-records";

export interface ClinicalRecordPhotoData {
  id: string;
  label: string | null;
}

export interface ClinicalRecordData {
  id: string;
  note: string;
  authorName: string;
  createdAt: Date;
  photos: ClinicalRecordPhotoData[];
}

/**
 * Card de prontuário: alergias fixadas no topo + linha do tempo de registros
 * clínicos com fotos. As fotos nunca carregam a URL do Blob no cliente — o
 * <img> aponta pra /api/prontuario/foto/[id], que confere sessão antes de
 * servir os bytes (ver rota e clinical-records.ts pro porquê).
 */
export function ClinicalRecordCard({
  customerId,
  allergies,
  records,
}: {
  customerId: string;
  allergies: string;
  records: ClinicalRecordData[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Prontuário</CardTitle>
        <NewRecordDialog customerId={customerId} />
      </CardHeader>
      <CardContent className="space-y-6">
        <AllergiesForm customerId={customerId} allergies={allergies} />

        <div className="space-y-4">
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
          ) : (
            records.map((record) => <RecordEntry key={record.id} record={record} />)
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AllergiesForm({ customerId, allergies }: { customerId: string; allergies: string }) {
  const [value, setValue] = useState(allergies);
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
      <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
        Alergias / contraindicações
      </p>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Ex: alergia a látex, evitar ácido X..."
        className="bg-background"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const result = await updateAllergiesAction(customerId, value);
          setLoading(false);
          if (!result.success) toast.error(result.message ?? "Erro ao salvar.");
          else toast.success("Alergias atualizadas.");
        }}
      >
        {loading ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );
}

function NewRecordDialog({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!note.trim()) return;
    setLoading(true);
    const result = await createClinicalRecordAction(customerId, note);
    setLoading(false);

    if (!result.success) {
      toast.error(result.message ?? "Não foi possível salvar o registro.");
      return;
    }
    toast.success("Registro salvo.");
    setOpen(false);
    setNote("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-2 h-4 w-4" /> Novo registro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo registro clínico</DialogTitle>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          placeholder="Anamnese, evolução do tratamento, observações..."
        />
        <DialogFooter>
          <Button className="w-full" disabled={loading || !note.trim()} onClick={handleCreate}>
            {loading ? "Salvando..." : "Salvar registro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordEntry({ record }: { record: ClinicalRecordData }) {
  return (
    <div className="space-y-3 border-b pb-4 last:border-0 last:pb-0">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{record.authorName}</span>
        <span>{formatDateTime(record.createdAt)}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{record.note}</p>

      <div className="flex flex-wrap items-center gap-2">
        {record.photos.map((photo) => (
          <PhotoThumb key={photo.id} photo={photo} />
        ))}
        <PhotoUploadButton clinicalRecordId={record.id} />
      </div>
    </div>
  );
}

function PhotoThumb({ photo }: { photo: ClinicalRecordPhotoData }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const src = `/api/prontuario/foto/${photo.id}`;

  // Sem window.confirm(): mesmo problema do prompt() em handleFileChange
  // (não suportado em navegadores embutidos como o webview do VS Code).
  // Primeiro clique arma, segundo clique confirma; sair do foco cancela.
  async function handleDelete() {
    setDeleting(true);
    const result = await deleteClinicalRecordPhotoAction(photo.id);
    setDeleting(false);
    setConfirming(false);
    if (!result.success) toast.error(result.message ?? "Erro ao remover.");
    else router.refresh();
  }

  return (
    <div className="group relative">
      <a href={src} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- servido por rota autenticada própria, não pelo otimizador de imagens do Next */}
        <img
          src={src}
          alt={photo.label ?? "Foto do prontuário"}
          className="h-16 w-16 rounded-md border object-cover"
        />
      </a>
      {photo.label && (
        <span className="absolute bottom-0 left-0 rounded-tr-md bg-black/60 px-1 text-[10px] text-white">
          {photo.label}
        </span>
      )}
      <button
        type="button"
        disabled={deleting}
        onClick={() => (confirming ? handleDelete() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        className={
          confirming
            ? "absolute -top-1.5 -right-1.5 flex h-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] whitespace-nowrap text-white"
            : "absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-white group-hover:flex"
        }
      >
        {confirming ? "Remover?" : <X className="h-3 w-3" />}
      </button>
    </div>
  );
}

function PhotoUploadButton({ clinicalRecordId }: { clinicalRecordId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("");

  // Não usa window.prompt() pra legenda: é bloqueante e alguns navegadores
  // embutidos (ex: webview do VS Code) simplesmente não suportam, quebrando
  // o upload inteiro. Um campo de texto normal ao lado resolve.
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("clinicalRecordId", clinicalRecordId);
    formData.append("label", label);
    const result = await uploadClinicalPhotoAction(formData);
    setUploading(false);

    if (!result.success) {
      toast.error(result.message ?? "Não foi possível enviar a foto.");
      return;
    }
    setLabel("");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-16 w-16"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Camera className="h-5 w-5" />
      </Button>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="antes/depois"
        className="h-6 w-16 px-1 text-[10px]"
      />
    </div>
  );
}
