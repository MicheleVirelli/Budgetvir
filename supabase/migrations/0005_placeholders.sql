-- Placeholder members: people added to a group by name only, without an account.
-- They are ordinary rows in `profiles` (so paid_by / splits / settlements keep
-- referencing profiles.id unchanged) but have no auth user. Idempotent.
-- Run after 0001-0004.

-- New columns.
alter table public.profiles
  add column if not exists is_placeholder boolean not null default false,
  add column if not exists created_by uuid references public.profiles (id);

-- Placeholders have no real email — allow null (unique still holds for non-nulls).
alter table public.profiles alter column email drop not null;

-- Drop the hard FK profiles.id -> auth.users(id) so placeholder profiles can
-- exist without an auth user. Real profiles still get id = auth.uid() via the
-- signup trigger. (Discover the constraint name rather than assuming it.)
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'f'
    and confrelid = 'auth.users'::regclass;
  if c is not null then
    execute format('alter table public.profiles drop constraint %I', c);
  end if;
end $$;

-- RLS: an authenticated user may create placeholder profiles they own.
drop policy if exists "profiles_insert_placeholder" on public.profiles;
create policy "profiles_insert_placeholder" on public.profiles
  for insert to authenticated
  with check (is_placeholder = true and created_by = auth.uid() and id <> auth.uid());

-- Owner may update their own profile and any placeholder they created.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid() or created_by = auth.uid())
  with check (id = auth.uid() or created_by = auth.uid());

-- Owner may delete placeholders they created.
drop policy if exists "profiles_delete_placeholder" on public.profiles;
create policy "profiles_delete_placeholder" on public.profiles
  for delete to authenticated
  using (created_by = auth.uid() and is_placeholder = true);

-- Member-joined activity: actor is the real adder; store who was added so the
-- feed can say "X added Y" for placeholders.
create or replace function public.log_member_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity (group_id, actor_id, type, data)
  values (new.group_id, coalesce(auth.uid(), new.user_id), 'member_joined',
          jsonb_build_object('user_id', new.user_id));
  return new;
end $$;
