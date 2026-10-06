-- Dive log backend database schema (2026-10-06-dive-log-backend-v1-design.md)

create table public.dives (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    device_serial text not null,
    dive_number integer not null,
    start_local text not null,          -- device local time, ISO without zone
    file_path text not null,            -- storage path inside bucket dive-logs
    file_sha256 text not null,
    parser_version integer not null,
    summary jsonb not null,
    record jsonb not null,              -- full RecordedDive (schema 1)
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner, device_serial, dive_number, start_local)
);

alter table public.dives enable row level security;

grant select, insert, update, delete on table public.dives to authenticated;

create policy "owner reads and writes own dives" on public.dives
    for all to authenticated
    using (owner = auth.uid())
    with check (owner = auth.uid());

insert into storage.buckets (id, name, public) values ('dive-logs', 'dive-logs', false);

create policy "owner reads and writes own dive files" on storage.objects
    for all to authenticated
    using (bucket_id = 'dive-logs' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'dive-logs' and (storage.foldername(name))[1] = auth.uid()::text);
