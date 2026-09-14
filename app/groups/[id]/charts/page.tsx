import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGroupData, findProfile } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { toCents } from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import { getCategory } from "@/lib/categories";
import BackHeader from "@/components/BackHeader";
import ChartsDateRange from "./ChartsDateRange";

export const dynamic = "force-dynamic";

export default async function ChartsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from, to } = await searchParams;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  const { group, members, expenses, settlements } = data;

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

  // Optional date range (applies to the spending charts and KPIs).
  const inRange = scoped.filter(
    (e) => (!from || e.expense_date >= from) && (!to || e.expense_date <= to),
  );

  const totalCents = inRange.reduce((s, e) => s + toCents(e.amount), 0);

  const byCategory = aggregate(inRange, (e) => e.category);
  const byPayer = aggregate(inRange, (e) => e.paid_by);
  const byMonth = aggregate(inRange, (e) => e.expense_date.slice(0, 7));

  // How much each member actually consumed (their share of the expenses).
  const byConsumer = new Map<string, number>();
  for (const e of inRange)
    for (const s of e.splits)
      byConsumer.set(s.user_id, (byConsumer.get(s.user_id) ?? 0) + toCents(s.amount_owed));

  const count = inRange.length;
  const avgCents = count ? Math.round(totalCents / count) : 0;
  const biggestCents = inRange.reduce((m, e) => Math.max(m, toCents(e.amount)), 0);

  const monthsSorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  const monthMax = Math.max(1, ...monthsSorted.map(([, v]) => v));

  // Paid vs consumed per member.
  const memberStats = members
    .map((m) => ({ m, paid: byPayer.get(m.id) ?? 0, consumed: byConsumer.get(m.id) ?? 0 }))
    .filter((s) => s.paid > 0 || s.consumed > 0)
    .sort((a, b) => b.paid + b.consumed - (a.paid + a.consumed));
  const pcMax = Math.max(1, ...memberStats.flatMap((s) => [s.paid, s.consumed]));

  // Balance over time: chronological net (paid − owed, incl. settlements),
  // scoped to the primary currency. One point per event, per member.
  const events: { t: number; deltas: [string, number][] }[] = [];
  for (const e of scoped) {
    const deltas: [string, number][] = [[e.paid_by, toCents(e.amount)]];
    for (const s of e.splits) deltas.push([s.user_id, -toCents(s.amount_owed)]);
    events.push({ t: new Date(e.expense_date).getTime(), deltas });
  }
  for (const s of settlements.filter((x) => x.currency === primary)) {
    events.push({
      t: new Date(s.paid_on).getTime(),
      deltas: [
        [s.from_user, toCents(s.amount)],
        [s.to_user, -toCents(s.amount)],
      ],
    });
  }
  events.sort((a, b) => a.t - b.t);

  const running = new Map<string, number>();
  const fullSeries: { t: number; nets: Record<string, number> }[] = [];
  if (events.length > 0) {
    fullSeries.push({ t: events[0].t, nets: Object.fromEntries(members.map((m) => [m.id, 0])) });
    for (const ev of events) {
      for (const [uid, d] of ev.deltas) running.set(uid, (running.get(uid) ?? 0) + d);
      fullSeries.push({ t: ev.t, nets: Object.fromEntries(members.map((m) => [m.id, running.get(m.id) ?? 0])) });
    }
  }

  // Window the balance line to the selected range, carrying the running net
  // from just before the window so the line starts at the correct level.
  const fromT = from ? new Date(from).getTime() : -Infinity;
  const toT = to ? new Date(to).getTime() : Infinity;
  let series = fullSeries;
  if (from || to) {
    const inWin = fullSeries.filter((p) => p.t >= fromT && p.t <= toT);
    const before = [...fullSeries].reverse().find((p) => p.t < fromT);
    series = [];
    if (before && (inWin.length === 0 || inWin[0].t > fromT)) {
      series.push({ t: Number.isFinite(fromT) ? fromT : inWin[0]?.t ?? before.t, nets: before.nets });
    }
    series.push(...inWin);
  }

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

      <div className="px-4 pt-3">
        <ChartsDateRange from={from} to={to} />
      </div>

      <div className="px-4 py-4">
        <div className="rounded-2xl bg-surface px-4 py-5 text-center">
          <p className="text-sm text-muted">Total spent{primary ? ` (${primary})` : ""}</p>
          <p className="text-3xl font-bold">{formatMoney(totalCents, primary)}</p>
          <p className="text-xs text-muted">{scoped.length} expenses</p>
          {otherCurrencies.length > 0 && (
            <p className="mt-1 text-xs text-muted">Excludes {otherCurrencies.join(", ")} expenses.</p>
          )}
        </div>

        {totalCents > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Expenses" value={String(count)} />
            <Stat label="Average" value={formatMoney(avgCents, primary)} />
            <Stat label="Biggest" value={formatMoney(biggestCents, primary)} />
          </div>
        )}
      </div>

      {totalCents === 0 ? (
        <p className="px-4 pt-10 text-center text-muted">
          {scoped.length > 0 ? "No expenses in this range." : "No expenses to chart yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-8 px-4">
          {series.length >= 2 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted">Balance over time</h2>
              <BalanceOverTime members={members} series={series} currency={primary} />
            </section>
          )}

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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Paid vs consumed</h2>
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-brand)" }} />
                  paid
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#6ea8fe" }} />
                  consumed
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {memberStats.map((s) => (
                <div key={s.m.id}>
                  <p className="mb-1 text-sm font-medium">{profileName(s.m)}</p>
                  <PcBar label="Paid" cents={s.paid} max={pcMax} color="var(--color-brand)" currency={primary} />
                  <PcBar label="Cons." cents={s.consumed} max={pcMax} color="#6ea8fe" currency={primary} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted">Last months</h2>
            <div className="flex items-end justify-between gap-2">
              {monthsSorted.map(([month, cents]) => (
                <div key={month} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-muted">
                    {formatMoney(cents, primary).replace(/[.,]00$/, "")}
                  </span>
                  <div className="flex h-28 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-brand"
                      style={{ height: `${Math.max(3, Math.round((cents / monthMax) * 100))}%` }}
                    />
                  </div>
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

function PcBar({
  label,
  cents,
  max,
  color,
  currency,
}: {
  label: string;
  cents: number;
  max: number;
  color: string;
  currency: string;
}) {
  const pct = max > 0 ? Math.max(cents > 0 ? 3 : 0, Math.round((cents / max) * 100)) : 0;
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] text-muted">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-20 shrink-0 text-right text-xs font-medium">{formatMoney(cents, currency)}</span>
    </div>
  );
}

const LINE_COLORS = ["#4fb89a", "#6ea8fe", "#e8955a", "#c58af9", "#e05a5a", "#f2c14e"];

function BalanceOverTime({
  members,
  series,
  currency,
}: {
  members: import("@/lib/types").Profile[];
  series: { t: number; nets: Record<string, number> }[];
  currency: string;
}) {
  const W = 320;
  const H = 130;
  const pad = 8;
  const ts = series.map((p) => p.t);
  const minT = Math.min(...ts);
  const maxT = Math.max(...ts);
  const drawn = members.filter((m) => series.some((p) => (p.nets[m.id] ?? 0) !== 0));
  const vals = series.flatMap((p) => drawn.map((m) => p.nets[m.id] ?? 0));
  let yMin = Math.min(0, ...vals);
  let yMax = Math.max(0, ...vals);
  if (yMin === yMax) {
    yMin -= 100;
    yMax += 100;
  }
  const spanT = maxT - minT || 1;
  const spanY = yMax - yMin || 1;
  const x = (t: number) => pad + ((t - minT) / spanT) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - yMin) / spanY) * (H - 2 * pad);
  const zeroY = y(0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet">
        <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 3" />
        {drawn.map((m, i) => (
          <polyline
            key={m.id}
            points={series.map((p) => `${x(p.t)},${y(p.nets[m.id] ?? 0)}`).join(" ")}
            fill="none"
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {drawn.map((m, i) => (
          <span key={m.id} className="flex items-center gap-1 text-xs text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
            {profileName(m)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Above the line = is owed · below = owes. Range {formatMoney(yMin, currency)} … {formatMoney(yMax, currency)}.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-2 py-3 text-center">
      <p className="truncate text-sm font-semibold">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
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
