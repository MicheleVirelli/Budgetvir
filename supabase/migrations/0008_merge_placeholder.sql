-- Merge a placeholder member into a real account: reassign all references
-- (expenses, splits, settlements, comments, recurring templates, activity) from
-- the placeholder to the target, add the target as a member, and drop the
-- placeholder. SECURITY DEFINER so it can rewrite rows across tables; the caller
-- must be a member of the group. Idempotent. Run after 0001-0007.

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

  -- Make sure the target is a member of the group.
  insert into group_members (group_id, user_id)
  values (gid, target)
  on conflict (group_id, user_id) do nothing;

  update expenses set paid_by    = target where group_id = gid and paid_by    = ph;
  update expenses set created_by = target where group_id = gid and created_by = ph;

  -- Splits: avoid violating unique(expense_id, user_id) if the target already
  -- had a split on the same expense.
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

  -- Drop the placeholder profile only if nothing references it anywhere.
  if not exists (select 1 from group_members where user_id = ph)
     and not exists (select 1 from expenses where paid_by = ph or created_by = ph)
     and not exists (select 1 from expense_splits where user_id = ph)
     and not exists (select 1 from settlements where from_user = ph or to_user = ph)
     and not exists (select 1 from expense_comments where user_id = ph) then
    delete from profiles where id = ph and is_placeholder;
  end if;
end $$;
