"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { profileName } from "@/lib/balances";
import type { Profile } from "@/lib/types";

export default function PlaceholderMerge({
  groupId,
  placeholder,
  realMembers,
}: {
  groupId: string;
  placeholder: Profile;
  realMembers: Profile[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState(realMembers[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function resolveTarget(): Promise<string | null> {
    const q = email.trim().toLowerCase();
    if (q) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", q)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setStatus("No account with that email. They must sign up (and confirm) first.");
        return null;
      }
      return data.id as string;
    }
    return targetId || null;
  }

  async function merge() {
    setBusy(true);
    setStatus(null);
    try {
      const target = await resolveTarget();
      if (!target) {
        setBusy(false);
        return;
      }
      if (target === placeholder.id) throw new Error("Pick a different account.");
      if (!confirm(`Move all of "${profileName(placeholder)}"'s expenses to this account? This can't be undone.`)) {
        setBusy(false);
        return;
      }
      const { error } = await supabase.rpc("merge_placeholder", {
        gid: groupId,
        ph: placeholder.id,
        target,
      });
      if (error) throw error;
      setOpen(false);
      router.refresh();
    } catch (err) {
      setStatus(
        (err instanceof Error ? err.message : "Merge failed.") +
          " If it mentions merge_placeholder, run migration 0008 in Supabase.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand">
        Merge
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-xl bg-bg p-3">
      <p className="mb-2 text-xs text-muted">
        Merge “{profileName(placeholder)}” into a real account:
      </p>

      {realMembers.length > 0 && (
        <select
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            setEmail("");
          }}
          className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none"
        >
          {realMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {profileName(m)}
            </option>
          ))}
        </select>
      )}

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="or find by email"
        className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={merge}
          disabled={busy || (!email.trim() && !targetId)}
          className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? "Merging…" : "Merge"}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
          Cancel
        </button>
      </div>

      {status && <p className="mt-2 text-xs text-danger">{status}</p>}
    </div>
  );
}
