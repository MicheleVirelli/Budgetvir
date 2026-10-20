import { notFound, redirect } from "next/navigation";
import { getGroupMeta, getSingleExpense } from "@/lib/data";
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

  const [meta, expense] = await Promise.all([
    getGroupMeta(id),
    getSingleExpense(expenseId),
  ]);
  if (!meta || !expense || expense.group_id !== id) notFound();

  return (
    <ExpenseForm
      groupId={id}
      members={meta.members}
      meId={me.id}
      defaultCurrency={meta.group.default_currency ?? "EUR"}
      initial={expense}
      groupCategories={meta.categories}
    />
  );
}
