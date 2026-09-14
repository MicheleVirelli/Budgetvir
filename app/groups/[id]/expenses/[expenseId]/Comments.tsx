"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { profileName } from "@/lib/balances";
import { timeAgo } from "@/lib/activity";
import type { ExpenseComment, Profile } from "@/lib/types";
import Avatar from "@/components/Avatar";

export default function Comments({
  expenseId,
  meId,
  members,
  initial,
}: {
  expenseId: string;
  meId: string;
  members: Profile[];
  initial: ExpenseComment[];
}) {
  const supabase = createClient();
  const [comments, setComments] = useState<ExpenseComment[]>(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const byId = (id: string) => members.find((m) => m.id === id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("expense_comments")
      .insert({ expense_id: expenseId, user_id: meId, body: text })
      .select("*")
      .single();
    setBusy(false);
    if (!error && data) {
      setComments((c) => [...c, data as ExpenseComment]);
      setBody("");
    }
  }

  return (
    <div className="px-4 py-5">
      <p className="mb-2 text-sm font-medium text-muted">Comments</p>

      <ul className="mb-3 flex flex-col gap-3">
        {comments.length === 0 && <li className="text-sm text-muted">No comments yet.</li>}
        {comments.map((c) => {
          const m = byId(c.user_id);
          return (
            <li key={c.id} className="flex gap-2">
              <Avatar src={m?.avatar_url} name={m?.display_name} email={m?.email} size={30} />
              <div className="min-w-0 flex-1 rounded-2xl bg-surface px-3 py-2">
                <p className="text-xs text-muted">
                  {profileName(m)} · {timeAgo(c.created_at)}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="shrink-0 rounded-xl bg-brand px-4 font-semibold text-black disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
