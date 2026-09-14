import { notFound, redirect } from "next/navigation";
import { getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import RecurringForm from "@/components/RecurringForm";

export const dynamic = "force-dynamic";

export default async function NewRecurringPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  return (
    <RecurringForm
      groupId={id}
      members={data.members}
      meId={me.id}
      defaultCurrency={data.group.default_currency ?? "EUR"}
    />
  );
}
