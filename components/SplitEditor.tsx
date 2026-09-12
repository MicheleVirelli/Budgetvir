"use client";

import type { Profile, SplitType } from "@/lib/types";
import {
  computeSplit,
  validateSplit,
  fromCents,
  type SplitInput,
} from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import Avatar from "@/components/Avatar";

export interface SplitRowState {
  userId: string;
  selected: boolean;
  value: string;
}

const TABS: { type: SplitType; label: string; hint: string }[] = [
  { type: "equal", label: "Equally", hint: "Split equally among the selected people." },
  { type: "percentage", label: "%", hint: "Enter a percentage for each person. Must total 100%." },
  { type: "amount", label: "Amount", hint: "Enter the exact amount each person owes. Must total the expense." },
  {
    type: "shares",
    label: "Shares",
    hint: "Great for time-based splitting (2 nights → 2 shares) and families (family of 3 → 3 shares).",
  },
  {
    type: "adjustment",
    label: "Adjust",
    hint: "Enter who owes extra; the remainder is split equally.",
  },
];

export function rowsToInputs(rows: SplitRowState[]): SplitInput[] {
  return rows.map((r) => ({
    userId: r.userId,
    selected: r.selected,
    value: parseNum(r.value),
  }));
}

function parseNum(v: string): number {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function SplitEditor({
  type,
  onTypeChange,
  members,
  rows,
  setRows,
  totalCents,
  currency,
}: {
  type: SplitType;
  onTypeChange: (t: SplitType) => void;
  members: Profile[];
  rows: SplitRowState[];
  setRows: (rows: SplitRowState[]) => void;
  totalCents: number;
  currency: string;
}) {
  const inputs = rowsToInputs(rows);
  const results = computeSplit(type, totalCents, inputs);
  const owedByUser = new Map(results.map((r) => [r.userId, r.owedCents]));
  const validation = validateSplit(type, totalCents, inputs);
  const activeTab = TABS.find((t) => t.type === type)!;

  const update = (userId: string, patch: Partial<SplitRowState>) => {
    setRows(rows.map((r) => (r.userId === userId ? { ...r, ...patch } : r)));
  };

  const showValueInput = type !== "equal";

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => onTypeChange(t.type)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              t.type === type ? "bg-brand text-black" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">{activeTab.hint}</p>

      {/* Members */}
      <ul className="flex flex-col gap-1">
        {members.map((m) => {
          const row = rows.find((r) => r.userId === m.id)!;
          const owed = owedByUser.get(m.id);
          return (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => update(m.id, { selected: !row.selected })}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  row.selected ? "border-brand bg-brand text-black" : "border-border"
                }`}
                aria-label="Toggle participant"
              >
                {row.selected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                )}
              </button>

              <Avatar src={m.avatar_url} name={m.display_name} email={m.email} size={36} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profileName(m)}</p>
                <p className="text-xs text-muted">
                  {row.selected && owed !== undefined
                    ? formatMoney(owed, currency)
                    : "not included"}
                </p>
              </div>

              {showValueInput && row.selected && (
                <ValueInput
                  type={type}
                  value={row.value}
                  currency={currency}
                  onChange={(v) => update(m.id, { value: v })}
                />
              )}
            </li>
          );
        })}
      </ul>

      {/* Validation footer */}
      <div
        className={`rounded-xl px-3 py-2 text-center text-sm ${
          validation.ok ? "text-muted" : "bg-danger/10 text-danger"
        }`}
      >
        {validation.ok ? summary(type, validation) : validation.message}
      </div>
    </div>
  );
}

function summary(
  type: SplitType,
  v: ReturnType<typeof validateSplit>,
): string {
  if (type === "equal") return "Split equally.";
  if (type === "shares") return "Shares assigned.";
  if (type === "adjustment") return "Remainder split equally.";
  return `${fromCents(v.assignedCents).toFixed(2)} assigned · ${fromCents(
    v.remainingCents,
  ).toFixed(2)} left`;
}

function ValueInput({
  type,
  value,
  currency,
  onChange,
}: {
  type: SplitType;
  value: string;
  currency: string;
  onChange: (v: string) => void;
}) {
  const suffix =
    type === "percentage" ? "%" : type === "shares" ? "sh" : null;
  const prefix =
    type === "amount" ? currencySymbol(currency) : type === "adjustment" ? "+" : null;

  return (
    <div className="flex w-24 items-center gap-1 rounded-lg border border-border bg-bg px-2 py-1.5">
      {prefix && <span className="text-sm text-muted">{prefix}</span>}
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full min-w-0 bg-transparent text-right text-sm outline-none"
      />
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </div>
  );
}

function currencySymbol(currency: string): string {
  const map: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
  return map[currency] ?? currency;
}
