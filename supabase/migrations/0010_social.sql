-- DecoTrail kudos and comments on dives (docs/superpowers/specs/2026-10-10-kudos-comments-design.md).
-- Run once in the Supabase SQL editor after 0004 (and 0005). Safe to run again.
--
-- Security model: the same rule as 0004 decides everything — a member may see a dive when it is their own or
-- its visibility is 'members' or 'link'. Kudos and comments of any other dive (a private one, or one that became
-- private later) are invisible: the read functions and the table policies both go through entry_visible().
-- Clients write the two tables directly; the policies pin the author to auth.uid(), the triggers keep the
-- server's timestamps, and an update can only change a comment's body (column grant). Anonymous visitors get
-- nothing but the kudos count of a shared dive whose token they hold (shared_dive_kudos). Notes never appear.

begin;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- The owner turns comments off per dive; existing comments are hidden while it is off.
alter table public.log_entries add column if not exists comments_enabled boolean not null default true;
-- When the member last opened "New for you" (null: never).
alter table public.profiles add column if not exists social_seen_at timestamptz;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.kudos (
    entry_id uuid not null references public.log_entries (id) on delete cascade,
    member_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (entry_id, member_id)
);
create index if not exists kudos_member_idx on public.kudos (member_id);

create table if not exists public.comments (
    id uuid primary key default gen_random_uuid(),
    entry_id uuid not null references public.log_entries (id) on delete cascade,
    author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now(),
    edited_at timestamptz,
    constraint comments_body_check check (char_length(body) between 1 and 1000 and btrim(body) <> '')
);
create index if not exists comments_entry_idx on public.comments (entry_id, created_at, id);
create index if not exists comments_author_idx on public.comments (author_id, created_at);

alter table public.kudos enable row level security;
alter table public.comments enable row level security;

revoke all on table public.kudos from public, anon, authenticated;
revoke all on table public.comments from public, anon, authenticated;
grant select, insert, delete on table public.kudos to authenticated;
grant select, insert, delete on table public.comments to authenticated;
grant update (body) on table public.comments to authenticated; -- nothing else of a comment can change
grant all on table public.kudos to service_role;
grant all on table public.comments to service_role;

-- ---------------------------------------------------------------------------
-- Who may do what (security definer: they read log_entries past its owner-only RLS)
-- ---------------------------------------------------------------------------

-- The 0004 rule: a logged-in member, and the dive is theirs or visible to members.
create or replace function public.entry_visible(p_entry uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1 from public.log_entries e
        where e.id = p_entry
          and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    );
$$;

create or replace function public.can_kudos(p_entry uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1 from public.log_entries e
        where e.id = p_entry
          and e.owner <> auth.uid()
          and e.visibility in ('members', 'link')
    );
$$;

-- Visible and comments on: who may write comments, and whose comments may be read.
create or replace function public.can_comment(p_entry uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1 from public.log_entries e
        where e.id = p_entry
          and e.comments_enabled
          and (e.owner = auth.uid() or e.visibility in ('members', 'link'))
    );
$$;

