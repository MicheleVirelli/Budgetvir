"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RecurringExpense } from "@/lib/types";
import { formatMoney } from "@/lib/balances";
import { expenseIcon } from "@/lib/categories";
import { toCents } from "@/lib/split";

const FREQ_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export default function RecurringList({ items }: { items: RecurringExpense[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [list, setList] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(r: RecurringExpense) {
    setBusy(r.id);
    const { error } = await supabase.from("recurring_expenses").update({ active: !r.active }).eq("id", r.id);
    setBusy(null);
    if (!error) {
      setList((l) => l.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
      router.refresh();
    }
  }

  async function remove(r: RecurringExpense) {
    if (!confirm(`Delete recurring "${r.title}"?`)) return;
    setBusy(r.id);
    const { error } = await supabase.from("recurring_expenses").delete().eq("id", r.id);
    setBusy(null);
    if (!error) {
      setList((l) => l.filter((x) => x.id !== r.id));
      router.refresh();
    }
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 pt-16 text-center">
        <div className="text-4xl">🔁</div>
        <p className="text-muted">No recurring expenses yet.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 px-4 py-3">
      {list.map((r) => (
        <li key={r.id} className={`flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 ${r.active ? "" : "opacity-50"}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-xl">
            {expenseIcon(r.emoji, r.category)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.title}</p>
            <p className="text-sm text-muted">
              {formatMoney(toCents(r.amount), r.currency)} · {FREQ_LABEL[r.frequency]} · next {r.next_run}
            </p>
          </div>
          <button onClick={() => toggle(r)} disabled={busy === r.id} className="text-xs text-brand">
            {r.active ? "Pause" : "Resume"}
          </button>
          <button onClick={() => remove(r)} disabled={busy === r.id} aria-label="Delete" className="text-danger">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
