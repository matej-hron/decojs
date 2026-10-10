-- RLS assertions for 0007_profile_documents.sql. A = owner, B = another member, anon = logged out.
-- Any failed check raises and stops psql (ON_ERROR_STOP).
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set Q1 '70000000-0000-0000-0000-000000000001'
\set Q2 '70000000-0000-0000-0000-000000000002'
\set M1 '71000000-0000-0000-0000-000000000001'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
set client_min_messages = notice;
grant select on storage.objects to anon; -- Supabase grants it; the policies decide
update auth.users set is_anonymous = false, banned_until = null, deleted_at = null;

-- ---- Schema and grants (as superuser) ----
select pg_temp.check((select public = false and file_size_limit = 10485760
    and allowed_mime_types = array['image/jpeg', 'application/pdf'] from storage.buckets where id = 'documents'), 'documents bucket is private, 10 MiB, JPEG/PDF');
select pg_temp.check(not has_table_privilege('anon', 'public.qualifications', 'select')
    and not has_table_privilege('anon', 'public.medical_checks', 'select')
    and not has_table_privilege('anon', 'public.medical_checks', 'insert'), 'anon has no table grants');
select pg_temp.check(not has_function_privilege('anon', 'public.community_qualifications(uuid)', 'execute'), 'anon cannot call community_qualifications');
select pg_temp.check(has_function_privilege('authenticated', 'public.community_qualifications(uuid)', 'execute'), 'members can call community_qualifications');
select pg_temp.check(not has_function_privilege('authenticated', 'public.profile_documents_touch()', 'execute')
    and not has_function_privilege('anon', 'public.profile_documents_touch()', 'execute'), 'nobody calls the trigger function');
-- No function other than the trigger mentions medical_checks: no member/anon path to health data.
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.prosrc ilike '%medical%' and p.proname <> 'profile_documents_touch'), 'no function reads medical_checks');
select pg_temp.check(not exists (
    select 1 from pg_views where definition ilike '%medical_checks%' or definition ilike '%qualifications%'), 'no view exposes the tables');
select pg_temp.check(not exists (
    select 1 from pg_policies where tablename in ('qualifications', 'medical_checks')
      and (qual not like '%auth.uid()%' or 'anon' = any(roles) or 'public' = any(roles))), 'table policies are owner-only, authenticated only');
select pg_temp.check(not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and coalesce(qual, '') || coalesce(with_check, '') like '%documents%' and cmd in ('UPDATE', 'ALL')), 'no update policy on documents');
select pg_temp.check(not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and coalesce(qual, '') || coalesce(with_check, '') like '%documents%' and 'anon' = any(roles)), 'no anon policy on documents');

-- ---- A writes own rows ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.qualifications (id, agency, level, card_number, instructor, notes, scan_front, show_on_profile)
    values (:'Q1', 'CMAS', 'P2', 'CARD-SECRET-1', 'Instr X', 'qual note', :'A' || '/qualifications/' || :'Q1' || '.jpg', true);
insert into public.qualifications (id, agency, agency_other, level, card_number)
    values (:'Q2', 'other', 'UDI', 'Hidden Level', 'CARD-SECRET-2');
insert into public.medical_checks (id, checked_on, valid_until, doctor, notes, scan_path)
    values (:'M1', '2026-01-10', '2027-01-10', 'Dr Secret', 'HEALTH-NOTE', :'A' || '/medical/' || :'M1' || '.pdf');
insert into storage.objects (bucket_id, name) values
    ('documents', :'A' || '/qualifications/' || :'Q1' || '.jpg'),
    ('documents', :'A' || '/medical/' || :'M1' || '.pdf');
select pg_temp.check((select owner from public.qualifications where id = :'Q1') = :'A', 'owner defaults to the caller');
select pg_temp.check((select count(*) from public.qualifications) = 2 and (select count(*) from public.medical_checks) = 1, 'A reads own rows');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents') = 2, 'A reads own documents');

-- Constraints
do $$ begin
    insert into public.qualifications (agency, level) values ('XYZ', 'L');
    raise exception 'FAILED: unknown agency accepted';
exception when check_violation then raise notice 'ok: unknown agency refused';
end $$;
do $$ begin
    insert into public.qualifications (agency, agency_other, level) values ('PADI', 'x', 'OW');
    raise exception 'FAILED: agency_other with a listed agency accepted';
exception when check_violation then raise notice 'ok: agency_other only with other';
end $$;
do $$ begin
    update public.qualifications set scan_back = '00000000-0000-0000-0000-00000000000b/qualifications/70000000-0000-0000-0000-000000000009.jpg'
        where id = '70000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: a scan path in another folder accepted';
exception when check_violation then raise notice 'ok: scan path must be in the own folder';
end $$;
do $$ begin
    update public.medical_checks set scan_path = '00000000-0000-0000-0000-00000000000a/qualifications/71000000-0000-0000-0000-000000000001.pdf'
        where id = '71000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: a medical scan outside medical/ accepted';
