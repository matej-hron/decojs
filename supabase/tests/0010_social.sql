-- Assertions for 0010_social.sql. Own users and dives: O owns the dives, M and N are members, X is an
-- anonymous sign-in, Z is banned. Any failed check raises and stops psql (ON_ERROR_STOP).
\set O '00000000-0000-0000-0000-0000000000d1'
\set M '00000000-0000-0000-0000-0000000000d2'
\set N '00000000-0000-0000-0000-0000000000d3'
\set X '00000000-0000-0000-0000-0000000000d4'
\set Z '00000000-0000-0000-0000-0000000000d5'
\set PUB '4d000000-0000-0000-0000-000000000001'
\set PRIV '4d000000-0000-0000-0000-000000000002'
\set LNK '4d000000-0000-0000-0000-000000000003'
\set MINE '4d000000-0000-0000-0000-000000000004'

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
    if ok is not true then raise exception 'FAILED: %', what; end if;
    raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
-- Runs a statement as the current role and reports whether it was refused (RLS, grant or check).
create function pg_temp.refused(stmt text) returns boolean language plpgsql as $$
begin
    execute stmt;
    return false;
exception when insufficient_privilege or check_violation or raise_exception or not_null_violation or foreign_key_violation or unique_violation then
    return true;
end $$;
grant execute on function pg_temp.refused(text) to anon, authenticated;
-- Rows a statement changed (0 = silently filtered by RLS).
create function pg_temp.affected(stmt text) returns integer language plpgsql as $$
declare n integer;
begin
    execute stmt;
    get diagnostics n = row_count;
    return n;
end $$;
grant execute on function pg_temp.affected(text) to anon, authenticated;
set client_min_messages = notice;

-- ---- Data (as superuser) ----
insert into auth.users (id, is_anonymous, banned_until) values
    (:'O', false, null), (:'M', false, null), (:'N', false, null), (:'X', true, null), (:'Z', false, now() + interval '1 day');
insert into public.profiles (id, display_name, avatar_preset) values (:'O', 'Olga', 'reef-01'), (:'M', 'Milan', 'reef-02'), (:'N', 'Nora', null);
insert into public.sites (id, owner, name) values ('2d000000-0000-0000-0000-000000000001', :'O', 'Blue Hole');
insert into public.log_entries (id, owner, log_number, dive_date, notes, site_id, visibility) values
    (:'PUB', :'O', 1, '2026-09-20', 'O-SECRET-NOTE', '2d000000-0000-0000-0000-000000000001', 'members'),
    (:'PRIV', :'O', 2, '2026-09-21', 'O-SECRET-NOTE', null, 'private'),
    (:'LNK', :'O', 3, '2026-09-22', 'O-SECRET-NOTE', null, 'link'),
    (:'MINE', :'M', 1, '2026-09-23', 'M-NOTE', null, 'members');
select share_token as tok from public.log_entries where id = :'LNK' \gset

-- ---- Schema and grants ----
select pg_temp.check((select comments_enabled from public.log_entries where id = :'PUB'), 'comments on by default');
select pg_temp.check(not exists (select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name in ('kudos', 'comments')), 'anon has no grants on kudos/comments');
select pg_temp.check(not has_column_privilege('authenticated', 'public.comments', 'entry_id', 'update')
    and not has_column_privilege('authenticated', 'public.comments', 'author_id', 'update')
    and not has_column_privilege('authenticated', 'public.comments', 'created_at', 'update')
    and has_column_privilege('authenticated', 'public.comments', 'body', 'update'), 'only the body of a comment is updatable');
select pg_temp.check(not has_table_privilege('authenticated', 'public.kudos', 'update'), 'kudos cannot be updated');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('entry_visible', 'can_kudos', 'can_comment', 'owns_entry', 'social_counts', 'entry_kudos',
                        'entry_comments', 'social_inbox', 'social_unseen_count', 'social_mark_seen', 'kudos_touch', 'comments_touch')
      and has_function_privilege('anon', p.oid, 'execute')), 'anon cannot execute the social functions');
select pg_temp.check(has_function_privilege('anon', 'public.shared_dive_kudos(text)', 'execute'), 'anon can read a shared dive''s kudos count');
select pg_temp.check(not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('social_counts', 'entry_kudos', 'entry_comments', 'social_inbox')
      and pg_get_function_result(p.oid) ~* '\m(notes|share_token|email)\M'), 'no social function returns notes/share_token/email');

