import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startAuth, signState } from "@/lib/enablebanking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Begin connecting a bank: create a pending connection row, then return the
// bank's authorisation URL for the user to complete SCA on the bank's own site.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const redirectUrl = process.env.ENABLEBANKING_REDIRECT_URL;
  if (!redirectUrl) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  let body: { aspsp?: string; country?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const aspspName = (body.aspsp ?? "").trim();
  const aspspCountry = (body.country ?? "IT").trim() || "IT";
  if (!aspspName) return NextResponse.json({ error: "aspsp required" }, { status: 400 });

  const { data: conn, error: cErr } = await supabase
    .from("bank_connections")
    .insert({
      user_id: user.id,
      aspsp_name: aspspName,
      aspsp_country: aspspCountry,
      status: "pending",
    })
    .select("id")
    .single();
  if (cErr || !conn) {
    return NextResponse.json({ error: cErr?.message ?? "insert failed" }, { status: 500 });
  }

  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const state = signState({ u: user.id, c: conn.id });

  try {
    const { url } = await startAuth({
      aspspName,
      aspspCountry,
      redirectUrl,
      state,
      validUntilISO: validUntil,
    });
    return NextResponse.json({ url });
  } catch (err) {
    await supabase.from("bank_connections").update({ status: "error" }).eq("id", conn.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "auth failed" },
      { status: 502 },
    );
  }
}
