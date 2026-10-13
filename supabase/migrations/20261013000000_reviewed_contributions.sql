-- Reviewed contributions (2026-10-13).
--
-- Editors no longer write to the tree directly. Every change is submitted as a "change request" (one row per user action,
-- holding an ordered list of inserts/updates/deletes) and waits until an admin approves it; admins' own changes go through the
-- same path but apply immediately. Every applied row change is written to change_log, so an approved change can be undone.
-- Accounts can also say "this is me" and link themselves to a person in the tree; an admin approves the link.

-- 1. Only admins write directly -----------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['people','families','family_children','events','citations','sources','media','trees'] loop
    execute format('drop policy if exists "members: write" on public.%I', t);
    execute format('drop policy if exists "%s: edit" on public.%I', t, t);
    execute format('create policy "admins: write" on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())', t);
  end loop;
end $$;
drop policy if exists "trees: owner can update" on public.trees;
drop policy if exists "trees: owner can delete" on public.trees;
drop policy if exists "trees: anyone signed in can create" on public.trees;

-- Storage: editors may still upload (a photo has to exist before it can be reviewed); only admins update or delete files.
drop policy if exists "members: storage delete" on storage.objects;
drop policy if exists "members: storage update" on storage.objects;
drop policy if exists "media bucket: editors delete" on storage.objects;
drop policy if exists "media bucket: editors update" on storage.objects;
drop policy if exists "media bucket: editors write" on storage.objects;
create policy "admins: storage delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and private.is_admin());
create policy "admins: storage update" on storage.objects for update to authenticated using (bucket_id = 'media' and private.is_admin());

-- 2. Change requests -----------------------------------------------------------------------------------------------------
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  summary text not null,
  subject_person_id uuid,            -- the profile the change is about (no FK: it may be a person this request creates)
  changes jsonb not null,            -- [{table, op: insert|update|delete, key: {col: value}, data: {col: value}, before: row}]
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'reverted')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index change_requests_status_idx on public.change_requests (tree_id, status, created_at);
create index change_requests_subject_idx on public.change_requests (subject_person_id);
alter table public.change_requests enable row level security;
create policy "requests: own or admin read" on public.change_requests for select to authenticated using (author_id = auth.uid() or private.is_admin());
-- No insert/update/delete policies: all writes go through the functions below.

-- 3. Change log (the safety net) -----------------------------------------------------------------------------------------
create table public.change_log (
  id bigserial primary key,
  request_id uuid references public.change_requests(id) on delete set null,
  table_name text not null,
  op text not null,
  row_key jsonb not null,
  before jsonb,
  after jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index change_log_request_idx on public.change_log (request_id);
alter table public.change_log enable row level security;
create policy "log: admin read" on public.change_log for select to authenticated using (private.is_admin());

create or replace function private.log_change() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; k jsonb;
begin
  if TG_OP = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  if TG_TABLE_NAME = 'family_children' then k := jsonb_build_object('family_id', r->'family_id', 'person_id', r->'person_id');
  else k := jsonb_build_object('id', r->'id'); end if;
  insert into public.change_log (request_id, table_name, op, row_key, before, after, actor)
  values (nullif(current_setting('sft.request_id', true), '')::uuid, TG_TABLE_NAME, lower(TG_OP), k,
          case when TG_OP <> 'INSERT' then to_jsonb(old) end, case when TG_OP <> 'DELETE' then to_jsonb(new) end, auth.uid());
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['people','families','family_children','events','citations','sources','media'] loop
    execute format('drop trigger if exists log_change on public.%I', t);
    execute format('create trigger log_change after insert or update or delete on public.%I for each row execute function private.log_change()', t);
  end loop;
end $$;

-- 4. Applying changes ----------------------------------------------------------------------------------------------------
create or replace function private.editable_table(t text) returns boolean language sql immutable as $$
  select t in ('people','families','family_children','events','citations','sources','media') $$;

-- Comma-separated, quoted list of the keys of j that are real columns of public.t (minus any in excl).
create or replace function private.col_list(t text, j jsonb, excl text[] default '{}') returns text language sql stable set search_path = public as $$
  select string_agg(format('%I', k), ', ' order by k) from jsonb_object_keys(coalesce(j, '{}')) k
  where k <> all(excl) and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = k) $$;

