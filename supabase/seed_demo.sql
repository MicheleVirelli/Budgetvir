-- Budgetvir — demo data seed.
--
-- Creates a fully populated 3-person group for a@email.com, b@email.com and
-- c@email.com. Those three accounts must already exist (sign them up in the
-- app first — the signup trigger fills public.profiles). Run this in the
-- Supabase SQL Editor. Safe to re-run: it skips if the demo group already
-- exists.

do $$
declare
  ua uuid;
  ub uuid;
  uc uuid;
  gid uuid;
  eid uuid;
begin
  select id into ua from public.profiles where lower(email) = 'a@email.com';
  select id into ub from public.profiles where lower(email) = 'b@email.com';
  select id into uc from public.profiles where lower(email) = 'c@email.com';

  if ua is null or ub is null or uc is null then
    raise notice 'Missing account(s): a=% b=% c=%. Sign up all three first, then re-run.', ua, ub, uc;
    return;
  end if;

  if exists (select 1 from public.groups where name = 'Viaggio a Lisbona' and created_by = ua) then
    raise notice 'Demo group already exists — nothing to do.';
    return;
  end if;

  insert into public.groups (name, created_by, default_currency, simplify_debts)
  values ('Viaggio a Lisbona', ua, 'EUR', false)
  returning id into gid;

  insert into public.group_members (group_id, user_id) values
    (gid, ua), (gid, ub), (gid, uc);

  -- 1) Equal among all three (60 → 20/20/20)
  insert into public.expenses (group_id, title, emoji, category, amount, currency, paid_by, split_type, created_by, expense_date)
  values (gid, 'Spesa supermercato', '🛒', 'groceries', 60.00, 'EUR', ua, 'equal', ua, current_date - 9)
  returning id into eid;
  insert into public.expense_splits (expense_id, user_id, amount_owed) values
    (eid, ua, 20.00), (eid, ub, 20.00), (eid, uc, 20.00);

  -- 2) Equal among a + b only (45 → 22.50/22.50)
  insert into public.expenses (group_id, title, emoji, category, amount, currency, paid_by, split_type, created_by, expense_date)
  values (gid, 'Cena fuori', '🍽️', 'dining', 45.00, 'EUR', ub, 'equal', ub, current_date - 8)
  returning id into eid;
  insert into public.expense_splits (expense_id, user_id, amount_owed) values
    (eid, ua, 22.50), (eid, ub, 22.50);

  -- 3) Percentage (300 → 50/25/25)
  insert into public.expenses (group_id, title, emoji, category, amount, currency, paid_by, split_type, notes, created_by, expense_date)
  values (gid, 'Airbnb Lisbona', '🏨', 'accommodation', 300.00, 'EUR', ua, 'percentage', 'Check-in ore 15', ua, current_date - 7)
  returning id into eid;
  insert into public.expense_splits (expense_id, user_id, amount_owed, raw_value) values
    (eid, ua, 150.00, 50), (eid, ub, 75.00, 25), (eid, uc, 75.00, 25);
  insert into public.expense_comments (expense_id, user_id, body) values
    (eid, ua, 'Confermato il check-in alle 15'),
    (eid, ub, 'Perfetto, grazie!');

  -- 4) Exact amounts (74 → 30/24/20)
  insert into public.expenses (group_id, title, emoji, category, amount, currency, paid_by, split_type, created_by, expense_date)
  values (gid, 'Biglietti treno', '🚆', 'transport', 74.00, 'EUR', uc, 'amount', uc, current_date - 6)
  returning id into eid;
  insert into public.expense_splits (expense_id, user_id, amount_owed, raw_value) values
    (eid, ua, 30.00, 30.00), (eid, ub, 24.00, 24.00), (eid, uc, 20.00, 20.00);

  -- 5) Shares (210, shares 2/2/3 → 60/60/90)
  insert into public.expenses (group_id, title, emoji, category, amount, currency, paid_by, split_type, created_by, expense_date)
  values (gid, 'Casa vacanze 3 notti', '🏠', 'home', 210.00, 'EUR', ub, 'shares', ub, current_date - 5)
  returning id into eid;
  insert into public.expense_splits (expense_id, user_id, amount_owed, raw_value) values
    (eid, ua, 60.00, 2), (eid, ub, 60.00, 2), (eid, uc, 90.00, 3);

  -- 6) Adjustment (24, b +6 extra → 6/12/6)
  insert into public.expenses (group_id, title, emoji, category, amount, currency, paid_by, split_type, created_by, expense_date)
  values (gid, 'Gelati', '🍦', 'dining', 24.00, 'EUR', ua, 'adjustment', ua, current_date - 4)
  returning id into eid;
  insert into public.expense_splits (expense_id, user_id, amount_owed, raw_value) values
    (eid, ua, 6.00, 0), (eid, ub, 12.00, 6), (eid, uc, 6.00, 0);

  -- 7) Different currency (USD 40 equal → 13.34/13.33/13.33)
  insert into public.expenses (group_id, title, emoji, category, amount, currency, paid_by, split_type, created_by, expense_date)
  values (gid, 'Souvenir', '🛍️', 'shopping', 40.00, 'USD', uc, 'equal', uc, current_date - 3)
  returning id into eid;
  insert into public.expense_splits (expense_id, user_id, amount_owed) values
    (eid, ua, 13.34), (eid, ub, 13.33), (eid, uc, 13.33);

  -- 8) Drinks equal (18 → 6/6/6)
  insert into public.expenses (group_id, title, emoji, category, amount, currency, paid_by, split_type, created_by, expense_date)
  values (gid, 'Birre notturne', '🍺', 'drinks', 18.00, 'EUR', ub, 'equal', ub, current_date - 2)
  returning id into eid;
  insert into public.expense_splits (expense_id, user_id, amount_owed) values
    (eid, ua, 6.00), (eid, ub, 6.00), (eid, uc, 6.00);

  -- Settlements (partial repayments)
  insert into public.settlements (group_id, from_user, to_user, amount, currency, note, created_by, paid_on) values
    (gid, ub, ua, 20.00, 'EUR', 'Quota spesa', ub, current_date - 1),
    (gid, uc, ua, 30.00, 'EUR', 'Acconto', uc, current_date - 1);

  -- A recurring monthly template (Netflix, split equally 6.00/6.00/5.99)
  insert into public.recurring_expenses
    (group_id, title, emoji, category, amount, currency, paid_by, split_type, split_config, frequency, next_run, created_by)
  values (
    gid, 'Abbonamento Netflix', '🎬', 'entertainment', 17.99, 'EUR', ua, 'equal',
    jsonb_build_array(
      jsonb_build_object('user_id', ua, 'amount_owed', 6.00, 'raw_value', null),
      jsonb_build_object('user_id', ub, 'amount_owed', 6.00, 'raw_value', null),
      jsonb_build_object('user_id', uc, 'amount_owed', 5.99, 'raw_value', null)
    ),
    'monthly', date_trunc('month', current_date + interval '1 month')::date, ua
  );

  raise notice 'Demo group "Viaggio a Lisbona" created with 8 expenses, 2 settlements and 1 recurring template.';
end $$;
