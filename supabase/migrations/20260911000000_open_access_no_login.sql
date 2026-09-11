-- TEMPORARY open-access mode (applied 2026-09-11 at the owner's request): the app runs without a login for now.
-- To restore members-only access: drop every policy named "open-access: …" on public.* and storage.objects,
-- and set REQUIRE_LOGIN = true in src/App.tsx.

alter table public.trees alter column owner_id drop not null;

create or replace function public.handle_new_tree() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into public.tree_members (tree_id, user_id, role) values (new.id, new.owner_id, 'owner');
  end if;
  return new;
end $$;

create policy "open-access: trees" on public.trees for all to anon, authenticated using (true) with check (true);
create policy "open-access: people" on public.people for all to anon, authenticated using (true) with check (true);
create policy "open-access: families" on public.families for all to anon, authenticated using (true) with check (true);
create policy "open-access: family_children" on public.family_children for all to anon, authenticated using (true) with check (true);
create policy "open-access: events" on public.events for all to anon, authenticated using (true) with check (true);
create policy "open-access: sources" on public.sources for all to anon, authenticated using (true) with check (true);
create policy "open-access: citations" on public.citations for all to anon, authenticated using (true) with check (true);
create policy "open-access: media" on public.media for all to anon, authenticated using (true) with check (true);
create policy "open-access: storage read" on storage.objects for select to anon, authenticated using (bucket_id = 'media');
create policy "open-access: storage write" on storage.objects for insert to anon, authenticated with check (bucket_id = 'media');
create policy "open-access: storage update" on storage.objects for update to anon, authenticated using (bucket_id = 'media');
create policy "open-access: storage delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'media');
