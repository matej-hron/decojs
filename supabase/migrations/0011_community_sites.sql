-- Community site directory (docs/superpowers/specs/2026-10-10-community-sites-design.md).
-- Run once in the Supabase SQL editor after 0010 (and after 0006, 0008 and 0009, whose functions it redefines).
-- Safe to run again. get_shared_dive() here keeps 0006's shape (with 0008's author_key): if 0006, 0008 or 0009
-- is ever run again after this file, run this file again too, or the share page shows other members' sites the
-- old way.
--
-- Security model: sites become a shared directory. A site is 'members' (every member sees its name, position,
-- link and what the visible dives say about it) or 'private' (only its creator). The owner-only RLS of sites
-- stays as it is: others read sites only through the security definer functions below, which never return
-- notes. A dive shows a site when the site is 'members', or when it is the dive owner's own private site and the
-- caller is that owner (anon has no auth.uid(), so the share page shows only members sites). Every function that
-- joins a dive to its site is redefined with that rule, everything else unchanged. Aggregates count only dives
-- the caller may see (own, or 'members'/'link'). Triggers keep the rules on writes: a dive can only point at its
-- owner's own site or a members site (DTS03), a site cannot change owner, cannot turn private while another
-- member's dive uses it (DTS01), and cannot be deleted while any dive uses it (DTS02; account deletion cascades
-- still pass and leave others' dives without a site). Only the creator merges a site into another visible one,
-- and a merge moves only the creator's own dives.

begin;

-- Adding a column locks sites until commit: give up rather than queue every app request behind a slow query.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Columns and indexes
-- ---------------------------------------------------------------------------

-- The default fills every existing site with 'members'.
alter table public.sites add column if not exists visibility text not null default 'members';
alter table public.sites drop constraint if exists sites_visibility_check;
alter table public.sites add constraint sites_visibility_check check (visibility in ('members', 'private'));

-- Shared directory data: sane sizes. 'not valid' = checked for new and changed rows only, so an old odd row
-- cannot block this migration.
alter table public.sites drop constraint if exists sites_name_length;
alter table public.sites add constraint sites_name_length check (char_length(btrim(name)) between 1 and 120) not valid;
alter table public.sites drop constraint if exists sites_lat_range;
alter table public.sites add constraint sites_lat_range check (lat between -90 and 90) not valid;
alter table public.sites drop constraint if exists sites_lon_range;
alter table public.sites add constraint sites_lon_range check (lon between -180 and 180) not valid;

