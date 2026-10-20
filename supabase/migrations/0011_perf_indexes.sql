-- Budgetvir — Performance indexes for feed sorting and debt calculations.
-- Idempotent — safe to re-run.

-- 1. Accelerates expense feed retrieval and chronological ordering
CREATE INDEX IF NOT EXISTS idx_expenses_feed 
  ON public.expenses (group_id, expense_date DESC, created_at DESC);

-- 2. Accelerates settlements retrieval by group and date
CREATE INDEX IF NOT EXISTS idx_settlements_feed 
  ON public.settlements (group_id, paid_on DESC);

-- 3. Covering index to speed up join and debt calculation on expense_splits
CREATE INDEX IF NOT EXISTS idx_expense_splits_covering 
  ON public.expense_splits (expense_id, user_id, amount_owed);

