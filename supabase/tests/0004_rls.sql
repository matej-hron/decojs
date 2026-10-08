-- RLS assertions for 0004_community.sql. A = owner of the dives, B = another member, anon = logged out.
-- Any failed check raises and stops psql (ON_ERROR_STOP).
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
set client_min_messages = notice;

-- ---- Data (as superuser) ----
insert into public.sites (id, owner, name, lat, lon) values
    ('20000000-0000-0000-0000-000000000001', :'A', 'Secret Cove', 50.1, 14.2),
    ('20000000-0000-0000-0000-000000000002', :'A', 'Open Reef', 45.0, 13.0);
insert into public.dives (id, owner, device_serial, dive_number, start_local, file_path, file_sha256, parser_version, summary, record) values
    ('30000000-0000-0000-0000-000000000001', :'A', 'S1', 1, '2026-09-01T10:00:00', :'A' || '/S1/1.DLF', 'h1', 1, '{}', '{"n":1}'),
    ('30000000-0000-0000-0000-000000000002', :'A', 'S1', 2, '2026-09-02T10:00:00', :'A' || '/S1/2.DLF', 'h2', 1, '{}', '{"n":2}'),
    ('30000000-0000-0000-0000-000000000003', :'A', 'S1', 3, '2026-09-03T10:00:00', :'A' || '/S1/3.DLF', 'h3', 1, '{}', '{"n":3}');
insert into public.log_entries (id, owner, log_number, dive_date, notes, site_id, recording_id, visibility, share_location, max_depth_m, buddies) values
    ('40000000-0000-0000-0000-000000000001', :'A', 1, '2026-09-01', 'SECRET-NOTE-1', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'members', false, 30, '{Petr}'),
    ('40000000-0000-0000-0000-000000000002', :'A', 2, '2026-09-02', 'SECRET-NOTE-2', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'private', false, 55, '{}'),
    ('40000000-0000-0000-0000-000000000003', :'A', 3, '2026-09-03', 'SECRET-NOTE-3', '20000000-0000-0000-0000-000000000002', null, 'link', true, 20, '{}'),
    ('40000000-0000-0000-0000-0000000000b1', :'B', 1, '2026-09-05', 'B note', null, null, 'private', false, 10, '{}'),
    ('40000000-0000-0000-0000-0000000000b2', :'B', 2, '2026-09-06', null, null, null, 'members', false, 12, '{}');
insert into public.media (id, owner, entry_id, kind, path, lat, lon) values
    ('50000000-0000-0000-0000-000000000001', :'A', '40000000-0000-0000-0000-000000000001', 'photo', :'A' || '/40000000-0000-0000-0000-000000000001/p1.jpg', 50.1, 14.2),
    ('50000000-0000-0000-0000-000000000002', :'A', '40000000-0000-0000-0000-000000000002', 'photo', :'A' || '/40000000-0000-0000-0000-000000000002/p2.jpg', 50.1, 14.2),
    ('50000000-0000-0000-0000-000000000003', :'A', '40000000-0000-0000-0000-000000000003', 'photo', :'A' || '/40000000-0000-0000-0000-000000000003/p3.jpg', 45.0, 13.0);
insert into storage.objects (bucket_id, name) values
    ('dive-photos', :'A' || '/40000000-0000-0000-0000-000000000001/p1.jpg'),
    ('dive-photos', :'A' || '/40000000-0000-0000-0000-000000000002/p2.jpg'),
    ('dive-photos', :'A' || '/40000000-0000-0000-0000-000000000003/p3.jpg'),
    ('dive-logs', :'A' || '/S1/1.DLF'),
    ('avatars', :'A' || '/avatar-1.jpg');
insert into public.profiles (id, display_name) values (:'A', 'Alice');

