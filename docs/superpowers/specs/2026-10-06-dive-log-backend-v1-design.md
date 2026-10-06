# Dive Log Backend v1 (Login + Stored Dives)

**Date:** 2026-10-06
**Status:** Design approved in chat, awaiting written-spec review
**Roadmap position:** step 4, first deliverable (4a platform and login merged with 4b dive storage)
**Depends on:** `js/import/*` (DLF parser, RecordedDive, analysis, chaining) and `lab/dive-log.html` (hidden dive log page, released 2026-10-06)

## Background

The dive log page (`lab/dive-log.html`, reachable only through a quiet "Experimental"
tile on the homepage) parses `.DLF` files in the browser and analyses them, but forgets
everything when the tab closes. The user wants a personal dive log: log in, upload the
dive computer's `DIVELOG` folder once, and have the dives available afterwards, later
with details, photos and positions (steps 4c–4d) and from the Android app (step 5).

Decisions taken in chat:

- **Audience:** only the user for now. The data model still records an owner on every
  row so more users can be added without a migration.
- **Platform:** Supabase, as an experimental starter that may be replaced later. The
  page reaches it only through a thin interface, data stays in portable formats, and
  there is an export from day one.
- **Login:** email link (magic link). Google login may be added later.
- **Pausing:** the free plan pauses a project after 7 days without database activity;
  resuming is one click in the Supabase dashboard. Accepted for now.

## Goals

- Log in with an email link and stay logged in on that browser.
- Upload a `DIVELOG` folder: new dives are stored, known dives are skipped, changed files
  replace their earlier copy; a summary says what happened.
- The dive list loads from the server when logged in; selecting a dive loads it in full;
  analysis and chaining work as today on stored dives.
- Export everything (original files plus parsed JSON) as one zip.
- Switching backend later means writing one new adapter file plus importing the export.

## Non-goals (v1)

- Editing dive details, sites, buddies, tags (4c); photos and positions (4d); trip views
  and statistics (4e); Android upload (5).
- Deleting dives from the page (possible in the Supabase dashboard).
- Multi-user features: invitations, sharing, roles.
- Server-side code (Edge Functions, triggers with logic), realtime.
- Keeping the free project awake.

## One-time setup by the user

The implementation cannot create accounts. The user does this once; the plan includes
exact click-by-click steps.

1. Create a Supabase account and a project in the **EU (Frankfurt)** region.
2. In the SQL editor, run the migration file `supabase/migrations/0001_dive_log.sql`.
3. Authentication → URL configuration: Site URL `https://decotheory.eu/lab/dive-log.html`;
   additional redirect URL `http://localhost:5517/lab/dive-log.html`.
4. Copy the project URL and the **anon** key into `js/backend/config.js` (or hand them to
   the implementer). The anon key is public by design. The **service role** key must never
   appear in the repository, the page or a chat.
5. Log in once on the page, then Authentication → Sign In / Providers: turn off **Allow
   new users to sign up**.

Until `config.js` holds a URL and key, the page shows no login and behaves exactly as
today, so the code can ship before the project exists.

## Architecture

```
lab/dive-log.html
  └─ RecordedDiveAnalysis (existing page component)
       ├─ js/import/*            parse, analyse, chain (unchanged API)
       └─ js/backend/diveStore.js        getDiveStore() → DiveStore | null
             ├─ js/backend/config.js     SUPABASE_URL, SUPABASE_ANON_KEY
             ├─ js/backend/sync.js       pure: diveKey, planSync, sha256Hex
             └─ js/backend/supabaseStore.js   createSupabaseStore(client)
supabase/migrations/0001_dive_log.sql
```

### DiveStore interface

The page uses only these functions. A future backend implements the same object.

```js
/**
 * @typedef {Object} DiveStore
 * @property {() => Promise<{email: string}|null>} currentUser
 * @property {(email: string, redirectTo: string) => Promise<void>} sendLoginLink
 * @property {() => Promise<void>} signOut
 * @property {(listener: (user: {email: string}|null) => void) => () => void} onAuthChange
 * @property {() => Promise<DiveSummaryRow[]>} listDives
 * @property {(id: string) => Promise<Object>} loadDive          RecordedDive
 * @property {(items: SyncItem[], onProgress?: (done: number, total: number) => void)
 *             => Promise<SyncReport>} saveDives
 * @property {() => Promise<Blob>} exportAll                   zip
 */
```

- `DiveSummaryRow`: `{ id, deviceSerial, diveNumber, startLocal, fileSha256, parserVersion, summary }`
  where `summary` = `{ maxDepth, duration, mode, gfLow, gfHigh, waterSetting, warnings }`.
- `SyncItem`: `{ dive: RecordedDive, bytes: Uint8Array, sha256: string, action: 'upload'|'update' }`.
- `SyncReport`: `{ saved: number, updated: number, failed: Array<{fileName, message}> }`.

`getDiveStore()` returns `null` when `config.js` is empty or the Supabase script did not
load; the page then shows no login.

### Pure sync logic (`js/backend/sync.js`)

- `diveKey(dive)` → string `${serial}|${number}|${startLocal}` with serial `'unknown'` when
  the log has none and number `0` when the file name has none.
- `sha256Hex(bytes)` → lowercase hex via `crypto.subtle` (works in browsers and Node).
- `planSync(local, existing)`:
  - `local`: `[{ dive, bytes, sha256 }]` from the picked folder;
  - `existing`: `DiveSummaryRow[]` from `listDives()`;
  - returns `{ upload, update, unchanged }`, each a list of local items: unknown key →
    upload; known key with a different checksum → update; same checksum → unchanged.
  - Duplicate keys within `local` keep the first and count the rest as unchanged.