create index if not exists log_entries_site_idx on public.log_entries (site_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A dive may point at its owner's own site or at a members site; the foreign key alone would let anyone attach
-- a guessed id of a private site and read its name back. Checked on insert, and on update only when site_id
-- changes (merge_site and the FK's "set null" go through here too). A member inserting a dive for someone else
-- (or handing a dive over) gets the same DTS03 before RLS refuses it, so a spoofed owner cannot probe whether a
-- private site exists. The site row is locked 'for share': a concurrent switch to private waits for this dive
-- and then sees it (DTS01), or this check waits for the switch and sees the site private.
create or replace function public.log_entries_site_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if new.site_id is not null and (tg_op = 'INSERT' or new.site_id is distinct from old.site_id) then
        -- Only the caller's own dives (or, on an update, a dive whose owner does not change).
        if auth.uid() is not null and new.owner is distinct from auth.uid()
           and (tg_op = 'INSERT' or new.owner is distinct from old.owner) then
            raise exception 'This site is not available' using errcode = 'DTS03';
        end if;
        perform 1 from public.sites s
        where s.id = new.site_id and (s.owner = new.owner or s.visibility = 'members')
        for share;
        if not found then
            raise exception 'This site is not available' using errcode = 'DTS03';
        end if;
    end if;
    return new;
end $$;

drop trigger if exists log_entries_site_check on public.log_entries;
create trigger log_entries_site_check before insert or update on public.log_entries
    for each row execute function public.log_entries_site_check();

-- Only the creator edits a site (RLS); here: the owner never changes, a site other members dive at stays
-- 'members', and a site in use is not deleted. Account deletion (a cascade, trigger depth > 1) still deletes
-- the account's sites; the foreign key then leaves other members' dives without a site.
create or replace function public.sites_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' then
        if new.owner is distinct from old.owner then
            raise exception 'The owner of a site cannot change' using errcode = '42501';
        end if;
        if new.visibility = 'private' and old.visibility is distinct from 'private' and exists (
            select 1 from public.log_entries e where e.site_id = old.id and e.owner <> old.owner
        ) then
            raise exception 'Other members dive at this site; it cannot become private' using errcode = 'DTS01';
        end if;
        return new;
    end if;
    if pg_catalog.pg_trigger_depth() = 1 and exists (
        select 1 from public.log_entries e where e.site_id = old.id
    ) then
        raise exception 'Dives use this site; it cannot be deleted' using errcode = 'DTS02';
    end if;
    return old;
end $$;

drop trigger if exists sites_guard on public.sites;
create trigger sites_guard before update or delete on public.sites
    for each row execute function public.sites_guard();

-- ---------------------------------------------------------------------------
-- Functions that join a dive to its site: unchanged except the site join.
-- ---------------------------------------------------------------------------

-- community_entries: 0006 shape and filters.
-- Trust model: the creator of a members site controls its name and position for everyone's dives (directory
-- data, like a shared map). Its link is shown only with the creator's own dives, so nobody can put a link on
-- another member's dive or share page.
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
    photo_path text, photo_count integer,
    description text, site_url text
)
language sql stable security definer set search_path = ''
as $$
    select e.id, e.owner,
           -- gaps in another member's numbering would reveal their private dives
           case when e.owner = auth.uid() then e.log_number end,
           e.dive_date, e.entry_time, e.duration_s,
           e.max_depth_m, e.buddies, e.gas, e.water_temp_c, e.vis_shallow_m,
           e.vis_deep_m, e.details, e.visibility, e.share_location, e.recording_id,
           e.created_at, e.updated_at,
           s.id, s.name, s.country, s.water, s.altitude_m,
           case when e.owner = auth.uid() or e.share_location then s.lat end,
           case when e.owner = auth.uid() or e.share_location then s.lon end,
           ph.path, coalesce(ph.n, 0)::integer,
           e.description,
           case when (e.owner = auth.uid() or e.share_location) and s.owner = e.owner then s.url end
    from public.log_entries e
    left join public.sites s on s.id = e.site_id and (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))
    left join lateral (
        select (array_agg(m.path order by m.created_at, m.id))[1] as path, count(*) as n
        from public.media m
        where m.entry_id = e.id and m.owner = e.owner and m.kind = 'photo' and m.path is not null
    ) ph on true
    where public.is_member()
      and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
      and (p_owner is null or e.owner = p_owner)
      and (p_id is null or e.id = p_id)
    order by e.dive_date desc, e.entry_time desc nulls last, e.created_at desc, e.id
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;

