import { notFound, redirect } from "next/navigation";
import { getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import BudgetForm from "./BudgetForm";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
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
    <BudgetForm
      groupId={id}
      meId={me.id}
      currency={data.group.default_currency ?? "EUR"}
      groupCategories={data.categories}
      initial={data.budgets}
    />
  );
}
