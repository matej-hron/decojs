-- Site link and dive description (docs/superpowers/specs/2026-10-10-site-visits-description-design.md).
-- Run once in the Supabase SQL editor after 0005. Safe to run again.
--
-- Security model, unchanged from 0004/0005: the owner-only RLS of log_entries and sites stays as it is. Other
-- members read only through community_entries(), anonymous visitors only through get_shared_dive(). Both are
-- redefined here with exactly the same filters; they gain the dive's description (written for others) and the
-- site's link. Notes stay private. The site link can carry a position (a pasted map link), so it is shared
-- under the same rule as the site's coordinates: to the owner, or when the dive has share_location.

begin;

-- Adding columns locks both tables until commit: give up rather than queue every app request behind a slow query.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.sites add column if not exists url text;
alter table public.sites drop constraint if exists sites_url_https;
alter table public.sites add constraint sites_url_https
    -- Only the characters RFC 3986 allows (the app saves URL.href: punycode host, percent-encoded path), so no
    -- spaces, control, bidi or invisible characters, and no quotes or angle brackets; a host must follow https://.
    check (url is null or (url ~ '^https://[A-Za-z0-9._~:/?#@!$&''()*+,;=%[\]-]+$' and url !~ '^https://[/?#]'
                           and char_length(url) <= 500));

alter table public.log_entries add column if not exists description text;
alter table public.log_entries drop constraint if exists log_entries_description_length;
alter table public.log_entries add constraint log_entries_description_length
    check (description is null or char_length(btrim(description)) between 1 and 4000);

-- ---------------------------------------------------------------------------
-- community_entries: same filters as 0004, plus description and site_url.
-- The result columns change, so the function is dropped and created again (create or replace cannot do that);
-- inside this transaction no caller ever sees it missing.
-- ---------------------------------------------------------------------------

drop function if exists public.community_entries(uuid, uuid, integer, integer);

create function public.community_entries(
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
           case when e.owner = auth.uid() or e.share_location then s.url end
    from public.log_entries e
    left join public.sites s on s.id = e.site_id and s.owner = e.owner
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

-- ---------------------------------------------------------------------------
-- get_shared_dive: same as 0005, plus entry.description and site.url (only with share_location).
-- ---------------------------------------------------------------------------

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
            'url', case when e.share_location then s.url end
        ) end,
        'author', jsonb_build_object(
            'display_name', p.display_name,
            'avatar_preset', p.avatar_preset,
            'avatar_path', p.avatar_path
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
    left join public.sites s on s.id = e.site_id and s.owner = e.owner
    left join public.dives d on d.id = e.recording_id and d.owner = e.owner
    left join public.profiles p on p.id = e.owner
    where p_token ~ '^[0-9a-f]{64}$'
      and e.share_token = p_token
      and e.visibility = 'link'
      and public.share_owner_active(e.owner);
$$;

-- ---------------------------------------------------------------------------
-- Grants: as in 0004 / 0005. A newly created function is executable by PUBLIC (so also anon) until revoked.
-- ---------------------------------------------------------------------------

revoke all on function public.community_entries(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.community_entries(uuid, uuid, integer, integer) to authenticated;
revoke all on function public.get_shared_dive(text) from public;
grant execute on function public.get_shared_dive(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
