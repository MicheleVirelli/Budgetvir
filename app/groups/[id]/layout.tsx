import { notFound, redirect } from "next/navigation";
import { getGroupFeedData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { netByCurrency, myNetSummary } from "@/lib/balances";
import GroupTabsShell from "./GroupTabsShell";

export const dynamic = "force-dynamic";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupFeedData(id);
  if (!data) notFound();

  const { group, members, expenses, settlements } = data;

  const forBalance = expenses.map((e) => ({
    amount: e.amount,
    currency: e.currency,
    paid_by: e.paid_by,
    splits: e.splits.map((s) => ({ user_id: s.user_id, amount_owed: s.amount_owed })),
  }));
  const net = netByCurrency(forBalance, settlements);
  const summary = myNetSummary(net, me.id);

  return (
    <GroupTabsShell
      groupId={group.id}
      name={group.name}
      imageUrl={group.image_url}
      memberCount={members.length}
      summary={summaryLabel(summary)}
    >
      {children}
    </GroupTabsShell>
  );
}

function summaryLabel(s: ReturnType<typeof myNetSummary>): string {
  if (s.settled) return "You are settled up";
  if (s.positive > 0 && s.negative === 0) return `You are owed ${s.parts.join(", ")}`;
  if (s.negative < 0 && s.positive === 0) return `You owe ${s.parts.join(", ")}`;
  return `Net ${s.parts.join(", ")}`;
}