-- get_shared_dive: 0006 shape (with 0008's author_key). anon has no auth.uid(): only members sites show.
create or replace function public.get_shared_dive(p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    select jsonb_build_object(
        'entry', jsonb_build_object(
            'id', e.id,
            'dive_date', e.dive_date,
            'entry_time', e.entry_time,
            'duration_s', e.duration_s,
            'max_depth_m', e.max_depth_m,
            'buddies', to_jsonb(e.buddies),
            'gas', e.gas,
            'water_temp_c', e.water_temp_c,
            'vis_shallow_m', e.vis_shallow_m,
            'vis_deep_m', e.vis_deep_m,
            -- An allow-list of the detail keys the app shows. 'computer' is left out: it holds the
            -- dive computer's serial number ("Divesoft Freedom 1234-…"), which identifies a person.
            'details', coalesce((
                select jsonb_object_agg(k.key, k.value)
                from jsonb_each(case when jsonb_typeof(e.details) = 'object' then e.details else '{}'::jsonb end) k
                where k.key in ('airTempC', 'weather', 'current', 'waves', 'weightsKg', 'suit', 'suitMm',
                                'entry', 'avgDepthM', 'stops', 'tags', 'guide', 'rating', 'surfaceTempC', 'gases')
            ), '{}'::jsonb),
            'share_location', e.share_location,
            'description', e.description
        ),
        'site', case when s.id is null then null else jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'country', s.country,
            'water', s.water,
            'altitude_m', s.altitude_m,
            'lat', case when e.share_location then s.lat end,
            'lon', case when e.share_location then s.lon end,
            -- Only the creator's own link (see community_entries above).
            'url', case when e.share_location and s.owner = e.owner then s.url end
        ) end,
        'author', jsonb_build_object(
            'display_name', p.display_name,
            'avatar_preset', p.avatar_preset,
            'avatar_path', p.avatar_path,
            -- From 0008: stable per author, not per dive; one-way (the owner id cannot be recovered from it).
            'author_key', left(md5(e.owner::text || ':decotrail-avatar'), 12)
        ),
        'media', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', m.id,
                'kind', m.kind,
                'path', m.path,
                'url', m.url,
                'width', m.width,
                'height', m.height,
                'taken_at', m.taken_at,
                'lat', case when e.share_location then m.lat end,
                'lon', case when e.share_location then m.lon end,
                'caption', m.caption,
                'created_at', m.created_at
            ) order by m.created_at, m.id)
            from public.media m
            where m.entry_id = e.id and m.owner = e.owner
              and (m.path is null or split_part(m.path, '/', 1) = e.owner::text)
        ), '[]'::jsonb),
        'recording', case when d.id is null then null else jsonb_build_object(
            'id', d.id,
            'start_local', d.start_local,
            'parser_version', d.parser_version,
            'summary', d.summary,
            -- The analysis needs the samples, not who owns the computer: no serial, firmware or hardware,
            -- and no lifetime dive counter (the file name is that counter too).
            'record', case when jsonb_typeof(d.record) = 'object' then
                (d.record
                    || case when jsonb_typeof(d.record -> 'device') = 'object'
                            then jsonb_build_object('device', (d.record -> 'device') || '{"serial": null, "firmware": null, "hardware": null}'::jsonb)
                            else '{}'::jsonb end
                    || case when jsonb_typeof(d.record -> 'source') = 'object'
                            then jsonb_build_object('source', (d.record -> 'source') || '{"diveNumber": null, "fileName": null}'::jsonb)
                            else '{}'::jsonb end)
                else null end
        ) end
    )
    from public.log_entries e
    left join public.sites s on s.id = e.site_id and (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))
    left join public.dives d on d.id = e.recording_id and d.owner = e.owner
    left join public.profiles p on p.id = e.owner
    where p_token ~ '^[0-9a-f]{64}$'
      and e.share_token = p_token
      and e.visibility = 'link'
      and public.share_owner_active(e.owner);
$$;

-- get_shared_dive_area: 0009.
create or replace function public.get_shared_dive_area(p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    select jsonb_build_object(
        'lat', case when e.share_location then s.lat else round(s.lat::numeric, 2) end,
        'lon', case when e.share_location then s.lon else round(s.lon::numeric, 2) end,
        'exact', e.share_location
    )
    from public.log_entries e
    join public.sites s on s.id = e.site_id and (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))
    where p_token ~ '^[0-9a-f]{64}$'
      and e.share_token = p_token
      and e.visibility = 'link'
      and s.lat is not null and s.lon is not null
      and public.share_owner_active(e.owner);
$$;