### Parser and record versions

- `js/import/divesoftDlf.js` exports `PARSER_VERSION = 1`.
- RecordedDive gains a top-level `schema: 1`. The parser sets it; `toDiveSetup` ignores it.
- Rows store `parser_version`. When `listDives()` returns rows with an older version,
  the page re-parses their stored file in the background (`loadDiveFile` internal to the
  adapter) and updates the row. With version 1 everywhere this path is dormant but tested.

### Loading files with bytes

`loadDiveFiles(files)` in `RecordedDiveAnalysis.js` additionally returns
`items: [{ dive, bytes, sha256 }]` (same order as `dives`) so the sync can upload the
original bytes. Existing callers keep working (`dives` and `errors` unchanged).

## Database (`supabase/migrations/0001_dive_log.sql`)

```sql
create table public.dives (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    device_serial text not null,
    dive_number integer not null,
    start_local text not null,          -- device local time, ISO without zone
    file_path text not null,            -- storage path inside bucket dive-logs
    file_sha256 text not null,
    parser_version integer not null,
    summary jsonb not null,
    record jsonb not null,              -- full RecordedDive (schema 1)
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner, device_serial, dive_number, start_local)
);

alter table public.dives enable row level security;
-- Needed when the project was created with "Automatically expose new tables" off:
grant select, insert, update, delete on table public.dives to authenticated;

create policy "owner reads and writes own dives" on public.dives
    for all to authenticated
    using (owner = auth.uid())
    with check (owner = auth.uid());

insert into storage.buckets (id, name, public) values ('dive-logs', 'dive-logs', false);

create policy "owner reads and writes own dive files" on storage.objects
    for all to authenticated
    using (bucket_id = 'dive-logs' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'dive-logs' and (storage.foldername(name))[1] = auth.uid()::text);
```

File path: `<user id>/<device serial>/<file name>` (e.g. `…/7044-00006107/00000100.DLF`).

`saveDives` uploads the file first (upsert), then upserts the row on the unique key, so a
failure between the two is repaired by the next sync.

## Page behaviour

| State | What the user sees |
|---|---|
| No backend configured | Exactly today's page (demo dives, local files). |
| Logged out | Today's page plus a small "Log in to your dive log" form (email field + button). |
| Link sent | "Check your email for the login link." with "Send again". |
| Logged in | A bar: email, **Upload DIVELOG**, **Export**, **Log out**. The list shows stored dives (newest last, latest selected); local file pickers are replaced by Upload. |
| Uploading | Progress "Saving 12 / 40…"; then the report, e.g. "7 new dives saved, 94 already stored, 1 updated, 1 file could not be read: …". |

- Selecting a dive loads its full record (cached in the page). For chaining, the page
  also loads full records of dives that started within the 7 days before it.
- Analysis, GF sliders, charts and chaining behave as today.
- Export downloads `dive-log-YYYY-MM-DD.zip` containing `DIVELOG/*.DLF` (original files)
  and `dives.json` (all records). JSZip 3.10.2 is loaded from cdnjs only when Export is
  clicked.
- The Supabase client is `@supabase/supabase-js@2.117.2` from jsDelivr
  (`dist/umd/supabase.js`, global `supabase`), loaded by the page's `<script>` tag.
- All new strings live under `diveLog.backend.*` in `en`, `cs`, `es`.

## Errors

| Condition | Message (en) |
|---|---|
| Backend unreachable or paused | "Can't reach your dive log. If it hasn't been used for a week, resume the project in the Supabase dashboard." |
| Login link expired or invalid | "This login link has expired. Send a new one." with a button. |
| Unknown email after sign-ups are disabled | "This email can't log in here." |
| A file fails to upload | Listed by name in the report; other files continue. |
| Not logged in when calling the store | Treated as logged out; the page shows the login form. |

The page never shows raw error objects; technical details go to the console.

## Security

- Row level security on `dives` and on the `dive-logs` bucket: owner only.
- Sign-ups disabled after the first login.
- Only the anon key is in the code. No service role key anywhere.
- The page stays `noindex` and unlisted.

## Testing

- `tests/dive-log-backend.test.mjs` (node:test, added to `npm test`):
  - `diveKey` for normal, serial-less and number-less dives; #99's key is stable;
  - `sha256Hex` against a known vector;
  - `planSync`: all new; all unchanged; one changed checksum → update; duplicate local
    keys; empty server;
  - `createSupabaseStore` against a fake client: `saveDives` uploads the file before
    upserting the row with the right key, path and columns; a failed upload is reported
    and does not stop the rest; `listDives` maps rows to `DiveSummaryRow`; rows with an
    older `parser_version` trigger a re-parse and update;
  - `getDiveStore()` returns `null` with an empty config;
  - `loadDiveFiles` returns `items` with bytes and checksums;
  - parser: `schema === 1`, `PARSER_VERSION === 1`.
- Existing suites stay green.
- Browser smoke test (controller, after the user's setup): log in via email link, upload
  the 30 local dives, reload and see them from the server, upload again → "already
  stored", export and inspect the zip, log out, check the logged-out page is unchanged.
  Also with an empty `config.js`: the page is exactly as before.

## Open questions

- Keep-alive or paid plan if pausing gets annoying.
- Google login as a second option.
- When step 5 (Android) arrives: the Expo app uses the same Supabase project through
  `@supabase/supabase-js` and a mobile login redirect.
