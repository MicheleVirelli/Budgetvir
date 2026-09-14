import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGroupData, findProfile } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { toCents } from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import { resolveCategory, expenseIcon } from "@/lib/categories";
import type { ExpenseComment } from "@/lib/types";
import Avatar from "@/components/Avatar";
import BackHeader from "@/components/BackHeader";
import DeleteExpenseButton from "./DeleteExpenseButton";
import Comments from "./Comments";

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

  const supabase = await createClient();
  const { data: commentRows } = await supabase
    .from("expense_comments")
    .select("*")
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: true });
  const comments = (commentRows ?? []) as unknown as ExpenseComment[];

  const payer = findProfile(data.members, expense.paid_by);
  const category = resolveCategory(expense.category, data.categories);

  return (
    <div className="flex min-h-dvh flex-col pb-8">
      <BackHeader
        title="Expense"
        action={
          <div className="flex items-center gap-1">
            <Link
              href={`/groups/${id}/recurring/new?from=${expenseId}`}
              aria-label="Make recurring"
              className="flex h-9 w-9 items-center justify-center rounded-full text-brand active:bg-surface"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </Link>
            <Link
              href={`/groups/${id}/expenses/${expenseId}/edit`}
              aria-label="Edit"
              className="flex h-9 w-9 items-center justify-center rounded-full text-brand active:bg-surface"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 20h4L18 10l-4-4L4 16v4zM14 6l4 4" />
              </svg>
            </Link>
            <DeleteExpenseButton expenseId={expense.id} groupId={id} />
          </div>
        }
      />

      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-3xl">
          {expenseIcon(expense.emoji, expense.category, data.categories)}
        </div>
        <h1 className="text-xl font-semibold">{expense.title}</h1>
        <p className="text-3xl font-bold">{formatMoney(toCents(expense.amount), expense.currency)}</p>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          <span>{profileName(payer)} paid</span>
          <span>·</span>
          <span>
            {new Date(expense.expense_date).toLocaleDateString("en", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span className="rounded-full bg-surface px-2 py-0.5">
            {category.emoji} {category.label}
          </span>
        </div>
      </div>

      {expense.notes && (
        <div className="px-4 pb-2">
          <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">{expense.notes}</p>
        </div>
      )}

      <div className="px-4">
        <p className="mb-2 text-sm font-medium text-muted">{SPLIT_LABEL[expense.split_type] ?? "Split"}</p>
        <ul className="flex flex-col overflow-hidden rounded-2xl bg-surface">
          {expense.splits.map((s) => {
            const member = findProfile(data.members, s.user_id);
            return (
              <li key={s.id} className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0">
                <Avatar src={member?.avatar_url} name={member?.display_name} email={member?.email} size={36} />
                <span className="flex-1 truncate text-sm">
                  {profileName(member)}
                  {s.user_id === me.id && <span className="text-muted"> (you)</span>}
                </span>
                <span className="font-medium">{formatMoney(toCents(s.amount_owed), expense.currency)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {expense.receipt_url && (
        <div className="px-4 py-5">
          <p className="mb-2 text-sm font-medium text-muted">Receipt</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={expense.receipt_url} alt="Receipt" className="w-full rounded-2xl border border-border object-contain" />
        </div>
      )}

      <Comments expenseId={expense.id} meId={me.id} members={data.members} initial={comments} />
    </div>
  );
}