exception when check_violation then raise notice 'ok: medical scan path must be under medical/';
end $$;
do $$ begin
    update public.medical_checks set valid_until = '2025-01-01' where id = '71000000-0000-0000-0000-000000000001';
    raise exception 'FAILED: valid_until before checked_on accepted';
exception when check_violation then raise notice 'ok: valid_until not before the check';
end $$;
do $$ begin
    insert into public.medical_checks (owner, checked_on) values ('00000000-0000-0000-0000-00000000000b', '2026-01-01');
    raise exception 'FAILED: A inserted a row for B';
exception when insufficient_privilege then raise notice 'ok: A cannot insert a row owned by B';
end $$;
do $$ begin
    insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-00000000000a/other/x.jpg');
    raise exception 'FAILED: upload outside qualifications/medical accepted';
exception when insufficient_privilege then raise notice 'ok: uploads only into qualifications/ or medical/';
end $$;

-- Server-kept fields: owner and created_at cannot be changed.
update public.medical_checks set owner = :'B', created_at = '2000-01-01' where id = :'M1';
reset role;
select pg_temp.check((select owner = :'A' and created_at > '2020-01-01' from public.medical_checks where id = :'M1'), 'owner and created_at are server-kept');

-- ---- B (another member) ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check((select count(*) from public.qualifications) = 0, 'B cannot read A''s qualifications');
select pg_temp.check((select count(*) from public.medical_checks) = 0, 'B cannot read A''s medical checks');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents') = 0, 'B cannot read A''s documents');
with u as (update public.medical_checks set notes = 'x' returning 1) select pg_temp.check((select count(*) from u) = 0, 'B cannot update A''s medical check');
with d as (delete from public.qualifications returning 1) select pg_temp.check((select count(*) from d) = 0, 'B cannot delete A''s qualifications');
with d as (delete from storage.objects where bucket_id = 'documents' returning 1) select pg_temp.check((select count(*) from d) = 0, 'B cannot delete A''s documents');
do $$ begin
    insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-00000000000a/medical/71000000-0000-0000-0000-000000000009.pdf');
    raise exception 'FAILED: B uploaded into A''s documents folder';
exception when insufficient_privilege then raise notice 'ok: B cannot upload into A''s documents folder';
end $$;
-- Badges: only shown cards, only agency + level.
select pg_temp.check((select count(*) from public.community_qualifications(:'A')) = 1, 'B sees only the shown qualification');
select pg_temp.check((select agency = 'CMAS' and level = 'P2' and agency_other is null from public.community_qualifications(:'A')), 'badge is agency + level');
select pg_temp.check((select string_agg(t::text, '') from public.community_qualifications(:'A') t) not like '%CARD-SECRET%'
    and (select string_agg(t::text, '') from public.community_qualifications(:'A') t) not like '%Instr%', 'badge carries no card number or instructor');
-- Nothing in the community functions carries health data.
select pg_temp.check((select coalesce(string_agg(t::text, ''), '') from public.community_members(:'A') t) not like '%HEALTH%'
    and (select coalesce(string_agg(t::text, ''), '') from public.community_entries(:'A', null, 100, 0) t) not like '%Dr Secret%', 'community functions carry no medical data');
-- B's own medical row in B's own folder works; moving it to the avatars bucket does not.
insert into storage.objects (bucket_id, name) values ('documents', :'B' || '/medical/71000000-0000-0000-0000-0000000000b1.jpg');
with u as (update storage.objects set bucket_id = 'avatars' where bucket_id = 'documents' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'B cannot move a document into the members-readable avatars bucket');
reset role;
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents' and name like :'B' || '/%') = 1, 'B''s document stayed in documents');

-- A non-member (banned) caller gets no badges.
update auth.users set banned_until = now() + interval '1 day' where id = :'B';
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.check((select count(*) from public.community_qualifications(:'A')) = 0, 'a banned user sees no badges');
reset role;
update auth.users set banned_until = null where id = :'B';

-- ---- anon ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
    perform 1 from public.medical_checks;
    raise exception 'FAILED: anon read medical_checks';
exception when insufficient_privilege then raise notice 'ok: anon cannot read medical_checks';
end $$;
do $$ begin
    perform public.community_qualifications('00000000-0000-0000-0000-00000000000a');
    raise exception 'FAILED: anon called community_qualifications';
exception when insufficient_privilege then raise notice 'ok: anon cannot call community_qualifications';
end $$;
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents') = 0, 'anon reads no documents');
-- Even with a valid share-link header, documents stay hidden.
select set_config('request.headers', '{"x-decotrail-share": "' || repeat('a', 64) || '"}', false);
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'documents') = 0, 'anon with a share header reads no documents');
reset role;

-- ---- Delete cascades with the user ----
delete from auth.users where id = :'A';
select pg_temp.check((select count(*) from public.medical_checks where owner = :'A') = 0
    and (select count(*) from public.qualifications where owner = :'A') = 0, 'deleting the login deletes the rows');
