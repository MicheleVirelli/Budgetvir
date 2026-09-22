import { notFound, redirect } from "next/navigation";
import { getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { guessCategory } from "@/lib/categories";
import ExpenseForm, { type ExpensePrefill } from "@/components/ExpenseForm";
import type { BankTransaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tx?: string }>;
}) {
  const { id } = await params;
  const { tx } = await searchParams;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  // Optional prefill from a bank transaction the user chose to add to this group.
  let prefill: ExpensePrefill | undefined;
  let sourceTxId: string | undefined;
  if (tx) {
    const supabase = await createClient();
    const { data: row } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("id", tx)
      .single(); // RLS: only the owner's own transaction
    const t = row as BankTransaction | null;
    if (t) {
      sourceTxId = t.id;
      prefill = {
        title: t.description ?? t.counterparty ?? "Card payment",
        amount: t.amount.toFixed(2),
        category: guessCategory(t.description ?? t.counterparty),
        currency: t.currency,
        expenseDate: t.booking_date ?? undefined,
      };
    }
  }

  return (
    <ExpenseForm
      groupId={id}
      members={data.members}
      meId={me.id}
      defaultCurrency={data.group.default_currency ?? "EUR"}
      groupCategories={data.categories}
      prefill={prefill}
      sourceTxId={sourceTxId}
    />
  );
}
