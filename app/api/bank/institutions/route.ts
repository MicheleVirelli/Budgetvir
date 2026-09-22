import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAspsps } from "@/lib/enablebanking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List the Italian banks (ASPSPs) the user can connect.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const aspsps = await listAspsps("IT");
    return NextResponse.json({
      aspsps: aspsps.map((a) => ({ name: a.name, country: a.country, logo: a.logo ?? null })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 502 },
    );
  }
}
