import { notFound, redirect } from "next/navigation";
import { getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { profileName } from "@/lib/balances";
import Avatar from "@/components/Avatar";
import BackHeader from "@/components/BackHeader";
import AddMemberForm from "./AddMemberForm";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  const { group, members } = data;

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Members" />

      <div className="px-4 py-4">
        <AddMemberForm
          groupId={group.id}
          existingIds={members.map((m) => m.id)}
        />
      </div>

      <ul className="flex flex-col px-4">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 border-b border-border/60 py-3">
            <Avatar src={m.avatar_url} name={m.display_name} email={m.email} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {profileName(m)}
                {m.id === me.id && <span className="text-muted"> (you)</span>}
              </p>
              <p className="truncate text-sm text-muted">{m.email}</p>
            </div>
            {m.id === group.created_by && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
                admin
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
