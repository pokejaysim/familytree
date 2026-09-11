-- Applied to hosted project nurkbmmacrepftlepizi on 2026-09-10 via Supabase MCP (name: initial_family_tree_schema).
-- Kept here as the source of truth for the schema. See CLAUDE.md for the model overview.

-- Trees and membership -----------------------------------------------------
create table public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create type public.tree_role as enum ('owner', 'editor', 'viewer');
create table public.tree_members (
  tree_id uuid not null references public.trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tree_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (tree_id, user_id)
);
create or replace function public.handle_new_tree() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.tree_members (tree_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger on_tree_created after insert on public.trees for each row execute function public.handle_new_tree();
create or replace function public.tree_role_of(p_tree uuid) returns public.tree_role
language sql stable security definer set search_path = public as $$
  select role from public.tree_members where tree_id = p_tree and user_id = auth.uid() $$;
create or replace function public.can_view_tree(p_tree uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tree_members where tree_id = p_tree and user_id = auth.uid()) $$;
create or replace function public.can_edit_tree(p_tree uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tree_members where tree_id = p_tree and user_id = auth.uid() and role in ('owner','editor')) $$;

-- People, families, events, sources, citations, media --------------------------
create type public.sex as enum ('M', 'F', 'X', 'U');
create table public.people (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  given_names text not null default '', surname text not null default '',
  maiden_name text, nickname text, sex public.sex not null default 'U',
  birth_date text, birth_date_sort date, birth_place text,
  death_date text, death_date_sort date, death_place text,
  is_living boolean not null default false, bio text, photo_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index people_tree_idx on public.people(tree_id);
create index people_surname_idx on public.people(tree_id, surname, given_names);
create type public.union_type as enum ('marriage', 'partnership', 'unknown');
create table public.families (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  partner1_id uuid references public.people(id) on delete set null,
  partner2_id uuid references public.people(id) on delete set null,
  union_type public.union_type not null default 'marriage',
  start_date text, start_date_sort date, start_place text, end_date text, end_date_sort date, notes text,
  created_at timestamptz not null default now()
);
create index families_tree_idx on public.families(tree_id);
create index families_p1_idx on public.families(partner1_id);
create index families_p2_idx on public.families(partner2_id);
create type public.child_relation as enum ('biological', 'adopted', 'step', 'foster', 'unknown');
create table public.family_children (
  family_id uuid not null references public.families(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  relation public.child_relation not null default 'biological',
  sort_order int not null default 0,
  primary key (family_id, person_id)
);
create index family_children_person_idx on public.family_children(person_id);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  type text not null, date_text text, date_sort date, place text, description text,
  created_at timestamptz not null default now(),
  check (person_id is not null or family_id is not null)
);
create index events_person_idx on public.events(person_id);
create index events_family_idx on public.events(family_id);
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  title text not null, author text, publication text, repository text, url text, notes text,
  created_at timestamptz not null default now()
);
create index sources_tree_idx on public.sources(tree_id);
create table public.citations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  page text, quote text,
  confidence smallint not null default 2 check (confidence between 0 and 3),
  created_at timestamptz not null default now(),
  check (person_id is not null or family_id is not null or event_id is not null)
);
create index citations_person_idx on public.citations(person_id);
create index citations_source_idx on public.citations(source_id);
create table public.media (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,
  storage_path text not null, mime_type text, caption text, date_text text,
  created_at timestamptz not null default now()
);
create index media_person_idx on public.media(person_id);
create index media_source_idx on public.media(source_id);
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger people_updated_at before update on public.people for each row execute function public.set_updated_at();

