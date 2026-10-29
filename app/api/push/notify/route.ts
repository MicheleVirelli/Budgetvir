import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWebPush } from "@/lib/push";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId, title, body, url } = await request.json();

    if (!groupId || !title || !body) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify current user is a member of the group
    const { data: membership } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden: not a member of this group" }, { status: 403 });
    }

    // Find all OTHER members in the group
    const { data: otherMembers } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .neq("user_id", user.id);

    const targetUserIds = (otherMembers ?? []).map((m) => m.user_id);
    if (targetUserIds.length === 0) {
      return NextResponse.json({ sent: 0, message: "No other members to notify" });
    }

    // Get push subscriptions for these members
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", targetUserIds);

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, message: "No registered push subscriptions" });
    }

    const deadSubscriptionIds: string[] = [];
    let sentCount = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await sendWebPush(
          {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
          {
            title,
            body,
            url: url || `/groups/${groupId}`,
            icon: "/icon-192.png",
          },
        );

        if (result.success) {
          sentCount++;
        } else if (result.shouldRemove && sub.id) {
          deadSubscriptionIds.push(sub.id);
        }
      }),
    );

    // Clean up expired subscriptions
    if (deadSubscriptionIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", deadSubscriptionIds);
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      cleaned: deadSubscriptionIds.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to broadcast notification" },
      { status: 500 },
    );
  }
}

