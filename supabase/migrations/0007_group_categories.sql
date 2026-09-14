-- Per-group custom categories (emoji + name). Idempotent. Run after 0001-0006.
-- The category key stored on expenses is either a built-in key (e.g. 'dining')
-- or the id of a row here; unknown keys fall back to "General" in the app.

create table if not exists public.group_categories (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  emoji      text not null,
  label      text not null check (char_length(label) between 1 and 40),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_group_categories_group on public.group_categories (group_id);

alter table public.group_categories enable row level security;

drop policy if exists "group_categories_all" on public.group_categories;
create policy "group_categories_all" on public.group_categories
  for all to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));
