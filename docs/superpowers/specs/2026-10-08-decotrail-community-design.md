# DecoTrail community — profiles, visibility, members feed, own app shell

Date: 2026-10-08. Status: approved by brief (user away; all gates pre-approved, decisions below are mine, each with a one-line why).

## Goal

The logbook (`lab/dive-log.html`) becomes **DecoTrail**: an invite-only dive log where every invited member sees the
other members' dives, Strava-style, with DecoTheory's analysis behind every recorded dive. It gets its own app shell
instead of the DecoTheory site nav.

Binding user decisions (from the brief): per-dive visibility `private | members | link` (default `members`, all existing
dives become `members`; the anonymous share page is a later task); notes are owner-only; exact GPS only when the owner
ticks it per dive; buddy names shown; profile = display name, avatar (preset or upload), default visibility, home
country; email never shown; Feed / My dives / Community / Sites / Profile shell with a phone bottom tab bar; DecoTheory as
a sibling-app link; invite-only login message; page stays hidden/noindex; code works without the migration.

## Non-goals

- The public share page for `link` dives (later). The `link` option is **not offered in the UI yet** — why: choosing it
  today would promise a link that does not exist. The column, check constraint and RLS already accept it.
- Following, likes, comments, notifications.
- Inviting from the app (the user invites from the Supabase dashboard).

## Data model and security (migration `supabase/migrations/0004_community.sql`)

### Principle: base tables stay owner-only

The existing RLS on `log_entries`, `sites`, `media`, `dives` stays `owner = auth.uid()`. Members read other members'
data **only through `security definer` RPC functions** that select the allowed columns.
Why: RLS filters rows, not columns, so a members-readable `log_entries` would leak `notes` and `sites.lat/lon`; column
grants would break the owner's `select('*')`. Leaving the base policies untouched also means every existing owner query
(`listEntries`, `listBuddies`, `siteUsage`, …, which have no `owner` filter) keeps returning only the owner's rows — a
widened policy would silently mix other members' dives into "My dives".

### Columns on `log_entries`

| column | type | default | note |
|---|---|---|---|
| `visibility` | `text not null` check in (`private`,`members`,`link`) | `'members'` | adding the column with a default backfills every existing row to `members` |
| `share_location` | `boolean not null` | `false` | members see the site's lat/lon (and photo GPS) only when true |
| `share_token` | `uuid unique` | null | reserved for the later public share page; unused now |

Visible to a member = `owner = auth.uid() or visibility in ('members','link')` (and `auth.uid() is not null`).

### `profiles`

`id uuid pk references auth.users on delete cascade`, `display_name text` (1–60 chars after trim, nullable),
`avatar_preset text` (one of the 12 preset keys, nullable), `avatar_path text` (object in bucket `avatars`, nullable;
wins over the preset), `default_visibility text not null default 'members'` (same check), `home_country text`
(ISO 3166-1 alpha-2, `^[A-Z]{2}$`, nullable), `created_at`, `updated_at`.
RLS: `select` to authenticated using `true` (every authenticated user is an invited member); `insert`/`update` with
`id = auth.uid()`; no delete policy (rows go with the auth user). No email column — why: email must never reach others.

### RPC functions (all `security definer`, `set search_path = ''`, `stable`, execute revoked from `public`/`anon`, granted to `authenticated`)

- `community_entries(p_owner uuid default null, p_id uuid default null, p_limit int default 30, p_offset int default 0)` →
  visible entries newest first (`dive_date desc, entry_time desc nulls last, created_at desc`), own included.
  Columns: entry columns **except `notes` and `share_token`**, plus `site_name`, `site_country`, `site_water`,
  `site_altitude_m`, `site_lat`/`site_lon` (null unless owner or `share_location`), `photo_path` (first photo),
  `photo_count`. `p_limit` clamped to 1…100.
