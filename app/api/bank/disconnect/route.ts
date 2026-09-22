import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteSession } from "@/lib/enablebanking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disconnect a bank: revoke the Enable Banking session and delete the connection
// (cascades to its accounts and transactions).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let connectionId = "";
  try {
    const body = await request.json();
    connectionId = (body.connectionId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const { data: conn } = await supabase
    .from("bank_connections")
    .select("id, eb_session_id")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single();
  if (!conn) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (conn.eb_session_id) await deleteSession(conn.eb_session_id);

  const { error } = await supabase
    .from("bank_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
