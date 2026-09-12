"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, SplitType } from "@/lib/types";
import {
  computeSplit,
  validateSplit,
  toCents,
  fromCents,
} from "@/lib/split";
import { profileName } from "@/lib/balances";
import BackHeader from "@/components/BackHeader";
import EmojiPicker from "@/components/EmojiPicker";
import ImageUpload from "@/components/ImageUpload";
import SplitEditor, {
  type SplitRowState,
  rowsToInputs,
} from "@/components/SplitEditor";

const CURRENCIES = ["EUR", "USD", "GBP"];

export default function ExpenseForm({
  groupId,
  members,
  meId,
}: {
  groupId: string;
  members: Profile[];
  meId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [paidBy, setPaidBy] = useState(meId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
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

  const canSubmit =
    title.trim().length > 0 && totalCents > 0 && validation.ok && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const results = computeSplit(splitType, totalCents, rowsToInputs(rows));

      const { data: expense, error: eErr } = await supabase
        .from("expenses")
        .insert({
          group_id: groupId,
          title: title.trim(),
          emoji,
          amount: fromCents(totalCents),
          currency,
          paid_by: paidBy,
          split_type: splitType,
          receipt_url: receiptUrl,
          created_by: meId,
        })
        .select("id")
        .single();
      if (eErr) throw eErr;

      const splitRows = results.map((r) => ({
        expense_id: expense.id,
        user_id: r.userId,
        amount_owed: fromCents(r.owedCents),
        raw_value: r.rawValue,
      }));
      const { error: sErr } = await supabase
        .from("expense_splits")
        .insert(splitRows);
      if (sErr) throw sErr;

      router.replace(`/groups/${groupId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save expense.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-dvh flex-col">
      <BackHeader
        title="Add expense"
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
        {/* Title + emoji */}
        <div className="flex items-center gap-3">
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What was it for?"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3.5 outline-none focus:border-brand"
          />
        </div>

        {/* Amount */}
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

        {/* Paid by */}
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

        {/* Split */}
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

        {/* Receipt */}
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
