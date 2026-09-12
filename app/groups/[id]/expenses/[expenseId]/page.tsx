import { notFound, redirect } from "next/navigation";
import { getGroupData, findProfile } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { toCents } from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import Avatar from "@/components/Avatar";
import BackHeader from "@/components/BackHeader";
import DeleteExpenseButton from "./DeleteExpenseButton";

export const dynamic = "force-dynamic";

const SPLIT_LABEL: Record<string, string> = {
  equal: "Split equally",
  percentage: "Split by percentage",
  amount: "Split by exact amounts",
  shares: "Split by shares",
  adjustment: "Split by adjustment",
};

export default async function ExpenseDetailPage({
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

  const payer = findProfile(data.members, expense.paid_by);
  const canDelete = expense.created_by === me.id || expense.paid_by === me.id;

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        title="Expense"
        action={canDelete ? <DeleteExpenseButton expenseId={expense.id} groupId={id} /> : undefined}
      />

      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-3xl">
          {expense.emoji || "🧾"}
        </div>
        <h1 className="text-xl font-semibold">{expense.title}</h1>
        <p className="text-3xl font-bold">
          {formatMoney(toCents(expense.amount), expense.currency)}
        </p>
        <p className="text-sm text-muted">
          {profileName(payer)} paid ·{" "}
          {new Date(expense.expense_date).toLocaleDateString("en", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="px-4">
        <p className="mb-2 text-sm font-medium text-muted">
          {SPLIT_LABEL[expense.split_type] ?? "Split"}
        </p>
        <ul className="flex flex-col overflow-hidden rounded-2xl bg-surface">
          {expense.splits.map((s) => {
            const member = findProfile(data.members, s.user_id);
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
              >
                <Avatar
                  src={member?.avatar_url}
                  name={member?.display_name}
                  email={member?.email}
                  size={36}
                />
                <span className="flex-1 truncate text-sm">
                  {profileName(member)}
                  {s.user_id === me.id && <span className="text-muted"> (you)</span>}
                </span>
                <span className="font-medium">
                  {formatMoney(toCents(s.amount_owed), expense.currency)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {expense.receipt_url && (
        <div className="px-4 py-5">
          <p className="mb-2 text-sm font-medium text-muted">Receipt</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expense.receipt_url}
            alt="Receipt"
            className="w-full rounded-2xl border border-border object-contain"
          />
        </div>
      )}
    </div>
  );
}