- `community_media(p_entry_id uuid)` → media of a visible entry; `lat`/`lon` null unless owner or `share_location`.
- `community_recordings(p_owner uuid)` → list summaries (`id, device_serial, dive_number, start_local, file_sha256,
  parser_version, summary`) of the owner's recordings that are linked to a visible entry. Used for the analysis list and
  repetitive-dive chaining. Why only linked-to-visible: a private dive must not show up, even as tissue history.
- `community_recording(p_id uuid)` → `record` jsonb of one such recording.
- `community_members(p_id uuid default null)` → profile columns + stats over **visible** entries only: `dive_count`,
  `deepest_m`, `total_s`, `last_dive_date`, `top_sites text[]` (up to 3 most used site names).

### Storage

- `dive-photos`: extra `select` policy for authenticated — the object is the `path` of a `photo` media row whose entry is
  visible (checked by a `security definer` helper `public.photo_readable(name text)`). Writes stay owner-only (existing
  policy). Photos are re-encoded through a canvas on upload, so files carry no EXIF GPS.
- `avatars` (new, private, 512 KiB, `image/jpeg`): `select` for authenticated; insert/update/delete only in the own
  `<uid>/` folder.
- `dive-logs` (DLF files): unchanged, owner-only — analysis of others' dives reads the `record` jsonb via RPC.

### Idempotency and grants

`create table if not exists`, `add column if not exists`, `drop policy if exists` + `create policy`,
`create or replace function`, bucket `insert … on conflict do nothing`. Explicit `grant` to `authenticated` (auto-expose
is off). The migration is validated locally against Postgres in Docker with stub `auth`/`storage` schemas, including
RLS tests run as two different users, and reviewed by an Opus subagent.

## Frontend

### Feature detection (no crash without 0004)

`store.communityStatus()` probes `profiles` once (cached). Missing relation/function (`PGRST205`, `PGRST202`, `42P01`,
`42883`, 404) → `false`: the shell hides Feed, Community and Profile, home is My dives, the entry form shows no
visibility fields and inserts never send `visibility`/`share_location`. Any other error → also `false` for this session,
logged. Why: an unapplied migration must look like today's app, not an error.

### Store (`js/backend/communityStore.js`, mixed into the store by `createSupabaseStore`)

`communityStatus, ensureProfile, getMyProfile, saveProfile, uploadAvatar, removeAvatar, avatarUrls, listMembers,
getMember, listCommunityEntries, getCommunityEntry, listCommunityMedia, communityRecordings, loadCommunityRecording`.
`ensureProfile` runs at login (insert … on conflict do nothing) with `display_name` from the Google `full_name`/`name`
metadata when present — why: the members directory lists profile rows, so every member needs one; never derived from
the email. New entries (form and `ensureEntries`) take `visibility` from the profile's `default_visibility`.

### App shell (`lab/dive-log.html` + `js/logbook/AppShell.js`)

The DecoTheory nav, hero and disclaimer banner go. A DecoTrail top bar: wordmark (small trail-mark SVG + "DecoTrail"),
on ≥ 721 px the tabs Feed · My dives · Community · Sites · Profile inline, then the language switcher and
"DecoTheory ↗". On phones a fixed bottom tab bar with 5 icon+label tabs (safe-area aware, 56 px), top bar only brand +
language. Footer: "DecoTrail — dives explained by DecoTheory ↗", version, disclaimer line. Logged out: brand bar + login
card only. `<title>` "DecoTrail", `noindex` kept, no new HTML file. Analysis view keeps a "Learn why on DecoTheory ↗"
link to `../gradient-factors.html`. Why own shell: DecoTrail is a separate product sharing the core (north star).

### Routes (`js/logbook/router.js`)

| hash | view |
|---|---|
| `''`, `#/` | home → Feed when community is available, else My dives |
| `#/dives` | My dives (the existing list; `routeHref({name:'list'})` now returns this) |
| `#/feed` | Feed: own + members' visible dives, newest first, "Load more" (30 per page) |
| `#/community` | members directory |
| `#/member/<uuid>` | member profile |
| `#/m/<entryId>`, `#/m/<entryId>/analysis` | read-only dive detail / analysis of a visible dive (own dives redirect to `#/dive/<id>`) |
| `#/profile` | own profile settings |
| existing `#/new`, `#/dive/…`, `#/sites`, `#/site/…` | unchanged |

