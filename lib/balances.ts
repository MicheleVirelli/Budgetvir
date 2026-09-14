import type { Profile } from "./types";
import { toCents } from "./split";

export interface Debt {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface ExpenseForBalance {
  amount: number;
  currency: string;
  paid_by: string;
  splits: { user_id: string; amount_owed: number }[];
}

export interface SettlementForBalance {
  from_user: string;
  to_user: string;
  amount: number;
  currency: string;
}

/**
 * Net position per user, per currency (paid − owed, plus settlements).
 * Returns Map<currency, Map<userId, cents>>. Positive = gets money back.
 *
 * Multi-currency is kept separate (no FX conversion): each currency is a
 * self-contained ledger, which is both correct and cheap.
 */
export function netByCurrency(
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[] = [],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const bump = (cur: string, user: string, cents: number) => {
    let m = out.get(cur);
    if (!m) out.set(cur, (m = new Map()));
    m.set(user, (m.get(user) ?? 0) + cents);
  };

  for (const e of expenses) {
    bump(e.currency, e.paid_by, toCents(e.amount));
    for (const s of e.splits) bump(e.currency, s.user_id, -toCents(s.amount_owed));
  }
  // A settlement: `from` pays `to`, reducing what `from` owes.
  for (const s of settlements) {
    bump(s.currency, s.from_user, toCents(s.amount));
    bump(s.currency, s.to_user, -toCents(s.amount));
  }
  return out;
}

/**
 * Raw pairwise debts per currency (no simplification), aggregated + netted.
 */
export function pairwiseByCurrency(
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[] = [],
): Map<string, Debt[]> {
  // currency -> "a|b" -> cents a owes b
  const pairs = new Map<string, Map<string, number>>();
  const add = (cur: string, debtor: string, creditor: string, cents: number) => {
    if (debtor === creditor || cents === 0) return;
    const [a, b] = debtor < creditor ? [debtor, creditor] : [creditor, debtor];
    const sign = debtor < creditor ? 1 : -1;
    let m = pairs.get(cur);
    if (!m) pairs.set(cur, (m = new Map()));
    const key = `${a}|${b}`;
    m.set(key, (m.get(key) ?? 0) + sign * cents);
  };

  for (const e of expenses) {
    for (const s of e.splits) {
      if (s.user_id === e.paid_by) continue;
      add(e.currency, s.user_id, e.paid_by, toCents(s.amount_owed));
    }
  }
  for (const s of settlements) {
    // paying reduces from→to debt
    add(s.currency, s.to_user, s.from_user, toCents(s.amount));
  }

  const result = new Map<string, Debt[]>();
  for (const [cur, m] of pairs) {
    const debts: Debt[] = [];
    for (const [key, cents] of m) {
      if (cents === 0) continue;
      const [a, b] = key.split("|");
      debts.push(
        cents > 0
          ? { fromUserId: a, toUserId: b, amountCents: cents }
          : { fromUserId: b, toUserId: a, amountCents: -cents },
      );
    }
    if (debts.length) result.set(cur, debts.sort((x, y) => y.amountCents - x.amountCents));
  }
  return result;
}

/**
 * Debt simplification: given net positions, produce the minimum set of
 * transactions that settles everyone (greedy largest-creditor / largest-debtor
 * matching). Runs per currency.
 */
export function simplifyDebts(net: Map<string, number>): Debt[] {
  const creditors: { id: string; cents: number }[] = [];
  const debtors: { id: string; cents: number }[] = [];
  for (const [id, cents] of net) {
    if (cents > 0) creditors.push({ id, cents });
    else if (cents < 0) debtors.push({ id, cents: -cents });
  }
  creditors.sort((a, b) => b.cents - a.cents);
  debtors.sort((a, b) => b.cents - a.cents);

  const result: Debt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].cents, creditors[j].cents);
    if (pay > 0) {
      result.push({ fromUserId: debtors[i].id, toUserId: creditors[j].id, amountCents: pay });
      debtors[i].cents -= pay;
      creditors[j].cents -= pay;
    }
    if (debtors[i].cents === 0) i++;
    if (creditors[j].cents === 0) j++;
  }
  return result;
}

export function simplifyByCurrency(
  net: Map<string, Map<string, number>>,
): Map<string, Debt[]> {
  const out = new Map<string, Debt[]>();
  for (const [cur, m] of net) {
    const debts = simplifyDebts(m);
    if (debts.length) out.set(cur, debts);
  }
  return out;
}

/** The current user's net across all currencies, as a compact label. */
export function myNetSummary(
  net: Map<string, Map<string, number>>,
  meId: string,
): { positive: number; negative: number; parts: string[]; settled: boolean } {
  let positive = 0;
  let negative = 0;
  const parts: string[] = [];
  for (const [cur, m] of net) {
    const cents = m.get(meId) ?? 0;
    if (cents === 0) continue;
    parts.push(`${cents > 0 ? "+" : "−"}${formatMoney(Math.abs(cents), cur)}`);
    if (cents > 0) positive += cents;
    else negative += cents;
  }
  return { positive, negative, parts, settled: parts.length === 0 };
}

export function profileName(p: Profile | undefined, fallback = "Someone"): string {
  if (!p) return fallback;
  return p.display_name?.trim() || p.email?.split("@")[0] || fallback;
}

const CURRENCY_LOCALE: Record<string, string> = {
  EUR: "en-IE",
  USD: "en-US",
  GBP: "en-GB",
};

export function formatMoney(cents: number, currency = "EUR"): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-IE", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
