import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGroupData, findProfile } from "@/lib/data";
import { getSessionProfile } from "@/lib/supabase/auth";
import { toCents } from "@/lib/split";
import { formatMoney, profileName } from "@/lib/balances";
import type { ExpenseWithSplits } from "@/lib/types";
import GroupHeader from "./GroupHeader";

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

  const { group, members, expenses } = data;

  // Current user's net across the group.
  let myNet = 0;
  for (const exp of expenses) {
    if (exp.paid_by === me.id) myNet += toCents(exp.amount);
    for (const s of exp.splits) if (s.user_id === me.id) myNet -= toCents(s.amount_owed);
  }

  return (
    <div className="flex min-h-dvh flex-col pb-28">
      <GroupHeader
        groupId={group.id}
        name={group.name}
        imageUrl={group.image_url}
        memberCount={members.length}
        summary={summaryLabel(myNet)}
      />

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        <ActionChip href={`/groups/${group.id}/balances`}>Balances</ActionChip>
        <ActionChip href={`/groups/${group.id}/members`}>
          Members · {members.length}
        </ActionChip>
      </div>

      <main className="flex-1 px-4">
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 pt-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-3xl">
              🧾
            </div>
            <p className="text-muted">No expenses yet.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {expenses.map((exp) => (
              <ExpenseRow key={exp.id} exp={exp} meId={me.id} members={members} />
            ))}
          </ul>
        )}
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

function summaryLabel(netCents: number): string {
  if (netCents === 0) return "You are settled up";
  if (netCents > 0) return `You are owed ${formatMoney(netCents)}`;
  return `You owe ${formatMoney(-netCents)}`;
}

function ActionChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium active:bg-surface"
    >
      {children}
    </Link>
  );
}

function ExpenseRow({
  exp,
  meId,
  members,
}: {
  exp: ExpenseWithSplits;
  meId: string;
  members: import("@/lib/types").Profile[];
}) {
  const payer = findProfile(members, exp.paid_by);
  const myShare = exp.splits.find((s) => s.user_id === meId);
  const iPaid = exp.paid_by === meId;

  let relation: { label: string; cents: number; positive: boolean } | null = null;
  if (iPaid) {
    const lent = toCents(exp.amount) - (myShare ? toCents(myShare.amount_owed) : 0);
    if (lent > 0) relation = { label: "you lent", cents: lent, positive: true };
  } else if (myShare) {
    relation = { label: "you borrowed", cents: toCents(myShare.amount_owed), positive: false };
  }

  const date = new Date(exp.expense_date);

  return (
    <li>
      <Link
        href={`/groups/${exp.group_id}/expenses/${exp.id}`}
        className="flex items-center gap-3 border-b border-border/60 py-3 active:bg-surface"
      >
        <div className="flex w-9 flex-col items-center">
          <span className="text-[11px] uppercase text-muted">
            {date.toLocaleString("en", { month: "short" })}
          </span>
          <span className="text-lg font-semibold leading-none">{date.getDate()}</span>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-xl">
          {exp.emoji || "🧾"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{exp.title}</p>
          <p className="truncate text-sm text-muted">
            {profileName(payer)} paid {formatMoney(toCents(exp.amount), exp.currency)}
          </p>
        </div>
        {relation && (
          <div className="text-right">
            <p className={`text-xs ${relation.positive ? "text-positive" : "text-negative"}`}>
              {relation.label}
            </p>
            <p className={`font-semibold ${relation.positive ? "text-positive" : "text-negative"}`}>
              {formatMoney(relation.cents, exp.currency)}
            </p>
          </div>
        )}
      </Link>
    </li>
  );
}
