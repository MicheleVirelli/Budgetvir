"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  bucket: "avatars" | "receipts";
  value: string | null;
  onChange: (url: string | null) => void;
  shape?: "circle" | "square";
  label?: string;
  size?: number;
}

export default function ImageUpload({
  bucket,
  value,
  onChange,
  shape = "circle",
  label = "Add photo",
  size = 80,
}: Props) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const rounded = shape === "circle" ? "rounded-full" : "rounded-2xl";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{ width: size, height: size }}
        className={`relative flex items-center justify-center overflow-hidden border border-dashed border-border bg-surface text-muted ${rounded}`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="upload" className="h-full w-full object-cover" />
        ) : (
          <CameraIcon />
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">
            …
          </span>
        )}
      </button>

      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-brand"
        >
          {value ? "Change" : label}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-muted">
            Remove
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
