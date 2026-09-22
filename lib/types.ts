export type SplitType =
  | "equal"
  | "percentage"
  | "amount"
  | "shares"
  | "adjustment";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_placeholder?: boolean;
  created_by?: string | null;
  created_at?: string;
}

export interface Group {
  id: string;
  name: string;
  image_url: string | null;
  created_by: string;
  created_at: string;
  simplify_debts?: boolean;
  default_currency?: string;
  invite_token?: string;
}

export interface GroupCategory {
  id: string;
  group_id: string;
  emoji: string;
  label: string;
  created_by: string;
  created_at: string;
}

export const TOTAL_BUDGET_KEY = "__total__";

export interface GroupBudget {
  id: string;
  group_id: string;
  category: string; // '__total__' or a category key/id
  amount: number;
  currency: string;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
  profile?: Profile;
}

export interface Expense {
  id: string;
  group_id: string;
  title: string;
  emoji: string | null;
  amount: number;
  currency: string;
  paid_by: string;
  split_type: SplitType;
  receipt_url: string | null;
  expense_date: string;
  category: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export type ActivityType =
  | "expense_added"
  | "expense_updated"
  | "expense_deleted"
  | "settlement_added"
  | "comment_added"
  | "member_joined";

export interface Settlement {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  currency: string;
  note: string | null;
  paid_on: string;
  created_by: string;
  created_at: string;
}

export interface ExpenseComment {
  id: string;
  expense_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface Activity {
  id: string;
  group_id: string;
  actor_id: string | null;
  type: ActivityType;
  expense_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringExpense {
  id: string;
  group_id: string;
  title: string;
  emoji: string | null;
  category: string;
  amount: number;
  currency: string;
  paid_by: string;
  split_type: SplitType;
  split_config: { user_id: string; amount_owed: number; raw_value: number | null }[];
  frequency: Frequency;
  interval_count: number;
  next_run: string;
  active: boolean;
  created_by: string;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount_owed: number;
  raw_value: number | null;
}

export interface ExpenseWithSplits extends Expense {
  splits: ExpenseSplit[];
  payer?: Profile;
}

export interface BankConnection {
  id: string;
  user_id: string;
  aspsp_name: string;
  aspsp_country: string;
  eb_session_id: string | null;
  status: "pending" | "linked" | "error" | "expired";
  valid_until: string | null;
  created_at: string;
}

export interface BankAccount {
  id: string;
  user_id: string;
  connection_id: string;
  eb_account_uid: string;
  name: string | null;
  iban_masked: string | null;
  currency: string;
  last_synced_at: string | null;
  created_at: string;
}

export interface BankTransaction {
  id: string;
  user_id: string;
  account_id: string;
  eb_tx_id: string;
  booking_date: string | null;
  amount: number; // always positive; see direction
  currency: string;
  direction: "debit" | "credit";
  description: string | null;
  counterparty: string | null;
  status: "booked" | "pending";
  added_group_id: string | null;
  added_expense_id: string | null;
  dismissed: boolean;
  created_at: string;
}
