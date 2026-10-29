"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, SplitType, ExpenseWithSplits, GroupCategory } from "@/lib/types";
import { buildCategoryList } from "@/lib/categories";
import { computeSplit, validateSplit, toCents, fromCents } from "@/lib/split";
import { profileName } from "@/lib/balances";
import { saveOptimisticExpense } from "@/lib/optimistic";
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

export interface ExpensePrefill {
  title?: string;
  amount?: string;
  category?: string;
  currency?: string;
  expenseDate?: string;
}

export default function ExpenseForm({
  groupId,
  members,
  meId,
  defaultCurrency = "EUR",
  initial,
  groupCategories = [],
  prefill,
  sourceTxId,
}: {
  groupId: string;
  members: Profile[];
  meId: string;
  defaultCurrency?: string;
  initial?: ExpenseWithSplits;
  groupCategories?: GroupCategory[];
  prefill?: ExpensePrefill;
  sourceTxId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const editing = !!initial;
  const categoryList = buildCategoryList(groupCategories);

  const [title, setTitle] = useState(initial?.title ?? prefill?.title ?? "");
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [category, setCategory] = useState(initial?.category ?? prefill?.category ?? "general");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : prefill?.amount ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? prefill?.currency ?? defaultCurrency);
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? meId);
  const [splitType, setSplitType] = useState<SplitType>(initial?.split_type ?? "equal");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(initial?.receipt_url ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [expenseDate, setExpenseDate] = useState(
    initial?.expense_date ?? prefill?.expenseDate ?? new Date().toISOString().slice(0, 10),
  );
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

      const splitInputs = results.map((r) => ({
        user_id: r.userId,
        amount_owed: fromCents(r.owedCents),
        raw_value: r.rawValue,
      }));

      // Atomic save via PostgreSQL function: inserts/updates expense and splits in a single transaction
      const { data: savedId, error: rpcErr } = await supabase.rpc("save_expense_atomic", {
        p_expense_id: editing ? initial!.id : null,
        p_group_id: groupId,
        p_title: payload.title,
        p_emoji: payload.emoji,
        p_category: payload.category,
        p_amount: payload.amount,
        p_currency: payload.currency,
        p_paid_by: payload.paid_by,
        p_split_type: payload.split_type,
        p_receipt_url: payload.receipt_url,
        p_notes: payload.notes,
        p_expense_date: payload.expense_date,
        p_splits: splitInputs,
      });

      if (rpcErr) throw rpcErr;
      const expenseId = (savedId || initial?.id) as string;

      // If this expense came from a bank transaction, tag that transaction with
      // where it landed (the original stays in the channel). RLS scopes it to me.
      if (!editing && sourceTxId) {
        await supabase
          .from("bank_transactions")
          .update({ added_group_id: groupId, added_expense_id: expenseId })
          .eq("id", sourceTxId);
      }

      // Optimistic update: store this expense so the feed displays it immediately
      const optimisticItem: ExpenseWithSplits = {
        id: expenseId!,
        group_id: groupId,
        title: payload.title,
        emoji: payload.emoji,
        category: payload.category,
        amount: payload.amount,
        currency: payload.currency,
        paid_by: payload.paid_by,
        split_type: payload.split_type,
        receipt_url: payload.receipt_url,
        notes: payload.notes,
        expense_date: payload.expense_date,
        created_by: initial?.created_by ?? meId,
        created_at: initial?.created_at ?? new Date().toISOString(),
        splits: splitInputs.map((r, idx) => ({
          id: `opt-${expenseId}-${idx}`,
          expense_id: expenseId,
          user_id: r.user_id,
          amount_owed: r.amount_owed,
          raw_value: r.raw_value ?? null,
        })),
      };
      saveOptimisticExpense(groupId, optimisticItem);

      // Notify group members via Web Push (background, non-blocking)
      const payerName = profileName(members.find((m) => m.id === paidBy));
      fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          title: editing ? `Spesa aggiornata` : `Nuova spesa: ${payload.title}`,
          body: `${payerName} ha registrato ${payload.amount} ${payload.currency} per "${payload.title}"`,
          url: `/groups/${groupId}/expenses/${expenseId}`,
        }),
      }).catch(() => {});

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
        {!editing && (
          <Link
            href={`/groups/${groupId}/expenses/scan`}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface py-3 text-sm font-medium text-brand"
          >
            <span>📷</span> Scan a receipt instead
          </Link>
        )}

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

        <CategoryPicker value={category} onChange={setCategory} categories={categoryList} />

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
