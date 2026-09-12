import { notFound, redirect } from "next/navigation";
import { getGroupData, findProfile } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { computeNetBalances, computePairwiseDebts, formatMoney, profileName } from "@/lib/balances";
import Avatar from "@/components/Avatar";
import BackHeader from "@/components/BackHeader";

export const dynamic = "force-dynamic";

export default async function BalancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getSessionProfile();
  if (!me) redirect("/login");

  const data = await getGroupData(id);
  if (!data) notFound();

  const { members, expenses } = data;
  const currency = expenses[0]?.currency ?? "EUR";

  const forBalance = expenses.map((e) => ({
    amount: e.amount,
    paid_by: e.paid_by,
    splits: e.splits.map((s) => ({ user_id: s.user_id, amount_owed: s.amount_owed })),
  }));

  const net = computeNetBalances(forBalance);
  const debts = computePairwiseDebts(forBalance);

  const netList = members
    .map((m) => ({ member: m, cents: net.get(m.id) ?? 0 }))
    .filter((n) => n.cents !== 0)
    .sort((a, b) => b.cents - a.cents);

  const settled = netList.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader title="Balances" />

      {settled ? (
        <div className="flex flex-col items-center gap-2 px-6 pt-24 text-center">
          <div className="text-4xl">✅</div>
          <p className="font-semibold">Everyone is settled up</p>
        </div>
      ) : (
        <div className="px-4 py-4">
          {/* Net position per member */}
          <ul className="mb-6 flex flex-col gap-1">
            {netList.map(({ member, cents }) => (
              <li key={member.id} className="flex items-center gap-3 py-2">
                <Avatar src={member.avatar_url} name={member.display_name} email={member.email} size={42} />
                <p className="flex-1 text-sm">
                  <span className="font-medium">{profileName(member)}</span>{" "}
                  {cents > 0 ? (
                    <>gets back <span className="font-semibold text-positive">{formatMoney(cents, currency)}</span></>
                  ) : (
                    <>owes <span className="font-semibold text-negative">{formatMoney(-cents, currency)}</span></>
                  )}{" "}
                  in total
                </p>
              </li>
            ))}
          </ul>

          {/* Who owes whom */}
          <p className="mb-2 text-sm font-medium text-muted">Who owes whom</p>
          <ul className="flex flex-col overflow-hidden rounded-2xl bg-surface">
            {debts.map((d, i) => {
              const from = findProfile(members, d.fromUserId);
              const to = findProfile(members, d.toUserId);
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 border-b border-border/50 px-4 py-3 text-sm last:border-b-0"
                >
                  <Avatar src={from?.avatar_url} name={from?.display_name} email={from?.email} size={30} />
                  <span className="font-medium">{profileName(from)}</span>
                  <span className="text-muted">owes</span>
                  <span className="font-semibold text-negative">
                    {formatMoney(d.amountCents, currency)}
                  </span>
                  <span className="text-muted">to</span>
                  <span className="font-medium">{profileName(to)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
