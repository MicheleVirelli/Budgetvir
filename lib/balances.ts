import type { Expense, ExpenseSplit, Profile } from "./types";
import { toCents } from "./split";

export interface NetBalance {
  userId: string;
  /** Positive: gets money back. Negative: owes money. In cents. */
  netCents: number;
}

export interface Debt {
  fromUserId: string; // owes
  toUserId: string; // is owed
  amountCents: number;
}

interface ExpenseForBalance extends Pick<Expense, "amount" | "paid_by"> {
  splits: Pick<ExpenseSplit, "user_id" | "amount_owed">[];
}

/**
 * Net position per user: total paid minus total owed.
 */
export function computeNetBalances(
  expenses: ExpenseForBalance[],
): Map<string, number> {
  const net = new Map<string, number>();
  const add = (userId: string, cents: number) => {
    net.set(userId, (net.get(userId) ?? 0) + cents);
  };

  for (const exp of expenses) {
    add(exp.paid_by, toCents(exp.amount));
    for (const split of exp.splits) {
      add(split.user_id, -toCents(split.amount_owed));
    }
  }
  return net;
}

/**
 * Pairwise debts derived directly from each expense (no simplification):
 * for every expense, each participant (other than the payer) owes the payer
 * their share. Debts to/from the same pair are aggregated and netted.
 */
export function computePairwiseDebts(
  expenses: ExpenseForBalance[],
): Debt[] {
  // key "a|b" (a < b) -> net cents that a owes b (can be negative)
  const pair = new Map<string, number>();

  const addPair = (debtor: string, creditor: string, cents: number) => {
    if (debtor === creditor || cents === 0) return;
    const [a, b] = debtor < creditor ? [debtor, creditor] : [creditor, debtor];
    const sign = debtor < creditor ? 1 : -1; // positive means a owes b
    const key = `${a}|${b}`;
    pair.set(key, (pair.get(key) ?? 0) + sign * cents);
  };

  for (const exp of expenses) {
    for (const split of exp.splits) {
      if (split.user_id === exp.paid_by) continue;
      addPair(split.user_id, exp.paid_by, toCents(split.amount_owed));
    }
  }

  const debts: Debt[] = [];
  for (const [key, cents] of pair) {
    if (cents === 0) continue;
    const [a, b] = key.split("|");
    if (cents > 0) {
      debts.push({ fromUserId: a, toUserId: b, amountCents: cents });
    } else {
      debts.push({ fromUserId: b, toUserId: a, amountCents: -cents });
    }
  }
  return debts.sort((x, y) => y.amountCents - x.amountCents);
}

export function profileName(p: Profile | undefined, fallback = "Unknown"): string {
  if (!p) return fallback;
  return p.display_name?.trim() || p.email.split("@")[0] || fallback;
}

export function formatMoney(cents: number, currency = "EUR"): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
