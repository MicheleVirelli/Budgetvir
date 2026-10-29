-- ===========================================================================
-- Budgetvir — Complete Database Schema, Storage, Triggers, RPCs & RLS Policies
-- ===========================================================================
-- Paste this entire file into the Supabase SQL Editor and run it.
-- This script is completely idempotent: safe to execute on fresh databases
-- or re-run on existing setups.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- Profiles: represents real authenticated users and placeholder members.
create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  email          text unique,
  display_name   text,
  avatar_url     text,
  is_placeholder boolean not null default false,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

-- Groups
create table if not exists public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  image_url        text,
  simplify_debts   boolean not null default false,
  default_currency text not null default 'EUR',
  invite_token     uuid not null default gen_random_uuid(),
  created_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists idx_groups_invite_token on public.groups (invite_token);

-- Group Members (join table)
create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists idx_group_members_user on public.group_members (user_id);

-- Group Custom Categories
create table if not exists public.group_categories (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  emoji      text not null,
  label      text not null check (char_length(label) between 1 and 40),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_group_categories_group on public.group_categories (group_id);

-- Group Monthly Budgets
create table if not exists public.group_budgets (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  category   text not null, -- '__total__' or custom category id/key
  amount     numeric(12, 2) not null check (amount > 0),
  currency   text not null default 'EUR',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (group_id, category)
);
create index if not exists idx_group_budgets_group on public.group_budgets (group_id);

-- Expenses
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  title        text not null,
  emoji        text,
  category     text not null default 'general',
  amount       numeric(12, 2) not null check (amount > 0),
  currency     text not null default 'EUR',
  paid_by      uuid not null references public.profiles (id),
  split_type   text not null check (split_type in ('equal', 'percentage', 'amount', 'shares', 'adjustment')),
  receipt_url  text,
  notes        text,
  expense_date date not null default current_date,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_expenses_group on public.expenses (group_id);
create index if not exists idx_expenses_feed on public.expenses (group_id, expense_date desc, created_at desc);

-- Expense Splits
create table if not exists public.expense_splits (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  amount_owed numeric(12, 2) not null,
  raw_value   numeric(12, 4),
  unique (expense_id, user_id)
);
create index if not exists idx_expense_splits_expense on public.expense_splits (expense_id);
create index if not exists idx_expense_splits_user on public.expense_splits (user_id);
create index if not exists idx_expense_splits_covering on public.expense_splits (expense_id, user_id, amount_owed);

-- Settlements (debt settlements / payments)
create table if not exists public.settlements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  from_user  uuid not null references public.profiles (id),
  to_user    uuid not null references public.profiles (id),
  amount     numeric(12, 2) not null check (amount > 0),
  currency   text not null default 'EUR',
  note       text,
  paid_on    date not null default current_date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_settlements_group on public.settlements (group_id);
create index if not exists idx_settlements_feed on public.settlements (group_id, paid_on desc);

-- Expense Comments
create table if not exists public.expense_comments (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id    uuid not null references public.profiles (id),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_expense on public.expense_comments (expense_id, created_at);

-- Activity Feed
create table if not exists public.activity (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  type        text not null,
  expense_id  uuid,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_group on public.activity (group_id, created_at desc);

-- Recurring Expenses Templates
create table if not exists public.recurring_expenses (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups (id) on delete cascade,
  title          text not null,
  emoji          text,
  category       text not null default 'general',
  amount         numeric(12, 2) not null check (amount > 0),
  currency       text not null default 'EUR',
  paid_by        uuid not null references public.profiles (id),
  split_type     text not null check (split_type in ('equal', 'percentage', 'amount', 'shares', 'adjustment')),
  split_config   jsonb not null default '[]'::jsonb,
  frequency      text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count integer not null default 1 check (interval_count >= 1),
  next_run       date not null,
  active         boolean not null default true,
  created_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_recurring_group on public.recurring_expenses (group_id);

-- Bank Connections (Enable Banking PSD2)
create table if not exists public.bank_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  aspsp_name    text not null,
  aspsp_country text not null default 'IT',
  eb_session_id text,
  status        text not null default 'pending',
  valid_until   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_bank_connections_user on public.bank_connections (user_id);

-- Bank Accounts
create table if not exists public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  connection_id  uuid not null references public.bank_connections (id) on delete cascade,
  eb_account_uid text not null,
  name           text,
  iban_masked    text,
  currency       text not null default 'EUR',
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, eb_account_uid)
);
create index if not exists idx_bank_accounts_user on public.bank_accounts (user_id);

-- Bank Transactions
create table if not exists public.bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  account_id       uuid not null references public.bank_accounts (id) on delete cascade,
  eb_tx_id         text not null,
  booking_date     date,
  amount           numeric(12, 2) not null,
  currency         text not null default 'EUR',
  direction        text not null default 'debit',
  description      text,
  counterparty     text,
  status           text not null default 'booked',
  added_group_id   uuid references public.groups (id) on delete set null,
  added_expense_id uuid references public.expenses (id) on delete set null,
  dismissed        boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (user_id, eb_tx_id)
);
create index if not exists idx_bank_tx_user_date on public.bank_transactions (user_id, booking_date desc);

-- Web Push Notifications Subscriptions
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- 2. Storage Buckets & Policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('receipts', 'receipts', true)
on conflict (id) do nothing;

drop policy if exists "budgetvir_public_read" on storage.objects;
create policy "budgetvir_public_read" on storage.objects
  for select
  using (bucket_id in ('avatars', 'receipts'));

drop policy if exists "budgetvir_authenticated_insert" on storage.objects;
create policy "budgetvir_authenticated_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'receipts'));

drop policy if exists "budgetvir_authenticated_update" on storage.objects;
create policy "budgetvir_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'receipts') and owner = auth.uid());

drop policy if exists "budgetvir_authenticated_delete" on storage.objects;
create policy "budgetvir_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'receipts') and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Security Definer Helper Functions (RLS bypass guards)
-- ---------------------------------------------------------------------------

create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = gid
      and m.user_id = uid
  );
