-- Login is back on (2026-09-12). The temporary "open-access:" rules now apply to signed-in users only:
-- anyone with an account can read and edit every tree (family members self-serve sign up on the login page).
-- Anonymous visitors get nothing. The tree_members role model stays for a later, finer-grained pass.
alter policy "open-access: trees" on public.trees to authenticated;
alter policy "open-access: people" on public.people to authenticated;
alter policy "open-access: families" on public.families to authenticated;
alter policy "open-access: family_children" on public.family_children to authenticated;
alter policy "open-access: events" on public.events to authenticated;
alter policy "open-access: sources" on public.sources to authenticated;
alter policy "open-access: citations" on public.citations to authenticated;
alter policy "open-access: media" on public.media to authenticated;
alter policy "open-access: storage read" on storage.objects to authenticated;
alter policy "open-access: storage write" on storage.objects to authenticated;
alter policy "open-access: storage update" on storage.objects to authenticated;
alter policy "open-access: storage delete" on storage.objects to authenticated;
