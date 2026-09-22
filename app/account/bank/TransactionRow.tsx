"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/balances";
import type { BankTransaction } from "@/lib/types";

interface GroupRow {
  id: string;
  name: string;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

function formatDate(date: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : DATE_FMT.format(d);
}

export default function TransactionRow({
  tx,
  groups,
  addedGroupName,
}: {
  tx: BankTransaction;
  groups: GroupRow[];
  addedGroupName: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const cents = Math.round(Number(tx.amount) * 100);
  const signed = `${tx.direction === "credit" ? "+" : "−"}${formatMoney(cents, tx.currency)}`;
  const added = !!tx.added_group_id;

  async function dismiss() {
    setBusy(true);
    await supabase.from("bank_transactions").update({ dismissed: true }).eq("id", tx.id);
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{tx.description || tx.counterparty || "Payment"}</p>
          <p className="text-xs text-muted">
            {formatDate(tx.booking_date)}
            {tx.status === "pending" && " · pending"}
          </p>
        </div>
        <span
          className={`shrink-0 font-semibold ${tx.direction === "credit" ? "text-positive" : ""}`}
        >
          {signed}
        </span>
      </div>

      {added ? (
        <div className="mt-2 flex items-center justify-between">
          <Link
            href={`/groups/${tx.added_group_id}/expenses/${tx.added_expense_id}`}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-brand"
          >
            ✓ Added to «{addedGroupName}»
          </Link>
        </div>
      ) : (
        <div className="mt-2">
          {!picking ? (
            <div className="flex items-center gap-3">
              <button onClick={() => setPicking(true)} className="text-xs font-medium text-brand">
                ＋ Add to group
              </button>
              <button onClick={dismiss} disabled={busy} className="text-xs text-muted">
                Dismiss
              </button>
            </div>
          ) : groups.length === 0 ? (
            <p className="text-xs text-muted">
              No groups yet.{" "}
              <button onClick={() => setPicking(false)} className="text-brand">
                Cancel
              </button>
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Add to which group?</span>
                <button onClick={() => setPicking(false)} className="text-xs text-muted">
                  Cancel
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => router.push(`/groups/${g.id}/expenses/new?tx=${tx.id}`)}
                    className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium active:bg-border"
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
