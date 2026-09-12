"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import ImageUpload from "@/components/ImageUpload";

export default function AccountForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Saved.");
    router.refresh();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 pt-2">
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="flex justify-center">
          <ImageUpload
            bucket="avatars"
            value={avatarUrl}
            onChange={setAvatarUrl}
            shape="circle"
            label="Add photo"
            size={96}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Email</span>
          <input
            value={profile.email}
            disabled
            className="rounded-xl border border-border bg-surface px-4 py-3 text-muted"
          />
        </label>

        {status && <p className="text-sm text-muted">{status}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-brand py-3 font-semibold text-black disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <button
        onClick={handleSignOut}
        className="rounded-full border border-border py-3 font-medium text-danger"
      >
        Sign out
      </button>
    </div>
  );
}
