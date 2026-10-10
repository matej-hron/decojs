-- DecoTrail public share link for one dive (docs/superpowers/specs/2026-10-09-dive-share-link-design.md).
-- Run once in the Supabase SQL editor after 0004. Safe to run again.
--
-- Security model: anonymous visitors get exactly one thing — the dive whose share token they hold — through
-- the security definer function get_shared_dive(). No table gets an anon grant. Photos and the avatar are
-- readable by anon only when the request carries the matching token in the header x-decotrail-share
-- (Supabase Storage copies request headers into request.headers for RLS), so even listing the bucket shows
-- nothing but the photos of that one dive. The token lives only on 'link' dives: a trigger creates it when
-- a dive becomes 'link' and clears it when it stops being 'link'; values sent by clients are ignored.
--
-- Known limit: Storage checks RLS when it signs a URL, not when the signed URL is fetched, and the caller
-- picks the expiry. So turning a link off stops every new access at once, but a photo URL someone already
-- signed while the link was on keeps working until it expires. Said so in the privacy policy.

begin;

-- ---------------------------------------------------------------------------
-- Token: 64 lowercase hex characters (two random UUIDs, 244 random bits)
-- ---------------------------------------------------------------------------

-- 0004 reserved the column as uuid and the app never filled it. Anything that is not a valid token (e.g. a
-- uuid an owner wrote through the API) is dropped; the backfill below gives 'link' dives a real one.
-- Pre-flight on the live database: select count(*) from public.log_entries where share_token is not null; -- 0
alter table public.log_entries alter column share_token type text
    using case when share_token::text ~ '^[0-9a-f]{64}$' then share_token::text end;
alter table public.log_entries drop constraint if exists log_entries_share_token_format;
alter table public.log_entries add constraint log_entries_share_token_format
    check (share_token is null or share_token ~ '^[0-9a-f]{64}$');
alter table public.log_entries drop constraint if exists log_entries_share_token_only_link;
-- (added below, after the backfill)

create or replace function public.log_entries_share_token()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if new.visibility = 'link' then
        if tg_op = 'UPDATE' and old.visibility = 'link' and old.share_token is not null then
            new.share_token := old.share_token; -- unchanged link; a client cannot pick its own token
        else
            new.share_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
        end if;
    else
        new.share_token := null; -- revoked the moment the dive stops being 'link'
    end if;
    return new;
end $$;

drop trigger if exists log_entries_share_token on public.log_entries;
create trigger log_entries_share_token before insert or update on public.log_entries
    for each row execute function public.log_entries_share_token();

-- Dives that were already 'link' get their token now (the trigger fills it on this no-op update).
update public.log_entries set visibility = visibility where visibility = 'link' and share_token is null;
update public.log_entries set share_token = null where visibility <> 'link' and share_token is not null;

alter table public.log_entries add constraint log_entries_share_token_only_link
    check ((visibility = 'link') = (share_token is not null));

-- ---------------------------------------------------------------------------
-- The shared dive, for anyone holding its token
-- ---------------------------------------------------------------------------

-- The owner of a shared dive still has an active account (a deleted or banned user's links stop working).
create or replace function public.share_owner_active(p_owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from auth.users u
        where u.id = p_owner
          and u.deleted_at is null
          and (u.banned_until is null or u.banned_until < now())
    );
$$;

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

-- The token the request carries in the x-decotrail-share header (PostgREST and Storage put the headers,
-- lowercased, into request.headers); null when absent or malformed.
create or replace function public.request_share_token()
returns text
language sql stable set search_path = ''
as $$
    select t from (
        select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-decotrail-share' as t
    ) h
    where t ~ '^[0-9a-f]{64}$';
$$;

-- Storage helpers for anon: is this object the photo / the author's avatar of the dive of the header's token?
create or replace function public.shared_photo_readable(p_name text)
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
          and e.visibility = 'link'
          and e.share_token = public.request_share_token()
          and public.share_owner_active(e.owner)
    );
$$;

create or replace function public.shared_avatar_readable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1
        from public.log_entries e
        join public.profiles p on p.id = e.owner
        where p.avatar_path = p_name
          and split_part(p_name, '/', 1) = e.owner::text
          and e.visibility = 'link'
          and e.share_token = public.request_share_token()
          and public.share_owner_active(e.owner)
    );
$$;

do $$
declare
    f text;
begin
    foreach f in array array[
        'public.log_entries_share_token()',
        'public.request_share_token()',
        'public.share_owner_active(uuid)'
    ] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
    end loop;
    -- The storage helpers serve only the anon policies below.
    foreach f in array array['public.shared_photo_readable(text)', 'public.shared_avatar_readable(text)'] loop
        execute format('revoke all on function %s from public, authenticated', f);
        execute format('grant execute on function %s to anon', f);
    end loop;
    execute 'revoke all on function public.get_shared_dive(text) from public';
    execute 'grant execute on function public.get_shared_dive(text) to anon, authenticated';
end $$;

-- ---------------------------------------------------------------------------
-- Storage: anon reads only the photos / avatar of the dive whose token the request carries
-- ---------------------------------------------------------------------------

drop policy if exists "share link reads photos" on storage.objects;
create policy "share link reads photos" on storage.objects
    for select to anon
    using (bucket_id = 'dive-photos' and public.shared_photo_readable(name));

drop policy if exists "share link reads avatar" on storage.objects;
create policy "share link reads avatar" on storage.objects
    for select to anon
    using (bucket_id = 'avatars' and public.shared_avatar_readable(name));

commit;

notify pgrst, 'reload schema';
