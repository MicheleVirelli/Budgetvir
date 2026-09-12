import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/auth";
import { toCents } from "@/lib/split";
import { formatMoney } from "@/lib/balances";
import Avatar from "@/components/Avatar";
import BottomNav from "@/components/BottomNav";

export const dynamic = "force-dynamic";

interface GroupRow {
  id: string;
  name: string;
  image_url: string | null;
}

export default async function HomePage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group:groups(id, name, image_url)")
    .eq("user_id", profile.id);

  const groups: GroupRow[] = (memberships ?? [])
    .map((m) => (m as unknown as { group: GroupRow }).group)
    .filter(Boolean);

  const groupIds = groups.map((g) => g.id);

  // Per-group net for the current user (paid − owed).
  const netByGroup = new Map<string, number>();
  if (groupIds.length > 0) {
    const { data: expenses } = await supabase
      .from("expenses")
      .select("group_id, amount, paid_by, expense_splits(user_id, amount_owed)")
      .in("group_id", groupIds);

    for (const exp of expenses ?? []) {
      const e = exp as unknown as {
        group_id: string;
        amount: number;
        paid_by: string;
        expense_splits: { user_id: string; amount_owed: number }[];
      };
      let net = netByGroup.get(e.group_id) ?? 0;
      if (e.paid_by === profile.id) net += toCents(e.amount);
      for (const s of e.expense_splits) {
        if (s.user_id === profile.id) net -= toCents(s.amount_owed);
      }
      netByGroup.set(e.group_id, net);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 pb-2 pt-6">
        <h1 className="text-2xl font-bold">Groups</h1>
        <Avatar
          src={profile.avatar_url}
          name={profile.display_name}
          email={profile.email}
          size={36}
        />
      </header>

      <main className="flex-1 px-4 pb-24">
        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-2 pt-2">
            {groups.map((g) => {
              const net = netByGroup.get(g.id) ?? 0;
              return (
                <li key={g.id}>
                  <Link
                    href={`/groups/${g.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 active:bg-surface-2"
                  >
                    <Avatar src={g.image_url} name={g.name} size={48} shapeSquare />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{g.name}</p>
                      <p className="text-sm text-muted">{balanceLabel(net)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Link
        href="/groups/new"
        className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand px-6 py-3 font-semibold text-black shadow-lg"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New group
      </Link>

      <BottomNav />
    </div>
  );
}

function balanceLabel(netCents: number): string {
  if (netCents === 0) return "Settled up";
  if (netCents > 0) return `you are owed ${formatMoney(netCents)}`;
  return `you owe ${formatMoney(-netCents)}`;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 pt-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface text-4xl">
        👋
      </div>
      <h2 className="text-lg font-semibold">No groups yet</h2>
      <p className="max-w-xs text-sm text-muted">
        Create a group to start splitting expenses with friends and family.
      </p>
    </div>
  );
}
