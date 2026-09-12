export type SplitType =
  | "equal"
  | "percentage"
  | "amount"
  | "shares"
  | "adjustment";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at?: string;
}

export interface Group {
  id: string;
  name: string;
  image_url: string | null;
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
