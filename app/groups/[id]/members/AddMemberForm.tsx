"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { profileName } from "@/lib/balances";
import type { Profile } from "@/lib/types";
import Avatar from "@/components/Avatar";

export default function AddMemberForm({
  groupId,
  existingIds,
}: {
  groupId: string;
  existingIds: string[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Profile | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = email.trim().toLowerCase();
    if (!q) return;
    setBusy(true);
    setStatus(null);
    setResult(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .ilike("email", q)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setStatus("No user found with that email. They need to sign up first.");
        return;
      }
      if (existingIds.includes(data.id)) {
        setStatus("That person is already in the group.");
        return;
      }
      setResult(data as Profile);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    if (!result) return;
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase
        .from("group_members")
        .insert({ group_id: groupId, user_id: result.id });
      if (error) throw error;
      setResult(null);
      setEmail("");
      setStatus(`Added ${profileName(result)}.`);
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not add member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <p className="text-sm font-medium">Add someone by email</p>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="friend@example.com"
          className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="shrink-0 rounded-xl bg-surface-2 px-4 font-medium disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {result && (
        <div className="flex items-center gap-3 rounded-xl bg-bg p-3">
          <Avatar src={result.avatar_url} name={result.display_name} email={result.email} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{profileName(result)}</p>
            <p className="truncate text-sm text-muted">{result.email}</p>
          </div>
          <button
            onClick={handleAdd}
            disabled={busy}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {status && <p className="text-sm text-muted">{status}</p>}
    </div>
  );
}
