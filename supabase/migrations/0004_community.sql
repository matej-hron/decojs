-- DecoTrail community (docs/superpowers/specs/2026-10-08-decotrail-community-design.md):
-- member profiles, per-dive visibility, read access to other members' dives.
-- Run once in the Supabase SQL editor after 0001–0003. Safe to run again.
--
-- Security model: the owner-only RLS policies of log_entries, sites, media and dives stay as they are.
-- Other members read dives ONLY through the security definer functions below, which return the allowed
-- columns: never notes, never the share token, site and photo coordinates only when the owner ticked
-- share_location. Every join from an entry to a site, photo or recording also requires the same owner,
-- because the foreign keys do not: otherwise a member could attach someone else's row to their own dive.

-- ---------------------------------------------------------------------------
-- Visibility of a dive
-- ---------------------------------------------------------------------------

-- Adding the column with a default sets every existing dive to 'members'.
alter table public.log_entries add column if not exists visibility text not null default 'members'
    constraint log_entries_visibility_check check (visibility in ('private', 'members', 'link'));
alter table public.log_entries add column if not exists share_location boolean not null default false;
-- Reserved for the public share page of 'link' dives (a later step); nothing uses it yet.
alter table public.log_entries add column if not exists share_token uuid
    constraint log_entries_share_token_key unique;

create index if not exists log_entries_feed_idx on public.log_entries (dive_date desc, entry_time desc);
create index if not exists media_entry_idx on public.media (entry_id);
create index if not exists media_path_idx on public.media (path);

