import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { describeActivity, timeAgo } from "@/lib/activity";
import type { Activity, Profile } from "@/lib/types";
import BackHeader from "@/components/BackHeader";

export const dynamic = "force-dynamic";

export default async function GroupActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [{ data: group }, { data: memberRows }, { data: acts }] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", id).single(),
    supabase.from("group_members").select("profile:profiles(*)").eq("group_id", id),
    supabase.from("activity").select("*").eq("group_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!group) notFound();

  const members = (memberRows ?? [])
    .map((r) => (r as unknown as { profile: Profile }).profile)
    .filter(Boolean);
  const activities = (acts ?? []) as unknown as Activity[];

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Activity" />
      <ul className="flex flex-col px-4 py-2">
        {activities.length === 0 && <li className="pt-16 text-center text-muted">No activity yet.</li>}
        {activities.map((a) => {
          const { icon, text } = describeActivity(a, members);
          const inner = (
            <div className="flex items-start gap-3 py-3">
              <span className="mt-0.5 text-xl">{icon}</span>
              <p className="flex-1 text-sm">
                {text}
                <span className="ml-1 text-xs text-muted">· {timeAgo(a.created_at)}</span>
              </p>
            </div>
          );
          return (
            <li key={a.id} className="border-b border-border/50 last:border-b-0">
              {a.expense_id && a.type !== "expense_deleted" ? (
                <Link href={`/groups/${id}/expenses/${a.expense_id}`} className="block active:bg-surface">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