-- Extra WHERE clause keeping a statement inside one tree.
create or replace function private.tree_scope(t text, p_tree uuid) returns text language sql immutable as $$
  select case when t = 'family_children' then format(' and exists (select 1 from public.families f where f.id = family_id and f.tree_id = %L)', p_tree)
              else format(' and tree_id = %L', p_tree) end $$;

create or replace function private.apply_change(p_tree uuid, c jsonb) returns void language plpgsql security definer set search_path = public as $$
declare t text := c->>'table'; op text := c->>'op'; d jsonb := coalesce(c->'data', '{}'); k jsonb := coalesce(c->'key', '{}');
        cols text; keycols text; n int;
begin
  if not private.editable_table(t) then raise exception 'Changes to % are not supported', t; end if;
  if op = 'insert' then
    if t <> 'family_children' then d := d || jsonb_build_object('tree_id', p_tree); end if;
    cols := private.col_list(t, d);
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', t, cols, cols, t) using d;
    return;
  end if;
  keycols := private.col_list(t, k);
  if keycols is null then raise exception 'A change is missing the record it applies to'; end if;
  if op = 'update' then
    cols := private.col_list(t, d, array['id', 'tree_id', 'created_at', 'updated_at']);
    if cols is null then return; end if;
    execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where (%s) = (select %s from jsonb_populate_record(null::public.%I, $2))%s',
                   t, cols, cols, t, keycols, keycols, t, private.tree_scope(t, p_tree)) using d, k;
  elsif op = 'delete' then
    execute format('delete from public.%I where (%s) = (select %s from jsonb_populate_record(null::public.%I, $1))%s',
                   t, keycols, keycols, t, private.tree_scope(t, p_tree)) using k;
  else
    raise exception 'Unknown operation %', op;
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Something this change refers to has since been changed or removed.'; end if;
end $$;

