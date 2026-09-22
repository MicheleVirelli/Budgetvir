import "server-only";
import crypto from "crypto";

/**
 * Minimal server-only client for the Enable Banking Account Information API
 * (https://enablebanking.com/docs/api/reference/). Enable Banking is a licensed
 * PSD2 AISP; we authenticate every request with a JWT signed (RS256) by our
 * application's PRIVATE KEY, which lives only in server env — never in the
 * browser, never in the database. Bank credentials are entered by the user only
 * on the bank's own SCA page; we never see them.
 *
 * Required env (Vercel, server-only — NOT NEXT_PUBLIC_*):
 *   ENABLEBANKING_APP_ID       the Application ID (used as the JWT `kid`)
 *   ENABLEBANKING_PRIVATE_KEY  the PEM private key downloaded at registration
 *   ENABLEBANKING_REDIRECT_URL https://<app>/api/bank/callback
 */

const BASE = "https://api.enablebanking.com";

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function privateKeyPem(): string {
  const raw = process.env.ENABLEBANKING_PRIVATE_KEY;
  if (!raw) throw new Error("ENABLEBANKING_PRIVATE_KEY is not set");
  // Env vars often store the PEM with escaped newlines.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/** Mint a short-lived RS256 JWT for the API (valid ≤ 1h, well under the 24h cap). */
function mintJwt(): string {
  const appId = process.env.ENABLEBANKING_APP_ID;
  if (!appId) throw new Error("ENABLEBANKING_APP_ID is not set");
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "RS256", kid: appId };
  const payload = {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKeyPem());
  return `${signingInput}.${b64url(signature)}`;
}

// --- Signed state (CSRF) for the connect → bank → callback round-trip. -------
// Keyed by a hash of the private key, so no extra secret env var is needed.
function stateKey(): Buffer {
  return crypto.createHash("sha256").update(privateKeyPem()).digest();
}

export function signState(data: Record<string, string>): string {
  const payload = b64url(JSON.stringify({ ...data, exp: Date.now() + 15 * 60 * 1000 }));
  const sig = b64url(crypto.createHmac("sha256", stateKey()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyState(token: string): Record<string, string> | null {
  const [payload, sig] = (token || "").split(".");
  if (!payload || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", stateKey()).update(payload).digest());
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof obj.exp === "number" && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

async function ebFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mintJwt()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Enable Banking ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface Aspsp {
  name: string;
  country: string;
  logo?: string;
}

export async function listAspsps(country = "IT"): Promise<Aspsp[]> {
  const data = await ebFetch<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(country)}`);
  return data.aspsps ?? [];
}

/** Start an authorisation; returns the URL to send the user to (bank SCA). */
export async function startAuth(opts: {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  state: string;
  validUntilISO: string;
}): Promise<{ url: string; authorizationId?: string }> {
  const body = {
    access: { valid_until: opts.validUntilISO },
    aspsp: { name: opts.aspspName, country: opts.aspspCountry },
    state: opts.state,
    redirect_url: opts.redirectUrl,
    psu_type: "personal",
  };
  const data = await ebFetch<{ url: string; authorization_id?: string }>("/auth", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { url: data.url, authorizationId: data.authorization_id };
}

export interface EbSession {
  session_id: string;
  accounts?: Array<string | { uid: string }>;
  access?: { valid_until?: string };
  aspsp?: { name?: string; country?: string };
}

/** Exchange the callback code for a session (+ the list of account uids). */
export async function createSession(code: string): Promise<EbSession> {
  return ebFetch<EbSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await ebFetch(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  } catch {
    // Best-effort — the consent also expires on its own.
  }
}

export interface EbAccountDetails {
  uid?: string;
  name?: string;
  product?: string;
  currency?: string;
  account_id?: { iban?: string; other?: { identification?: string } };
}

export async function getAccountDetails(uid: string): Promise<EbAccountDetails> {
  const data = await ebFetch<EbAccountDetails>(
    `/accounts/${encodeURIComponent(uid)}/details`,
  );
  return data ?? {};
}

export interface EbTransaction {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount?: { amount?: string; currency?: string };
  credit_debit_indicator?: string; // "DBIT" | "CRDT"
  status?: string; // "BOOK" | "PDNG"
  booking_date?: string;
  value_date?: string;
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
}

/** Fetch transactions on/after `dateFrom` (YYYY-MM-DD), following pagination. */
export async function getTransactions(uid: string, dateFrom: string): Promise<EbTransaction[]> {
  const out: EbTransaction[] = [];
  let cont: string | undefined;
  // Cap the number of pages to stay well within per-account rate limits.
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ date_from: dateFrom });
    if (cont) qs.set("continuation_key", cont);
    const data = await ebFetch<{ transactions?: EbTransaction[]; continuation_key?: string }>(
      `/accounts/${encodeURIComponent(uid)}/transactions?${qs.toString()}`,
    );
    out.push(...(data.transactions ?? []));
    cont = data.continuation_key;
    if (!cont) break;
  }
  return out;
}

/** Map an Enable Banking transaction to our storable shape. */
export function normalizeTransaction(t: EbTransaction): {
  ebTxId: string;
  bookingDate: string | null;
  amount: number;
  currency: string;
  direction: "debit" | "credit";
  description: string | null;
  counterparty: string | null;
  status: "booked" | "pending";
} | null {
  const rawAmount = t.transaction_amount?.amount;
  const amount = rawAmount != null ? Math.abs(parseFloat(rawAmount)) : NaN;
  if (!Number.isFinite(amount)) return null;
  const direction = t.credit_debit_indicator === "CRDT" ? "credit" : "debit";
  const bookingDate = t.booking_date ?? t.value_date ?? null;
  const description =
    (t.remittance_information ?? []).join(" ").trim() ||
    t.creditor?.name ||
    t.debtor?.name ||
    null;
  const counterparty =
    (direction === "debit" ? t.creditor?.name : t.debtor?.name) ?? null;
  // Prefer a stable provider id; fall back to a deterministic composite so
  // re-syncs dedupe even when entry_reference is missing.
  const ebTxId =
    t.entry_reference ||
    t.transaction_id ||
    `${bookingDate ?? "?"}|${direction}|${amount}|${(description ?? "").slice(0, 40)}`;
  return {
    ebTxId,
    bookingDate,
    amount,
    currency: t.transaction_amount?.currency ?? "EUR",
    direction,
    description,
    counterparty,
    status: t.status === "PDNG" ? "pending" : "booked",
  };
}