-- social_inbox: 0010 shape.
create or replace function public.social_inbox(p_limit integer default 50)
returns table (
    kind text, entry_id uuid, actor_id uuid, display_name text, nickname text, avatar_preset text, avatar_path text,
    created_at timestamptz, excerpt text, dive_date date, site_name text, is_new boolean
)
language sql stable security definer set search_path = ''
as $$
    with seen as (
        select (select ss.seen_at from public.social_seen ss where ss.member_id = auth.uid()) as at
    ), ev as (
        select 'kudos'::text as kind, k.entry_id, k.member_id as actor_id, k.created_at, null::text as excerpt
        from public.kudos k
        join public.log_entries e on e.id = k.entry_id
        where e.owner = auth.uid() and k.member_id <> auth.uid()
        union all
        select 'comment', c.entry_id, c.author_id, c.created_at, left(c.body, 140)
        from public.comments c
        join public.log_entries e on e.id = c.entry_id
        where e.owner = auth.uid() and c.author_id <> auth.uid() and e.comments_enabled
    )
    select ev.kind, ev.entry_id, ev.actor_id, p.display_name, p.nickname, p.avatar_preset, p.avatar_path,
           ev.created_at, ev.excerpt, e.dive_date, s.name,
           (seen.at is null or ev.created_at > seen.at)
    from ev
    cross join seen
    join public.log_entries e on e.id = ev.entry_id
    left join public.sites s on s.id = e.site_id and (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))
    left join public.profiles p on p.id = ev.actor_id
    where public.is_member()
    order by ev.created_at desc, ev.entry_id, ev.actor_id
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- community_members: 0010 shape; top_sites only names the sites the caller may see with that dive.
create or replace function public.community_members(p_id uuid default null)
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
        where e.owner = p.id and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    ) st on true
    left join lateral (
        select array_agg(x.name order by x.n desc, x.name) as names
        from (
            select s.name, count(*) as n
            from public.log_entries e
            join public.sites s on s.id = e.site_id and (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))
            where e.owner = p.id and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
            group by s.name
            order by count(*) desc, s.name
            limit 3
        ) x
    ) ts on true
    where public.is_member()
      and (p_id is null or p.id = p_id)
    order by (p.id = auth.uid()) desc, st.last desc nulls last, coalesce(p.nickname, p.display_name), p.id;
$$;

-- ---------------------------------------------------------------------------
-- The site directory (members only). A site is visible when it is the caller's own or 'members'. Aggregates
-- count only dives the caller may see that show the site (the join rule above). Surface temperature is
-- details.surfaceTempC when it is a JSON number within -5..45 °C; anything else is ignored (text never cast).
-- ---------------------------------------------------------------------------

-- New shapes: dropped first, so an older draft of them cannot block create.
drop function if exists public.community_sites();
drop function if exists public.site_stats(uuid);
drop function if exists public.site_visits(uuid, integer, integer);
drop function if exists public.merge_site(uuid, uuid);

create function public.community_sites()
returns table (
    id uuid, owner uuid, name text, lat double precision, lon double precision, country text, water text,
    altitude_m integer, url text, visibility text, created_at timestamptz, updated_at timestamptz,
    visits integer, last_visit date, vis_min numeric, vis_max numeric, temp_min numeric, temp_max numeric,
    used_by_others boolean
)
language sql stable security definer set search_path = ''
as $$
    select s.id, s.owner, s.name, s.lat, s.lon, s.country, s.water, s.altitude_m, s.url, s.visibility,
           s.created_at, s.updated_at,
           coalesce(st.visits, 0)::integer, st.last_visit,
           least(st.shallow_min, st.deep_min), greatest(st.shallow_max, st.deep_max),
           least(st.bottom_min, st.surface_min), greatest(st.bottom_max, st.surface_max),
           -- Only on the caller's own sites: whether any other member's dive (also a private one) uses it.
           case when s.owner = auth.uid() then exists (
               select 1 from public.log_entries o where o.site_id = s.id and o.owner <> s.owner
           ) end
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
            where e.site_id = s.id
              and (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))
              and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
        ) d
    ) st on true
    where public.is_member()
      and (s.owner = auth.uid() or s.visibility = 'members')
    order by s.name, s.id;
$$;

