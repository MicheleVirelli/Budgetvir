"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import BackHeader from "@/components/BackHeader";
import ImageUpload from "@/components/ImageUpload";

const CURRENCIES = ["EUR", "USD", "GBP"];

export default function GroupSettings({
  group,
  meId,
  memberCount,
}: {
  group: Group;
  meId: string;
  memberCount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const isOwner = group.created_by === meId;

  const [name, setName] = useState(group.name);
  const [imageUrl, setImageUrl] = useState<string | null>(group.image_url);
  const [currency, setCurrency] = useState(group.default_currency ?? "EUR");
  const [simplify, setSimplify] = useState(!!group.simplify_debts);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const inviteLink =
    typeof window !== "undefined" ? `${window.location.origin}/join/${group.invite_token}` : "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { error } = await supabase
      .from("groups")
      .update({
        name: name.trim() || group.name,
        image_url: imageUrl,
        default_currency: currency,
        simplify_debts: simplify,
        updated_at: new Date().toISOString(),
      })
      .eq("id", group.id);
    setBusy(false);
    setStatus(error ? error.message : "Saved.");
    if (!error) router.refresh();
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus("Copy failed — long-press the link to copy.");
    }
  }

  async function leaveGroup() {
    if (!confirm("Leave this group?")) return;
    setBusy(true);
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", group.id)
      .eq("user_id", meId);
    if (error) {
      setStatus(error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function deleteGroup() {
    if (!confirm("Delete this group and ALL its expenses? This cannot be undone.")) return;
    setBusy(true);
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    if (error) {
      setStatus(error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Group settings" />

      <form onSubmit={save} className="flex flex-col gap-5 px-4 py-5">
        <div className="flex justify-center">
          <ImageUpload bucket="avatars" value={imageUrl} onChange={setImageUrl} shape="square" label="Group photo" size={96} />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Group name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
          />
        </label>

        <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-muted">Default currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="bg-transparent text-right font-medium outline-none">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setSimplify((s) => !s)}
          className="flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-left"
        >
          <span>
            <span className="block font-medium">Simplify debts</span>
            <span className="block text-xs text-muted">Combine debts into fewer payments</span>
          </span>
          <span className={`relative h-6 w-11 rounded-full transition ${simplify ? "bg-brand" : "bg-surface-2"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${simplify ? "left-[22px]" : "left-0.5"}`} />
          </span>
        </button>

        {status && <p className="text-sm text-muted">{status}</p>}

        <button type="submit" disabled={busy} className="rounded-full bg-brand py-3 font-semibold text-black disabled:opacity-60">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="px-4 pb-6">
        <p className="mb-2 text-sm font-medium text-muted">Invite people</p>
        <div className="flex items-center gap-2 rounded-xl bg-surface p-2">
          <span className="min-w-0 flex-1 truncate px-2 text-sm text-muted">{inviteLink}</span>
          <button onClick={copyInvite} className="shrink-0 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium">
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted">Anyone with this link and an account can join the group.</p>

        <Link href={`/groups/${group.id}/members`} className="mt-4 flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="font-medium">Members</span>
          <span className="text-muted">{memberCount} ›</span>
        </Link>

        <p className="mb-2 mt-6 text-sm font-medium text-muted">Data</p>
        <div className="flex flex-col overflow-hidden rounded-xl bg-surface">
          <Link href={`/groups/${group.id}/import`} className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <span className="flex items-center gap-2 font-medium">📥 Import from Splitwise</span>
            <span className="text-muted">›</span>
          </Link>
          <a href={`/groups/${group.id}/export`} className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 font-medium">📤 Export to CSV</span>
            <span className="text-muted">›</span>
          </a>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 px-4 pb-10">
        <button onClick={leaveGroup} disabled={busy} className="rounded-full border border-border py-3 font-medium text-negative">
          Leave group
        </button>
        {isOwner && (
          <button onClick={deleteGroup} disabled={busy} className="rounded-full border border-danger/40 py-3 font-medium text-danger">
            Delete group
          </button>
        )}
      </div>
    </div>
  );
}
