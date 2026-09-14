import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { describeActivity, timeAgo } from "@/lib/activity";
import type { Activity, Profile } from "@/lib/types";
import BottomNav from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function GlobalActivityPage() {
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, group:groups(id, name)")
    .eq("user_id", me.id);

  const groupIds = (memberships ?? []).map((m) => (m as { group_id: string }).group_id);
  const groupNames = new Map<string, string>();
  for (const m of memberships ?? []) {
    const g = (m as unknown as { group: { id: string; name: string } | null }).group;
    if (g) groupNames.set(g.id, g.name);
  }

  let activities: Activity[] = [];
  let members: Profile[] = [];
  if (groupIds.length > 0) {
    const [{ data: acts }, { data: memberRows }] = await Promise.all([
      supabase.from("activity").select("*").in("group_id", groupIds).order("created_at", { ascending: false }).limit(100),
      supabase.from("group_members").select("profile:profiles(*)").in("group_id", groupIds),
    ]);
    activities = (acts ?? []) as unknown as Activity[];
    const seen = new Set<string>();
    members = (memberRows ?? [])
      .map((r) => (r as unknown as { profile: Profile }).profile)
      .filter((p) => p && !seen.has(p.id) && seen.add(p.id));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 pb-2 pt-6">
        <h1 className="text-2xl font-bold">Activity</h1>
      </header>

      <main className="flex-1 px-4 pb-24">
        <ul className="flex flex-col">
          {activities.length === 0 && <li className="pt-16 text-center text-muted">Nothing here yet.</li>}
          {activities.map((a) => {
            const { icon, text } = describeActivity(a, members);
            return (
              <li key={a.id} className="border-b border-border/50 last:border-b-0">
                <Link href={`/groups/${a.group_id}`} className="flex items-start gap-3 py-3 active:bg-surface">
                  <span className="mt-0.5 text-xl">{icon}</span>
                  <p className="flex-1 text-sm">
                    {text}
                    <span className="block text-xs text-muted">
                      {groupNames.get(a.group_id) ?? "Group"} · {timeAgo(a.created_at)}
                    </span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>

      <BottomNav />
    </div>
  );
}
