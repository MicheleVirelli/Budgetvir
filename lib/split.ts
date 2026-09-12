import type { SplitType } from "./types";

/**
 * Split math. Everything is computed in integer cents so the per-person owed
 * amounts always sum exactly to the expense total (no lost/created cents).
 */

export interface SplitInput {
  userId: string;
  selected: boolean;
  /**
   * Raw value, meaning depends on the split type:
   * - percentage: percent (0-100)
   * - amount: exact currency amount owed
   * - shares: number of shares
   * - adjustment: extra currency amount this person owes
   * - equal: ignored
   */
  value?: number;
}

export interface SplitResult {
  userId: string;
  owedCents: number;
  rawValue: number | null;
}

export function toCents(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Distribute `totalCents` across `weights` using the largest-remainder method.
 * Ties (and equal weights) are broken by index, so earlier participants absorb
 * the leftover cents deterministically.
 */
function proportional(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Fall back to an even split when no positive weights are given.
    return evenSplit(totalCents, weights.length);
  }

  const exact = weights.map((w) => (totalCents * w) / sum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k].i] += 1;
    remainder -= 1;
  }
  return result;
}

function evenSplit(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  const result = Array<number>(n).fill(base);
  for (let i = 0; i < n && remainder > 0; i++) {
    result[i] += 1;
    remainder -= 1;
  }
  return result;
}

/**
 * Compute the owed cents for each *selected* participant.
 */
export function computeSplit(
  type: SplitType,
  totalCents: number,
  inputs: SplitInput[],
): SplitResult[] {
  const selected = inputs.filter((i) => i.selected);
  if (selected.length === 0) return [];

  switch (type) {
    case "equal": {
      const owed = proportional(totalCents, selected.map(() => 1));
      return selected.map((s, idx) => ({
        userId: s.userId,
        owedCents: owed[idx],
        rawValue: null,
      }));
    }
    case "percentage": {
      const owed = proportional(
        totalCents,
        selected.map((s) => Math.max(0, s.value ?? 0)),
      );
      return selected.map((s, idx) => ({
        userId: s.userId,
        owedCents: owed[idx],
        rawValue: s.value ?? 0,
      }));
    }
    case "shares": {
      const owed = proportional(
        totalCents,
        selected.map((s) => Math.max(0, s.value ?? 0)),
      );
      return selected.map((s, idx) => ({
        userId: s.userId,
        owedCents: owed[idx],
        rawValue: s.value ?? 0,
      }));
    }
    case "amount": {
      return selected.map((s) => ({
        userId: s.userId,
        owedCents: toCents(s.value ?? 0),
        rawValue: s.value ?? 0,
      }));
    }
    case "adjustment": {
      const adjCents = selected.map((s) => toCents(s.value ?? 0));
      const remaining = totalCents - adjCents.reduce((a, b) => a + b, 0);
      const base = evenSplit(remaining, selected.length);
      return selected.map((s, idx) => ({
        userId: s.userId,
        owedCents: adjCents[idx] + base[idx],
        rawValue: s.value ?? 0,
      }));
    }
    default:
      return [];
  }
}

export interface SplitValidation {
  ok: boolean;
  message?: string;
  /** Sum currently assigned, for the "X of Y" helper text. */
  assignedCents: number;
  remainingCents: number;
}

/**
 * Validate user input for a given split type before it can be saved.
 */
export function validateSplit(
  type: SplitType,
  totalCents: number,
  inputs: SplitInput[],
): SplitValidation {
  const selected = inputs.filter((i) => i.selected);

  if (selected.length === 0) {
    return {
      ok: false,
      message: "Select at least one person.",
      assignedCents: 0,
      remainingCents: totalCents,
    };
  }

  switch (type) {
    case "equal":
      return { ok: true, assignedCents: totalCents, remainingCents: 0 };

    case "percentage": {
      const sumPct = selected.reduce((a, s) => a + (s.value ?? 0), 0);
      const assignedCents = Math.round((sumPct / 100) * totalCents);
      const ok = Math.abs(sumPct - 100) < 0.01;
      return {
        ok,
        message: ok ? undefined : `Percentages must add up to 100% (now ${round2(sumPct)}%).`,
        assignedCents,
        remainingCents: totalCents - assignedCents,
      };
    }

    case "amount": {
      const assignedCents = selected.reduce((a, s) => a + toCents(s.value ?? 0), 0);
      const ok = assignedCents === totalCents;
      return {
        ok,
        message: ok ? undefined : "Amounts must add up to the total.",
        assignedCents,
        remainingCents: totalCents - assignedCents,
      };
    }

    case "shares": {
      const sumShares = selected.reduce((a, s) => a + (s.value ?? 0), 0);
      const ok = sumShares > 0;
      return {
        ok,
        message: ok ? undefined : "Assign at least one share.",
        assignedCents: ok ? totalCents : 0,
        remainingCents: ok ? 0 : totalCents,
      };
    }

    case "adjustment": {
      // Adjustments are always valid; the remainder is split equally.
      const results = computeSplit("adjustment", totalCents, inputs);
      const anyNegative = results.some((r) => r.owedCents < 0);
      return {
        ok: !anyNegative,
        message: anyNegative
          ? "Adjustments are larger than the total — someone would owe a negative amount."
          : undefined,
        assignedCents: totalCents,
        remainingCents: 0,
      };
    }

    default:
      return { ok: false, assignedCents: 0, remainingCents: totalCents };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
