-- Budgetvir — core schema, RLS, and signup trigger.
-- Paste this whole file into the Supabase SQL Editor and run it.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique not null,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  image_url   text,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  title        text not null,
  emoji        text,
  amount       numeric(12, 2) not null check (amount > 0),
  currency     text not null default 'EUR',
  paid_by      uuid not null references public.profiles (id),
  split_type   text not null check (split_type in ('equal', 'percentage', 'amount', 'shares', 'adjustment')),
  receipt_url  text,
  expense_date date not null default current_date,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now()
);

create table if not exists public.expense_splits (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  amount_owed numeric(12, 2) not null,
  raw_value   numeric(12, 4),
  unique (expense_id, user_id)
);

create index if not exists idx_group_members_user on public.group_members (user_id);
create index if not exists idx_expenses_group on public.expenses (group_id);
create index if not exists idx_expense_splits_expense on public.expense_splits (expense_id);
create index if not exists idx_expense_splits_user on public.expense_splits (user_id);

-- ---------------------------------------------------------------------------
-- Helper: membership check as SECURITY DEFINER so RLS policies never recurse.
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

-- ---------------------------------------------------------------------------
-- Signup trigger: create a profile row for every new auth user.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_splits enable row level security;

-- profiles: any signed-in user can read (needed to search members by email);
-- users may only edit their own profile.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- groups: visible to members; created by self; editable/deletable by members/creator.
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated using (public.is_group_member(id, auth.uid()));

drop policy if exists "groups_insert_self" on public.groups;
create policy "groups_insert_self" on public.groups
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "groups_update_member" on public.groups;
create policy "groups_update_member" on public.groups
  for update to authenticated using (public.is_group_member(id, auth.uid()));

drop policy if exists "groups_delete_creator" on public.groups;
create policy "groups_delete_creator" on public.groups
  for delete to authenticated using (created_by = auth.uid());

-- group_members: members can view; the creator or an existing member can add
-- people; members can remove people.
drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select" on public.group_members
  for select to authenticated using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "group_members_insert" on public.group_members;
create policy "group_members_insert" on public.group_members
  for insert to authenticated with check (
    public.is_group_member(group_id, auth.uid())
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete" on public.group_members
  for delete to authenticated using (public.is_group_member(group_id, auth.uid()));

-- expenses: full access to group members.
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

-- expense_splits: access governed by membership of the parent expense's group.
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
