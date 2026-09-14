-- Custom recurrence interval: "every N days/weeks/months/years". Idempotent.
-- Run after 0001-0005.

alter table public.recurring_expenses
  add column if not exists interval_count integer not null default 1;

alter table public.recurring_expenses
  drop constraint if exists recurring_interval_positive;
alter table public.recurring_expenses
  add constraint recurring_interval_positive check (interval_count >= 1);

-- Advance next_run by interval_count units (was hard-coded to 1).
create or replace function public.generate_due_recurring(gid uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  item jsonb;
  new_exp uuid;
  run date;
  step interval;
  created int := 0;
  guard int := 0;
begin
  if not public.is_group_member(gid, auth.uid()) then
    raise exception 'forbidden';
  end if;

  for r in
    select * from recurring_expenses
    where group_id = gid and active and next_run <= current_date
  loop
    step := greatest(r.interval_count, 1) * (case r.frequency
      when 'daily'   then interval '1 day'
      when 'weekly'  then interval '1 week'
      when 'monthly' then interval '1 month'
      when 'yearly'  then interval '1 year'
    end);

    run := r.next_run;
    while run <= current_date and guard < 200 loop
      insert into expenses (group_id, title, emoji, amount, currency, category, paid_by, split_type, expense_date, created_by)
      values (r.group_id, r.title, r.emoji, r.amount, r.currency, r.category, r.paid_by, r.split_type, run, r.created_by)
      returning id into new_exp;

      for item in select * from jsonb_array_elements(r.split_config)
      loop
        insert into expense_splits (expense_id, user_id, amount_owed, raw_value)
        values (new_exp, (item->>'user_id')::uuid, (item->>'amount_owed')::numeric, nullif(item->>'raw_value', '')::numeric);
      end loop;

      created := created + 1;
      guard := guard + 1;
      run := (run + step)::date;
    end loop;

    update recurring_expenses set next_run = run where id = r.id;
  end loop;

  return created;
end $$;
