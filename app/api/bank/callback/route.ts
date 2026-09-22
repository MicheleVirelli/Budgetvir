import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createSession,
  getAccountDetails,
  verifyState,
  type EbAccountDetails,
} from "@/lib/enablebanking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maskIban(iban?: string | null): string | null {
  if (!iban) return null;
  const s = iban.replace(/\s+/g, "");
  return s.length <= 4 ? s : `••••${s.slice(-4)}`;
}

function accountUid(a: string | { uid: string }): string {
  return typeof a === "string" ? a : a.uid;
}

// The bank redirects the user here after SCA. Exchange the code for a session,
// store the accounts, and send the user to their transactions channel.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.APP_BASE_URL ?? url.origin;
  const back = (params: string) => NextResponse.redirect(`${base}/account/bank?${params}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.get("error")) return back("error=bank_declined");
  if (!code) return back("error=missing_code");

  const parsed = verifyState(state);
  if (!parsed) return back("error=bad_state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== parsed.u) return back("error=session");

  const connectionId = parsed.c;

  try {
    const session = await createSession(code);

    await supabase
      .from("bank_connections")
      .update({
        status: "linked",
        eb_session_id: session.session_id,
        valid_until: session.access?.valid_until ?? null,
      })
      .eq("id", connectionId)
      .eq("user_id", user.id);

    const uids = (session.accounts ?? []).map(accountUid).filter(Boolean);
    for (const uid of uids) {
      let details: EbAccountDetails = {};
      try {
        details = await getAccountDetails(uid);
      } catch {
        // Keep going — we can still store the account by uid.
      }
      await supabase.from("bank_accounts").upsert(
        {
          user_id: user.id,
          connection_id: connectionId,
          eb_account_uid: uid,
          name: details.name ?? details.product ?? null,
          iban_masked: maskIban(details.account_id?.iban),
          currency: details.currency ?? "EUR",
        },
        { onConflict: "user_id,eb_account_uid" },
      );
    }

    return back("connected=1");
  } catch (err) {
    await supabase
      .from("bank_connections")
      .update({ status: "error" })
      .eq("id", connectionId)
      .eq("user_id", user.id);
    const msg = err instanceof Error ? err.message : "session_failed";
    return back(`error=${encodeURIComponent(msg.slice(0, 120))}`);
  }
}