-- ---- Backfill and schema ----
select pg_temp.check((select visibility from public.log_entries where id = '10000000-0000-0000-0000-000000000000') = 'members', 'existing dive became members');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'community_%'
      and pg_get_function_result(p.oid) ~* '\m(notes|share_token|email)\M'), 'no community function returns notes/share_token/email');

-- ---- Logged out ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
    perform public.community_entries();
    raise exception 'FAILED: anon could call community_entries';
exception when insufficient_privilege then raise notice 'ok: anon cannot call community_entries';
end $$;
do $$ begin
    perform 1 from public.profiles;
    raise exception 'FAILED: anon could read profiles';
exception when insufficient_privilege then raise notice 'ok: anon cannot read profiles';
end $$;
reset role;

-- ---- Member B ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);

select pg_temp.check((select count(*) from public.log_entries where owner = :'A') = 0, 'B cannot read A''s log_entries table');
select pg_temp.check((select count(*) from public.sites where owner = :'A') = 0, 'B cannot read A''s sites table');
select pg_temp.check((select count(*) from public.media where owner = :'A') = 0, 'B cannot read A''s media table');
select pg_temp.check((select count(*) from public.dives where owner = :'A') = 0, 'B cannot read A''s dives table');

select pg_temp.check((select array_agg(id order by id) from public.community_entries(:'A')) =
    array['10000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003']::uuid[],
    'B sees A''s members and link dives, not the private one');
select pg_temp.check(exists (select 1 from public.community_entries() where id = '40000000-0000-0000-0000-0000000000b1'), 'B sees own private dive in the feed');
select pg_temp.check(not exists (select 1 from public.community_entries(p_id => '40000000-0000-0000-0000-000000000002')), 'B cannot fetch A''s private dive by id');
select pg_temp.check((select string_agg(row_to_json(c)::text, '') from public.community_entries() c) !~ 'SECRET-NOTE', 'no notes in the feed');
select pg_temp.check((select site_lat is null and site_lon is null and site_name = 'Secret Cove' from public.community_entries(p_id => '40000000-0000-0000-0000-000000000001')),
    'unshared coordinates hidden, site name shown');
select pg_temp.check((select site_lat = 45.0 from public.community_entries(p_id => '40000000-0000-0000-0000-000000000003')), 'shared coordinates shown');
select pg_temp.check((select photo_count = 1 and photo_path like '%p1.jpg' from public.community_entries(p_id => '40000000-0000-0000-0000-000000000001')), 'first photo and count');
select pg_temp.check((select count(*) from public.community_entries(p_limit => 1000)) <= 100, 'limit clamped');

select pg_temp.check((select lat is null from public.community_media('40000000-0000-0000-0000-000000000001')), 'photo GPS hidden without share_location');
select pg_temp.check((select lat = 45.0 from public.community_media('40000000-0000-0000-0000-000000000003')), 'photo GPS shown with share_location');
select pg_temp.check(not exists (select 1 from public.community_media('40000000-0000-0000-0000-000000000002')), 'no media of a private dive');

select pg_temp.check((select array_agg(id) from public.community_recordings(:'A')) = array['30000000-0000-0000-0000-000000000001']::uuid[], 'only recordings of visible dives');
select pg_temp.check(public.community_recording('30000000-0000-0000-0000-000000000001') is not null, 'record of a visible dive');
select pg_temp.check(public.community_recording('30000000-0000-0000-0000-000000000002') is null, 'no record of a private dive');
select pg_temp.check(public.community_recording('30000000-0000-0000-0000-000000000003') is null, 'no record of an unlinked recording');

select pg_temp.check((select dive_count = 3 and deepest_m = 30 and top_sites = array['Open Reef', 'Secret Cove'] from public.community_members(:'A')),
    'A''s stats count only visible dives');
select pg_temp.check((select count(*) from public.community_members()) = 1, 'members list = profile rows');