$$;

create or replace function public.is_group_creator(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = gid
      and g.created_by = uid
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Activity & Signup Triggers
-- ---------------------------------------------------------------------------

-- New auth user signup: profile auto-creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Expense activity logger
create or replace function public.log_expense_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into activity (group_id, actor_id, type, expense_id, data)
    values (new.group_id, coalesce(auth.uid(), new.created_by), 'expense_added', new.id,
            jsonb_build_object('title', new.title, 'amount', new.amount, 'currency', new.currency, 'emoji', new.emoji));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into activity (group_id, actor_id, type, expense_id, data)
    values (new.group_id, coalesce(auth.uid(), new.created_by), 'expense_updated', new.id,
            jsonb_build_object('title', new.title, 'amount', new.amount, 'currency', new.currency, 'emoji', new.emoji));
    return new;
  else
    insert into activity (group_id, actor_id, type, expense_id, data)
    values (old.group_id, coalesce(auth.uid(), old.created_by), 'expense_deleted', old.id,
            jsonb_build_object('title', old.title, 'amount', old.amount, 'currency', old.currency, 'emoji', old.emoji));
    return old;
  end if;
end;
$$;

drop trigger if exists trg_expense_activity on public.expenses;
create trigger trg_expense_activity
after insert or update or delete on public.expenses
for each row execute function public.log_expense_activity();

-- Settlement activity logger
create or replace function public.log_settlement_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity (group_id, actor_id, type, data)
  values (new.group_id, coalesce(auth.uid(), new.created_by), 'settlement_added',
          jsonb_build_object('from_user', new.from_user, 'to_user', new.to_user,
                             'amount', new.amount, 'currency', new.currency));
  return new;
end;
$$;

drop trigger if exists trg_settlement_activity on public.settlements;
create trigger trg_settlement_activity
after insert on public.settlements
for each row execute function public.log_settlement_activity();

-- Comment activity logger
create or replace function public.log_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  select group_id into gid from expenses where id = new.expense_id;
  insert into activity (group_id, actor_id, type, expense_id, data)
  values (gid, coalesce(auth.uid(), new.user_id), 'comment_added', new.expense_id,
          jsonb_build_object('body', left(new.body, 140)));
  return new;
end;
$$;

drop trigger if exists trg_comment_activity on public.expense_comments;
create trigger trg_comment_activity
after insert on public.expense_comments
for each row execute function public.log_comment_activity();

-- Member joined activity logger
create or replace function public.log_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity (group_id, actor_id, type, data)
  values (new.group_id, coalesce(auth.uid(), new.user_id), 'member_joined',
          jsonb_build_object('user_id', new.user_id));
  return new;
end;
$$;

drop trigger if exists trg_member_activity on public.group_members;
create trigger trg_member_activity
after insert on public.group_members
for each row execute function public.log_member_activity();

-- ---------------------------------------------------------------------------
-- 5. Stored Procedures / RPCs
-- ---------------------------------------------------------------------------

-- Atomic Expense Save (Insert or Update with Splits)
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
      p_split_type,
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
      split_type = p_split_type,
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

-- Join a group via invite token
create or replace function public.join_group_by_token(token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  select id into gid from groups where invite_token = token;
  if gid is null then
    raise exception 'Invalid or expired invite link';
  end if;
  insert into group_members (group_id, user_id)
  values (gid, auth.uid())
  on conflict (group_id, user_id) do nothing;
  return gid;
end;
$$;

-- Read public group preview before joining
create or replace function public.group_preview_by_token(token uuid)
returns table (id uuid, name text, image_url text, member_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select g.id, g.name, g.image_url, (select count(*) from group_members m where m.group_id = g.id)
  from groups g where g.invite_token = token;
$$;

-- Materialise due recurring expenses
create or replace function public.generate_due_recurring(gid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
end;
$$;

-- Merge a placeholder profile into a real registered account
create or replace function public.merge_placeholder(gid uuid, ph uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(gid, auth.uid()) then
    raise exception 'forbidden';
  end if;
  if ph = target then
    raise exception 'Placeholder and target are the same';
  end if;
  if not exists (select 1 from profiles where id = ph and is_placeholder) then
    raise exception 'Source is not a placeholder';
  end if;
  if not exists (select 1 from profiles where id = target) then
    raise exception 'Target account not found';
  end if;

  -- Ensure target is a member of the group
  insert into group_members (group_id, user_id)
  values (gid, target)
  on conflict (group_id, user_id) do nothing;

  update expenses set paid_by    = target where group_id = gid and paid_by    = ph;
  update expenses set created_by = target where group_id = gid and created_by = ph;

  -- Remove duplicate split targets before updating
  delete from expense_splits es using expenses e
   where es.expense_id = e.id and e.group_id = gid and es.user_id = target
     and exists (select 1 from expense_splits x where x.expense_id = es.expense_id and x.user_id = ph);
  update expense_splits es set user_id = target
   from expenses e where es.expense_id = e.id and e.group_id = gid and es.user_id = ph;

  update settlements set from_user = target where group_id = gid and from_user = ph;
  update settlements set to_user   = target where group_id = gid and to_user   = ph;

  update expense_comments ec set user_id = target
   from expenses e where ec.expense_id = e.id and e.group_id = gid and ec.user_id = ph;

  update recurring_expenses set paid_by = target where group_id = gid and paid_by = ph;
  update recurring_expenses r set split_config = (
    select jsonb_agg(case when elem->>'user_id' = ph::text
      then jsonb_set(elem, '{user_id}', to_jsonb(target::text)) else elem end)
    from jsonb_array_elements(r.split_config) elem)
   where r.group_id = gid and r.split_config::text like '%' || ph::text || '%';

  update activity set actor_id = target where group_id = gid and actor_id = ph;

  delete from group_members where group_id = gid and user_id = ph;

  -- Clean up placeholder profile if orphaned
  if not exists (select 1 from group_members where user_id = ph)
     and not exists (select 1 from expenses where paid_by = ph or created_by = ph)
     and not exists (select 1 from expense_splits where user_id = ph)
     and not exists (select 1 from settlements where from_user = ph or to_user = ph)
     and not exists (select 1 from expense_comments where user_id = ph) then
    delete from profiles where id = ph and is_placeholder;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.group_categories   enable row level security;
alter table public.group_budgets      enable row level security;
alter table public.expenses           enable row level security;
alter table public.expense_splits     enable row level security;
alter table public.settlements        enable row level security;
alter table public.expense_comments   enable row level security;
alter table public.activity           enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.bank_connections    enable row level security;
alter table public.bank_accounts      enable row level security;
alter table public.bank_transactions  enable row level security;
alter table public.push_subscriptions enable row level security;

-- Profiles:
-- Any signed-in user can search profiles; users can update their own or created placeholders.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_placeholder" on public.profiles;
create policy "profiles_insert_placeholder" on public.profiles
  for insert to authenticated
  with check (is_placeholder = true and created_by = auth.uid() and id <> auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid() or created_by = auth.uid())
  with check (id = auth.uid() or created_by = auth.uid());

drop policy if exists "profiles_delete_placeholder" on public.profiles;
create policy "profiles_delete_placeholder" on public.profiles
  for delete to authenticated
  using (created_by = auth.uid() and is_placeholder = true);

-- Groups:
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated
  using (public.is_group_member(id, auth.uid()) or created_by = auth.uid());

drop policy if exists "groups_insert_self" on public.groups;
create policy "groups_insert_self" on public.groups
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "groups_update_member" on public.groups;
create policy "groups_update_member" on public.groups
  for update to authenticated using (public.is_group_member(id, auth.uid()));

drop policy if exists "groups_delete_creator" on public.groups;
create policy "groups_delete_creator" on public.groups
  for delete to authenticated using (created_by = auth.uid());

-- Group Members:
drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select" on public.group_members
  for select to authenticated using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "group_members_insert" on public.group_members;
create policy "group_members_insert" on public.group_members
  for insert to authenticated with check (
    public.is_group_member(group_id, auth.uid())
    or public.is_group_creator(group_id, auth.uid())
  );

drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete" on public.group_members
  for delete to authenticated using (public.is_group_member(group_id, auth.uid()));

-- Group Categories:
drop policy if exists "group_categories_all" on public.group_categories;
create policy "group_categories_all" on public.group_categories
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

-- Group Budgets:
drop policy if exists "group_budgets_all" on public.group_budgets;
create policy "group_budgets_all" on public.group_budgets
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

-- Expenses:
drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses
  for select to authenticated using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "expenses_insert" on public.expenses;
create policy "expenses_insert" on public.expenses
  for insert to authenticated with check (
    public.is_group_member(group_id, auth.uid()) and created_by = auth.uid()
  );

drop policy if exists "expenses_update" on public.expenses;
create policy "expenses_update" on public.expenses
  for update to authenticated using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "expenses_delete" on public.expenses;
create policy "expenses_delete" on public.expenses
  for delete to authenticated using (public.is_group_member(group_id, auth.uid()));

-- Expense Splits:
drop policy if exists "expense_splits_select" on public.expense_splits;
create policy "expense_splits_select" on public.expense_splits
  for select to authenticated using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

drop policy if exists "expense_splits_write" on public.expense_splits;
create policy "expense_splits_write" on public.expense_splits
  for all to authenticated using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id, auth.uid())
    )
  );

-- Settlements:
drop policy if exists "settlements_all" on public.settlements;
create policy "settlements_all" on public.settlements
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

-- Expense Comments:
drop policy if exists "comments_select" on public.expense_comments;
create policy "comments_select" on public.expense_comments
  for select to authenticated using (
    exists (select 1 from public.expenses e
            where e.id = expense_id and public.is_group_member(e.group_id, auth.uid()))
  );

drop policy if exists "comments_insert" on public.expense_comments;
create policy "comments_insert" on public.expense_comments
  for insert to authenticated with check (
    user_id = auth.uid() and
    exists (select 1 from public.expenses e
            where e.id = expense_id and public.is_group_member(e.group_id, auth.uid()))
  );

drop policy if exists "comments_delete_own" on public.expense_comments;
create policy "comments_delete_own" on public.expense_comments
  for delete to authenticated using (user_id = auth.uid());

-- Activity:
drop policy if exists "activity_select" on public.activity;
create policy "activity_select" on public.activity
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- Recurring Expenses:
drop policy if exists "recurring_all" on public.recurring_expenses;
create policy "recurring_all" on public.recurring_expenses
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

-- Bank Connections:
drop policy if exists "bank_connections_own" on public.bank_connections;
create policy "bank_connections_own" on public.bank_connections
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Bank Accounts:
drop policy if exists "bank_accounts_own" on public.bank_accounts;
create policy "bank_accounts_own" on public.bank_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Bank Transactions:
drop policy if exists "bank_transactions_own" on public.bank_transactions;
create policy "bank_transactions_own" on public.bank_transactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Web Push Subscriptions:
drop policy if exists "push_subscriptions_select" on public.push_subscriptions;
create policy "push_subscriptions_select" on public.push_subscriptions
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_members m1
      join public.group_members m2 on m1.group_id = m2.group_id
      where m1.user_id = auth.uid() and m2.user_id = push_subscriptions.user_id
    )
  );

drop policy if exists "push_subscriptions_insert" on public.push_subscriptions;
create policy "push_subscriptions_insert" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete" on public.push_subscriptions;
create policy "push_subscriptions_delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

