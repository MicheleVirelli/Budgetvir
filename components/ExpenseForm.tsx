"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, SplitType, ExpenseWithSplits } from "@/lib/types";
import { computeSplit, validateSplit, toCents, fromCents } from "@/lib/split";
import { profileName } from "@/lib/balances";
import BackHeader from "@/components/BackHeader";
import EmojiPicker from "@/components/EmojiPicker";
import CategoryPicker from "@/components/CategoryPicker";
import ImageUpload from "@/components/ImageUpload";
import SplitEditor, { type SplitRowState, rowsToInputs } from "@/components/SplitEditor";

const CURRENCIES = ["EUR", "USD", "GBP"];

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

export default function ExpenseForm({
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
  const editing = !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [category, setCategory] = useState(initial?.category ?? "general");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? meId);
  const [splitType, setSplitType] = useState<SplitType>(initial?.split_type ?? "equal");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(initial?.receipt_url ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [expenseDate, setExpenseDate] = useState(initial?.expense_date ?? new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<SplitRowState[]>(() => initialRows(members, initial));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = toCents(parseFloat(amount.replace(",", ".")) || 0);
  const validation = useMemo(
    () => validateSplit(splitType, totalCents, rowsToInputs(rows)),
    [splitType, totalCents, rows],
  );
  const canSubmit = title.trim().length > 0 && totalCents > 0 && validation.ok && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const results = computeSplit(splitType, totalCents, rowsToInputs(rows));
      const payload = {
        title: title.trim(),
        emoji,
        category,
        amount: fromCents(totalCents),
        currency,
        paid_by: paidBy,
        split_type: splitType,
        receipt_url: receiptUrl,
        notes: notes.trim() || null,
        expense_date: expenseDate,
      };

      let expenseId = initial?.id;
      if (editing) {
        const { error: uErr } = await supabase.from("expenses").update(payload).eq("id", initial!.id);
        if (uErr) throw uErr;
        // Replace splits.
        const { error: dErr } = await supabase.from("expense_splits").delete().eq("expense_id", initial!.id);
        if (dErr) throw dErr;
      } else {
        const { data, error: iErr } = await supabase
          .from("expenses")
          .insert({ ...payload, group_id: groupId, created_by: meId })
          .select("id")
          .single();
        if (iErr) throw iErr;
        expenseId = data.id;
      }

      const splitRows = results.map((r) => ({
        expense_id: expenseId,
        user_id: r.userId,
        amount_owed: fromCents(r.owedCents),
        raw_value: r.rawValue,
      }));
      const { error: sErr } = await supabase.from("expense_splits").insert(splitRows);
      if (sErr) throw sErr;

      router.replace(editing ? `/groups/${groupId}/expenses/${expenseId}` : `/groups/${groupId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save expense.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-dvh flex-col">
      <BackHeader
        title={editing ? "Edit expense" : "Add expense"}
        action={
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            {editing ? "Update" : "Save"}
          </button>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-4 py-4">
        <div className="flex items-center gap-3">
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What was it for?"
            autoFocus={!editing}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3.5 outline-none focus:border-brand"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-3.5 outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
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

        <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-muted">Paid by</span>
          <select
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="bg-transparent text-right font-medium outline-none"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === meId ? "You" : profileName(m)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-muted">Date</span>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="bg-transparent text-right font-medium outline-none [color-scheme:dark]"
          />
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

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything to remember?"
            className="resize-none rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
          />
        </label>

        <div>
          <p className="mb-2 text-sm font-medium text-muted">Receipt (optional)</p>
          <ImageUpload
            bucket="receipts"
            value={receiptUrl}
            onChange={setReceiptUrl}
            shape="square"
            label="Add receipt"
            size={72}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}
