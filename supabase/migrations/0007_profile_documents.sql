-- DecoTrail profile: qualifications (certification cards) and medical checks, with scans
-- (docs/superpowers/specs/2026-10-10-profile-documents-design.md).
-- Run once in the Supabase SQL editor after 0001–0005. Independent of 0006. Safe to run again.
--
-- Security model:
--  * Both tables are owner-only (RLS owner = auth.uid()); anon has no grant at all.
--  * Medical checks are health data (GDPR Art. 9). No function, view or policy other than the owner's own
--    RLS reads them: nothing in the community, share-link or feed paths can return them.
--  * Other members see a qualification only through community_qualifications(), and only its agency and
--    level, and only when the owner ticked show_on_profile. Never the card number, dates, instructor,
--    notes or scans.
--  * Scans live in the private bucket 'documents' under '<owner>/qualifications/…' or '<owner>/medical/…'.
--    Only the owner can read, upload or delete there. There is no update policy (see 0004: an update could
--    move a file between buckets past their limits). Rows can only point into the owner's own folder.
--    Uploads must be named '<owner>/(qualifications|medical)/<uuid>.(jpg|pdf)' and come from a member.
--
-- Known limits (owner-only, never a leak to someone else):
--  * Storage copy (and move on versioned buckets) checks SELECT/DELETE on the source and INSERT on the
--    destination, not UPDATE, and skips the destination bucket's size/type limits. So the owner's own session
--    could copy their own scan into their own avatars folder (members-readable). The app never calls copy or
--    move; this is self-disclosure only.
--  * on delete cascade removes the rows with the login, but not the files: before deleting a user in the
--    dashboard, remove documents/<uid>/ (see supabase/README.md). In-app "Delete all my data" removes both.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.qualifications (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    agency text not null
        check (agency in ('CMAS', 'PADI', 'SSI', 'NAUI', 'TDI-SDI', 'IANTD', 'GUE', 'RAID', 'BSAC', 'other')),
    agency_other text
        check (agency_other is null or char_length(btrim(agency_other)) between 1 and 60),
    level text not null check (char_length(btrim(level)) between 1 and 100),
    card_number text check (card_number is null or char_length(card_number) <= 60),
    issued_on date,
    instructor text check (instructor is null or char_length(instructor) <= 100),
    notes text check (notes is null or char_length(notes) <= 2000),
    scan_front text,
    scan_back text,
    show_on_profile boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint qualifications_agency_other_only_other check (agency = 'other' or agency_other is null),
    constraint qualifications_scan_front_path check (scan_front is null
        or scan_front ~ ('^' || owner::text || '/qualifications/[0-9a-f-]{36}\.(jpg|pdf)$')),
    constraint qualifications_scan_back_path check (scan_back is null
        or scan_back ~ ('^' || owner::text || '/qualifications/[0-9a-f-]{36}\.(jpg|pdf)$'))
);

create table if not exists public.medical_checks (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    checked_on date not null,
    valid_until date,
    doctor text check (doctor is null or char_length(doctor) <= 200),
    notes text check (notes is null or char_length(notes) <= 2000),
    scan_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint medical_checks_valid_after_check check (valid_until is null or valid_until >= checked_on),
    constraint medical_checks_scan_path check (scan_path is null
        or scan_path ~ ('^' || owner::text || '/medical/[0-9a-f-]{36}\.(jpg|pdf)$'))
);

create index if not exists qualifications_owner_idx on public.qualifications (owner);
create index if not exists medical_checks_owner_idx on public.medical_checks (owner);

alter table public.qualifications enable row level security;
alter table public.medical_checks enable row level security;

revoke all on table public.qualifications from public, anon, authenticated;
revoke all on table public.medical_checks from public, anon, authenticated;
grant select, insert, update, delete on table public.qualifications to authenticated;
grant select, insert, update, delete on table public.medical_checks to authenticated;
grant all on table public.qualifications to service_role;
grant all on table public.medical_checks to service_role;

drop policy if exists "owner reads and writes own qualifications" on public.qualifications;
create policy "owner reads and writes own qualifications" on public.qualifications
    for all to authenticated
    using (owner = auth.uid())
    with check (owner = auth.uid() and public.is_member());

drop policy if exists "owner reads and writes own medical checks" on public.medical_checks;
create policy "owner reads and writes own medical checks" on public.medical_checks
    for all to authenticated
    using (owner = auth.uid())
    with check (owner = auth.uid() and public.is_member());

-- The server keeps the timestamps; the owner of a row never changes.
create or replace function public.profile_documents_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := now();
    else
        new.created_at := old.created_at;
        new.owner := old.owner;
    end if;
    new.updated_at := now();
    return new;
end $$;

drop trigger if exists qualifications_touch on public.qualifications;
create trigger qualifications_touch before insert or update on public.qualifications
    for each row execute function public.profile_documents_touch();

drop trigger if exists medical_checks_touch on public.medical_checks;
create trigger medical_checks_touch before insert or update on public.medical_checks
    for each row execute function public.profile_documents_touch();

revoke all on function public.profile_documents_touch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Members see a badge (agency + level) of the qualifications the owner chose to show. Nothing else.
-- security definer = it bypasses the owner-only RLS, so it filters by itself and returns fixed columns.
-- ---------------------------------------------------------------------------

create or replace function public.community_qualifications(p_owner uuid)
returns table (agency text, agency_other text, level text)
language sql stable security definer set search_path = ''
as $$
    select q.agency, q.agency_other, q.level
    from public.qualifications q
    where q.owner = p_owner
      and q.show_on_profile
      and public.is_member()
      and public.share_owner_active(p_owner)
    -- not by issued_on: the order would reveal the hidden dates
    order by q.created_at desc, q.id
    limit 20;
$$;

revoke all on function public.community_qualifications(uuid) from public, anon;
grant execute on function public.community_qualifications(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, owner folder only, no update policy
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['image/jpeg', 'application/pdf'])
on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner reads own documents" on storage.objects;
create policy "owner reads own documents" on storage.objects
    for select to authenticated
    using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owner uploads own documents" on storage.objects;
create policy "owner uploads own documents" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'documents' and public.is_member()
        and name ~ ('^' || auth.uid()::text || '/(qualifications|medical)/[0-9a-f-]{36}\.(jpg|pdf)$'));

drop policy if exists "owner updates own documents" on storage.objects;

drop policy if exists "owner deletes own documents" on storage.objects;
create policy "owner deletes own documents" on storage.objects
    for delete to authenticated
    using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

commit;

-- Make PostgREST see the new tables and function right away.
notify pgrst, 'reload schema';
