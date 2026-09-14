-- Fix: a group's creator could neither read back their brand-new group nor add
-- themselves as the first member, because the SELECT policy on groups (and the
-- inline groups subquery inside the group_members INSERT policy) required an
-- already-existing membership. Idempotent — safe to re-run. Run after 0001-0003.

-- SECURITY DEFINER creator check, so it is not itself filtered by RLS on groups.
create or replace function public.is_group_creator(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.groups g where g.id = gid and g.created_by = uid);
$$;

-- The owner can always see their own group (even before the membership row).
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated
  using (public.is_group_member(id, auth.uid()) or created_by = auth.uid());

-- The creator (or an existing member) can add members. Using the DEFINER
-- helper avoids the RLS-on-groups recursion that blocked the first insert.
drop policy if exists "group_members_insert" on public.group_members;
create policy "group_members_insert" on public.group_members
  for insert to authenticated with check (
    public.is_group_member(group_id, auth.uid())
    or public.is_group_creator(group_id, auth.uid())
  );
