"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { uploadImageAction } from "@/server/actions/upload";

export function ImageUploadField({
  value,
  onChange,
  uploadEnabled,
  placeholder = "https://...",
}: {
  value: string;
  onChange: (url: string) => void;
  uploadEnabled: boolean;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadImageAction(formData);
    setUploading(false);

    if (!result.success || !result.data) {
      toast.error(result.message ?? "Não foi possível enviar a imagem.");
      return;
    }
    onChange(result.data.url);
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-12 w-12 shrink-0">
        <AvatarImage src={value || undefined} />
        <AvatarFallback>IMG</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2">
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {uploadEnabled && (
          <>
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
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              {uploading ? "Enviando..." : "Enviar imagem do computador"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
