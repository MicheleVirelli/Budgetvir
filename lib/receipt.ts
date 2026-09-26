import { toCents } from "./split";

export interface ReceiptItem {
  description: string;
  priceCents: number; // negative for discounts
}

export interface ParsedReceipt {
  items: ReceiptItem[];
  totalCents: number | null;
}

// Any money amount on a line: 12,50 / 12.50 / 1.234,56. The line price is taken
// as the rightmost such match (see lastAmount), which tolerates trailing OCR
// noise and a VAT-class letter printed after the price ("2,69 B", "0,85 *D").
const AMOUNT_G = /-?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}/g;
// "2 x", "2x", "2 ×" quantity markers.
const QTY_UNIT_RE = /(\d{1,3})\s*[x×]\s*(\d{1,3}(?:[.,]\d{2}))/i;

const TOTAL_RE = /\b(totale?|total|importo|tot(?:\.|\b)|amount due|balance due|to pay|zu zahlen)\b/i;
const SUBTOTAL_RE = /\b(sub[- ]?totale?|subtotal|imponibile)\b/i;
const DISCOUNT_RE = /\b(sconto|scont|discount|promo(?:zione)?|riduzione|buono|voucher|coupon|off)\b/i;
// Non-item lines: taxes, receipt/register metadata, and payment lines. Payment
// terms matter because "Pagamento elettronico 3,54" would otherwise be read as a
// bogus item (the scanner sums items to get the expense amount).
// NOTE: bare "tax" is intentionally NOT here — Italian VAT lines say "IVA"/"VAT",
// while "City Tax" / "Tourist Tax" are real chargeable items (e.g. hotel bills).
const NOISE_RE = /\b(iva|vat|resto|change|contante|cash|carta|card|pos|bancomat|cambio|tavolo|coperto? n|scontrino|documento|cassa|operatore|grazie|thank|arrivederci|p\.?\s?iva|cod\.?\s?fisc|pagament\w*|elettronic\w*|electronic\w*|credit\w*|debit\w*|visa|mastercard|maestro|contactless|banconot\w*|assegn\w*|articol\w*|di\s*cui|firma|server|ecr)\b/i;
// Unit/measure tokens that appear on quantity/detail lines (e.g. "n.3 t 2,40",
// "1,200 kg x 2,00") — used to tell a detail line from a real item.
const UNIT_WORD_RE = /\b(n|nr|no|t|un|pz|pzi|conf|kg|hg|gr|g|ml|cl|dl|lt|l|mt|m|cm|per|ea|eur|iva|x)\b/gi;

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
 * True if a line contains a real product word: a run of ≥2 letters left over
 * after removing amounts, quantities, VAT percentages, punctuation and unit
 * tokens (n, kg, x, ea, …). "EA", "2 X 3,00", "n.3 t 2,40" have none; "FIORE
 * RECISO", "CORONA ALLORO" do.
 */
function hasProductWord(line: string): boolean {
  const stripped = line
    .replace(/-?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}/g, " ") // money amounts
    .replace(/\d+/g, " ") // leftover digits (quantities)
    .replace(/%/g, " ")
    .replace(/[x×*.,:;·@()/€+-]/g, " ")
    .replace(UNIT_WORD_RE, " ")
    .trim();
  return /[a-zA-ZÀ-ÿ]{2,}/.test(stripped);
}

/**
 * The rightmost money amount on a line, tolerating trailing noise after it — a
 * photographed receipt often has background bleed on the right ("35,00 i i A"),
 * so the price is no longer anchored to the end of the line. Returns the raw
 * amount string and where it starts (so the label is everything before it).
 */
function lastAmount(line: string): { raw: string; index: number } | null {
  const re = new RegExp(AMOUNT_G.source, "g");
  let m: RegExpExecArray | null;
  let last: { raw: string; index: number } | null = null;
  while ((m = re.exec(line))) last = { raw: m[0], index: m.index };
  return last;
}

/**
 * A quantity breakdown line — "2 X 3,00", "3 x 2,50" — with no product name of
 * its own. On these receipts the real line-total is printed on the adjacent
 * item line, so counting the breakdown too would double-count. Always skipped.
 */
function isQtyDetailLine(line: string): boolean {
  if (hasProductWord(line)) return false;
  return QTY_UNIT_RE.test(line) || /(^|\s)\d{1,3}\s*[x×]\s/i.test(line);
}

// A trailing VAT-rate column printed before the price on some receipts
// ("CORONA ALLORO LAUR 10%") — stripped from item labels.
const TRAILING_VAT_PCT_RE = /\s*\b\d{1,3}\s*%\s*$/;

/**
 * Best-effort parse of raw receipt OCR text into line items and a total.
 * Handles quantities ("2 x 3,50", "2x Pizza") and discount lines (stored as a
 * negative-price item). Conservative on purpose — the UI lets the user fix
 * everything.
 */
/**
 * Normalise common OCR artefacts before line parsing:
 * a space injected inside a decimal amount ("13, 06", "2 ,69") so AMOUNT_G
 * still recognises it. Deliberately conservative: only a space directly
 * around the decimal separator, right before its two decimals, is collapsed.
 */
function normalizeOcr(text: string): string {
  return text.replace(/(\d)[ \t]*([.,])[ \t]*(\d{2})(?!\d)/g, "$1$2$3");
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = normalizeOcr(text)
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
      const a = lastAmount(line);
      if (a) {
        const c = toCents(Math.abs(parseAmount(a.raw)));
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
      const a = lastAmount(line);
      if (a) {
        const c = toCents(Math.abs(parseAmount(a.raw)));
        if (c > 0) push(cleanLabel(line.slice(0, a.index)) || "Sconto", -c);
      }
      pending = "";
      continue;
    }

    if (NOISE_RE.test(line)) {
      pending = "";
      continue;
    }

    // Quantity breakdown ("2 X 3,00") whose real total is on the item line —
    // always skip so it isn't counted twice.
    if (isQtyDetailLine(line)) {
      continue;
    }

    const a = lastAmount(line);
    if (!a) {
      // No price → possibly the name of an item whose price is on the next line.
      // Require a real product word so background noise / unit tokens ("EA") do
      // not become a bogus pending name that the next line attaches to.
      if (hasProductWord(line)) pending = line;
      continue;
    }

    let cents = toCents(parseAmount(a.raw));
    let label = cleanLabel(
      line
        .slice(0, a.index)
        .replace(TRAILING_VAT_PCT_RE, "")
        .replace(/[£$€]/g, " ") // currency symbol next to the price
        .replace(/^\s*\d{5,}\s+/, "") // leading PLU / item code (e.g. M&S "00869256")
        .replace(/^\s*\*+\s*/, ""), // leading multibuy marker "*"
    );
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

    // Require a real product word: rejects noise-only "items" produced by
    // background bleed (dates, opening hours, register footer text).
    if (!hasProductWord(label)) continue;

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
