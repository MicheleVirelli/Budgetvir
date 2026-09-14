"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, SplitType, Frequency, ExpenseWithSplits } from "@/lib/types";
import { computeSplit, validateSplit, toCents, fromCents } from "@/lib/split";
import { profileName } from "@/lib/balances";
import BackHeader from "@/components/BackHeader";
import EmojiPicker from "@/components/EmojiPicker";
import CategoryPicker from "@/components/CategoryPicker";
import SplitEditor, { type SplitRowState, rowsToInputs } from "@/components/SplitEditor";

const CURRENCIES = ["EUR", "USD", "GBP"];
const FREQ: { key: Frequency; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

const UNIT: Record<Frequency, [string, string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
};

function intervalUnit(freq: Frequency, countStr: string): string {
  const n = Math.max(1, parseInt(countStr, 10) || 1);
  const [one, many] = UNIT[freq];
  return n === 1 ? one : many;
}

function initialRows(members: Profile[], initial?: ExpenseWithSplits): SplitRowState[] {
  return members.map((m) => {
    const split = initial?.splits.find((s) => s.user_id === m.id);
    if (!initial) return { userId: m.id, selected: true, value: "" };
    let value = "";
    if (split) {
      if (initial.split_type === "amount") value = String(split.amount_owed);
      else if (initial.split_type !== "equal") value = split.raw_value != null ? String(split.raw_value) : "";
    }
    return { userId: m.id, selected: !!split, value };
  });
}

export default function RecurringForm({
  groupId,
  members,
  meId,
  defaultCurrency = "EUR",
  initial,
}: {
  groupId: string;
  members: Profile[];
  meId: string;
  defaultCurrency?: string;
  initial?: ExpenseWithSplits;
}) {
  const router = useRouter();
  const supabase = createClient();

  // When starting from an existing expense, default the first occurrence to the
  // 1st of next month so we don't immediately duplicate that expense.
  const defaultNext = initial
    ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [category, setCategory] = useState(initial?.category ?? "general");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? meId);
  const [splitType, setSplitType] = useState<SplitType>(initial?.split_type ?? "equal");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [intervalCount, setIntervalCount] = useState("1");
  const [nextRun, setNextRun] = useState(defaultNext);
  const [rows, setRows] = useState<SplitRowState[]>(() => initialRows(members, initial));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = toCents(parseFloat(amount.replace(",", ".")) || 0);
  const validation = useMemo(
    () => validateSplit(splitType, totalCents, rowsToInputs(rows)),
    [splitType, totalCents, rows],
  );
  const canSubmit = title.trim().length > 0 && totalCents > 0 && validation.ok && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const results = computeSplit(splitType, totalCents, rowsToInputs(rows));
    const split_config = results.map((r) => ({
      user_id: r.userId,
      amount_owed: fromCents(r.owedCents),
      raw_value: r.rawValue,
    }));

    const { error } = await supabase.from("recurring_expenses").insert({
      group_id: groupId,
      title: title.trim(),
      emoji,
      category,
      amount: fromCents(totalCents),
      currency,
      paid_by: paidBy,
      split_type: splitType,
      split_config,
      frequency,
      interval_count: Math.max(1, parseInt(intervalCount, 10) || 1),
      next_run: nextRun,
      created_by: meId,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.replace(`/groups/${groupId}/recurring`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex min-h-dvh flex-col">
      <BackHeader
        title={initial ? "Make recurring" : "New recurring expense"}
        action={
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            Save
          </button>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-4 py-4">
        <div className="flex items-center gap-3">
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Rent, Netflix"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3.5 outline-none focus:border-brand"
          />
        </div>

        <div className="flex items-center gap-2">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-xl border border-border bg-surface px-3 py-3.5 outline-none">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3.5 text-xl font-semibold outline-none focus:border-brand"
          />
        </div>

        <CategoryPicker value={category} onChange={setCategory} />

        <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-muted">Every</span>
          <input
            value={intervalCount}
            onChange={(e) => setIntervalCount(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            className="w-12 rounded-lg border border-border bg-bg px-2 py-1.5 text-center outline-none focus:border-brand"
          />
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className="flex-1 bg-transparent text-right font-medium outline-none">
            {FREQ.map((f) => (
              <option key={f.key} value={f.key}>
                {intervalUnit(f.key, intervalCount)}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-muted">Starting</span>
          <input
            type="date"
            value={nextRun}
            onChange={(e) => setNextRun(e.target.value)}
            className="bg-transparent text-right font-medium outline-none [color-scheme:dark]"
          />
        </label>

        <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-muted">Paid by</span>
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="bg-transparent text-right font-medium outline-none">
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.id === meId ? "You" : profileName(m)}</option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-2 text-sm font-medium text-muted">How to split</p>
          <SplitEditor
            type={splitType}
            onTypeChange={setSplitType}
            members={members}
            rows={rows}
            setRows={setRows}
            totalCents={totalCents}
            currency={currency}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}
