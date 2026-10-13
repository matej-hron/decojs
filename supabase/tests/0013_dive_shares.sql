-- Assertions for 0013_dive_shares.sql. Own users: S sends, R receives, O is another member, X an anonymous sign-in.
-- Any failed check raises and stops psql (ON_ERROR_STOP).
\set S '00000000-0000-0000-0000-0000000001a1'
\set R '00000000-0000-0000-0000-0000000001a2'
\set O '00000000-0000-0000-0000-0000000001a3'
\set X '00000000-0000-0000-0000-0000000001a4'
\set SM '5a000000-0000-0000-0000-000000000001'
\set SP '5a000000-0000-0000-0000-000000000002'
\set E1 '6a000000-0000-0000-0000-000000000001'
\set E2 '6a000000-0000-0000-0000-000000000002'
\set RE '6a000000-0000-0000-0000-000000000003'
\set OE '6a000000-0000-0000-0000-000000000004'
\set D1 '7a000000-0000-0000-0000-000000000001'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
create function pg_temp.err(stmt text) returns text language plpgsql as $$
begin
    execute stmt;
    return null;
exception when others then
    return sqlstate;
end $$;
grant execute on function pg_temp.err(text) to anon, authenticated;
set client_min_messages = notice;

-- ---- Grants ----
select pg_temp.check(not has_table_privilege('authenticated', 'public.dive_shares', 'insert')
    and not has_table_privilege('authenticated', 'public.dive_shares', 'update')
    and not has_table_privilege('authenticated', 'public.dive_shares', 'delete')
    and not has_table_privilege('anon', 'public.dive_shares', 'select'), 'shares change only through the functions');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('set_dive_shares', 'incoming_dive_shares', 'accept_dive_share', 'decline_dive_share', 'dive_share_media',
                        'share_member_name', 'share_recipient_ok', 'incoming_dive_share_count')
      and has_function_privilege('anon', p.oid, 'execute')), 'anon calls none of the share functions');
select pg_temp.check(not has_function_privilege('authenticated', 'public.share_member_name(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.share_recipient_ok(uuid)', 'execute'), 'helpers are not callable');

-- ---- Data ----
insert into auth.users (id, is_anonymous, raw_user_meta_data) values
    (:'S', false, '{}'), (:'R', false, '{"log_offset": 40, "share_location_default": false}'), (:'O', false, '{}'), (:'X', true, '{}');
insert into public.profiles (id, display_name, nickname, default_visibility) values
    (:'S', 'Matej Hron', 'Matej', 'members'), (:'R', 'Krystof Novak', 'Krystof', 'private'), (:'O', 'Otto', null, 'members');
insert into public.sites (id, owner, name, visibility) values (:'SM', :'S', 'Zernovka', 'members'), (:'SP', :'S', 'Secret', 'private');
insert into public.dives (id, owner, device_serial, dive_number, start_local, file_path, file_sha256, parser_version, summary, record) values
    (:'D1', :'S', 'SER-1', 55, '2026-10-12T21:00:00', :'S' || '/SER-1/x.DLF', 'h', 1, '{"maxDepth": 12}', '{"samples": [1, 2, 3]}');
insert into public.log_entries (id, owner, log_number, dive_date, entry_time, duration_s, max_depth_m, notes, buddies, water_temp_c,
                                vis_shallow_m, details, site_id, recording_id, visibility, description, gas) values
    (:'E1', :'S', 7, '2026-10-12', '21:00', 2700, 12.3, 'S-SECRET-NOTE', '{"Krystof", "Pepa"}', 11, 4,
     '{"rating": 5, "weightsKg": 8, "current": "none", "tags": ["night"], "computer": "Freedom SER-1"}', :'SM', :'D1', 'private',
     'Nocak s Krystofem', '[{"o2": 21}]'),
    (:'E2', :'S', 8, '2026-10-13', null, 1800, 20, null, '{}', null, null, '{}', :'SP', null, 'members', null, null),
    (:'RE', :'R', 3, '2026-10-12', '21:05', 2600, 12, null, '{}', null, null, '{}', null, null, 'members', null, null),
    (:'OE', :'O', 1, '2026-10-12', null, 100, 5, null, '{}', null, null, '{}', null, null, 'members', null, null);
insert into public.media (id, owner, entry_id, kind, path, width, height) values
    ('8a000000-0000-0000-0000-000000000001', :'S', :'E1', 'photo', :'S' || '/' || :'E1' || '/p.jpg', 800, 600);
insert into storage.objects (bucket_id, name) values ('dive-photos', :'S' || '/' || :'E1' || '/p.jpg');

-- ---- Offering ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'O', false);
select pg_temp.check(pg_temp.err(format('select public.set_dive_shares(%L, array[%L]::uuid[])', :'E1', :'R')) = '42501', 'only the owner offers a dive');
select set_config('request.jwt.claim.sub', :'X', false);
select pg_temp.check(pg_temp.err(format('select public.set_dive_shares(%L, array[%L]::uuid[])', :'E1', :'R')) = '42501', 'an anonymous sign-in cannot offer');
select set_config('request.jwt.claim.sub', :'S', false);
select pg_temp.check((select count(*) from public.set_dive_shares(:'E1', array[:'R', :'O', :'S', :'X', '00000000-0000-0000-0000-00000000dead']::uuid[])) = 2,
    'offers only to other real members (not self, anonymous or unknown)');
