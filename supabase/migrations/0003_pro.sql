-- Budgetvir — "Pro" features: settlements, comments, activity feed, recurring
-- expenses, categories/notes, group settings (simplify debts, invite link,
-- default currency). Idempotent — safe to re-run. Run after 0001 and 0002.

-- ---------------------------------------------------------------------------
-- Column additions
-- ---------------------------------------------------------------------------

alter table public.groups
  add column if not exists simplify_debts boolean not null default false,
  add column if not exists default_currency text not null default 'EUR',
  add column if not exists invite_token uuid not null default gen_random_uuid(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_groups_invite_token on public.groups (invite_token);

alter table public.expenses
  add column if not exists category text not null default 'general',
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

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

create table if not exists public.expense_comments (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id    uuid not null references public.profiles (id),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_expense on public.expense_comments (expense_id, created_at);

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

create table if not exists public.recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  title        text not null,
  emoji        text,
  category     text not null default 'general',
  amount       numeric(12, 2) not null check (amount > 0),
  currency     text not null default 'EUR',
  paid_by      uuid not null references public.profiles (id),
  split_type   text not null check (split_type in ('equal', 'percentage', 'amount', 'shares', 'adjustment')),
  split_config jsonb not null default '[]'::jsonb,
  frequency    text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  next_run     date not null,
  active       boolean not null default true,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_recurring_group on public.recurring_expenses (group_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.settlements        enable row level security;
alter table public.expense_comments   enable row level security;
alter table public.activity           enable row level security;
alter table public.recurring_expenses enable row level security;

drop policy if exists "settlements_all" on public.settlements;
create policy "settlements_all" on public.settlements
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

drop policy if exists "recurring_all" on public.recurring_expenses;
create policy "recurring_all" on public.recurring_expenses
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

drop policy if exists "activity_select" on public.activity;
create policy "activity_select" on public.activity
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

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

-- ---------------------------------------------------------------------------
-- Activity triggers (actor falls back to created_by when auth.uid() is null,
-- e.g. when seeding from the SQL editor).
-- ---------------------------------------------------------------------------

create or replace function public.log_expense_activity()
returns trigger language plpgsql security definer set search_path = public as $$
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
end $$;

drop trigger if exists trg_expense_activity on public.expenses;
create trigger trg_expense_activity
after insert or update or delete on public.expenses
for each row execute function public.log_expense_activity();

create or replace function public.log_settlement_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity (group_id, actor_id, type, data)
  values (new.group_id, coalesce(auth.uid(), new.created_by), 'settlement_added',
          jsonb_build_object('from_user', new.from_user, 'to_user', new.to_user,
                             'amount', new.amount, 'currency', new.currency));
  return new;
end $$;

drop trigger if exists trg_settlement_activity on public.settlements;
create trigger trg_settlement_activity
after insert on public.settlements
for each row execute function public.log_settlement_activity();

create or replace function public.log_comment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from expenses where id = new.expense_id;
  insert into activity (group_id, actor_id, type, expense_id, data)
  values (gid, coalesce(auth.uid(), new.user_id), 'comment_added', new.expense_id,
          jsonb_build_object('body', left(new.body, 140)));
  return new;
end $$;

drop trigger if exists trg_comment_activity on public.expense_comments;
create trigger trg_comment_activity
after insert on public.expense_comments
for each row execute function public.log_comment_activity();

create or replace function public.log_member_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity (group_id, actor_id, type, data)
  values (new.group_id, new.user_id, 'member_joined', jsonb_build_object('user_id', new.user_id));
  return new;
end $$;

drop trigger if exists trg_member_activity on public.group_members;
create trigger trg_member_activity
after insert on public.group_members
for each row execute function public.log_member_activity();

-- ---------------------------------------------------------------------------
-- RPC: join a group via its invite token (bypasses RLS safely).
-- ---------------------------------------------------------------------------

create or replace function public.join_group_by_token(token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
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
end $$;

-- Read a group's public info by invite token without being a member yet.
create or replace function public.group_preview_by_token(token uuid)
returns table (id uuid, name text, image_url text, member_count bigint)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.image_url, (select count(*) from group_members m where m.group_id = g.id)
  from groups g where g.invite_token = token;
$$;

-- ---------------------------------------------------------------------------
-- RPC: materialise any recurring expenses that are now due.
-- ---------------------------------------------------------------------------

create or replace function public.generate_due_recurring(gid uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  item jsonb;
  new_exp uuid;
  run date;
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
      run := (case r.frequency
        when 'daily'   then run + interval '1 day'
        when 'weekly'  then run + interval '1 week'
        when 'monthly' then run + interval '1 month'
        when 'yearly'  then run + interval '1 year'
      end)::date;
    end loop;

    update recurring_expenses set next_run = run where id = r.id;
  end loop;

  return created;
end $$;
