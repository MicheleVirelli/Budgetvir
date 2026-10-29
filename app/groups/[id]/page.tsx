import { notFound, redirect } from "next/navigation";
import { getGroupFeedData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import GroupFeed from "./GroupFeed";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupFeedData(id);
  if (!data) notFound();

  return (
    <GroupFeed
      groupId={data.group.id}
      expenses={data.expenses}
      members={data.members}
      meId={me.id}
      groupCategories={data.categories}
    />
  );
}
