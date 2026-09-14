import { notFound, redirect } from "next/navigation";
import { getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import ExpenseForm from "@/components/ExpenseForm";

export const dynamic = "force-dynamic";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string; expenseId: string }>;
}) {
  const { id, expenseId } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  const expense = data.expenses.find((e) => e.id === expenseId);
  if (!expense) notFound();

  return (
    <ExpenseForm
      groupId={id}
      members={data.members}
      meId={me.id}
      defaultCurrency={data.group.default_currency ?? "EUR"}
      initial={expense}
    />
  );
}
