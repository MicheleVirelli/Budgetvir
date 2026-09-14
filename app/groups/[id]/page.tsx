import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGroupData } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { netByCurrency, myNetSummary } from "@/lib/balances";
import GroupHeader from "./GroupHeader";
import GroupFeed from "./GroupFeed";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
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
    <div className="flex min-h-dvh flex-col pb-28">
      <GroupHeader
        groupId={group.id}
        name={group.name}
        imageUrl={group.image_url}
        memberCount={members.length}
        summary={summaryLabel(summary)}
      />

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        <Chip href={`/groups/${group.id}/settle`} accent>
          Settle up
        </Chip>
        <Chip href={`/groups/${group.id}/balances`}>Balances</Chip>
        <Chip href={`/groups/${group.id}/charts`}>Charts</Chip>
        <Chip href={`/groups/${group.id}/activity`}>Activity</Chip>
        <Chip href={`/groups/${group.id}/recurring`}>Recurring</Chip>
        <Chip href={`/groups/${group.id}/members`}>Members · {members.length}</Chip>
      </div>

      <main className="flex-1">
        <GroupFeed groupId={group.id} expenses={expenses} members={members} meId={me.id} groupCategories={data.categories} />
      </main>

      <Link
        href={`/groups/${group.id}/expenses/new`}
        className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand px-6 py-3.5 font-semibold text-black shadow-lg"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add expense
      </Link>
    </div>
  );
}

function summaryLabel(s: ReturnType<typeof myNetSummary>): string {
  if (s.settled) return "You are settled up";
  if (s.positive > 0 && s.negative === 0) return `You are owed ${s.parts.join(", ")}`;
  if (s.negative < 0 && s.positive === 0) return `You owe ${s.parts.join(", ")}`;
  return `Net ${s.parts.join(", ")}`;
}

function Chip({
  href,
  children,
  accent,
}: {
  href: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
        accent ? "bg-brand text-black" : "border border-border active:bg-surface"
      }`}
    >
      {children}
    </Link>
  );
}
