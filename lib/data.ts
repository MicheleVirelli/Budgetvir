import { cache } from "react";
import { createClient } from "./supabase/server";
import type {
  Group,
  Profile,
  ExpenseWithSplits,
  Settlement,
  RecurringExpense,
  GroupCategory,
  GroupBudget,
} from "./types";

export const DEFAULT_PAGE_SIZE = 25;

export interface GroupMeta {
  group: Group;
  members: Profile[];
  categories: GroupCategory[];
}

export interface GroupBalanceExpense {
  amount: number;
  currency: string;
  paid_by: string;
  splits: { user_id: string; amount_owed: number }[];
}

export interface GroupBalanceData {
  expenses: GroupBalanceExpense[];
  settlements: Settlement[];
}

export interface GroupFeedData extends GroupMeta {
  expenses: ExpenseWithSplits[];
  settlements: Settlement[];
}

export interface GroupData extends GroupFeedData {
  budgets: GroupBudget[];
}

/**
 * Loads metadata only (group, members, categories).
 * Cached per-request to avoid redundant queries across layouts/components.
 */
export const getGroupMeta = cache(async (groupId: string): Promise<GroupMeta | null> => {
  const supabase = await createClient();

  const [{ data: group }, { data: memberRows }, { data: catRows }] = await Promise.all([
    supabase.from("groups").select("*").eq("id", groupId).single(),
    supabase.from("group_members").select("profile:profiles(*)").eq("group_id", groupId),
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
    categories: (catRows ?? []) as unknown as GroupCategory[],
  };
});

/**
 * Loads minimal debt vectors (amount, currency, paid_by, and splits owed) to compute
 * group balances and net summaries. Ultra-lightweight payload.
 */
export const getGroupBalanceData = cache(async (groupId: string): Promise<GroupBalanceData> => {
  const supabase = await createClient();

  const [{ data: expRows }, { data: settleRows }] = await Promise.all([
    supabase
      .from("expenses")
      .select("amount, currency, paid_by, splits:expense_splits(user_id, amount_owed)")
      .eq("group_id", groupId),
    supabase
      .from("settlements")
      .select("*")
      .eq("group_id", groupId)
      .order("paid_on", { ascending: false }),
  ]);

  return {
    expenses: (expRows ?? []) as unknown as GroupBalanceExpense[],
    settlements: (settleRows ?? []) as unknown as Settlement[],
  };
});

/**
 * Loads a single expense with its splits.
 * Much faster than loading the entire group feed when only one expense is needed.
 */
export const getSingleExpense = cache(async (expenseId: string): Promise<ExpenseWithSplits | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("*, splits:expense_splits(*)")
    .eq("id", expenseId)
    .single();

  if (error || !data) return null;
  return data as unknown as ExpenseWithSplits;
});

/**
 * Loads paginated expenses for the feed with full display details.
 */
export const getGroupFeedExpenses = cache(
  async (groupId: string, offset = 0, limit = DEFAULT_PAGE_SIZE): Promise<ExpenseWithSplits[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("expenses")
      .select("*, splits:expense_splits(*)")
      .eq("group_id", groupId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return (data ?? []) as unknown as ExpenseWithSplits[];
  },
);

/**
 * Loads group data needed for the main feed with server-side limit.
 */
export const getGroupFeedData = cache(
  async (groupId: string, limit = DEFAULT_PAGE_SIZE): Promise<GroupFeedData | null> => {
    const supabase = await createClient();

    const [meta, expRows, { data: settleRows }] = await Promise.all([
      getGroupMeta(groupId),
      getGroupFeedExpenses(groupId, 0, limit),
      supabase
        .from("settlements")
        .select("*")
        .eq("group_id", groupId)
        .order("paid_on", { ascending: false }),
    ]);

    if (!meta) return null;

    return {
      ...meta,
      expenses: expRows,
      settlements: (settleRows ?? []) as unknown as Settlement[],
    };
  },
);

/**
 * Load full group data with budgets.
 */
export const getGroupData = cache(async (groupId: string): Promise<GroupData | null> => {
  const supabase = await createClient();

  const [feedData, { data: budgetRows }] = await Promise.all([
    getGroupFeedData(groupId, 100),
    supabase.from("group_budgets").select("*").eq("group_id", groupId),
  ]);

  if (!feedData) return null;

  return {
    ...feedData,
    budgets: (budgetRows ?? []) as unknown as GroupBudget[],
  };
});

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
