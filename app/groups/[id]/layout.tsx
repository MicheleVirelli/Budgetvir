import { notFound, redirect } from "next/navigation";
import { getGroupMeta, getGroupBalanceData } from "@/lib/data";
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

  const [meta, balanceData] = await Promise.all([
    getGroupMeta(id),
    getGroupBalanceData(id),
  ]);
  if (!meta) notFound();

  const net = netByCurrency(balanceData.expenses, balanceData.settlements);
  const summary = myNetSummary(net, me.id);

  return (
    <GroupTabsShell
      groupId={meta.group.id}
      name={meta.group.name}
      imageUrl={meta.group.image_url}
      memberCount={meta.members.length}
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
