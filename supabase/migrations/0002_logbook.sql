-- Dive logbook schema (2026-10-07-dive-logbook-design.md)

create table public.sites (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null,
    lat double precision,
    lon double precision,
    country text,
    water text check (water in ('salt', 'fresh')),
    altitude_m integer,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.log_entries (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    log_number integer not null,
    dive_date date not null,
    entry_time time,
    duration_s integer,
    max_depth_m numeric(5, 2),
    site_id uuid references public.sites (id) on delete set null,
    buddies text[] not null default '{}',
    gas jsonb,
    water_temp_c numeric(4, 1),
    vis_shallow_m numeric(5, 1),
    vis_deep_m numeric(5, 1),
    notes text,
    details jsonb not null default '{}',
    recording_id uuid unique references public.dives (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner, log_number)
);

create table public.media (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    entry_id uuid not null references public.log_entries (id) on delete cascade,
    kind text not null check (kind in ('photo', 'video_link')),
    path text,                 -- storage path for photos
    url text,                  -- for video links
    width integer,
    height integer,
    taken_at timestamptz,      -- from EXIF, for step 4d
    lat double precision,      -- from EXIF, for step 4d
    lon double precision,
    caption text,
    created_at timestamptz not null default now()
);


alter table public.sites enable row level security;

grant select, insert, update, delete on table public.sites to authenticated;

create policy "owner reads and writes own sites" on public.sites
    for all to authenticated
    using (owner = auth.uid())
    with check (owner = auth.uid());

alter table public.log_entries enable row level security;

grant select, insert, update, delete on table public.log_entries to authenticated;

create policy "owner reads and writes own log_entries" on public.log_entries
    for all to authenticated
    using (owner = auth.uid())
    with check (owner = auth.uid());

alter table public.media enable row level security;

grant select, insert, update, delete on table public.media to authenticated;

create policy "owner reads and writes own media" on public.media
    for all to authenticated
    using (owner = auth.uid())
    with check (owner = auth.uid());

insert into storage.buckets (id, name, public) values ('dive-photos', 'dive-photos', false);

create policy "owner reads and writes own dive photos" on storage.objects
    for all to authenticated
    using (bucket_id = 'dive-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'dive-photos' and (storage.foldername(name))[1] = auth.uid()::text);
