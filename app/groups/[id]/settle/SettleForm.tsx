"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { profileName } from "@/lib/balances";
import BackHeader from "@/components/BackHeader";

const CURRENCIES = ["EUR", "USD", "GBP"];

export default function SettleForm({
  groupId,
  members,
  meId,
  prefill,
}: {
  groupId: string;
  members: Profile[];
  meId: string;
  prefill: { from?: string; to?: string; amount?: string; currency?: string };
}) {
  const router = useRouter();
  const supabase = createClient();

  const [fromUser, setFromUser] = useState(prefill.from || meId);
  const [toUser, setToUser] = useState(
    prefill.to || members.find((m) => m.id !== meId)?.id || meId,
  );
  const [amount, setAmount] = useState(prefill.amount || "");
  const [currency, setCurrency] = useState(prefill.currency || "EUR");
  const [note, setNote] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round((parseFloat(amount.replace(",", ".")) || 0) * 100);
  const canSubmit = amountCents > 0 && fromUser !== toUser && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.from("settlements").insert({
      group_id: groupId,
      from_user: fromUser,
      to_user: toUser,
      amount: amountCents / 100,
      currency,
      note: note.trim() || null,
      paid_on: paidOn,
      created_by: meId,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.replace(`/groups/${groupId}/balances`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex min-h-dvh flex-col">
      <BackHeader
        title="Record a payment"
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

      <div className="flex flex-1 flex-col gap-4 px-4 py-5">
        <div className="flex items-center gap-2">
          <UserSelect label="From" value={fromUser} onChange={setFromUser} members={members} meId={meId} />
          <div className="pt-6 text-muted">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
          <UserSelect label="To" value={toUser} onChange={setToUser} members={members} meId={meId} />
        </div>

        {fromUser === toUser && <p className="text-sm text-danger">Pick two different people.</p>}

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
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3.5 text-xl font-semibold outline-none focus:border-brand"
          />
        </div>

        <label className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
          <span className="text-sm text-muted">Date</span>
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className="bg-transparent text-right font-medium outline-none [color-scheme:dark]"
          />
        </label>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"
        />

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}

function UserSelect({
  label,
  value,
  onChange,
  members,
  meId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  members: Profile[];
  meId: string;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface px-3 py-3 outline-none"
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id === meId ? "You" : profileName(m)}
          </option>
        ))}
      </select>
    </label>
  );
}