-- ---------------------------------------------------------------------------
-- Profiles: every invited (authenticated) user is a member and can read all profiles.
-- No email here, on purpose.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
    avatar_preset text check (avatar_preset is null or avatar_preset ~ '^reef-(0[1-9]|1[0-2])$'),
    avatar_path text check (avatar_path is null or avatar_path like (id::text || '/%')),
    default_visibility text not null default 'members' check (default_visibility in ('private', 'members', 'link')),
    home_country text check (home_country is null or home_country ~ '^[A-Z]{2}$'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
    for select to authenticated
    using (auth.uid() is not null);

drop policy if exists "owner creates own profile" on public.profiles;
create policy "owner creates own profile" on public.profiles
    for insert to authenticated
    with check (id = auth.uid());

drop policy if exists "owner updates own profile" on public.profiles;
create policy "owner updates own profile" on public.profiles
    for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Read functions for members. security definer = they bypass the owner-only RLS, so each one
-- filters by itself: logged in, and the entry is the caller's own or visibility is members/link.
-- ---------------------------------------------------------------------------

create or replace function public.community_entries(
    p_owner uuid default null,
    p_id uuid default null,
    p_limit integer default 30,
    p_offset integer default 0
)
returns table (
    id uuid, owner uuid, log_number integer, dive_date date, entry_time time, duration_s integer,
    max_depth_m numeric, buddies text[], gas jsonb, water_temp_c numeric, vis_shallow_m numeric,
    vis_deep_m numeric, details jsonb, visibility text, share_location boolean, recording_id uuid,
    created_at timestamptz, updated_at timestamptz,
    site_id uuid, site_name text, site_country text, site_water text, site_altitude_m integer,
    site_lat double precision, site_lon double precision,
    photo_path text, photo_count integer
)
language sql stable security definer set search_path = ''
as $$
    select e.id, e.owner, e.log_number, e.dive_date, e.entry_time, e.duration_s,
           e.max_depth_m, e.buddies, e.gas, e.water_temp_c, e.vis_shallow_m,
           e.vis_deep_m, e.details, e.visibility, e.share_location, e.recording_id,
           e.created_at, e.updated_at,
           s.id, s.name, s.country, s.water, s.altitude_m,
           case when e.owner = auth.uid() or e.share_location then s.lat end,
           case when e.owner = auth.uid() or e.share_location then s.lon end,
           ph.path, coalesce(ph.n, 0)::integer
    from public.log_entries e
    left join public.sites s on s.id = e.site_id and s.owner = e.owner
    left join lateral (
        select (array_agg(m.path order by m.created_at, m.id))[1] as path, count(*) as n
        from public.media m
        where m.entry_id = e.id and m.owner = e.owner and m.kind = 'photo' and m.path is not null
    ) ph on true
    where auth.uid() is not null
      and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
      and (p_owner is null or e.owner = p_owner)
      and (p_id is null or e.id = p_id)
    order by e.dive_date desc, e.entry_time desc nulls last, e.created_at desc, e.id
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.community_media(p_entry_id uuid)
returns table (
    id uuid, entry_id uuid, kind text, path text, url text, width integer, height integer,
    taken_at timestamptz, lat double precision, lon double precision, caption text, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
    select m.id, m.entry_id, m.kind, m.path, m.url, m.width, m.height, m.taken_at,
           case when e.owner = auth.uid() or e.share_location then m.lat end,
           case when e.owner = auth.uid() or e.share_location then m.lon end,
           m.caption, m.created_at
    from public.media m
    join public.log_entries e on e.id = m.entry_id and e.owner = m.owner
    where m.entry_id = p_entry_id
      and auth.uid() is not null
      and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    order by m.created_at, m.id;
$$;

-- Recordings of one member that belong to a dive the caller may see (for the analysis and for
-- repetitive-dive chaining). A recording of a private dive never appears, not even as tissue history.
create or replace function public.community_recordings(p_owner uuid)
returns table (
    id uuid, device_serial text, dive_number integer, start_local text, file_sha256 text,
    parser_version integer, summary jsonb
)
language sql stable security definer set search_path = ''
as $$
    select d.id, d.device_serial, d.dive_number, d.start_local, d.file_sha256, d.parser_version, d.summary
    from public.dives d
    join public.log_entries e on e.recording_id = d.id and e.owner = d.owner
    where d.owner = p_owner
      and auth.uid() is not null
      and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    order by d.dive_number, d.start_local;
$$;

create or replace function public.community_recording(p_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    select d.record
    from public.dives d
    join public.log_entries e on e.recording_id = d.id and e.owner = d.owner
    where d.id = p_id
      and auth.uid() is not null
      and (e.owner = auth.uid() or e.visibility in ('members', 'link'));
$$;

-- Members with stats over the dives the caller may see (a private dive never counts).
create or replace function public.community_members(p_id uuid default null)
returns table (
    id uuid, display_name text, avatar_preset text, avatar_path text, home_country text,
    created_at timestamptz, dive_count integer, deepest_m numeric, total_s bigint,
    last_dive_date date, top_sites text[]
)
language sql stable security definer set search_path = ''
as $$
    select p.id, p.display_name, p.avatar_preset, p.avatar_path, p.home_country, p.created_at,
           coalesce(st.n, 0)::integer, st.deepest, coalesce(st.total, 0)::bigint, st.last,
           coalesce(ts.names, '{}')
    from public.profiles p
    left join lateral (
        select count(*) as n, max(e.max_depth_m) as deepest, sum(e.duration_s) as total, max(e.dive_date) as last
        from public.log_entries e
        where e.owner = p.id and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    ) st on true
    left join lateral (
        select array_agg(x.name order by x.n desc, x.name) as names
        from (
            select s.name, count(*) as n
            from public.log_entries e
            join public.sites s on s.id = e.site_id and s.owner = e.owner
            where e.owner = p.id and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
            group by s.name
            order by count(*) desc, s.name
            limit 3
        ) x
    ) ts on true
    where auth.uid() is not null
      and (p_id is null or p.id = p_id)
    order by (p.id = auth.uid()) desc, st.last desc nulls last, p.display_name, p.id;
$$;

-- Storage helper: may the caller read this object of bucket dive-photos?
create or replace function public.photo_readable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select auth.uid() is not null and exists (
        select 1
        from public.media m
        join public.log_entries e on e.id = m.entry_id and e.owner = m.owner
        where m.kind = 'photo'
          and m.path = p_name
          and split_part(p_name, '/', 1) = e.owner::text
          and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    );
$$;

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.community_entries(uuid, uuid, integer, integer)',
        'public.community_media(uuid)',
        'public.community_recordings(uuid)',
        'public.community_recording(uuid)',
        'public.community_members(uuid)',
        'public.photo_readable(text)'
    ] loop
        execute format('revoke all on function %s from public, anon', f);
        execute format('grant execute on function %s to authenticated', f);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Photos of dives the caller may see (writes stay with the owner-only policy of 0002).
drop policy if exists "members read photos of visible dives" on storage.objects;
create policy "members read photos of visible dives" on storage.objects
    for select to authenticated
    using (bucket_id = 'dive-photos' and public.photo_readable(name));

-- Avatars: private bucket, every member reads, each member writes only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "members read avatars" on storage.objects;
create policy "members read avatars" on storage.objects
    for select to authenticated
    using (bucket_id = 'avatars');

drop policy if exists "owner uploads own avatar" on storage.objects;
create policy "owner uploads own avatar" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owner updates own avatar" on storage.objects;
create policy "owner updates own avatar" on storage.objects
    for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owner deletes own avatar" on storage.objects;
create policy "owner deletes own avatar" on storage.objects
    for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Make PostgREST see the new table and functions right away.
notify pgrst, 'reload schema';
