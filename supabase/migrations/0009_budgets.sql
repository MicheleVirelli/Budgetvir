-- Per-group monthly budgets: one overall budget (category = '__total__') plus
-- optional per-category budgets. Idempotent. Run after 0001-0008.

create table if not exists public.group_budgets (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  category   text not null,               -- '__total__' or a category key/id
  amount     numeric(12, 2) not null check (amount > 0),
  currency   text not null default 'EUR',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (group_id, category)
);
create index if not exists idx_group_budgets_group on public.group_budgets (group_id);

alter table public.group_budgets enable row level security;

drop policy if exists "group_budgets_all" on public.group_budgets;
create policy "group_budgets_all" on public.group_budgets
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));
