"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, SplitType, Frequency } from "@/lib/types";
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

export default function RecurringForm({
  groupId,
  members,
  meId,
  defaultCurrency = "EUR",
}: {
  groupId: string;
  members: Profile[];
  meId: string;
  defaultCurrency?: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [category, setCategory] = useState("general");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [paidBy, setPaidBy] = useState(meId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [nextRun, setNextRun] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<SplitRowState[]>(
    members.map((m) => ({ userId: m.id, selected: true, value: "" })),
  );
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
        title="New recurring expense"
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

        <div className="flex gap-2">
          <label className="flex flex-1 items-center justify-between rounded-xl bg-surface px-4 py-3">
            <span className="text-sm text-muted">Every</span>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className="bg-transparent text-right font-medium outline-none">
              {FREQ.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 items-center justify-between rounded-xl bg-surface px-4 py-3">
            <span className="text-sm text-muted">Start</span>
            <input
              type="date"
              value={nextRun}
              onChange={(e) => setNextRun(e.target.value)}
              className="bg-transparent text-right font-medium outline-none [color-scheme:dark]"
            />
          </label>
        </div>

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