-- ---- Anon: nothing ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(pg_temp.refused('select 1 from public.kudos'), 'anon cannot read kudos');
select pg_temp.check(pg_temp.refused('select 1 from public.comments'), 'anon cannot read comments');
select pg_temp.check(pg_temp.refused(format('insert into public.kudos (entry_id, member_id) values (%L, %L)', :'PUB', :'M')), 'anon cannot give kudos');
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, author_id, body) values (%L, %L, %L)', :'PUB', :'M', 'hi')), 'anon cannot comment');
select pg_temp.check(pg_temp.refused('select public.social_counts(array[]::uuid[])'), 'anon cannot call social_counts');
select pg_temp.check(pg_temp.refused(format('select public.entry_comments(%L)', :'PUB')), 'anon cannot call entry_comments');
reset role;

-- ---- Member M: kudos ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'M', false);
insert into public.kudos (entry_id) values (:'PUB'); -- member_id defaults to the caller
select pg_temp.check((select member_id from public.kudos where entry_id = :'PUB') = :'M', 'kudos member defaults to the caller');
select pg_temp.check(pg_temp.refused(format('insert into public.kudos (entry_id) values (%L)', :'PUB')), 'second kudos on the same dive refused');
insert into public.kudos (entry_id, member_id, created_at) values (:'LNK', :'M', '2000-01-01');
select pg_temp.check((select created_at > now() - interval '1 minute' from public.kudos where entry_id = :'LNK'), 'kudos time is the server''s');
select pg_temp.check(pg_temp.refused(format('insert into public.kudos (entry_id, member_id) values (%L, %L)', :'PUB', :'N')), 'M cannot give kudos as N');
select pg_temp.check(pg_temp.refused(format('insert into public.kudos (entry_id) values (%L)', :'PRIV')), 'no kudos on a private dive');
select pg_temp.check(pg_temp.refused(format('insert into public.kudos (entry_id) values (%L)', :'MINE')), 'no kudos on own dive');
select pg_temp.check(pg_temp.refused(format('insert into public.kudos (entry_id) values (%L)', gen_random_uuid())), 'no kudos on a missing dive');

-- ---- Member M: comments ----
insert into public.comments (entry_id, body) values (:'PUB', E'First line\n<b>bold</b>');
select id as c1 from public.comments where entry_id = :'PUB' and author_id = :'M' \gset
select pg_temp.check((select author_id = :'M' and edited_at is null from public.comments where id = :'c1'), 'comment author defaults to the caller');
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, author_id, body) values (%L, %L, %L)', :'PUB', :'N', 'spoof')), 'M cannot comment as N');
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, body) values (%L, %L)', :'PRIV', 'peek')), 'no comment on a private dive');
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, body) values (%L, %L)', :'PUB', '   ')), 'blank comment refused');
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, body) values (%L, %L)', :'PUB', repeat('x', 1001))), '1001 characters refused');
select pg_temp.check(not pg_temp.refused(format('insert into public.comments (entry_id, body) values (%L, %L)', :'PUB', repeat('é', 1000))), '1000 characters accepted');
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, body, created_at) values (%L, %L, %L)', :'PUB', 'x', '2000-01-01'))
    or (select min(created_at) > now() - interval '1 minute' from public.comments where author_id = :'M'), 'comment time is the server''s');
insert into public.comments (entry_id, body) values (:'MINE', 'own dive comment');
-- Edit: only the body changes, edited_at is set.
update public.comments set body = 'edited text' where id = :'c1';
select pg_temp.check((select body = 'edited text' and edited_at is not null from public.comments where id = :'c1'), 'author edits own comment, edited_at set');
select pg_temp.check(pg_temp.refused(format('update public.comments set entry_id = %L where id = %L', :'MINE', :'c1')), 'entry of a comment cannot change');
select pg_temp.check(pg_temp.refused(format('update public.comments set author_id = %L where id = %L', :'N', :'c1')), 'author of a comment cannot change');
reset role;

