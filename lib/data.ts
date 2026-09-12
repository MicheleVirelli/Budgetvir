import { createClient } from "./supabase/server";
import type { Group, Profile, ExpenseWithSplits } from "./types";

export interface GroupData {
  group: Group;
  members: Profile[];
  expenses: ExpenseWithSplits[];
}

/**
 * Load a group with its members and expenses (each with splits).
 * Returns null if the group doesn't exist or the user can't see it (RLS).
 */
export async function getGroupData(groupId: string): Promise<GroupData | null> {
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .single();
  if (!group) return null;

  const { data: memberRows } = await supabase
    .from("group_members")
    .select("profile:profiles(*)")
    .eq("group_id", groupId);

  const members = (memberRows ?? [])
    .map((r) => (r as unknown as { profile: Profile }).profile)
    .filter(Boolean);

  const { data: expRows } = await supabase
    .from("expenses")
    .select("*, splits:expense_splits(*)")
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  const expenses = (expRows ?? []) as unknown as ExpenseWithSplits[];

  return { group: group as Group, members, expenses };
}

export function findProfile(
  members: Profile[],
  id: string,
): Profile | undefined {
  return members.find((m) => m.id === id);
}
