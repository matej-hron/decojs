-- Dive logbook follow-up (2026-10-07-dive-logbook-design.md): remember deleted entries, limit photo uploads.
-- Run once, after 0002_logbook.sql. Both statements are safe to run.

-- A recording whose logbook entry was deleted on purpose is not turned into an entry again by ensureEntries.
alter table public.dives add column if not exists logbook_dismissed boolean not null default false;

-- The app uploads JPEGs of at most 2560 px; cap what the private bucket accepts (10 MiB, JPEG only).
update storage.buckets
set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg']
where id = 'dive-photos';
