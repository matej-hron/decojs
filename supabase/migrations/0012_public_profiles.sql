-- DecoTrail public profiles and anonymous browsing (docs/superpowers/specs/2026-10-11-public-profiles-design.md).
-- Run once in the Supabase SQL editor after 0011. Safe to run again.
--
-- Security model: a member switches their profile to public (profiles.is_public, off by default). Visitors who are
-- not logged in (role anon) then read that member's profile, stats and every dive that is not private, through the
-- security definer functions below. Nothing else changes for anon: no table gets an anon grant, and the member
-- functions of 0004–0011 stay members-only. Public reads are stricter than member reads:
--   * never notes, the share token, log numbers, buddies' names (third people who did not opt in), or the dive
--     computer's serial number and lifetime dive counter (as on the share page);
--   * a dive's site position only when the owner ticked "show the exact location" (share_location), as for members;
--   * only 'members' sites, never a private one; a site's creator is never named.
-- The site directory is public too: every 'members' site with its name, position, water, altitude and link, and
-- conditions aggregated over all members' visible dives (numbers only, nobody named). The list of visits at a site
-- only shows dives of public profiles.
-- A public profile of a deleted or banned account shows nothing (share_owner_active from 0005).

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists is_public boolean not null default false;

create index if not exists profiles_public_idx on public.profiles (id) where is_public;