-- ---- Member N: reads what M wrote, cannot change it ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'N', false);
select pg_temp.check((select kudos_count = 1 and not kudoed and comment_count = 3 and comments_enabled from public.social_counts(array[:'PUB']::uuid[])), 'N sees counts of a members dive');
select pg_temp.check(not exists (select 1 from public.social_counts(array[:'PRIV']::uuid[])), 'no counts of a private dive');
select pg_temp.check((select count(*) from public.entry_kudos(:'PUB')) = 1 and (select display_name from public.entry_kudos(:'PUB')) = 'Milan', 'N sees who gave kudos');
select pg_temp.check((select count(*) from public.entry_comments(:'PUB')) = 3, 'N reads the comments');
select pg_temp.check((select body from public.entry_comments(:'PUB') limit 1) = 'edited text', 'comments oldest first');
select pg_temp.check((select string_agg(row_to_json(c)::text, '') from public.entry_comments(:'PUB') c) !~ 'O-SECRET-NOTE', 'no notes in comments');
select pg_temp.check(pg_temp.affected(format('update public.comments set body = %L where id = %L', 'hijack', :'c1')) = 0, 'N cannot edit M''s comment');
select pg_temp.check(pg_temp.affected(format('delete from public.comments where id = %L', :'c1')) = 0, 'N cannot delete M''s comment');
select pg_temp.check(pg_temp.affected(format('delete from public.kudos where entry_id = %L', :'PUB')) = 0, 'N cannot take back M''s kudos');
select pg_temp.check((select count(*) from public.social_inbox()) = 0, 'N has no inbox events (owns nothing)');
reset role;

-- ---- Private dive with history: everything disappears ----
insert into public.kudos (entry_id, member_id) values (:'PRIV', :'N');
insert into public.comments (entry_id, author_id, body) values (:'PRIV', :'N', 'PRIVATE-COMMENT');
set role authenticated;
select set_config('request.jwt.claim.sub', :'M', false);
select pg_temp.check(not exists (select 1 from public.kudos where entry_id = :'PRIV'), 'M cannot read kudos of a private dive');
select pg_temp.check(not exists (select 1 from public.comments where entry_id = :'PRIV'), 'M cannot read comments of a private dive (table)');
select pg_temp.check(not exists (select 1 from public.entry_comments(:'PRIV')), 'M cannot read comments of a private dive (function)');
select pg_temp.check(not exists (select 1 from public.entry_kudos(:'PRIV')), 'M cannot read kudos of a private dive (function)');
select pg_temp.check(not exists (select 1 from public.social_counts(array[:'PRIV', :'PUB']::uuid[]) where entry_id = :'PRIV'), 'social_counts skips a private dive');
reset role;

