-- Budgetvir — Atomic expense creation and update function.
-- Guarantees that expenses and their splits are committed together or rolled back.

create or replace function public.save_expense_atomic(
  p_expense_id uuid,
  p_group_id uuid,
  p_title text,
  p_emoji text,
  p_category text,
  p_amount numeric,
  p_currency text,
  p_paid_by uuid,
  p_split_type text,
  p_receipt_url text,
  p_notes text,
  p_expense_date date,
  p_splits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  s jsonb;
begin
  -- 1. Authorization check: user must be an active member of the group
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'Not authorized: you are not a member of this group';
  end if;

  -- 2. Insert or Update parent expense row
  if p_expense_id is null then
    insert into public.expenses (
      group_id,
      title,
      emoji,
      category,
      amount,
      currency,
      paid_by,
      split_type,
      receipt_url,
      notes,
      expense_date,
      created_by
    ) values (
      p_group_id,
      p_title,
      p_emoji,
      p_category,
      p_amount,
      p_currency,
      p_paid_by,
      p_split_type::public.split_type,
      p_receipt_url,
      p_notes,
      p_expense_date,
      auth.uid()
    ) returning id into v_expense_id;
  else
    update public.expenses set
      title = p_title,
      emoji = p_emoji,
      category = p_category,
      amount = p_amount,
      currency = p_currency,
      paid_by = p_paid_by,
      split_type = p_split_type::public.split_type,
      receipt_url = p_receipt_url,
      notes = p_notes,
      expense_date = p_expense_date,
      updated_at = now()
    where id = p_expense_id and group_id = p_group_id;

    v_expense_id := p_expense_id;

    -- Replace existing splits
    delete from public.expense_splits where expense_id = v_expense_id;
  end if;

  -- 3. Insert all split rows atomically
  for s in select * from jsonb_array_elements(p_splits)
  loop
    insert into public.expense_splits (
      expense_id,
      user_id,
      amount_owed,
      raw_value
    ) values (
      v_expense_id,
      (s->>'user_id')::uuid,
      (s->>'amount_owed')::numeric,
      (s->>'raw_value')::numeric
    );
  end loop;

  return v_expense_id;
end;
$$;