create or replace function private.apply_request(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare r public.change_requests; c jsonb;
begin
  select * into r from public.change_requests where id = p_id for update;
  perform set_config('sft.request_id', p_id::text, true);
  begin
    for c in select value from jsonb_array_elements(r.changes) loop
      perform private.apply_change(r.tree_id, c);
    end loop;
  exception when foreign_key_violation then
    raise exception 'This change depends on a person or family that is not in the tree yet. Approve the earlier change it builds on first.';
  end;
  perform set_config('sft.request_id', '', true);
  update public.change_requests set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
end $$;

-- Editors and admins submit; admins' submissions apply at once. Returns {id, status}.
create or replace function public.submit_changes(p_tree uuid, p_summary text, p_subject uuid, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; enriched jsonb := '[]'; c jsonb; b jsonb; t text; keycols text;
begin
  if not private.can_edit() then raise exception 'Your account can view the tree but not change it yet.'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then raise exception 'Nothing to submit'; end if;
  for c in select value from jsonb_array_elements(p_changes) loop
    t := c->>'table'; b := null;
    if not private.editable_table(t) then raise exception 'Changes to % are not supported', t; end if;
    if c->>'op' in ('update', 'delete') then
      keycols := private.col_list(t, c->'key');
      if keycols is null then raise exception 'A change is missing the record it applies to'; end if;
      execute format('select to_jsonb(x) from public.%I x where (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) limit 1', t, keycols, keycols, t)
        into b using c->'key';
    end if;
    enriched := enriched || jsonb_build_array(c || jsonb_build_object('before', b));
  end loop;
  insert into public.change_requests (tree_id, author_id, summary, subject_person_id, changes)
  values (p_tree, auth.uid(), left(p_summary, 300), p_subject, enriched) returning id into rid;
  if private.is_admin() then
    perform private.apply_request(rid);
    return jsonb_build_object('id', rid, 'status', 'approved');
  end if;
  return jsonb_build_object('id', rid, 'status', 'pending');
end $$;

create or replace function public.review_request(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'Only admins can review changes.'; end if;
  if not exists (select 1 from public.change_requests where id = p_id and status = 'pending') then raise exception 'This change has already been handled.'; end if;
  if p_approve then
    perform private.apply_request(p_id);
    update public.change_requests set review_note = p_note where id = p_id;
  else
    update public.change_requests set status = 'rejected', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  end if;
end $$;

create or replace function public.withdraw_request(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.change_requests set status = 'withdrawn' where id = p_id and author_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Only your own changes that are still waiting can be withdrawn.'; end if;
end $$;

-- Undo an approved change: put every row it touched back the way it was (cascaded deletes included).
create or replace function public.revert_request(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare l record; cols text; keycols text;
  parent_first text[] := array['people','sources','families','family_children','events','citations','media'];
begin
  if not private.is_admin() then raise exception 'Only admins can undo changes.'; end if;
  if not exists (select 1 from public.change_requests where id = p_id and status = 'approved') then raise exception 'Only approved changes can be undone.'; end if;
  perform set_config('sft.request_id', '', true);
  -- 1. remove rows the change created, children before parents
  for l in select * from public.change_log where request_id = p_id and op = 'insert'
           order by array_position(parent_first, table_name) desc, id desc loop
    keycols := private.col_list(l.table_name, l.row_key);
    execute format('delete from public.%I where (%s) = (select %s from jsonb_populate_record(null::public.%I, $1))', l.table_name, keycols, keycols, l.table_name) using l.row_key;
  end loop;
  -- 2. restore values the change overwrote, latest first so the oldest "before" wins
  for l in select * from public.change_log where request_id = p_id and op = 'update' order by id desc loop
    keycols := private.col_list(l.table_name, l.row_key);
    cols := private.col_list(l.table_name, l.before, array['id', 'family_id', 'person_id', 'created_at', 'updated_at']);
    if cols is not null then
      execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where (%s) = (select %s from jsonb_populate_record(null::public.%I, $2))',
                     l.table_name, cols, cols, l.table_name, keycols, keycols, l.table_name) using l.before, l.row_key;
    end if;
  end loop;
  -- 3. bring back rows the change deleted, parents before children
  for l in select * from public.change_log where request_id = p_id and op = 'delete'
           order by array_position(parent_first, table_name), id loop
    cols := private.col_list(l.table_name, l.before);
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict do nothing', l.table_name, cols, cols, l.table_name) using l.before;
  end loop;
  update public.change_requests set status = 'reverted', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
end $$;

-- 5. "This is me" --------------------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists person_id uuid references public.people(id) on delete set null;
alter table public.profiles add column if not exists person_status text check (person_status in ('pending', 'approved'));
create unique index if not exists profiles_person_approved on public.profiles (person_id) where person_status = 'approved';

create or replace function public.claim_person(p_person uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_approved() then raise exception 'Your account has not been approved yet.'; end if;
  if p_person is null then
    update public.profiles set person_id = null, person_status = null where id = auth.uid();
    return;
  end if;
  if not exists (select 1 from public.people where id = p_person) then raise exception 'That person is not in the tree.'; end if;
  if exists (select 1 from public.profiles where person_id = p_person and person_status = 'approved' and id <> auth.uid()) then
    raise exception 'Someone else has already linked their account to this person.';
  end if;
  update public.profiles set person_id = p_person,
         person_status = case when private.is_admin() then 'approved' else 'pending' end
  where id = auth.uid();
end $$;

create or replace function public.review_claim(p_profile uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'Only admins can review profile links.'; end if;
  if p_approve then update public.profiles set person_status = 'approved' where id = p_profile and person_id is not null;
  else update public.profiles set person_id = null, person_status = null where id = p_profile; end if;
end $$;

-- Badge for admins: changes and profile links waiting for review.
create or replace function public.pending_review_count() returns integer language sql stable security definer set search_path = public as $$
  select case when private.is_admin() then
    (select count(*)::int from public.change_requests where status = 'pending') + (select count(*)::int from public.profiles where person_status = 'pending')
  else 0 end $$;

revoke all on function public.submit_changes(uuid, text, uuid, jsonb), public.review_request(uuid, boolean, text), public.withdraw_request(uuid),
  public.revert_request(uuid), public.claim_person(uuid), public.review_claim(uuid, boolean), public.pending_review_count() from public, anon;
grant execute on function public.submit_changes(uuid, text, uuid, jsonb), public.review_request(uuid, boolean, text), public.withdraw_request(uuid),
  public.revert_request(uuid), public.claim_person(uuid), public.review_claim(uuid, boolean), public.pending_review_count() to authenticated;

-- Hardening (applied as reviewed_contributions_hardening)
alter function private.editable_table(text) set search_path = public;
alter function private.tree_scope(text, uuid) set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.pending_member_count() from public, anon;
grant execute on function public.pending_member_count() to authenticated;
