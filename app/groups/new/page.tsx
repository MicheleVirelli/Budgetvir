"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BackHeader from "@/components/BackHeader";
import ImageUpload from "@/components/ImageUpload";

export default function NewGroupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      // Generate the id client-side so we don't depend on reading the row back
      // (the SELECT policy needs membership, which we add in the next step).
      const groupId = crypto.randomUUID();

      const { error: gErr } = await supabase
        .from("groups")
        .insert({ id: groupId, name: name.trim(), image_url: imageUrl, created_by: user.id });
      if (gErr) throw gErr;

      const { error: mErr } = await supabase
        .from("group_members")
        .insert({ group_id: groupId, user_id: user.id });
      if (mErr) throw mErr;

      router.replace(`/groups/${groupId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="New group" />
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 px-5 py-6">
        <div className="flex justify-center">
          <ImageUpload
            bucket="avatars"
            value={imageUrl}
            onChange={setImageUrl}
            shape="square"
            label="Group photo (optional)"
            size={96}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Group name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Trip to Portugal"
            autoFocus
            className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="mt-auto rounded-full bg-brand py-3 font-semibold text-black disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create group"}
        </button>
      </form>
    </div>
  );
}
