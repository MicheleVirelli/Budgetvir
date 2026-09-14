// Basic real-email guard for sign-up. The authoritative check is Supabase's
// "Confirm email" (the user must click a link in their inbox); this just rejects
// clearly-invalid formats and common disposable/throwaway domains up front.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Common disposable / temporary email providers. Best-effort, not exhaustive.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "tempmail.net",
  "throwawaymail.com",
  "yopmail.com",
  "getnada.com",
  "trashmail.com",
  "trashmail.de",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
  "mailnesia.com",
  "mohmal.com",
  "mailcatch.com",
  "spamgourmet.com",
  "mytemp.email",
  "moakt.com",
  "tempinbox.com",
  "emailondeck.com",
  "burnermail.io",
  "guerrillamailblock.com",
  "grr.la",
  "spam4.me",
  "tmpmail.org",
  "discard.email",
  "1secmail.com",
  "1secmail.org",
  "1secmail.net",
]);

export interface EmailCheck {
  ok: boolean;
  message?: string;
}

export function validateSignupEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  const domain = email.split("@")[1];
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      ok: false,
      message: "Please use a real, permanent email — temporary addresses aren't allowed.",
    };
  }
  return { ok: true };
}
