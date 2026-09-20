"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GroupBudget, GroupCategory } from "@/lib/types";
import { TOTAL_BUDGET_KEY } from "@/lib/types";
import { buildCategoryList } from "@/lib/categories";
import { toCents, fromCents } from "@/lib/split";
import BackHeader from "@/components/BackHeader";

const symbol: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export default function BudgetForm({
  groupId,
  meId,
  currency,
  groupCategories,
  initial,
}: {
  groupId: string;
  meId: string;
  currency: string;
  groupCategories: GroupCategory[];
  initial: GroupBudget[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const categories = buildCategoryList(groupCategories);

  const initialMap = new Map(initial.map((b) => [b.category, String(b.amount)]));
  const [total, setTotal] = useState(initialMap.get(TOTAL_BUDGET_KEY) ?? "");
  const [perCat, setPerCat] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((c) => [c.key, initialMap.get(c.key) ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function num(v: string) {
    return parseFloat(v.replace(",", ".")) || 0;
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const rows: {
        group_id: string;
        category: string;
        amount: number;
        currency: string;
        created_by: string;
      }[] = [];
      const push = (category: string, v: string) => {
        const cents = toCents(num(v));
        if (cents > 0)
          rows.push({ group_id: groupId, category, amount: fromCents(cents), currency, created_by: meId });
      };
      push(TOTAL_BUDGET_KEY, total);
      for (const c of categories) push(c.key, perCat[c.key] ?? "");

      // Replace the group's budgets wholesale (small dataset).
      const { error: dErr } = await supabase.from("group_budgets").delete().eq("group_id", groupId);
      if (dErr) throw dErr;
      if (rows.length > 0) {
        const { error: iErr } = await supabase.from("group_budgets").insert(rows);
        if (iErr) throw iErr;
      }
      setStatus("Saved.");
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const cur = symbol[currency] ?? currency;

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        title="Monthly budget"
        action={
          <button
            onClick={save}
            disabled={busy}
            className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5">
        <div className="rounded-2xl bg-surface p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="font-medium">Overall / month</span>
            <span className="flex items-center gap-1 rounded-xl border border-border bg-bg px-3 py-2">
              <span className="text-muted">{cur}</span>
              <input
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="w-24 bg-transparent text-right text-lg font-semibold outline-none [font-variant-numeric:tabular-nums]"
              />
            </span>
          </label>
          <p className="mt-1 text-xs text-muted">Leave empty for no overall limit.</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-muted">Per category (optional)</p>
          <ul className="flex flex-col overflow-hidden rounded-2xl bg-surface">
            {categories.map((c) => (
              <li key={c.key} className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0">
                <span className="text-xl">{c.emoji}</span>
                <span className="flex-1 truncate text-sm">{c.label}</span>
                <span className="flex items-center gap-1 rounded-lg border border-border bg-bg px-2.5 py-1.5">
                  <span className="text-xs text-muted">{cur}</span>
                  <input
                    value={perCat[c.key] ?? ""}
                    onChange={(e) => setPerCat((m) => ({ ...m, [c.key]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-16 bg-transparent text-right text-sm outline-none [font-variant-numeric:tabular-nums]"
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>

        {status && <p className="text-sm text-muted">{status}</p>}
      </div>
    </div>
  );
}