-- RLS ------------------------------------------------------------------------
alter table public.trees enable row level security;
alter table public.tree_members enable row level security;
alter table public.people enable row level security;
alter table public.families enable row level security;
alter table public.family_children enable row level security;
alter table public.events enable row level security;
alter table public.sources enable row level security;
alter table public.citations enable row level security;
alter table public.media enable row level security;
create policy "trees: members can view" on public.trees for select using (public.can_view_tree(id));
create policy "trees: anyone signed in can create" on public.trees for insert with check (auth.uid() = owner_id);
create policy "trees: owner can update" on public.trees for update using (owner_id = auth.uid());
create policy "trees: owner can delete" on public.trees for delete using (owner_id = auth.uid());
create policy "members: members can view" on public.tree_members for select using (public.can_view_tree(tree_id));
create policy "members: owner manages" on public.tree_members for all using (public.tree_role_of(tree_id) = 'owner') with check (public.tree_role_of(tree_id) = 'owner');
create policy "people: view" on public.people for select using (public.can_view_tree(tree_id));
create policy "people: edit" on public.people for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));
create policy "families: view" on public.families for select using (public.can_view_tree(tree_id));
create policy "families: edit" on public.families for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));
create policy "family_children: view" on public.family_children for select using (exists (select 1 from public.families f where f.id = family_id and public.can_view_tree(f.tree_id)));
create policy "family_children: edit" on public.family_children for all using (exists (select 1 from public.families f where f.id = family_id and public.can_edit_tree(f.tree_id))) with check (exists (select 1 from public.families f where f.id = family_id and public.can_edit_tree(f.tree_id)));
create policy "events: view" on public.events for select using (public.can_view_tree(tree_id));
create policy "events: edit" on public.events for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));
create policy "sources: view" on public.sources for select using (public.can_view_tree(tree_id));
create policy "sources: edit" on public.sources for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));
create policy "citations: view" on public.citations for select using (public.can_view_tree(tree_id));
create policy "citations: edit" on public.citations for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));
create policy "media: view" on public.media for select using (public.can_view_tree(tree_id));
create policy "media: edit" on public.media for all using (public.can_edit_tree(tree_id)) with check (public.can_edit_tree(tree_id));

-- Storage ----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 26214400, array['image/jpeg','image/png','image/webp','image/gif','image/tiff','application/pdf'])
on conflict (id) do nothing;
create policy "media bucket: members read" on storage.objects for select using (bucket_id = 'media' and public.can_view_tree(((storage.foldername(name))[1])::uuid));
create policy "media bucket: editors write" on storage.objects for insert with check (bucket_id = 'media' and public.can_edit_tree(((storage.foldername(name))[1])::uuid));
create policy "media bucket: editors update" on storage.objects for update using (bucket_id = 'media' and public.can_edit_tree(((storage.foldername(name))[1])::uuid));
create policy "media bucket: editors delete" on storage.objects for delete using (bucket_id = 'media' and public.can_edit_tree(((storage.foldername(name))[1])::uuid));

-- Hardening (applied as migration harden_helper_functions) ----------------------
revoke execute on function public.can_view_tree(uuid) from anon, authenticated, public;
revoke execute on function public.can_edit_tree(uuid) from anon, authenticated, public;
revoke execute on function public.tree_role_of(uuid) from anon, authenticated, public;
revoke execute on function public.handle_new_tree() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;

-- Applied as migration move_helpers_to_private_schema: RLS needs EXECUTE for the calling role,
-- so the helpers live in a non-exposed schema instead of being revoked.
create schema if not exists private;
grant usage on schema private to authenticated, anon;
alter function public.can_view_tree(uuid) set schema private;
alter function public.can_edit_tree(uuid) set schema private;
alter function public.tree_role_of(uuid) set schema private;
grant execute on function private.can_view_tree(uuid) to authenticated, anon;
grant execute on function private.can_edit_tree(uuid) to authenticated, anon;
grant execute on function private.tree_role_of(uuid) to authenticated, anon;

-- Applied as migration trees_owner_can_view: INSERT..RETURNING checks SELECT policy before the
-- membership trigger fires, so the owner must be able to see the tree directly.
drop policy "trees: members can view" on public.trees;
create policy "trees: members can view" on public.trees for select
  using (owner_id = auth.uid() or private.can_view_tree(id));
