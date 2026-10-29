import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRecurring, getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
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
    <div className="flex flex-col pb-24">
      <div className="flex items-center justify-between px-4 pt-2">
        <h2 className="text-xl font-bold">Recurring</h2>
        <Link
          href={`/groups/${id}/recurring/new`}
          className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-black"
        >
          New
        </Link>
      </div>
      <p className="px-4 pt-3 text-xs text-muted">
        Recurring expenses are added automatically when they come due (checked when you open the group).
      </p>
      <RecurringList items={items} categories={data.categories} />
    </div>
  );
}