select pg_temp.check((select count(*) from public.set_dive_shares(:'E1', array[:'R']::uuid[])) = 1, 'a pending offer missing from the list is withdrawn');
select pg_temp.check((select count(*) from public.set_dive_shares(:'E1', array[:'R', :'R']::uuid[])) = 1, 'offered once');
select pg_temp.check((select count(*) from public.dive_shares) = 1, 'the sender reads own offers');
reset role;

-- ---- Receiving ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'O', false);
select pg_temp.check((select count(*) from public.incoming_dive_shares()) = 0 and (select count(*) from public.dive_shares) = 0, 'others see no offer');
select pg_temp.check((select count(*) from storage.objects where name like :'S' || '/%') = 0, 'others cannot read the offered photo');
select set_config('request.jwt.claim.sub', :'R', false);
select pg_temp.check((select count(*) from public.incoming_dive_shares()) = 1 and public.incoming_dive_share_count() = 1, 'the recipient sees one offer');
select pg_temp.check((select nickname = 'Matej' and site_name = 'Zernovka' and has_recording and photo_count = 1 and description = 'Nocak s Krystofem'
    from public.incoming_dive_shares()), 'the offer says what the dive is (even a private one)');
select pg_temp.check((select row_to_json(x)::text !~ 'S-SECRET' from public.incoming_dive_shares() x), 'no notes in the offer');
select pg_temp.check((select count(*) from storage.objects where name like :'S' || '/%') = 1, 'the recipient may read the offered photo');
select id as share_id from public.dive_shares where entry_id = :'E1' \gset
select pg_temp.check((select count(*) from public.dive_share_media(:'share_id')) = 1, 'the recipient lists the media to copy');
select pg_temp.check(pg_temp.err(format('select public.accept_dive_share(%L, %L)', :'share_id', :'OE')) = '42501', 'cannot link someone else''s dive');
reset role;

-- ---- Accept as a copy ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'R', false);
select public.accept_dive_share(:'share_id') ->> 'entry_id' as copy_id \gset
select pg_temp.check((select copied from (select (public.accept_dive_share(:'share_id') ->> 'copied')::boolean as copied) x) = false
    and (select public.accept_dive_share(:'share_id') ->> 'entry_id') = :'copy_id', 'a second accept returns the same dive');
reset role;
select pg_temp.check((select owner = :'R' and log_number = 41 and dive_date = '2026-10-12' and entry_time = '21:00' and duration_s = 2700
    and max_depth_m = 12.3 and water_temp_c = 11 and site_id = :'SM' and notes is null and gas is null
    and description = 'Nocak s Krystofem' and visibility = 'private' and share_location = false
    from public.log_entries where id = :'copy_id'), 'copy: basics, story, own next number after the offset, own defaults; no notes or gas');
select pg_temp.check((select buddies = '{"Matej", "Pepa"}' from public.log_entries where id = :'copy_id'), 'copy buddies: the sender, not the recipient');
select pg_temp.check((select details = '{"current": "none", "tags": ["night"]}'::jsonb from public.log_entries where id = :'copy_id'),
    'copy details: conditions only (no rating, weights or computer)');
select pg_temp.check((select d.owner = :'R' and d.record = '{"samples": [1, 2, 3]}'::jsonb and d.id <> :'D1'
    from public.log_entries e join public.dives d on d.id = e.recording_id where e.id = :'copy_id'), 'copy has its own recording with the samples');
select pg_temp.check((select status = 'accepted' and result_entry_id = :'copy_id' from public.dive_shares where id = :'share_id'), 'offer accepted');
set role authenticated;
select set_config('request.jwt.claim.sub', :'R', false);
select pg_temp.check(public.incoming_dive_share_count() = 0, 'no pending offer left');
reset role;

-- ---- Answered offers stay answered; decline; link ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
select pg_temp.check((select count(*) from public.set_dive_shares(:'E1', '{}'::uuid[])) = 1, 'an accepted offer is not withdrawn');
select count(*) from public.set_dive_shares(:'E2', array[:'R', :'O']::uuid[]);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'O', false);
select public.decline_dive_share((select id from public.dive_shares where entry_id = :'E2' and recipient = :'O'));
select pg_temp.check((select status from public.dive_shares where entry_id = :'E2') = 'declined', 'declined');
select pg_temp.check(pg_temp.err(format('select public.accept_dive_share(%L)', (select id from public.dive_shares where entry_id = :'E2'))) = '22023', 'a declined offer cannot be accepted');
select set_config('request.jwt.claim.sub', :'R', false);
select pg_temp.check((select public.accept_dive_share((select id from public.dive_shares where entry_id = :'E2'), :'RE') ->> 'entry_id') = :'RE', 'linked to an own dive');
reset role;
select pg_temp.check((select buddies = '{"Matej"}' from public.log_entries where id = :'RE'), 'the sender joins the linked dive''s buddies');
select pg_temp.check((select count(*) from public.log_entries where owner = :'R') = 2, 'linking copies nothing');
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false);
select pg_temp.check((select count(*) from public.set_dive_shares(:'E2', array[:'O']::uuid[]) where recipient = :'O' and status = 'declined') = 1, 'a declined buddy is not asked again');
reset role;

-- ---- A private site is never copied ----
select pg_temp.check((select site_id is null from public.log_entries where owner = :'R' and id <> :'RE' and id <> :'copy_id') is not false, 'no private site');

-- ---- Deleting the sender's dive removes the offers ----
delete from public.log_entries where id = :'E2';
select pg_temp.check((select count(*) from public.dive_shares where entry_id = :'E2') = 0, 'offers go with the dive');