-- storage
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'dive-photos') = 2, 'B reads photos of visible dives only');
select pg_temp.check(not exists (select 1 from storage.objects where name like '%p2.jpg'), 'B cannot read a private dive''s photo');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'dive-logs') = 0, 'B cannot read A''s DLF files');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'avatars') = 1, 'B reads avatars');

-- profiles
select pg_temp.check((select display_name from public.profiles where id = :'A') = 'Alice', 'B reads A''s profile');
with u as (update public.profiles set display_name = 'Hacked' where id = :'A' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'B cannot update A''s profile');
do $$ begin
    insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000c', 'Fake C');
    raise exception 'FAILED: B created a profile for C';
exception when insufficient_privilege then raise notice 'ok: B cannot create another member''s profile';
end $$;
insert into public.profiles (id, display_name, avatar_path) values (:'B', 'Bob', :'B' || '/avatar-1.jpg');
do $$ begin
    update public.profiles set avatar_path = '00000000-0000-0000-0000-00000000000a/avatar-1.jpg' where id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FAILED: B pointed the avatar at A''s file';
exception when check_violation then raise notice 'ok: avatar_path must be in the own folder';
end $$;

-- avatars bucket writes
insert into storage.objects (bucket_id, name) values ('avatars', :'B' || '/avatar-2.jpg');
do $$ begin
    insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000a/avatar-x.jpg');
    raise exception 'FAILED: B uploaded into A''s avatar folder';
exception when insufficient_privilege then raise notice 'ok: B cannot upload into A''s avatar folder';
end $$;
with d as (delete from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-00000000000a/%' returning 1)
select pg_temp.check((select count(*) from d) = 0, 'B cannot delete A''s avatar');

-- ---- Attacks: attach A's rows to B's own visible dive ----
-- B links A's private-dive photo path to a media row of B's members dive.
insert into public.media (owner, entry_id, kind, path)
values (:'B', '40000000-0000-0000-0000-0000000000b2', 'photo', '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-000000000002/p2.jpg');
select pg_temp.check(not exists (select 1 from storage.objects where name like '%p2.jpg'), 'a forged media row does not unlock A''s photo');
-- B points own dive at A's site.
update public.log_entries set site_id = '20000000-0000-0000-0000-000000000001', share_location = true where id = '40000000-0000-0000-0000-0000000000b2';
select pg_temp.check((select site_name is null and site_lat is null from public.community_entries(p_id => '40000000-0000-0000-0000-0000000000b2')), 'a borrowed site id reveals nothing');
-- B links A's unlinked recording to own dive.
update public.log_entries set recording_id = '30000000-0000-0000-0000-000000000003' where id = '40000000-0000-0000-0000-0000000000b2';
select pg_temp.check(public.community_recording('30000000-0000-0000-0000-000000000003') is null, 'a borrowed recording id reveals nothing');
select pg_temp.check(not exists (select 1 from public.community_recordings(:'B')), 'B''s recordings list ignores A''s recording');
-- B cannot change A's visibility.
with u as (update public.log_entries set visibility = 'members' where id = '40000000-0000-0000-0000-000000000002' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'B cannot change A''s dive');
reset role;

-- ---- Owner A still sees everything of their own, incl. notes, through the table ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.check((select count(*) from public.log_entries) = 4, 'A reads all own entries');
select pg_temp.check((select notes from public.log_entries where id = '40000000-0000-0000-0000-000000000002') = 'SECRET-NOTE-2', 'A reads own notes');
select pg_temp.check((select count(*) from public.log_entries where owner = :'B') = 0, 'A does not see B''s entries in the table');
select pg_temp.check((select site_lat = 50.1 from public.community_entries(p_id => '40000000-0000-0000-0000-000000000001')), 'owner sees own coordinates via the RPC');
select pg_temp.check(not exists (select 1 from public.community_entries() where id = '40000000-0000-0000-0000-0000000000b1'), 'A does not see B''s private dive');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'dive-photos') = 3, 'A reads own photos');
reset role;
