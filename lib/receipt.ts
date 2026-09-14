import { toCents } from "./split";

export interface ReceiptItem {
  description: string;
  priceCents: number; // negative for discounts
}

export interface ParsedReceipt {
  items: ReceiptItem[];
  totalCents: number | null;
}

// Money amount at (or near) the end of a line: 12,50 / 12.50 / 1.234,56 / 12,50 €
const PRICE_RE = /(-?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})\s*(?:€|eur)?\s*$/i;
// All money amounts anywhere on a line (used to tell unit-price from line-total).
const AMOUNT_G = /-?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}/g;
// "2 x", "2x", "2 ×" quantity markers.
const QTY_UNIT_RE = /(\d{1,3})\s*[x×]\s*(\d{1,3}(?:[.,]\d{2}))/i;

const TOTAL_RE = /\b(totale?|total|importo|tot(?:\.|\b)|amount due|balance due|to pay|zu zahlen)\b/i;
const SUBTOTAL_RE = /\b(sub[- ]?totale?|subtotal|imponibile)\b/i;
const DISCOUNT_RE = /\b(sconto|scont|discount|promo(?:zione)?|riduzione|buono|voucher|coupon|off)\b/i;
const NOISE_RE = /\b(iva|vat|tax|resto|change|contante|cash|carta|card|pos|bancomat|cambio|tavolo|coperto? n|scontrino|documento|cassa|operatore|grazie|thank|arrivederci|p\.?\s?iva|cod\.?\s?fisc)\b/i;

function parseAmount(raw: string): number {
  let s = raw.trim().replace(/[€\s]/g, "");
  const neg = s.startsWith("-");
  s = s.replace(/^-/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function cleanLabel(s: string): string {
  return s.replace(/[.\-–:]+$/, "").replace(/^[.\-–:]+/, "").trim();
}

/**
 * Best-effort parse of raw receipt OCR text into line items and a total.
 * Handles quantities ("2 x 3,50", "2x Pizza") and discount lines (stored as a
 * negative-price item). Conservative on purpose — the UI lets the user fix
 * everything.
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: ReceiptItem[] = [];
  let totalCents: number | null = null;
  let pending = ""; // a description line awaiting its price on the next line

  const push = (desc: string, cents: number) => {
    if (cents === 0) return;
    const d = cleanLabel(desc) || "Item";
    items.push({ description: d.slice(0, 60), priceCents: cents });
  };

  for (const line of lines) {
    // Grand total.
    if (TOTAL_RE.test(line) && !SUBTOTAL_RE.test(line)) {
      const m = line.match(PRICE_RE);
      if (m) {
        const c = toCents(Math.abs(parseAmount(m[1])));
        if (totalCents === null || c > totalCents) totalCents = c;
      }
      pending = "";
      continue;
    }
    if (SUBTOTAL_RE.test(line)) {
      pending = "";
      continue;
    }

    // Discount → negative item.
    if (DISCOUNT_RE.test(line)) {
      const m = line.match(PRICE_RE);
      if (m) {
        const c = toCents(Math.abs(parseAmount(m[1])));
        if (c > 0) push(cleanLabel(line.slice(0, m.index)) || "Sconto", -c);
      }
      pending = "";
      continue;
    }

    if (NOISE_RE.test(line)) {
      pending = "";
      continue;
    }

    const m = line.match(PRICE_RE);
    if (!m) {
      // Possibly the name of an item whose price is on the next line.
      if (/[a-zA-ZÀ-ÿ]/.test(line) && line.length >= 2 && !/^\d/.test(line)) pending = line;
      continue;
    }

    let cents = toCents(parseAmount(m[1]));
    let label = cleanLabel(line.slice(0, m.index));
    let qty = 1;

    const qu = line.match(QTY_UNIT_RE);
    if (qu) {
      // "N x U" form. If the line has a second amount it's the line total,
      // otherwise the amount is the unit price → total = qty × unit.
      qty = parseInt(qu[1], 10) || 1;
      const unitCents = toCents(parseAmount(qu[2]));
      const amounts = line.match(AMOUNT_G) || [];
      if (amounts.length < 2) cents = unitCents * qty;
      // Strip the quantity marker from the description (with or without a
      // trailing amount, e.g. "2 x 3,50" or a lone "2x").
      label = cleanLabel(label.replace(QTY_UNIT_RE, "").replace(/(\d{1,3})\s*[x×](?=\s|$)/i, ""));
    } else {
      // Leading "Nx Desc" or "N Desc".
      const lx = label.match(/^(\d{1,3})\s*[x×]\s*(.+)$/i);
      const lc = label.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ].*)$/);
      if (lx) {
        qty = parseInt(lx[1], 10) || 1;
        label = lx[2].trim();
      } else if (lc) {
        qty = parseInt(lc[1], 10) || 1;
        label = lc[2].trim();
      }
    }

    if (!label && pending) label = cleanLabel(pending);
    pending = "";

    if (!/[a-zA-ZÀ-ÿ]/.test(label) || label.length < 2) continue;

    push(qty > 1 ? `${qty}× ${label}` : label, cents);
  }

  if (totalCents === null && items.length > 0) {
    totalCents = items.reduce((s, it) => s + it.priceCents, 0);
  }

  return { items, totalCents };
}

export interface AssignedItem {
  priceCents: number; // may be negative (discount)
  memberIds: string[];
}

/**
 * Split itemised lines across members: each item's magnitude is divided equally
 * among its assignees (cent remainder to the first) and applied with the item's
 * sign, so discounts reduce shares. Totals sum exactly to the net of prices.
 */
export function computeItemizedOwed(items: AssignedItem[]): Map<string, number> {
  const owed = new Map<string, number>();
  for (const item of items) {
    const who = item.memberIds;
    if (who.length === 0 || item.priceCents === 0) continue;
    const sign = item.priceCents < 0 ? -1 : 1;
    const mag = Math.abs(item.priceCents);
    const base = Math.floor(mag / who.length);
    let remainder = mag - base * who.length;
    for (const id of who) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      owed.set(id, (owed.get(id) ?? 0) + sign * (base + extra));
    }
  }
  return owed;
}
