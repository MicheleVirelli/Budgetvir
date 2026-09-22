import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGroupData, findProfile } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { toCents } from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import { resolveCategory } from "@/lib/categories";
import { TOTAL_BUDGET_KEY, type GroupCategory } from "@/lib/types";
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

  const { group, members, expenses, settlements, categories, budgets } = data;

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

  // Category slices (shared by the donut and the legend bars) and the monthly
  // spending trend (last 12 months) for the two new charts.
  const catEntries = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const trendMonths = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);

  // Budgets (current calendar month, independent of the range filter).
  const budgetMap = new Map(budgets.map((b) => [b.category, toCents(b.amount)]));
  const totalBudget = budgetMap.get(TOTAL_BUDGET_KEY) ?? 0;
  const hasBudget = budgets.length > 0;

  const nowMonth = new Date().toISOString().slice(0, 7);
  const monthExpenses = scoped.filter((e) => e.expense_date.slice(0, 7) === nowMonth);
  const monthSpent = monthExpenses.reduce((s, e) => s + toCents(e.amount), 0);
  const monthByCat = new Map<string, number>();
  for (const e of monthExpenses) monthByCat.set(e.category, (monthByCat.get(e.category) ?? 0) + toCents(e.amount));
  const catBudgets = [...budgetMap.entries()]
    .filter(([k, v]) => k !== TOTAL_BUDGET_KEY && v > 0)
    .map(([k, v]) => ({ key: k, budget: v, spent: monthByCat.get(k) ?? 0 }))
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  const monthLabelLong = new Date(nowMonth + "-01").toLocaleString("en", { month: "long", year: "numeric" });

  // "Last months" chart also carries the budget line (max includes the budget).
  const monthMax = Math.max(1, totalBudget, ...monthsSorted.map(([, v]) => v));

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

      <div className="px-4 pb-2">
        <BudgetThisMonth
          groupId={id}
          monthLabel={monthLabelLong}
          totalBudget={totalBudget}
          monthSpent={monthSpent}
          catBudgets={catBudgets}
          categories={categories}
          hasBudget={hasBudget}
          currency={primary}
        />
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
            <CategoryDonut
              slices={catEntries.map(([key, cents], i) => {
                const c = resolveCategory(key, categories);
                return { emoji: c.emoji, label: c.label, cents, color: catColor(i) };
              })}
              total={totalCents}
              currency={primary}
            />
            <div className="mt-4 flex flex-col gap-2.5">
              {catEntries.map(([key, cents], i) => {
                const c = resolveCategory(key, categories);
                return (
                  <Bar
                    key={key}
                    label={`${c.emoji} ${c.label}`}
                    cents={cents}
                    total={totalCents}
                    currency={primary}
                    color={catColor(i)}
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Spending trend</h2>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "#d7d8dc" }} />
                average
              </span>
            </div>
            {trendMonths.length >= 2 ? (
              <SpendTrend months={trendMonths} currency={primary} />
            ) : (
              <p className="text-sm text-muted">Not enough months yet to show a trend.</p>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Last months</h2>
              {totalBudget > 0 && (
                <span className="flex items-center gap-3 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />entro</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-negative" />oltre</span>
                </span>
              )}
            </div>
            <MonthsBudgetChart months={monthsSorted} budget={totalBudget} max={monthMax} currency={primary} />
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

// Categorical palette for the donut + its legend bars (brand teal first, then a
// spread of distinct hues that read on the dark surface).
const CATEGORY_COLORS = [
  "#4fb89a", "#6ea8fe", "#e8955a", "#c58af9", "#e05a5a",
  "#f2c14e", "#5bc4a8", "#8b93ff", "#ef7fb4", "#9bd35a",
];

function catColor(i: number): string {
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

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

function BudgetThisMonth({
  groupId,
  monthLabel,
  totalBudget,
  monthSpent,
  catBudgets,
  categories,
  hasBudget,
  currency,
}: {
  groupId: string;
  monthLabel: string;
  totalBudget: number;
  monthSpent: number;
  catBudgets: { key: string; budget: number; spent: number }[];
  categories: GroupCategory[];
  hasBudget: boolean;
  currency: string;
}) {
  if (!hasBudget) {
    return (
      <Link href={`/groups/${groupId}/budget`} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5">
        <span className="flex items-center gap-2 text-sm">
          <span>🎯</span> Set a monthly budget
        </span>
        <span className="text-muted">›</span>
      </Link>
    );
  }

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Budget · {monthLabel}</h2>
        <Link href={`/groups/${groupId}/budget`} className="text-xs text-brand">
          Edit
        </Link>
      </div>

      {totalBudget > 0 && (
        <div className="mb-3">
          <BudgetBar label={<span className="font-medium">Overall</span>} spent={monthSpent} budget={totalBudget} currency={currency} />
        </div>
      )}

      {catBudgets.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {catBudgets.map((c) => {
            const cat = resolveCategory(c.key, categories);
            return (
              <BudgetBar
                key={c.key}
                label={<span>{cat.emoji} {cat.label}</span>}
                spent={c.spent}
                budget={c.budget}
                currency={currency}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function BudgetBar({
  label,
  spent,
  budget,
  currency,
}: {
  label: React.ReactNode;
  spent: number;
  budget: number;
  currency: string;
}) {
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const over = spent > budget;
  const diff = Math.abs(budget - spent);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="truncate">{label}</span>
        <span className="ml-2 shrink-0 text-xs [font-variant-numeric:tabular-nums]">
          <span className="font-medium">{formatMoney(spent, currency)}</span>
          <span className="text-muted"> / {formatMoney(budget, currency)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${over ? "bg-negative" : "bg-brand"}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className={`mt-0.5 text-[11px] ${over ? "text-negative" : "text-muted"}`}>
        {over ? `Over by ${formatMoney(diff, currency)}` : `${formatMoney(diff, currency)} left`}
      </p>
    </div>
  );
}

function MonthsBudgetChart({
  months,
  budget,
  max,
  currency,
}: {
  months: [string, number][];
  budget: number;
  max: number;
  currency: string;
}) {
  const W = 340;
  const H = 176;
  const padL = 10;
  const padR = 10;
  const padTop = 26;
  const padBottom = 22;
  const x0 = padL;
  const x1 = W - padR;
  const y0 = padTop;
  const y1 = H - padBottom;
  const plotW = x1 - x0;
  const plotH = y1 - y0;
  const sy = (v: number) => y1 - (v / max) * plotH;
  const n = Math.max(1, months.length);
  const slot = plotW / n;
  const bw = Math.min(34, slot * 0.56);
  const budgetY = sy(budget);
  const money0 = (c: number) => formatMoney(c, currency).replace(/[.,]00$/, "");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet">
      <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="var(--color-border)" strokeWidth="1" />

      {months.map(([ym, cents], i) => {
        const cx = x0 + slot * (i + 0.5);
        const bx = cx - bw / 2;
        const topY = sy(cents);
        const over = budget > 0 && cents > budget;
        return (
          <g key={ym}>
            {over ? (
              <>
                <rect x={bx} y={budgetY} width={bw} height={y1 - budgetY} rx="4" fill="var(--color-brand)" />
                <rect x={bx} y={topY} width={bw} height={Math.max(2, budgetY - 2 - topY)} rx="4" fill="var(--color-negative)" />
              </>
            ) : (
              <rect x={bx} y={topY} width={bw} height={y1 - topY} rx="4" fill="var(--color-brand)" />
            )}
            <text x={cx} y={topY - 6} textAnchor="middle" fontSize="10" fill={over ? "var(--color-negative)" : "var(--color-text)"} fontWeight={over ? 700 : 500}>
              {money0(cents)}
            </text>
            <text x={cx} y={y1 + 14} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
              {monthLabel(ym)}
            </text>
          </g>
        );
      })}

      {budget > 0 && (
        <>
          <line x1={x0} y1={budgetY} x2={x1 - 46} y2={budgetY} stroke="#d7d8dc" strokeWidth="2" strokeDasharray="5 4" opacity="0.85" />
          <rect x={x1 - 44} y={budgetY - 8} width="44" height="16" rx="8" fill="var(--color-bg)" stroke="var(--color-border)" />
          <text x={x1 - 22} y={budgetY + 3.5} textAnchor="middle" fontSize="9.5" fill="#d7d8dc" fontWeight="600">
            {money0(budget)}
          </text>
        </>
      )}
    </svg>
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
  color,
}: {
  label: string;
  cents: number;
  total: number;
  currency: string;
  color?: string;
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
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, pct)}%`, background: color ?? "var(--color-brand)" }}
        />
      </div>
    </div>
  );
}

// Donut of total spending by category. Slices are dash segments of one ring,
// starting at 12 o'clock; each slice ≥ 5% is labelled with its emoji + % just
// outside the ring, and the centre shows the total.
function CategoryDonut({
  slices,
  total,
  currency,
}: {
  slices: { emoji: string; label: string; cents: number; color: string }[];
  total: number;
  currency: string;
}) {
  const CX = 100;
  const CY = 90;
  const R = 46;
  const SW = 15;
  const RL = R + 18; // label radius
  const C = 2 * Math.PI * R;
  const centerMoney = formatMoney(total, currency).replace(/[.,]00$/, "");
  let acc = 0; // cumulative fraction

  return (
    <div className="flex items-center justify-center py-1">
      <svg viewBox="0 0 200 180" width="100%" style={{ maxWidth: 260 }} role="img" aria-label="Spending by category">
        <g transform={`rotate(-90 ${CX} ${CY})`}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth={SW} />
          {slices.map((s, i) => {
            const frac = total > 0 ? s.cents / total : 0;
            const dash = frac * C;
            const offset = -acc * C;
            acc += frac;
            if (dash <= 0) return null;
            return (
              <circle
                key={i}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={SW}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </g>

        {/* Labels around the ring (skip tiny slices to avoid collisions). */}
        {(() => {
          let cum = 0;
          return slices.map((s, i) => {
            const frac = total > 0 ? s.cents / total : 0;
            const mid = cum + frac / 2;
            cum += frac;
            const pct = Math.round(frac * 100);
            if (pct < 5) return null;
            const theta = mid * 2 * Math.PI; // 0 at top, clockwise
            const lx = CX + RL * Math.sin(theta);
            const ly = CY - RL * Math.cos(theta);
            const anchor = lx < CX - 2 ? "end" : lx > CX + 2 ? "start" : "middle";
            return (
              <text
                key={i}
                x={lx}
                y={ly}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize="9"
                fill="var(--color-muted)"
              >
                {s.emoji} {pct}%
              </text>
            );
          });
        })()}

        <text x={CX} y={CY - 2} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--color-text)">
          {centerMoney}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="8.5" fill="var(--color-muted)">
          total
        </text>
      </svg>
    </div>
  );
}

// Monthly spending as a line + area, with a dashed line at the average month.
function SpendTrend({ months, currency }: { months: [string, number][]; currency: string }) {
  const W = 340;
  const H = 168;
  const padL = 10;
  const padR = 10;
  const padTop = 24;
  const padBottom = 22;
  const x0 = padL;
  const x1 = W - padR;
  const y0 = padTop;
  const y1 = H - padBottom;
  const plotW = x1 - x0;
  const plotH = y1 - y0;

  const vals = months.map(([, c]) => c);
  const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  const max = Math.max(1, ...vals, avg);
  const n = months.length;
  const px = (i: number) => (n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * plotW);
  const py = (v: number) => y1 - (v / max) * plotH;
  const avgY = py(avg);
  const money0 = (c: number) => formatMoney(c, currency).replace(/[.,]00$/, "");

  const pts = months.map(([, c], i) => `${px(i)},${py(c)}`);
  const areaPath = `M ${x0},${y1} L ${pts.join(" L ")} L ${x1},${y1} Z`;
  // Show at most ~6 month labels so they don't collide.
  const labelStep = Math.ceil(n / 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet">
      <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="var(--color-border)" strokeWidth="1" />

      <path d={areaPath} fill="var(--color-brand)" opacity="0.12" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {months.map(([ym, c], i) => (
        <g key={ym}>
          <circle cx={px(i)} cy={py(c)} r="2.6" fill="var(--color-brand)" />
          {i % labelStep === 0 && (
            <text x={px(i)} y={y1 + 14} textAnchor="middle" fontSize="10.5" fill="var(--color-muted)">
              {monthLabel(ym)}
            </text>
          )}
        </g>
      ))}

      {/* Average line + pill */}
      <line x1={x0} y1={avgY} x2={x1 - 46} y2={avgY} stroke="#d7d8dc" strokeWidth="2" strokeDasharray="5 4" opacity="0.85" />
      <rect x={x1 - 44} y={avgY - 8} width="44" height="16" rx="8" fill="var(--color-bg)" stroke="var(--color-border)" />
      <text x={x1 - 22} y={avgY + 3.5} textAnchor="middle" fontSize="9.5" fill="#d7d8dc" fontWeight="600">
        {money0(avg)}
      </text>
    </svg>
  );
}