-- ---- Owner O ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'O', false);
select pg_temp.check((select count(*) from public.entry_comments(:'PRIV')) = 1, 'owner reads comments on own private dive');
select pg_temp.check(public.social_unseen_count() = 7, 'owner badge counts kudos (3) and comments (4) by others');
select pg_temp.check((select count(*) from public.social_inbox()) = 7, 'inbox lists them');
select pg_temp.check((select bool_and(is_new) from public.social_inbox()), 'all new before the first visit');
select pg_temp.check((select string_agg(coalesce(excerpt, ''), '|') from public.social_inbox() where kind = 'comment') ~ 'edited text', 'inbox shows comment excerpts');
select pg_temp.check((select site_name from public.social_inbox() where entry_id = :'PUB' limit 1) = 'Blue Hole', 'inbox names the site');
select pg_temp.check(not exists (select 1 from public.social_inbox() where entry_id = :'MINE'), 'inbox only has own dives');
select pg_temp.check(public.social_mark_seen() is not null, 'mark seen');
select pg_temp.check(public.social_unseen_count() = 0, 'badge cleared after the visit');
select pg_temp.check((select count(*) from public.social_inbox()) = 7 and not (select bool_or(is_new) from public.social_inbox()), 'inbox keeps old events, not new');
-- The owner deletes another member's comment on their dive, but cannot edit it.
select pg_temp.check(pg_temp.affected(format('update public.comments set body = %L where id = %L', 'owner edit', :'c1')) = 0, 'owner cannot edit M''s comment');
select pg_temp.check(pg_temp.affected(format('delete from public.comments where id = %L', :'c1')) = 1, 'owner deletes M''s comment on own dive');
select pg_temp.check(pg_temp.affected('delete from public.comments where entry_id = ''' || :'MINE' || '''') = 0, 'owner cannot delete comments on someone else''s dive');
select pg_temp.check(pg_temp.affected(format('delete from public.kudos where entry_id = %L', :'PUB')) = 0, 'owner cannot remove kudos of others');
-- Comments off: hidden from everyone, no new ones, not counted, not in the inbox.
update public.log_entries set comments_enabled = false where id = :'PUB';
select pg_temp.check(not exists (select 1 from public.entry_comments(:'PUB')), 'comments off: hidden from the owner too');
select pg_temp.check((select comment_count = 0 and not comments_enabled from public.social_counts(array[:'PUB']::uuid[])), 'comments off: count 0');
select pg_temp.check(not exists (select 1 from public.social_inbox() where entry_id = :'PUB' and kind = 'comment'), 'comments off: not in the inbox');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'N', false);
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, body) values (%L, %L)', :'PUB', 'while off')), 'comments off: no new comment');
select pg_temp.check(not exists (select 1 from public.comments where entry_id = :'PUB' and author_id <> :'N'), 'comments off: others'' comments hidden in the table');
select pg_temp.check(not exists (select 1 from public.entry_comments(:'PUB')), 'comments off: function returns none');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'M', false);
select id as c2 from public.comments where entry_id = :'PUB' and author_id = :'M' limit 1 \gset
select pg_temp.check(pg_temp.affected(format('update public.comments set body = %L where id = %L', 'sneak edit', :'c2')) = 0, 'comments off: author cannot edit');
select pg_temp.check(pg_temp.affected(format('delete from public.comments where id = %L', :'c2')) = 1, 'comments off: author can still delete own');
reset role;
update public.log_entries set comments_enabled = true where id = :'PUB';

-- ---- Anonymous sign-in and banned users are not members ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'X', false);
select pg_temp.check(pg_temp.refused(format('insert into public.kudos (entry_id) values (%L)', :'PUB')), 'anonymous sign-in cannot give kudos');
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, body) values (%L, %L)', :'PUB', 'x')), 'anonymous sign-in cannot comment');
select pg_temp.check(not exists (select 1 from public.kudos), 'anonymous sign-in reads no kudos');
select pg_temp.check(not exists (select 1 from public.entry_comments(:'PUB')), 'anonymous sign-in reads no comments');
select pg_temp.check(not exists (select 1 from public.social_counts(array[:'PUB']::uuid[])), 'anonymous sign-in gets no counts');
select set_config('request.jwt.claim.sub', :'Z', false);
select pg_temp.check(pg_temp.refused(format('insert into public.kudos (entry_id) values (%L)', :'PUB')), 'banned user cannot give kudos');
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, body) values (%L, %L)', :'PUB', 'x')), 'banned user cannot comment');
reset role;

-- ---- Rate limit ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'N', false);
do $$ begin
    for i in 1..9 loop -- with the one on the private dive: 10 in the last minute
        insert into public.comments (entry_id, body) values ('4d000000-0000-0000-0000-000000000003', 'spam ' || i);
    end loop;
end $$;
select pg_temp.check(pg_temp.refused(format('insert into public.comments (entry_id, body) values (%L, %L)', :'LNK', 'one too many')), '11th comment within a minute refused');
reset role;

-- ---- Share page: anon gets the count, nothing else ----
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(public.shared_dive_kudos(:'tok') = 1, 'anon sees the kudos count of the shared dive');
select pg_temp.check(public.shared_dive_kudos(repeat('0', 64)) is null, 'wrong token: null');
select pg_temp.check(public.shared_dive_kudos('x') is null, 'malformed token: null');
reset role;
update public.log_entries set visibility = 'members' where id = :'LNK';
set role anon;
select pg_temp.check(public.shared_dive_kudos(:'tok') is null, 'revoked link: null');
reset role;

-- ---- Deleting a dive deletes its kudos and comments ----
delete from public.log_entries where id = :'PUB';
select pg_temp.check(not exists (select 1 from public.kudos where entry_id = :'PUB') and not exists (select 1 from public.comments where entry_id = :'PUB'), 'dive delete cascades');

-- ---- A member deletes all their own kudos and comments (Delete all my data) ----
set role authenticated;
select set_config('request.jwt.claim.sub', :'N', false);
delete from public.kudos where member_id = :'N';
delete from public.comments where author_id = :'N';
reset role;
select pg_temp.check(not exists (select 1 from public.kudos where member_id = :'N') and not exists (select 1 from public.comments where author_id = :'N'),
    'own kudos and comments deleted, also on a dive that turned private');