-- Whether anyone may see this member's non-private dives without logging in.
create or replace function public.profile_public(p_owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (select 1 from public.profiles p where p.id = p_owner and p.is_public)
       and public.share_owner_active(p_owner);
$$;

-- The analysis needs the samples, not who owns the computer (same stripping as get_shared_dive in 0005).
create or replace function public.public_record(p_record jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
    select case when jsonb_typeof(p_record) = 'object' then
        (p_record
            || case when jsonb_typeof(p_record -> 'device') = 'object'
                    then jsonb_build_object('device', (p_record -> 'device') || '{"serial": null, "firmware": null, "hardware": null}'::jsonb)
                    else '{}'::jsonb end
            || case when jsonb_typeof(p_record -> 'source') = 'object'
                    then jsonb_build_object('source', (p_record -> 'source') || '{"diveNumber": null, "fileName": null}'::jsonb)
                    else '{}'::jsonb end)
        else null end;
$$;

-- The detail keys the app shows (the share page's allow-list): 'computer' holds the serial number.
create or replace function public.public_details(p_details jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
    select coalesce((
        select jsonb_object_agg(k.key, k.value)
        from jsonb_each(case when jsonb_typeof(p_details) = 'object' then p_details else '{}'::jsonb end) k
        where k.key in ('airTempC', 'weather', 'current', 'waves', 'weightsKg', 'suit', 'suitMm',
                        'entry', 'avgDepthM', 'stops', 'tags', 'guide', 'rating', 'surfaceTempC', 'gases')
    ), '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- Dives of public profiles. Same row shapes as the community_* functions, so the app reads both alike.
-- ---------------------------------------------------------------------------

create or replace function public.public_entries(
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
    photo_path text, photo_count integer,
    description text, site_url text
)
language sql stable security definer set search_path = ''
as $$
    select e.id, e.owner, null::integer, e.dive_date, e.entry_time, e.duration_s,
           e.max_depth_m, '{}'::text[], e.gas, e.water_temp_c, e.vis_shallow_m,
           e.vis_deep_m, public.public_details(e.details), e.visibility, e.share_location, e.recording_id,
           e.created_at, e.updated_at,
           s.id, s.name, s.country, s.water, s.altitude_m,
           case when e.share_location then s.lat end,
           case when e.share_location then s.lon end,
           ph.path, coalesce(ph.n, 0)::integer,
           e.description,
           case when e.share_location and s.owner = e.owner then s.url end
    from public.log_entries e
    left join public.sites s on s.id = e.site_id and s.visibility = 'members'
    left join lateral (
        select (array_agg(m.path order by m.created_at, m.id))[1] as path, count(*) as n
        from public.media m
        where m.entry_id = e.id and m.owner = e.owner and m.kind = 'photo' and m.path is not null
          and split_part(m.path, '/', 1) = e.owner::text
    ) ph on true
    where e.visibility in ('members', 'link')
      and public.profile_public(e.owner)
      and (p_owner is null or e.owner = p_owner)
      and (p_id is null or e.id = p_id)
    order by e.dive_date desc, e.entry_time desc nulls last, e.created_at desc, e.id
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;

create or replace function public.public_media(p_entry_id uuid)
returns table (
    id uuid, entry_id uuid, kind text, path text, url text, width integer, height integer,
    taken_at timestamptz, lat double precision, lon double precision, caption text, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
    select m.id, m.entry_id, m.kind, m.path, m.url, m.width, m.height, m.taken_at,
           case when e.share_location then m.lat end,
           case when e.share_location then m.lon end,
           m.caption, m.created_at
    from public.media m
    join public.log_entries e on e.id = m.entry_id and e.owner = m.owner
    where m.entry_id = p_entry_id
      and (m.path is null or split_part(m.path, '/', 1) = e.owner::text)
      and e.visibility in ('members', 'link')
      and public.profile_public(e.owner)
    order by m.created_at, m.id;
$$;

-- Recordings of a public member that belong to a dive anyone may see (analysis and repetitive-dive chaining).
-- No serial, no lifetime dive counter, no file hash.
create or replace function public.public_recordings(p_owner uuid)
returns table (
    id uuid, device_serial text, dive_number integer, start_local text, file_sha256 text,
    parser_version integer, summary jsonb
)
language sql stable security definer set search_path = ''
as $$
    select d.id, null::text, null::integer, d.start_local, null::text, d.parser_version, d.summary
    from public.dives d
    join public.log_entries e on e.recording_id = d.id and e.owner = d.owner
    where d.owner = p_owner
      and e.visibility in ('members', 'link')
      and public.profile_public(d.owner)
    order by d.start_local, d.id;
$$;

create or replace function public.public_recording(p_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    select public.public_record(d.record)
    from public.dives d
    join public.log_entries e on e.recording_id = d.id and e.owner = d.owner
    where d.id = p_id
      and e.visibility in ('members', 'link')
      and public.profile_public(d.owner);
$$;

-- Public profiles with stats over their non-private dives (community_members shape).
create or replace function public.public_members(p_id uuid default null)
returns table (
    id uuid, display_name text, nickname text, avatar_preset text, avatar_path text, home_country text,
    created_at timestamptz, dive_count integer, deepest_m numeric, total_s bigint,
    last_dive_date date, top_sites text[]
)
language sql stable security definer set search_path = ''
as $$
    select p.id, p.display_name, p.nickname, p.avatar_preset, p.avatar_path, p.home_country, p.created_at,
           coalesce(st.n, 0)::integer, st.deepest, coalesce(st.total, 0)::bigint, st.last,
           coalesce(ts.names, '{}')
    from public.profiles p
    left join lateral (
        select count(*) as n, max(e.max_depth_m) as deepest, sum(e.duration_s) as total, max(e.dive_date) as last
        from public.log_entries e
        where e.owner = p.id and e.visibility in ('members', 'link')
    ) st on true
    left join lateral (
        select array_agg(x.name order by x.n desc, x.name) as names
        from (
            select s.name, count(*) as n
            from public.log_entries e
            join public.sites s on s.id = e.site_id and s.visibility = 'members'
            where e.owner = p.id and e.visibility in ('members', 'link')
            group by s.name
            order by count(*) desc, s.name
            limit 3
        ) x
    ) ts on true
    where p.is_public
      and public.share_owner_active(p.id)
      and (p_id is null or p.id = p_id)
    order by st.last desc nulls last, coalesce(p.nickname, p.display_name), p.id;
$$;

-- ---------------------------------------------------------------------------
-- The public site directory: 'members' sites, no creator, no notes. Conditions count every members-visible dive
-- (as for members); nobody is named.
-- ---------------------------------------------------------------------------

create or replace function public.public_sites()
returns table (
    id uuid, owner uuid, name text, lat double precision, lon double precision, country text, water text,
    altitude_m integer, url text, visibility text, created_at timestamptz, updated_at timestamptz,
    visits integer, last_visit date, vis_min numeric, vis_max numeric, temp_min numeric, temp_max numeric,
    used_by_others boolean
)
language sql stable security definer set search_path = ''
as $$
    select s.id, null::uuid, s.name, s.lat, s.lon, s.country, s.water, s.altitude_m, s.url, s.visibility,
           s.created_at, s.updated_at,
           coalesce(st.visits, 0)::integer, st.last_visit,
           least(st.shallow_min, st.deep_min), greatest(st.shallow_max, st.deep_max),
           least(st.bottom_min, st.surface_min), greatest(st.bottom_max, st.surface_max),
           null::boolean
    from public.sites s
    left join lateral (
        select count(*) as visits, max(d.dive_date) as last_visit,
               min(d.vis_shallow_m) as shallow_min, max(d.vis_shallow_m) as shallow_max,
               min(d.vis_deep_m) as deep_min, max(d.vis_deep_m) as deep_max,
               min(d.water_temp_c) as bottom_min, max(d.water_temp_c) as bottom_max,
               min(d.surface) as surface_min, max(d.surface) as surface_max
        from (
            select e.dive_date, e.vis_shallow_m, e.vis_deep_m, e.water_temp_c,
                   case when jsonb_typeof(e.details -> 'surfaceTempC') = 'number' then
                        case when (e.details ->> 'surfaceTempC')::numeric between -5 and 45
                             then (e.details ->> 'surfaceTempC')::numeric end end as surface
            from public.log_entries e
            where e.site_id = s.id and e.visibility in ('members', 'link')
        ) d
    ) st on true
    where s.visibility = 'members'
    order by s.name, s.id;
$$;

-- Conditions of one public site (site_stats shape), or null.
create or replace function public.public_site_stats(p_site_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    with site as (
        select s.id from public.sites s where s.id = p_site_id and s.visibility = 'members'
    ), d as (
        select e.id, e.owner, e.dive_date, e.entry_time, e.created_at,
               e.vis_shallow_m as shallow, e.vis_deep_m as deep, e.water_temp_c as bottom,
               case when jsonb_typeof(e.details -> 'surfaceTempC') = 'number' then
                    case when (e.details ->> 'surfaceTempC')::numeric between -5 and 45
                         then (e.details ->> 'surfaceTempC')::numeric end end as surface
        from public.log_entries e
        join site s on s.id = e.site_id
        where e.visibility in ('members', 'link')
    ), vals as (
        select x.k, x.v, d.id, d.dive_date, d.entry_time, d.created_at
        from d
        cross join lateral (values ('shallow', d.shallow), ('deep', d.deep), ('bottom', d.bottom), ('surface', d.surface)) x (k, v)
        where x.v is not null
    ), summ as (
        select vals.k, jsonb_build_object(
            'n', count(*),
            'avg', round(avg(vals.v), 1),
            'min', min(vals.v),
            'max', max(vals.v),
            'best_date', (array_agg(vals.dive_date order by vals.v desc, vals.dive_date desc, vals.id))[1],
            'latest', (array_agg(vals.v order by vals.dive_date desc, vals.entry_time desc nulls last, vals.created_at desc, vals.id))[1],
            'latest_date', (array_agg(vals.dive_date order by vals.dive_date desc, vals.entry_time desc nulls last, vals.created_at desc, vals.id))[1]
        ) as j
        from vals
        group by vals.k
    ), months as (
        select extract(month from d.dive_date)::integer as m,
               count(*) as n,
               case when count(d.bottom) > 0 then jsonb_build_object(
                   'avg', round(avg(d.bottom), 1), 'min', min(d.bottom), 'max', max(d.bottom), 'n', count(d.bottom)) end as bottom,
               case when count(d.surface) > 0 then jsonb_build_object(
                   'avg', round(avg(d.surface), 1), 'min', min(d.surface), 'max', max(d.surface), 'n', count(d.surface)) end as surface,
               case when count(d.shallow) + count(d.deep) > 0 then jsonb_build_object(
                   'avg', round((coalesce(sum(d.shallow), 0) + coalesce(sum(d.deep), 0)) / (count(d.shallow) + count(d.deep)), 1),
                   'n', count(d.shallow) + count(d.deep)) end as vis
        from d
        group by 1
    )
    select jsonb_build_object(
        'visits', (select count(*) from d),
        'divers', (select count(distinct d.owner) from d),
        'first_visit', (select min(d.dive_date) from d),
        'last_visit', (select max(d.dive_date) from d),
        'vis', jsonb_build_object(
            'shallow', (select summ.j from summ where summ.k = 'shallow'),
            'deep', (select summ.j from summ where summ.k = 'deep')
        ),
        'temp', jsonb_build_object(
            'bottom', (select summ.j from summ where summ.k = 'bottom'),
            'surface', (select summ.j from summ where summ.k = 'surface')
        ),
        'months', coalesce((
            select jsonb_agg(jsonb_build_object(
                'month', months.m, 'n', months.n, 'bottom', months.bottom, 'surface', months.surface, 'vis', months.vis
            ) order by months.m)
            from months
        ), '[]'::jsonb)
    )
    from site;
$$;

-- Dives of public profiles at a public site, newest first (site_visits shape).
create or replace function public.public_site_visits(p_site_id uuid, p_limit integer default 50, p_offset integer default 0)
returns table (
    id uuid, owner uuid, dive_date date, entry_time time, duration_s integer, max_depth_m numeric,
    water_temp_c numeric, surface_temp_c numeric, vis_shallow_m numeric, vis_deep_m numeric, visibility text
)
language sql stable security definer set search_path = ''
as $$
    select e.id, e.owner, e.dive_date, e.entry_time, e.duration_s, e.max_depth_m, e.water_temp_c,
           case when jsonb_typeof(e.details -> 'surfaceTempC') = 'number' then
                case when (e.details ->> 'surfaceTempC')::numeric between -5 and 45
                     then (e.details ->> 'surfaceTempC')::numeric end end,
           e.vis_shallow_m, e.vis_deep_m, e.visibility
    from public.log_entries e
    join public.sites s on s.id = e.site_id and s.visibility = 'members'
    where s.id = p_site_id
      and e.visibility in ('members', 'link')
      and public.profile_public(e.owner)
    order by e.dive_date desc, e.entry_time desc nulls last, e.created_at desc, e.id
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;

-- Storage helpers: a photo of a dive anyone may see; the avatar of a public profile.
create or replace function public.public_photo_readable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1
        from public.media m
        join public.log_entries e on e.id = m.entry_id and e.owner = m.owner
        where m.kind = 'photo'
          and m.path = p_name
          and split_part(p_name, '/', 1) = e.owner::text
          and e.visibility in ('members', 'link')
          and public.profile_public(e.owner)
    );
$$;

create or replace function public.public_avatar_readable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.profiles p
        where p.avatar_path = p_name
          and split_part(p_name, '/', 1) = p.id::text
          and public.profile_public(p.id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Grants. A new function is executable by PUBLIC until revoked.
-- ---------------------------------------------------------------------------

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.public_entries(uuid, uuid, integer, integer)',
        'public.public_media(uuid)',
        'public.public_recordings(uuid)',
        'public.public_recording(uuid)',
        'public.public_members(uuid)',
        'public.public_sites()',
        'public.public_site_stats(uuid)',
        'public.public_site_visits(uuid, integer, integer)'
    ] loop
        execute format('revoke all on function %s from public', f);
        execute format('grant execute on function %s to anon, authenticated', f);
    end loop;
    -- Helpers: the storage helpers serve only the anon policies below; the rest only the functions above.
    foreach f in array array['public.public_photo_readable(text)', 'public.public_avatar_readable(text)'] loop
        execute format('revoke all on function %s from public, authenticated', f);
        execute format('grant execute on function %s to anon', f);
    end loop;
    foreach f in array array['public.profile_public(uuid)', 'public.public_record(jsonb)', 'public.public_details(jsonb)'] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
    end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: anon reads the photos of public dives and the avatars of public profiles
-- ---------------------------------------------------------------------------

drop policy if exists "public profiles read photos" on storage.objects;
create policy "public profiles read photos" on storage.objects
    for select to anon
    using (bucket_id = 'dive-photos' and public.public_photo_readable(name));

drop policy if exists "public profiles read avatars" on storage.objects;
create policy "public profiles read avatars" on storage.objects
    for select to anon
    using (bucket_id = 'avatars' and public.public_avatar_readable(name));

commit;

notify pgrst, 'reload schema';
