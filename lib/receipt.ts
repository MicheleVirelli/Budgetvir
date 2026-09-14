import { toCents } from "./split";

export interface ReceiptItem {
  description: string;
  priceCents: number;
}

export interface ParsedReceipt {
  items: ReceiptItem[];
  totalCents: number | null;
}

// Matches a money amount at (or near) the end of a line: 12,50 / 12.50 / 1.234,56 / 12,50 €
const PRICE_RE = /(-?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})\s*(?:€|eur)?\s*$/i;
const TOTAL_RE = /\b(totale?|total|importo|tot(?:\.|\b)|amount due|balance due|to pay|zu zahlen)\b/i;
const SUBTOTAL_RE = /\b(sub[- ]?totale?|subtotal|imponibile)\b/i;
// Lines that are never line items.
const NOISE_RE = /\b(iva|vat|tax|resto|change|contante|cash|carta|card|pos|bancomat|cambio|tavolo|coperto? n|scontrino|documento|cassa|operatore|grazie|thank|arrivederci|p\.?\s?iva|cod\.?\s?fisc)\b/i;

function parseAmount(raw: string): number {
  let s = raw.trim().replace(/[€\s]/g, "");
  // Thousands + decimal handling: last separator is the decimal.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Best-effort parse of raw receipt OCR text into line items and a total.
 * Deliberately conservative — the UI lets the user fix everything.
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: ReceiptItem[] = [];
  let totalCents: number | null = null;

  for (const line of lines) {
    const m = line.match(PRICE_RE);
    if (!m) continue;
    const amount = parseAmount(m[1]);
    if (amount <= 0) continue;
    const cents = toCents(amount);
    const label = line.slice(0, m.index).replace(/[.\-–:]+$/, "").trim();

    if (TOTAL_RE.test(line) && !SUBTOTAL_RE.test(line)) {
      // Keep the largest total-looking value.
      if (totalCents === null || cents > totalCents) totalCents = cents;
      continue;
    }
    if (SUBTOTAL_RE.test(line) || NOISE_RE.test(line)) continue;

    // A plausible item needs a description with at least one letter.
    if (!/[a-zA-Z]/.test(label) || label.length < 2) continue;
    items.push({ description: label.slice(0, 60), priceCents: cents });
  }

  // If no explicit total was found, sum the items.
  if (totalCents === null && items.length > 0) {
    totalCents = items.reduce((s, it) => s + it.priceCents, 0);
  }

  return { items, totalCents };
}

export interface AssignedItem {
  priceCents: number;
  memberIds: string[]; // who shares this item
}

/**
 * Split itemised receipt lines across members: each item's price is divided
 * equally among its assignees (cent remainder to the first), summed per member.
 * The returned totals sum exactly to the sum of assigned item prices.
 */
export function computeItemizedOwed(items: AssignedItem[]): Map<string, number> {
  const owed = new Map<string, number>();
  for (const item of items) {
    const who = item.memberIds;
    if (who.length === 0 || item.priceCents <= 0) continue;
    const base = Math.floor(item.priceCents / who.length);
    let remainder = item.priceCents - base * who.length;
    for (const id of who) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      owed.set(id, (owed.get(id) ?? 0) + base + extra);
    }
  }
  return owed;
}
