-- DecoTrail share page: a stable, non-identifying author key so the fallback avatar is the same on every
-- dive of one author (it was keyed by the dive id). Run once in the Supabase SQL editor after 0005. Safe to run again.
-- Only adds 'author_key' to get_shared_dive(); grants are unchanged by create or replace.

begin;

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
            'share_location', e.share_location
        ),
        'site', case when s.id is null then null else jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'country', s.country,
            'water', s.water,
            'altitude_m', s.altitude_m,
            'lat', case when e.share_location then s.lat end,
            'lon', case when e.share_location then s.lon end
        ) end,
        'author', jsonb_build_object(
            'display_name', p.display_name,
            'avatar_preset', p.avatar_preset,
            'avatar_path', p.avatar_path,
            -- Stable per author, not per dive; one-way (the owner id cannot be recovered from it).
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
    left join public.sites s on s.id = e.site_id and s.owner = e.owner
    left join public.dives d on d.id = e.recording_id and d.owner = e.owner
    left join public.profiles p on p.id = e.owner
    where p_token ~ '^[0-9a-f]{64}$'
      and e.share_token = p_token
      and e.visibility = 'link'
      and public.share_owner_active(e.owner);
$$;

commit;

notify pgrst, 'reload schema';
