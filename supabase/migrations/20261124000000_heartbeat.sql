-- Heartbeat (2026-11-24). Supabase paused the free project in October even though a read-only REST ping ran twice a week,
-- so reads alone don't count as activity. The keep-alive workflow now calls public.heartbeat(), which writes one row.
create table if not exists public.heartbeat (id int primary key default 1 check (id = 1), beat_at timestamptz not null default now(), beats bigint not null default 0);
alter table public.heartbeat enable row level security; -- no policies: only the function below touches it
create or replace function public.heartbeat() returns timestamptz language sql security definer set search_path = public as $$
  insert into public.heartbeat (id, beat_at, beats) values (1, now(), 1)
  on conflict (id) do update set beat_at = now(), beats = public.heartbeat.beats + 1
  returning beat_at $$;
revoke all on function public.heartbeat() from public;
grant execute on function public.heartbeat() to anon, authenticated;
