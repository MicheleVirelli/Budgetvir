"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GroupCategory } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import BackHeader from "@/components/BackHeader";

export default function CategoryManager({
  groupId,
  meId,
  initial,
}: {
  groupId: string;
  meId: string;
  initial: GroupCategory[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [list, setList] = useState<GroupCategory[]>(initial);
  const [emoji, setEmoji] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const em = emoji.trim();
    const lb = label.trim();
    if (!em || !lb) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("group_categories")
      .insert({ group_id: groupId, emoji: em, label: lb, created_by: meId })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setList((l) => [...l, data as GroupCategory]);
    setEmoji("");
    setLabel("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this category? Existing expenses will fall back to General.")) return;
    setBusy(true);
    const { error } = await supabase.from("group_categories").delete().eq("id", id);
    setBusy(false);
    if (!error) {
      setList((l) => l.filter((c) => c.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Categories" />

      <div className="flex flex-col gap-5 px-4 py-5">
        <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
          <p className="text-sm font-medium">Add a category</p>
          <div className="flex gap-2">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🍔"
              maxLength={8}
              className="w-16 rounded-xl border border-border bg-bg px-3 py-2.5 text-center text-xl outline-none focus:border-brand"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name (e.g. Date night)"
              maxLength={40}
              className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={busy || !emoji.trim() || !label.trim()}
              className="shrink-0 rounded-xl bg-brand px-4 font-semibold text-black disabled:opacity-50"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-muted">Tip: use your phone&apos;s emoji keyboard for the icon.</p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>

        <div>
          <p className="mb-2 text-sm font-medium text-muted">Custom categories</p>
          {list.length === 0 ? (
            <p className="text-sm text-muted">None yet — add one above.</p>
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-2xl bg-surface">
              {list.map((c) => (
                <li key={c.id} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
                  <span className="text-xl">{c.emoji}</span>
                  <span className="flex-1 truncate">{c.label}</span>
                  <button onClick={() => remove(c.id)} disabled={busy} aria-label="Delete" className="text-danger">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-muted">Built-in categories</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <span key={c.key} className="rounded-full bg-surface px-3 py-1.5 text-sm text-muted">
                {c.emoji} {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