create or replace function public.owns_entry(p_entry uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select public.is_member() and exists (
        select 1 from public.log_entries e where e.id = p_entry and e.owner = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Server-kept fields
-- ---------------------------------------------------------------------------

create or replace function public.kudos_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    new.created_at := now();
    return new;
end $$;

drop trigger if exists kudos_touch on public.kudos;
create trigger kudos_touch before insert on public.kudos
    for each row execute function public.kudos_touch();

create or replace function public.comments_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        -- Rate sanity: a stuck client or a script cannot flood dives with comments.
        if auth.uid() is not null and (
            select count(*) from public.comments c
            where c.author_id = auth.uid() and c.created_at > now() - interval '1 minute'
        ) >= 10 then
            raise exception 'Too many comments, try again in a minute' using errcode = 'P0001';
        end if;
        new.created_at := now();
        new.edited_at := null;
    else
        new.id := old.id;
        new.entry_id := old.entry_id;
        new.author_id := old.author_id;
        new.created_at := old.created_at;
        new.edited_at := case when new.body is distinct from old.body then now() else old.edited_at end;
    end if;
    return new;
end $$;

drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before insert or update on public.comments
    for each row execute function public.comments_touch();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists "members read kudos of visible dives" on public.kudos;
create policy "members read kudos of visible dives" on public.kudos
    for select to authenticated
    using (member_id = auth.uid() or public.entry_visible(entry_id));

drop policy if exists "members give kudos" on public.kudos;
create policy "members give kudos" on public.kudos
    for insert to authenticated
    with check (member_id = auth.uid() and public.can_kudos(entry_id));

drop policy if exists "members take back own kudos" on public.kudos;
create policy "members take back own kudos" on public.kudos
    for delete to authenticated
    using (member_id = auth.uid());

drop policy if exists "members read comments of visible dives" on public.comments;
create policy "members read comments of visible dives" on public.comments
    for select to authenticated
    using (author_id = auth.uid() or public.can_comment(entry_id) or public.owns_entry(entry_id));

drop policy if exists "members write comments" on public.comments;
create policy "members write comments" on public.comments
    for insert to authenticated
    with check (author_id = auth.uid() and public.can_comment(entry_id));

drop policy if exists "authors edit own comments" on public.comments;
create policy "authors edit own comments" on public.comments
    for update to authenticated
    using (author_id = auth.uid() and public.can_comment(entry_id))
    with check (author_id = auth.uid() and public.can_comment(entry_id));

drop policy if exists "authors and dive owners delete comments" on public.comments;
create policy "authors and dive owners delete comments" on public.comments
    for delete to authenticated
    using (author_id = auth.uid() or public.owns_entry(entry_id));

-- ---------------------------------------------------------------------------
-- Read functions
-- ---------------------------------------------------------------------------

-- Counts for feed cards and the detail: only for dives the caller may see; 0 comments while they are off.
create or replace function public.social_counts(p_entry_ids uuid[])
returns table (entry_id uuid, kudos_count integer, kudoed boolean, comment_count integer, comments_enabled boolean)
language sql stable security definer set search_path = ''
as $$
    select e.id,
           (select count(*) from public.kudos k where k.entry_id = e.id)::integer,
           exists (select 1 from public.kudos k where k.entry_id = e.id and k.member_id = auth.uid()),
           case when e.comments_enabled
                then (select count(*) from public.comments c where c.entry_id = e.id)::integer else 0 end,
           e.comments_enabled
    from public.log_entries e
    where public.is_member()
      and e.id = any ((coalesce(p_entry_ids, '{}'::uuid[]))[1:200])
      and (e.owner = auth.uid() or e.visibility in ('members', 'link'));
$$;

-- Who gave kudos to a dive the caller may see, newest first.
create or replace function public.entry_kudos(p_entry_id uuid)
returns table (member_id uuid, display_name text, avatar_preset text, avatar_path text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
    select k.member_id, p.display_name, p.avatar_preset, p.avatar_path, k.created_at
    from public.kudos k
    left join public.profiles p on p.id = k.member_id
    where k.entry_id = p_entry_id
      and public.entry_visible(p_entry_id)
    order by k.created_at desc, k.member_id
    limit 500;
$$;

-- The comments of a dive the caller may see, oldest first; none while comments are off.
create or replace function public.entry_comments(p_entry_id uuid)
returns table (
    id uuid, entry_id uuid, author_id uuid, display_name text, avatar_preset text, avatar_path text,
    body text, created_at timestamptz, edited_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
    select c.id, c.entry_id, c.author_id, p.display_name, p.avatar_preset, p.avatar_path, c.body, c.created_at, c.edited_at
    from public.comments c
    left join public.profiles p on p.id = c.author_id
    where c.entry_id = p_entry_id
      and public.can_comment(p_entry_id)
    order by c.created_at, c.id
    limit 1000;
$$;

-- "New for you": kudos and comments by others on the caller's dives, newest first.
create or replace function public.social_inbox(p_limit integer default 50)
returns table (
    kind text, entry_id uuid, actor_id uuid, display_name text, avatar_preset text, avatar_path text,
    created_at timestamptz, excerpt text, dive_date date, site_name text, is_new boolean
)
language sql stable security definer set search_path = ''
as $$
    with seen as (
        select (select p.social_seen_at from public.profiles p where p.id = auth.uid()) as at
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
    select ev.kind, ev.entry_id, ev.actor_id, p.display_name, p.avatar_preset, p.avatar_path,
           ev.created_at, ev.excerpt, e.dive_date, s.name,
           (seen.at is null or ev.created_at > seen.at)
    from ev
    cross join seen
    join public.log_entries e on e.id = ev.entry_id
    left join public.sites s on s.id = e.site_id and s.owner = e.owner
    left join public.profiles p on p.id = ev.actor_id
    where public.is_member()
    order by ev.created_at desc, ev.entry_id, ev.actor_id
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- The badge: inbox events newer than the last visit.
create or replace function public.social_unseen_count()
returns integer
language sql stable security definer set search_path = ''
as $$
    with seen as (
        select coalesce((select p.social_seen_at from public.profiles p where p.id = auth.uid()), '-infinity'::timestamptz) as at
    )
    select case when not public.is_member() then 0 else (
        (select count(*) from public.kudos k join public.log_entries e on e.id = k.entry_id, seen
         where e.owner = auth.uid() and k.member_id <> auth.uid() and k.created_at > seen.at)
      + (select count(*) from public.comments c join public.log_entries e on e.id = c.entry_id, seen
         where e.owner = auth.uid() and c.author_id <> auth.uid() and e.comments_enabled and c.created_at > seen.at)
    )::integer end;
$$;

-- Opened "New for you": remember the server time.
create or replace function public.social_mark_seen()
returns timestamptz
language sql volatile security definer set search_path = ''
as $$
    update public.profiles set social_seen_at = now()
    where id = auth.uid() and public.is_member()
    returning social_seen_at;
$$;

-- Anon share page: the kudos count only (no names) of the 'link' dive whose token the caller holds.
create or replace function public.shared_dive_kudos(p_token text)
returns integer
language sql stable security definer set search_path = ''
as $$
    select (select count(*) from public.kudos k where k.entry_id = e.id)::integer
    from public.log_entries e
    where p_token ~ '^[0-9a-f]{64}$'
      and e.share_token = p_token
      and e.visibility = 'link'
      and public.share_owner_active(e.owner);
$$;

do $$
declare
    f text;
begin
    -- Policy helpers and the readers: members only.
    foreach f in array array[
        'public.entry_visible(uuid)',
        'public.can_kudos(uuid)',
        'public.can_comment(uuid)',
        'public.owns_entry(uuid)',
        'public.social_counts(uuid[])',
        'public.entry_kudos(uuid)',
        'public.entry_comments(uuid)',
        'public.social_inbox(integer)',
        'public.social_unseen_count()',
        'public.social_mark_seen()'
    ] loop
        execute format('revoke all on function %s from public, anon', f);
        execute format('grant execute on function %s to authenticated', f);
    end loop;
    foreach f in array array['public.kudos_touch()', 'public.comments_touch()'] loop
        execute format('revoke all on function %s from public, anon, authenticated', f);
    end loop;
    execute 'revoke all on function public.shared_dive_kudos(text) from public';
    execute 'grant execute on function public.shared_dive_kudos(text) to anon, authenticated';
end $$;

commit;

notify pgrst, 'reload schema';
