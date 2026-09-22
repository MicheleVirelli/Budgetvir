import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTransactions, normalizeTransaction } from "@/lib/enablebanking";
import type { BankAccount } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // respect strict bank rate limits (as low as 4/day)
const INITIAL_WINDOW_DAYS = 90;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Pull new transactions for the user's accounts (on demand). Never overwrites a
// row already pushed to a group (insert with ignoreDuplicates).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("user_id", user.id);

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const acc of (accounts ?? []) as BankAccount[]) {
    const last = acc.last_synced_at ? new Date(acc.last_synced_at).getTime() : 0;
    if (last && Date.now() - last < COOLDOWN_MS) {
      skipped++;
      continue;
    }
    const dateFrom = acc.last_synced_at
      ? ymd(new Date(last))
      : ymd(new Date(Date.now() - INITIAL_WINDOW_DAYS * 24 * 60 * 60 * 1000));

    try {
      const raw = await getTransactions(acc.eb_account_uid, dateFrom);
      const rows = raw
        .map(normalizeTransaction)
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r) => ({
          user_id: user.id,
          account_id: acc.id,
          eb_tx_id: r.ebTxId,
          booking_date: r.bookingDate,
          amount: r.amount,
          currency: r.currency,
          direction: r.direction,
          description: r.description,
          counterparty: r.counterparty,
          status: r.status,
        }));

      if (rows.length > 0) {
        // ignoreDuplicates: existing rows (incl. ones pushed to a group) are
        // left untouched; only genuinely new rows are inserted and returned.
        const { data: inserted, error } = await supabase
          .from("bank_transactions")
          .upsert(rows, { onConflict: "user_id,eb_tx_id", ignoreDuplicates: true })
          .select("id");
        if (error) throw new Error(error.message);
        added += inserted?.length ?? 0;
      }
      await supabase
        .from("bank_accounts")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", acc.id)
        .eq("user_id", user.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "sync failed");
    }
  }

  return NextResponse.json({ ok: errors.length === 0, added, skipped, errors });
}
