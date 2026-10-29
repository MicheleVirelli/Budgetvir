import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: groupId } = await params;
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10), 100);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check membership
    const { data: member } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("*, splits:expense_splits(*)")
      .eq("group_id", groupId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      expenses: expenses ?? [],
      hasMore: (expenses ?? []).length === limit,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch expenses" },
      { status: 500 },
    );
  }
}

