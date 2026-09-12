-- Budgetvir — storage buckets for avatars/group photos and expense receipts.
-- Paste this into the Supabase SQL Editor and run it (after 0001_init.sql).

-- Public buckets: anyone can read objects by URL; only signed-in users can write.
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Public read for both buckets.
drop policy if exists "budgetvir_public_read" on storage.objects;
create policy "budgetvir_public_read" on storage.objects
  for select
  using (bucket_id in ('avatars', 'receipts'));

-- Signed-in users can upload.
drop policy if exists "budgetvir_authenticated_insert" on storage.objects;
create policy "budgetvir_authenticated_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'receipts'));

-- Signed-in users can update objects they own.
drop policy if exists "budgetvir_authenticated_update" on storage.objects;
create policy "budgetvir_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'receipts') and owner = auth.uid());

-- Signed-in users can delete objects they own.
drop policy if exists "budgetvir_authenticated_delete" on storage.objects;
create policy "budgetvir_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'receipts') and owner = auth.uid());
