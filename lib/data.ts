import { createClient } from "./supabase/server";
import type {
  Group,
  Profile,
  ExpenseWithSplits,
  Settlement,
  RecurringExpense,
  GroupCategory,
} from "./types";

export interface GroupData {
  group: Group;
  members: Profile[];
  expenses: ExpenseWithSplits[];
  settlements: Settlement[];
  categories: GroupCategory[];
}

/**
 * Load a group with members, expenses (+splits) and settlements.
 * Returns null if the group doesn't exist or the user can't see it (RLS).
 *
 * One round-trip per relation, no per-row queries (no N+1). Payer/participant
 * profiles are resolved from the members list on the client, not re-fetched.
 */
export async function getGroupData(groupId: string): Promise<GroupData | null> {
  const supabase = await createClient();

  const [
    { data: group },
    { data: memberRows },
    { data: expRows },
    { data: settleRows },
    { data: catRows },
  ] = await Promise.all([
    supabase.from("groups").select("*").eq("id", groupId).single(),
    supabase.from("group_members").select("profile:profiles(*)").eq("group_id", groupId),
    supabase
      .from("expenses")
      .select("*, splits:expense_splits(*)")
      .eq("group_id", groupId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("settlements")
      .select("*")
      .eq("group_id", groupId)
      .order("paid_on", { ascending: false }),
    supabase
      .from("group_categories")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true }),
  ]);

  if (!group) return null;

  const members = (memberRows ?? [])
    .map((r) => (r as unknown as { profile: Profile }).profile)
    .filter(Boolean);

  return {
    group: group as Group,
    members,
    expenses: (expRows ?? []) as unknown as ExpenseWithSplits[],
    settlements: (settleRows ?? []) as unknown as Settlement[],
    categories: (catRows ?? []) as unknown as GroupCategory[],
  };
}

export async function getRecurring(groupId: string): Promise<RecurringExpense[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("group_id", groupId)
    .order("next_run", { ascending: true });
  return (data ?? []) as unknown as RecurringExpense[];
}

export function findProfile(members: Profile[], id: string | null | undefined): Profile | undefined {
  if (!id) return undefined;
  return members.find((m) => m.id === id);
}