-- Conditions of one visible site, or null. S = {n, avg, min, max, best_date (date of the max, latest on ties),
-- latest, latest_date (value on the newest dive that has one)}; months are 1–12 (month of the year, all years
-- together), only those with a dive.
create function public.site_stats(p_site_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    with site as (
        select s.id, s.owner, s.visibility
        from public.sites s
        where s.id = p_site_id
          and public.is_member()
          and (s.owner = auth.uid() or s.visibility = 'members')
    ), d as (
        select e.id, e.owner, e.dive_date, e.entry_time, e.created_at,
               e.vis_shallow_m as shallow, e.vis_deep_m as deep, e.water_temp_c as bottom,
               case when jsonb_typeof(e.details -> 'surfaceTempC') = 'number' then
                    case when (e.details ->> 'surfaceTempC')::numeric between -5 and 45
                         then (e.details ->> 'surfaceTempC')::numeric end end as surface
        from public.log_entries e
        join site s on s.id = e.site_id and (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))
        where e.owner = auth.uid() or e.visibility in ('members', 'link')
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

-- The visible dives at a visible site, newest first. No notes, no log numbers.
create function public.site_visits(p_site_id uuid, p_limit integer default 50, p_offset integer default 0)
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
    join public.sites s on s.id = e.site_id and (s.visibility = 'members' or (s.owner = e.owner and s.owner = auth.uid()))
    where public.is_member()
      and s.id = p_site_id
      and (s.owner = auth.uid() or s.visibility = 'members')
      and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    order by e.dive_date desc, e.entry_time desc nulls last, e.created_at desc, e.id
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;

-- The creator merges a duplicate into another visible site. Other members' dives are never touched: only the
-- caller's own dives move, and the duplicate is deleted only when no dive (anyone's) uses it any more; otherwise
-- it stays for the members who still dive there. Returns {"moved": own dives moved, "deleted": boolean}, never
-- how many other dives remain. p_from is locked 'for update' (no dive can be attached to it meanwhile), the
-- target 'for share' (it cannot turn private while dives land on it).
create function public.merge_site(p_from uuid, p_into uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
    moved integer;
    gone boolean := false;
begin
    perform 1 from public.sites s where s.id = p_from and s.owner = auth.uid() for update;
    if not found or not public.is_member() then
        raise exception 'Only the creator merges a site' using errcode = '42501';
    end if;
    if p_into is null or p_into = p_from then
        raise exception 'The target site is not available' using errcode = '42501';
    end if;
    perform 1 from public.sites s
    where s.id = p_into and (s.owner = auth.uid() or s.visibility = 'members')
    for share;
    if not found then
        raise exception 'The target site is not available' using errcode = '42501';
    end if;
    update public.log_entries set site_id = p_into where site_id = p_from and owner = auth.uid();
    get diagnostics moved = row_count;
    if not exists (select 1 from public.log_entries e where e.site_id = p_from) then
        delete from public.sites where id = p_from;
        gone := true;
    end if;
    return jsonb_build_object('moved', moved, 'deleted', gone);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. A newly created function is executable by PUBLIC (so also anon) until revoked.
-- ---------------------------------------------------------------------------

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.community_entries(uuid, uuid, integer, integer)',
        'public.social_inbox(integer)',
        'public.community_members(uuid)',
        'public.community_sites()',
        'public.site_stats(uuid)',
        'public.site_visits(uuid, integer, integer)',
        'public.merge_site(uuid, uuid)'
    ] loop
        execute format('revoke all on function %s from public, anon', f);
        execute format('grant execute on function %s to authenticated', f);
    end loop;
    foreach f in array array['public.log_entries_site_check()', 'public.sites_guard()'] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
    end loop;
    foreach f in array array['public.get_shared_dive(text)', 'public.get_shared_dive_area(text)'] loop
        execute format('revoke all on function %s from public', f);
        execute format('grant execute on function %s to anon, authenticated', f);
    end loop;
end $$;

commit;

notify pgrst, 'reload schema';
