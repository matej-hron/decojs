-- Assertions for 0012_public_profiles.sql. Own users: P is public, Q is a member who stays non-public, R is public
-- but banned. Any failed check raises and stops psql (ON_ERROR_STOP).
\set P '00000000-0000-0000-0000-0000000000f1'
\set Q '00000000-0000-0000-0000-0000000000f2'
\set R '00000000-0000-0000-0000-0000000000f3'
\set SM '5f000000-0000-0000-0000-000000000001'
\set SP '5f000000-0000-0000-0000-000000000002'
\set P1 '6f000000-0000-0000-0000-000000000001'
\set P2 '6f000000-0000-0000-0000-000000000002'
\set PPRIV '6f000000-0000-0000-0000-000000000003'
\set PSEC '6f000000-0000-0000-0000-000000000004'
\set Q1 '6f000000-0000-0000-0000-000000000005'
\set R1 '6f000000-0000-0000-0000-000000000006'
\set D1 '7f000000-0000-0000-0000-000000000001'
\set DPRIV '7f000000-0000-0000-0000-000000000002'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
set client_min_messages = notice;
grant select on storage.objects to anon; -- Supabase grants it; the policies decide

-- ---- Schema and grants ----
select pg_temp.check((select column_default = 'false' and is_nullable = 'NO' from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_public'), 'is_public defaults to false, not null');
select pg_temp.check((select count(*) = 0 from public.profiles where is_public), 'every existing profile stays non-public');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('community_entries', 'community_members', 'community_sites', 'site_stats', 'site_visits', 'community_media', 'community_recording')
      and has_function_privilege('anon', p.oid, 'execute')), 'member functions stay closed to anon');
select pg_temp.check((select bool_and(has_function_privilege('anon', p.oid, 'execute'))
    from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('public_entries', 'public_media', 'public_recordings', 'public_recording', 'public_members',
                        'public_sites', 'public_site_stats', 'public_site_visits')), 'anon can call the public functions');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('profile_public', 'public_record', 'public_details')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 'helpers are not callable');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname like 'public\_%'
      and pg_get_function_result(p.oid) ~* '\m(notes|share_token)\M'), 'public functions return no notes or share_token');
select pg_temp.check(not has_table_privilege('anon', 'public.profiles', 'select')
    and not has_table_privilege('anon', 'public.log_entries', 'select')
    and not has_table_privilege('anon', 'public.sites', 'select'), 'anon has no table access');

-- ---- Data ----
insert into auth.users (id, is_anonymous, banned_until) values (:'P', false, null), (:'Q', false, null), (:'R', false, null);
insert into public.profiles (id, display_name, nickname, avatar_path) values
    (:'P', 'Petra', 'Pet', :'P' || '/avatar-1.jpg'), (:'Q', 'Quido', null, :'Q' || '/avatar-1.jpg'), (:'R', 'Radek', null, null);
insert into public.sites (id, owner, name, lat, lon, notes, url, visibility) values
    (:'SM', :'Q', 'Lom Public', 50.5, 14.5, 'Q-SECRET-SITE-NOTE', 'https://example.com/lom', 'members'),
    (:'SP', :'P', 'Petra Secret Spot', 49.5, 15.5, 'P-SECRET-SITE-NOTE', null, 'private');
insert into public.dives (id, owner, device_serial, dive_number, start_local, file_path, file_sha256, parser_version, summary, record) values
    (:'D1', :'P', 'SERIAL-1234', 777, '2026-09-01T10:00:00', 'p/d1.dlf', 'abc', 1, '{"maxDepth": 20}',
     '{"device": {"serial": "SERIAL-1234", "model": "Freedom"}, "source": {"diveNumber": 777, "fileName": "777.DLF"}, "samples": [1, 2]}'),
    (:'DPRIV', :'P', 'SERIAL-1234', 778, '2026-09-02T10:00:00', 'p/d2.dlf', 'def', 1, '{"maxDepth": 30}', '{"samples": []}');
