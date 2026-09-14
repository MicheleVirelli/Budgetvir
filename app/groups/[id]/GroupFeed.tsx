"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseWithSplits, Profile, GroupCategory } from "@/lib/types";
import { toCents } from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import { buildCategoryList, expenseIcon } from "@/lib/categories";

const PAGE = 20;

export default function GroupFeed({
  groupId,
  expenses,
  members,
  meId,
  groupCategories = [],
}: {
  groupId: string;
  expenses: ExpenseWithSplits[];
  members: Profile[];
  meId: string;
  groupCategories?: GroupCategory[];
}) {
  const allCategories = buildCategoryList(groupCategories);
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // Materialise any due recurring expenses once when the group opens.
  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("generate_due_recurring", { gid: groupId })
      .then(({ data }) => {
        if (!cancelled && typeof data === "number" && data > 0) router.refresh();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (cat && e.category !== cat) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, query, cat]);

  const shown = filtered.slice(0, limit);
  const usedCategories = useMemo(() => {
    const set = new Set(expenses.map((e) => e.category));
    return allCategories.filter((c) => set.has(c.key));
  }, [expenses, allCategories]);

  return (
    <div className="px-4">
      {/* Search + filters */}
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search expenses"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {usedCategories.length > 1 && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          <FilterChip active={cat === null} onClick={() => setCat(null)}>
            All
          </FilterChip>
          {usedCategories.map((c) => (
            <FilterChip key={c.key} active={cat === c.key} onClick={() => setCat(cat === c.key ? null : c.key)}>
              {c.emoji} {c.label}
            </FilterChip>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 pt-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-3xl">🧾</div>
          <p className="text-muted">{expenses.length === 0 ? "No expenses yet." : "No matches."}</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {shown.map((exp) => (
            <ExpenseRow key={exp.id} exp={exp} meId={meId} members={members} categories={groupCategories} />
          ))}
        </ul>
      )}

      {filtered.length > limit && (
        <button
          onClick={() => setLimit((l) => l + PAGE)}
          className="mx-auto my-4 block rounded-full border border-border px-5 py-2 text-sm font-medium text-muted"
        >
          Load more ({filtered.length - limit})
        </button>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? "bg-brand text-black" : "bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function ExpenseRow({
  exp,
  meId,
  members,
  categories,
}: {
  exp: ExpenseWithSplits;
  meId: string;
  members: Profile[];
  categories: GroupCategory[];
}) {
  const payer = members.find((m) => m.id === exp.paid_by);
  const myShare = exp.splits.find((s) => s.user_id === meId);
  const iPaid = exp.paid_by === meId;

  let relation: { label: string; cents: number; positive: boolean } | null = null;
  if (iPaid) {
    const lent = toCents(exp.amount) - (myShare ? toCents(myShare.amount_owed) : 0);
    if (lent > 0) relation = { label: "you lent", cents: lent, positive: true };
  } else if (myShare) {
    relation = { label: "you borrowed", cents: toCents(myShare.amount_owed), positive: false };
  }

  const date = new Date(exp.expense_date);

  return (
    <li>
      <Link
        href={`/groups/${exp.group_id}/expenses/${exp.id}`}
        className="flex items-center gap-3 border-b border-border/60 py-3 active:bg-surface"
      >
        <div className="flex w-9 flex-col items-center">
          <span className="text-[11px] uppercase text-muted">{date.toLocaleString("en", { month: "short" })}</span>
          <span className="text-lg font-semibold leading-none">{date.getDate()}</span>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-xl">
          {expenseIcon(exp.emoji, exp.category, categories)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{exp.title}</p>
          <p className="truncate text-sm text-muted">
            {profileName(payer)} paid {formatMoney(toCents(exp.amount), exp.currency)}
          </p>
        </div>
        {relation && (
          <div className="text-right">
            <p className={`text-xs ${relation.positive ? "text-positive" : "text-negative"}`}>{relation.label}</p>
            <p className={`font-semibold ${relation.positive ? "text-positive" : "text-negative"}`}>
              {formatMoney(relation.cents, exp.currency)}
            </p>
          </div>
        )}
      </Link>
    </li>
  );
}
