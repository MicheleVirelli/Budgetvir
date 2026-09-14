import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRecurring, getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import BackHeader from "@/components/BackHeader";
import RecurringList from "./RecurringList";

export const dynamic = "force-dynamic";

export default async function RecurringPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  const items = await getRecurring(id);

  return (
    <div className="flex min-h-dvh flex-col pb-24">
      <BackHeader
        title="Recurring"
        action={
          <Link
            href={`/groups/${id}/recurring/new`}
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-black"
          >
            New
          </Link>
        }
      />
      <p className="px-4 pt-3 text-xs text-muted">
        Recurring expenses are added automatically when they come due (checked when you open the group).
      </p>
      <RecurringList items={items} />
    </div>
  );
}
