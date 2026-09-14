import { CATEGORIES } from "./categories";

/**
 * Map a Splitwise category label to our category key (best effort).
 */
export function mapCategory(text: string): string {
  const t = (text || "").toLowerCase().trim();
  const exact = CATEGORIES.find((c) => c.label.toLowerCase() === t || c.key === t);
  if (exact) return exact.key;
  const has = (...keys: string[]) => keys.some((k) => t.includes(k));
  if (has("grocer", "supermarket", "market")) return "groceries";
  if (has("dining", "restaurant", "dinner", "lunch", "food", "snack")) return "dining";
  if (has("drink", "bar", "liquor", "alcohol", "beer", "wine")) return "drinks";
  if (has("hotel", "accommod", "lodging", "hostel", "airbnb", "rent")) return "accommodation";
  if (has("flight", "plane", "airfare", "travel", "trip")) return "travel";
  if (has("transport", "taxi", "bus", "train", "car", "fuel", "gas", "parking", "uber")) return "transport";
  if (has("utilit", "electric", "water", "internet", "phone", "heat")) return "utilities";
  if (has("entertain", "movie", "game", "music", "sport event")) return "entertainment";
  if (has("shopping", "clothes", "electronics")) return "shopping";
  if (has("health", "medical", "pharmacy", "doctor", "medicine")) return "health";
  if (has("gift", "donation")) return "gifts";
  if (has("sport", "gym", "fitness")) return "sports";
  if (has("home", "household", "furniture")) return "home";
  return "general";
}

export interface NetInput {
  userId: string;
  cents: number; // Splitwise per-person net for the row (paid − owed)
}

export interface Reconstructed {
  paidBy: string;
  splits: { userId: string; owedCents: number }[];
}

/**
 * Rebuild a single-payer expense from Splitwise per-person net columns.
 *
 * Splitwise stores each person's net (paid − owed) per row, summing to 0. We
 * pick the largest-net person as the single payer; every person's *owed* is
 * then `paid − net`, where only the payer "paid" the full cost. This preserves
 * every person's net balance exactly (even if the original had many payers).
 */
export function reconstructExpense(costCents: number, nets: NetInput[]): Reconstructed | null {
  if (costCents <= 0 || nets.length === 0) return null;

  let payer = nets[0];
  for (const n of nets) if (n.cents > payer.cents) payer = n;

  const splits = nets.map((n) => ({
    userId: n.userId,
    owedCents: n.userId === payer.userId ? costCents - payer.cents : -n.cents,
  }));

  // Keep the payer plus anyone who actually owes something.
  const filtered = splits.filter((s) => s.owedCents > 0 || s.userId === payer.userId);
  if (filtered.length === 0) return null;

  // Absorb any 1-cent rounding drift on the payer's share.
  const sum = filtered.reduce((a, b) => a + b.owedCents, 0);
  const diff = costCents - sum;
  if (diff !== 0) {
    const p = filtered.find((s) => s.userId === payer.userId) ?? filtered[0];
    p.owedCents += diff;
  }

  if (filtered.some((s) => s.owedCents < 0)) return null;
  return { paidBy: payer.userId, splits: filtered };
}

const FIXED_HEADERS = ["date", "description", "title", "category", "cost", "amount", "currency", "currency code"];

export interface ParsedImport {
  header: string[];
  fixed: { date: number; description: number; category: number; cost: number; currency: number };
  personColumns: { index: number; name: string }[];
  rows: string[][];
}

/**
 * Interpret a parsed CSV (matrix) as a Splitwise export: locate the fixed
 * columns and treat the rest as per-person columns.
 */
export function interpretSplitwiseCsv(matrix: string[][]): ParsedImport | null {
  if (matrix.length < 2) return null;
  const header = matrix[0].map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const find = (...names: string[]) => {
    for (const n of names) {
      const idx = lower.indexOf(n);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const fixed = {
    date: find("date"),
    description: find("description", "title"),
    category: find("category"),
    cost: find("cost", "amount"),
    currency: find("currency", "currency code"),
  };
  if (fixed.description === -1 || fixed.cost === -1) return null;

  const personColumns = header
    .map((name, index) => ({ name: name.trim(), index }))
    .filter(
      (c) =>
        c.name !== "" &&
        !FIXED_HEADERS.includes(c.name.toLowerCase()) &&
        c.index !== fixed.date &&
        c.index !== fixed.description &&
        c.index !== fixed.category &&
        c.index !== fixed.cost &&
        c.index !== fixed.currency,
    );

  return { header, fixed, personColumns, rows: matrix.slice(1) };
}

export function normalizeDate(raw: string): string {
  const t = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

export function parseMoney(raw: string): number {
  const n = parseFloat((raw || "").replace(/[^0-9.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
