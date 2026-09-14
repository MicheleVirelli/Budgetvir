import { notFound, redirect } from "next/navigation";
import { getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import RecurringForm from "@/components/RecurringForm";

export const dynamic = "force-dynamic";

export default async function NewRecurringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  const initial = from ? data.expenses.find((e) => e.id === from) : undefined;

  return (
    <RecurringForm
      groupId={id}
      members={data.members}
      meId={me.id}
      defaultCurrency={data.group.default_currency ?? "EUR"}
      initial={initial}
    />
  );
}