insert into public.log_entries (id, owner, log_number, dive_date, entry_time, notes, buddies, site_id, visibility, share_location,
                                water_temp_c, vis_shallow_m, vis_deep_m, details, recording_id) values
    (:'P1', :'P', 1, '2026-09-01', '10:00', 'P-SECRET-NOTE', '{"Buddy Name"}', :'SM', 'members', true, 16, 8, 4,
     '{"computer": "Divesoft Freedom SERIAL-1234", "rating": 4, "surfaceTempC": 20}', :'D1'),
    (:'P2', :'P', 2, '2026-08-01', '10:00', 'P-SECRET-NOTE', '{}', :'SM', 'link', false, 14, null, null, '{}', null),
    (:'PPRIV', :'P', 3, '2026-09-02', '10:00', 'P-SECRET-NOTE', '{}', :'SM', 'private', true, -5, 99, 99, '{}', :'DPRIV'),
    (:'PSEC', :'P', 4, '2026-07-01', '10:00', 'P-SECRET-NOTE', '{}', :'SP', 'members', true, null, null, null, '{}', null),
    (:'Q1', :'Q', 1, '2026-06-01', '10:00', 'Q-SECRET-NOTE', '{}', :'SM', 'members', true, 10, 12, 6, '{}', null),
    (:'R1', :'R', 1, '2026-05-01', '10:00', null, '{}', :'SM', 'members', true, 11, null, null, '{}', null);
insert into public.media (id, owner, entry_id, kind, path) values
    ('8f000000-0000-0000-0000-000000000001', :'P', :'P1', 'photo', :'P' || '/' || :'P1' || '/a.jpg'),
    ('8f000000-0000-0000-0000-000000000002', :'P', :'PPRIV', 'photo', :'P' || '/' || :'PPRIV' || '/b.jpg'),
    ('8f000000-0000-0000-0000-000000000003', :'Q', :'Q1', 'photo', :'Q' || '/' || :'Q1' || '/c.jpg');
insert into storage.objects (bucket_id, name) values
    ('dive-photos', :'P' || '/' || :'P1' || '/a.jpg'), ('dive-photos', :'P' || '/' || :'PPRIV' || '/b.jpg'),
    ('dive-photos', :'Q' || '/' || :'Q1' || '/c.jpg'),
    ('avatars', :'P' || '/avatar-1.jpg'), ('avatars', :'Q' || '/avatar-1.jpg');

-- ---- Nobody public yet: anon sees no dives, no members ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select count(*) from public.public_entries()) = 0, 'no public profile: no dives');
select pg_temp.check((select count(*) from public.public_members()) = 0, 'no public profile: no members');
select pg_temp.check((select count(*) from storage.objects) = 0, 'no public profile: no objects');
reset role;

-- ---- P switches the profile to public (through RLS); Q cannot switch it for P ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
update public.profiles set is_public = true where id = :'P';
reset role;
select pg_temp.check((select not is_public from public.profiles where id = :'P'), 'another member cannot make P public');
set role authenticated;
select set_config('request.jwt.claim.sub', :'P', false);
update public.profiles set is_public = true where id = :'P';
reset role;
select pg_temp.check((select is_public from public.profiles where id = :'P'), 'P made the own profile public');
update public.profiles set is_public = true where id = :'R';
update auth.users set banned_until = now() + interval '1 day' where id = :'R';

-- ---- Anonymous reads ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check((select array_agg(id order by dive_date desc) from public.public_entries(:'P')) = array[:'P1', :'P2', :'PSEC']::uuid[],
    'P''s members and link dives, newest first; never the private one');
select pg_temp.check((select count(*) from public.public_entries() where owner in (:'Q', :'R')) = 0, 'non-public and banned members: no dives');
select pg_temp.check((select log_number is null and buddies = '{}' and details = '{"rating": 4, "surfaceTempC": 20}'::jsonb
    from public.public_entries(null, :'P1')), 'no log number, no buddies, no computer serial');
