import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGroupData, findProfile } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import {
  netByCurrency,
  pairwiseByCurrency,
  simplifyByCurrency,
  formatMoney,
  profileName,
  type Debt,
} from "@/lib/balances";
import type { Profile } from "@/lib/types";
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

  const { group, members, expenses, settlements } = data;
  const simplify = !!group.simplify_debts;

  const forBalance = expenses.map((e) => ({
    amount: e.amount,
    currency: e.currency,
    paid_by: e.paid_by,
    splits: e.splits.map((s) => ({ user_id: s.user_id, amount_owed: s.amount_owed })),
  }));

  const net = netByCurrency(forBalance, settlements);
  const debtsByCur = simplify ? simplifyByCurrency(net) : pairwiseByCurrency(forBalance, settlements);
  const currencies = [...net.keys()].sort();
  const settled = currencies.every((c) => [...(net.get(c)?.values() ?? [])].every((v) => v === 0));

  return (
    <div className="flex min-h-dvh flex-col">
      <BackHeader
        title="Balances"
        action={
          <Link
            href={`/groups/${id}/settle`}
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-black"
          >
            Settle up
          </Link>
        }
      />

      <div className="flex items-center justify-between px-4 pt-3 text-xs text-muted">
        <span>{simplify ? "Simplified debts on" : "Showing all debts"}</span>
        <Link href={`/groups/${id}/settings`} className="text-brand">
          {simplify ? "Turn off in settings" : "Simplify in settings"}
        </Link>
      </div>

      {settled ? (
        <div className="flex flex-col items-center gap-2 px-6 pt-24 text-center">
          <div className="text-4xl">✅</div>
          <p className="font-semibold">Everyone is settled up</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 px-4 py-4">
          {currencies.map((cur) => {
            const m = net.get(cur)!;
            const netList = members
              .map((member) => ({ member, cents: m.get(member.id) ?? 0 }))
              .filter((n) => n.cents !== 0)
              .sort((a, b) => b.cents - a.cents);
            const debts = debtsByCur.get(cur) ?? [];
            if (netList.length === 0) return null;

            return (
              <section key={cur}>
                {net.size > 1 && <p className="mb-2 text-sm font-semibold text-muted">{cur}</p>}

                <ul className="mb-4 flex flex-col gap-1">
                  {netList.map(({ member, cents }) => (
                    <li key={member.id} className="flex items-center gap-3 py-1.5">
                      <Avatar src={member.avatar_url} name={member.display_name} email={member.email} size={40} />
                      <p className="flex-1 text-sm">
                        <span className="font-medium">
                          {profileName(member)}
                          {member.id === me.id && " (you)"}
                        </span>{" "}
                        {cents > 0 ? (
                          <>gets back <span className="font-semibold text-positive">{formatMoney(cents, cur)}</span></>
                        ) : (
                          <>owes <span className="font-semibold text-negative">{formatMoney(-cents, cur)}</span></>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>

                <p className="mb-2 text-sm font-medium text-muted">
                  {simplify ? "Suggested payments" : "Who owes whom"}
                </p>
                <ul className="flex flex-col overflow-hidden rounded-2xl bg-surface">
                  {debts.map((d, i) => (
                    <DebtRow key={i} debt={d} members={members} currency={cur} groupId={id} meId={me.id} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DebtRow({
  debt,
  members,
  currency,
  groupId,
  meId,
}: {
  debt: Debt;
  members: Profile[];
  currency: string;
  groupId: string;
  meId: string;
}) {
  const from = findProfile(members, debt.fromUserId);
  const to = findProfile(members, debt.toUserId);
  const iAmInvolved = debt.fromUserId === meId || debt.toUserId === meId;

  const settleHref =
    `/groups/${groupId}/settle?from=${debt.fromUserId}&to=${debt.toUserId}` +
    `&amount=${(debt.amountCents / 100).toFixed(2)}&currency=${currency}`;

  return (
    <li className="flex items-center gap-2 border-b border-border/50 px-4 py-3 text-sm last:border-b-0">
      <Avatar src={from?.avatar_url} name={from?.display_name} email={from?.email} size={30} />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{profileName(from)}</span>
        <span className="text-muted"> owes </span>
        <span className="font-semibold text-negative">{formatMoney(debt.amountCents, currency)}</span>
        <span className="text-muted"> to </span>
        <span className="font-medium">{profileName(to)}</span>
      </span>
      {iAmInvolved && (
        <Link href={settleHref} className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-brand">
          Settle
        </Link>
      )}
    </li>
  );
}