### Views

- **Feed** (`CommunityFeed.js`): the existing Strava-style cards (card HTML extracted from `LogbookApp` into
  `feedCard.js` and reused) with an author row (avatar, display name → member page, "You" for own). Visual: photo, else
  map only when coordinates are shared, else profile sparkline (from `community_recording`), else none. No notes.
- **Community** (`MembersPage.js`): member cards — avatar, name, country, dives, deepest, last dive; own card first.
- **Member profile** (`MemberPage.js`): big avatar, name, country; stat tiles (dives, deepest, total time); favourite
  sites (top 3); recent dives as feed cards with "Load more".
- **Read-only dive** (`EntryDetail` with `readOnly`): author row; no edit/delete/upload/notes; photos open in the
  viewer; map only with shared coordinates, else the site name. Data via `memberEntryStore.js`, an adapter giving
  `EntryDetail`/`RecordedDiveAnalysis` the store methods they call (`listSites`, `listMedia`, `photoUrls`,
  `listDives`, `loadDive`, `reparseOutdated` = no-op).
- **Profile** (`ProfilePage.js`): display name, avatar grid (12 presets) + "Upload photo" (square-cropped to 256 px JPEG in
  the browser) + "Remove photo", default visibility (Private / Members), home country (`<select>` from
  `Intl.DisplayNames`), Save; sign out; "Your email is never shown to other members."
- **Entry form**: fieldset "Who can see this dive" (Private / Members) + checkbox "Show the exact location to members".
  **Own dive detail**: a visibility line. **My dives cards**: a lock badge on private dives.
- **Avatars** (`avatars.js`): 12 original, flat, diving-themed SVGs (mask, fin, octopus, turtle, manta, seahorse,
  jellyfish, reef fish, shell, anchor, whale tail, bubbles) on round tinted backgrounds, keys `reef-01`…`reef-12`; a
  member without any avatar gets a deterministic preset from their id.
- **Login**: an "DecoTrail is invite-only. Ask the person who invited you, or ask for an invite." line under the login
  card; the `cannotLogin`/`cannotLoginGoogle` errors become "This account hasn't been invited to DecoTrail yet. Ask for an
  invite."

### i18n, notation, theming

All strings in `locales/{en,cs,es}.json` under `diveLog.trail.*`, with English fallbacks in code. Numbers via
`fmtNum` (decimal comma in Czech), U+00A0 between number and unit. Dark mode via existing tokens; avatars use fixed
tints readable on both themes. Touch targets ≥ 44 px.

## Testing

- Node tests: router (new routes, home), `community.js` helpers (display name fallback, visibility labels, stat
  formatting), `avatars.js` (12 unique keys, well-formed SVG, deterministic fallback), store with a fake client:
  RPC names/args, `communityStatus` false on missing relation and no `visibility` sent then, `ensureEntries`/insert use
  `default_visibility`, `ensureProfile` never uses the email, avatar upload path in the own folder.
- SQL: run 0004 twice on Docker Postgres with stub `auth`/`storage`; RLS assertions as users A and B (B cannot read A's
  base rows, cannot see A's private dive via any RPC, never gets `notes`, gets lat/lon only with `share_location`, can
  read A's photo object only for a visible entry, cannot write A's profile/avatar).
- Browser (fake-store harness, 390×844 and desktop, light/dark, en/cs/es): shell, feed, community, member page,
  read-only dive, profile, entry form; plus the real page logged out (login message) and logged in before the migration.

## Release

After the migration is final and reviewed, the coordinator is told and the user runs it. Then: version bump
(`sw.js` `CACHE_NAME` + `css/styles.css` `.version-number`), new JS files in `sw.js` `STATIC_ASSETS`, PR, squash-merge,
verify the Pages deploy.