select pg_temp.check((select row_to_json(x)::text !~ 'SECRET|SERIAL|Buddy' from public.public_entries() x limit 1), 'no notes, serials or buddy names in a row');
select pg_temp.check((select site_name = 'Lom Public' and site_lat = 50.5 and site_url is null from public.public_entries(null, :'P1')),
    'exact position with share_location; another member''s site link never shown');
select pg_temp.check((select site_name = 'Lom Public' and site_lat is null from public.public_entries(null, :'P2')), 'share_location off: no position');
select pg_temp.check((select site_id is null and site_name is null from public.public_entries(null, :'PSEC')), 'a private site never shows');
select pg_temp.check((select photo_path = :'P' || '/' || :'P1' || '/a.jpg' and photo_count = 1 from public.public_entries(null, :'P1')), 'first photo of a public dive');
select pg_temp.check((select count(*) from public.public_media(:'P1')) = 1 and (select count(*) from public.public_media(:'PPRIV')) = 0
    and (select count(*) from public.public_media(:'Q1')) = 0, 'media only of public dives');
select pg_temp.check((select array_agg(id) from public.public_recordings(:'P')) = array[:'D1']::uuid[], 'recordings only of non-private dives');
select pg_temp.check((select device_serial is null and dive_number is null and file_sha256 is null from public.public_recordings(:'P')), 'recording list: no serial, counter or hash');
select pg_temp.check(public.public_recording(:'D1')::text !~ 'SERIAL|777' and public.public_recording(:'D1') -> 'samples' = '[1, 2]'::jsonb,
    'recording: samples without serial or counter');
select pg_temp.check(public.public_recording(:'DPRIV') is null, 'recording of a private dive: null');
select pg_temp.check((select array_agg(id) from public.public_members()) = array[:'P']::uuid[], 'only the public, active profile is listed');
select pg_temp.check((select dive_count = 3 and nickname = 'Pet' and top_sites = '{"Lom Public"}' from public.public_members(:'P')),
    'stats over non-private dives; private sites not named');
select pg_temp.check((select count(*) from public.public_members(:'Q')) = 0, 'a non-public member is not found');
-- Sites: the members site only, no creator, conditions over every members-visible dive (P1, P2, Q1, R1).
select pg_temp.check(not exists (select 1 from public.public_sites() where id = :'SP'), 'a private site is not listed');
select pg_temp.check((select owner is null and url = 'https://example.com/lom' and visits = 4 and temp_min = 10 and temp_max = 20 and vis_max = 12
    from public.public_sites() where id = :'SM'), 'site: no creator, aggregates without the private dive');
select pg_temp.check((select (s ->> 'visits')::int = 4 and (s -> 'temp' -> 'bottom' ->> 'min')::numeric = 10 and s::text !~ 'SECRET'
    from public.public_site_stats(:'SM') s), 'site stats aggregate every members-visible dive');
select pg_temp.check(public.public_site_stats(:'SP') is null, 'stats of a private site: null');
select pg_temp.check((select array_agg(id order by dive_date desc) from public.public_site_visits(:'SM')) = array[:'P1', :'P2']::uuid[],
    'visits list only public profiles'' dives');
select pg_temp.check((select array_agg(name order by name) from storage.objects) =
    array[:'P' || '/' || :'P1' || '/a.jpg', :'P' || '/avatar-1.jpg'], 'storage: public dive photos and public avatars only');
reset role;

-- ---- Members still read through the member functions; the public ones behave the same for them ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'Q', false);
select pg_temp.check((select count(*) from public.public_entries(:'P')) = 3, 'a member can call the public functions too');
reset role;

-- ---- Switching off hides everything at once ----
update public.profiles set is_public = false where id = :'P';
set role anon;
select pg_temp.check((select count(*) from public.public_entries()) = 0 and (select count(*) from public.public_members()) = 0
    and public.public_recording(:'D1') is null and (select count(*) from storage.objects) = 0, 'switched off: nothing public');
select pg_temp.check((select visits = 4 from public.public_sites() where id = :'SM'), 'site conditions stay (nobody named)');
select pg_temp.check((select count(*) from public.public_site_visits(:'SM')) = 0, 'switched off: no visits listed');
reset role;
