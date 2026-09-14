import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGroupData, findProfile } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { toCents } from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import { getCategory } from "@/lib/categories";
import BackHeader from "@/components/BackHeader";

export const dynamic = "force-dynamic";

export default async function ChartsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  const { group, members, expenses } = data;

  // Charts are per single currency (no FX). Pick the group default if used,
  // else the most frequent currency among expenses.
  const freq = new Map<string, number>();
  for (const e of expenses) freq.set(e.currency, (freq.get(e.currency) ?? 0) + 1);
  const primary =
    (group.default_currency && freq.has(group.default_currency) && group.default_currency) ||
    [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
    group.default_currency ||
    "EUR";
  const otherCurrencies = [...freq.keys()].filter((c) => c !== primary);

  const scoped = expenses.filter((e) => e.currency === primary);
  const totalCents = scoped.reduce((s, e) => s + toCents(e.amount), 0);

  const byCategory = aggregate(scoped, (e) => e.category);
  const byPayer = aggregate(scoped, (e) => e.paid_by);
  const byMonth = aggregate(scoped, (e) => e.expense_date.slice(0, 7));

  const monthsSorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  const monthMax = Math.max(1, ...monthsSorted.map(([, v]) => v));

  return (
    <div className="flex min-h-dvh flex-col pb-10">
      <BackHeader
        title="Charts"
        action={
          <a href={`/groups/${id}/export`} className="rounded-full border border-border px-3 py-1.5 text-sm text-brand">
            Export CSV
          </a>
        }
      />

      <div className="px-4 py-4">
        <div className="rounded-2xl bg-surface px-4 py-5 text-center">
          <p className="text-sm text-muted">Total spent{primary ? ` (${primary})` : ""}</p>
          <p className="text-3xl font-bold">{formatMoney(totalCents, primary)}</p>
          <p className="text-xs text-muted">{scoped.length} expenses</p>
          {otherCurrencies.length > 0 && (
            <p className="mt-1 text-xs text-muted">Excludes {otherCurrencies.join(", ")} expenses.</p>
          )}
        </div>
      </div>

      {totalCents === 0 ? (
        <p className="px-4 pt-10 text-center text-muted">No expenses to chart yet.</p>
      ) : (
        <div className="flex flex-col gap-8 px-4">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted">By category</h2>
            <div className="flex flex-col gap-2.5">
              {[...byCategory.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([key, cents]) => {
                  const c = getCategory(key);
                  return (
                    <Bar
                      key={key}
                      label={`${c.emoji} ${c.label}`}
                      cents={cents}
                      total={totalCents}
                      currency={primary}
                    />
                  );
                })}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted">By who paid</h2>
            <div className="flex flex-col gap-2.5">
              {[...byPayer.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([uid, cents]) => (
                  <Bar
                    key={uid}
                    label={profileName(findProfile(members, uid))}
                    cents={cents}
                    total={totalCents}
                    currency={primary}
                  />
                ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted">Last months</h2>
            <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
              {monthsSorted.map(([month, cents]) => (
                <div key={month} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-muted">{formatMoney(cents, primary).replace(/\.00$/, "")}</span>
                  <div
                    className="w-full rounded-t-md bg-brand"
                    style={{ height: `${Math.max(4, (cents / monthMax) * 100)}%` }}
                  />
                  <span className="text-[10px] text-muted">{monthLabel(month)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="px-4 pt-8">
        <Link href={`/groups/${id}`} className="text-sm text-brand">
          ‹ Back to group
        </Link>
      </div>
    </div>
  );
}

function aggregate<T extends { amount: number }>(
  items: T[],
  keyOf: (t: T) => string,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(keyOf(it), (m.get(keyOf(it)) ?? 0) + toCents(it.amount));
  return m;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en", { month: "short" });
}

function Bar({
  label,
  cents,
  total,
  currency,
}: {
  label: string;
  cents: number;
  total: number;
  currency: string;
}) {
  const pct = total > 0 ? Math.round((cents / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="truncate">{label}</span>
        <span className="ml-2 shrink-0 font-medium">
          {formatMoney(cents, currency)} <span className="text-xs text-muted">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}
