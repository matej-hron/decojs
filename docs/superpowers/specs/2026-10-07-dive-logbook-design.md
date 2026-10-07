# Dive Logbook (Step 4c)

**Date:** 2026-10-07
**Status:** Design agreed in chat, awaiting written-spec review
**Roadmap position:** step 4c (after 4a/4b backend v1, released 2026-10-07; before 4d photo/GPS
matching and the Android app)
**Depends on:** `js/backend/*` (DiveStore over Supabase), `js/import/*`, `lab/dive-log.html`

## Background

The dive log page stores computer recordings (`.DLF` files plus parsed dives) and analyses
them. It is not yet a logbook: a dive without a computer cannot be logged, and there is no
place for the site, buddy, conditions, notes or photos.

Decisions taken in chat:

- A dive can be logged **with or without a dive computer**. The computer is a helper that
  fills in what it knows; other computers may follow later.
- **Bulk upload creates logbook entries automatically**, filled from the computer; the
  user adds details later. The 30 dives already stored get entries the same way.
- Logging a single dive starts from a **date**; computer dives from that day are offered.
- **Few fields up front**, the rest in a collapsed "More details" section. Hiding fields
  via settings is a later step; the data model must make that easy.
- **Site position is picked on a map.**
- **Photos are resized in the browser and uploaded; videos are stored as links**
  (the free plan has 1 GB of storage).
- **Full UI on the web, phone-friendly.** The Android app reuses the same data later.

## Goals

- A logbook list, a new/edit dive form, a dive detail view and a site map picker in
  `lab/dive-log.html`, usable on a phone.
- Logbook entries independent of recordings, optionally linked to one.
- Automatic entries for every stored recording without one (existing and future uploads).
- Sites reusable across dives; buddies suggested from earlier entries.
- Photos attached to an entry, resized before upload, with their EXIF time and position
  kept for step 4d; video links.

## Non-goals

- Automatic photo-to-dive matching by time or GPS (4d).
- Field visibility settings, buddy/instructor sign-off, statistics, trip views.
- Uploading video files.
- Google login (separate small step).
- Changes to the analysis itself (profile, P-P, GF charts stay as they are).

## Fields

`⚙️` = filled from the computer when an entry comes from a recording. Every field can be
typed by hand. Units: depth m, temperature °C, pressure bar, duration minutes in the UI
(stored in seconds).

**Core (always visible)**

| Field | Column | ⚙️ source |
|---|---|---|
| Logbook number | `log_number` | assigned (next free), editable |
| Date | `dive_date` | `start.local` date |
| Entry time | `entry_time` | `start.local` time |
| Duration | `duration_s` | `duration` |
| Site | `site_id` | – |
| Max depth | `max_depth_m` | `maxDepth` |
| Buddies | `buddies` (text[]) | – |
| Gas | `gas` (`{o2, he}` fractions) | first gas |
| Water temperature (bottom) | `water_temp_c` | `minTemp` |
| Visibility shallow / deep | `vis_shallow_m`, `vis_deep_m` | – |
| Notes | `notes` | – |
| Photos, video links | `media` table | – |

**More details (collapsed; opens when any value inside is set)** — stored in `details`
(JSON), keys:

- conditions: `surfaceTempC`, `airTempC`, `weather` (`sun`, `clouds`, `rain`, `wind`),
  `current` (`none`, `light`, `moderate`, `strong`), `waves` (`calm`, `small`, `rough`)
- equipment: `cylinderL`, `cylinderMaterial` (`steel`, `aluminium`), `pressureStartBar`,
  `pressureEndBar`, `weightsKg`, `suit` (`wet`, `dry`), `suitMm`, `computer` ⚙️ (model +
  serial)
- dive: `entry` (`shore`, `boat`), `avgDepthM` ⚙️, `stops` ⚙️ (`none`, `safety`, `deco`),
  `tags` (array: `night`, `wreck`, `cave`, `ice`, `training`, `deep`, `drift`, free text),
  `guide`, `rating` (1–5)

Unknown keys in `details` are preserved on save, so adding fields later needs no
migration.

## Data model (`supabase/migrations/0002_logbook.sql`)

```sql
create table public.sites (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null,
    lat double precision,
    lon double precision,
    country text,
    water text check (water in ('salt', 'fresh')),
    altitude_m integer,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.log_entries (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    log_number integer not null,
    dive_date date not null,
    entry_time time,
    duration_s integer,
    max_depth_m numeric(5, 2),
    site_id uuid references public.sites (id) on delete set null,
    buddies text[] not null default '{}',
    gas jsonb,
    water_temp_c numeric(4, 1),
    vis_shallow_m numeric(5, 1),
    vis_deep_m numeric(5, 1),
    notes text,
    details jsonb not null default '{}',
    recording_id uuid unique references public.dives (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner, log_number)
);

create table public.media (
    id uuid primary key default gen_random_uuid(),
    owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
    entry_id uuid not null references public.log_entries (id) on delete cascade,
    kind text not null check (kind in ('photo', 'video_link')),
    path text,                 -- storage path for photos
    url text,                  -- for video links
    width integer,
    height integer,
    taken_at timestamptz,      -- from EXIF, for step 4d
    lat double precision,      -- from EXIF, for step 4d
    lon double precision,
    caption text,
    created_at timestamptz not null default now()
);

-- RLS, grants and owner-only policies for all three tables (same pattern as dives)
-- Private bucket 'dive-photos' with the owner-folder storage policy
```

The full migration enables RLS on each table, grants `select, insert, update, delete` to
`authenticated`, adds an owner-only `for all` policy per table, creates the private
`dive-photos` bucket and its owner-folder policy (first path segment = `auth.uid()`). The
existing `dives` table stays as the recordings table (name unchanged).

Photo path: `<user id>/<entry id>/<media id>.jpg`. Photos are shown through short-lived
signed URLs (`createSignedUrl`), never public URLs.

## Logbook numbering

- New entries get `max(log_number) + 1` for the owner.
- Automatic entries from recordings are numbered in recording order (device dive number,
  then start time), continuing after the current maximum.
- The number is editable; a duplicate number is rejected with a plain message.
- (Later: a setting for the first number, for divers with earlier paper logbooks.)

## Entries from recordings

- Pure function `entryFromRecording(dive)` maps a RecordedDive to entry fields (⚙️ above).
  Gas: first gas as `{o2, he}`. `stops`: `deco` if any sample has a ceiling > 0, else
  `safety` if a `safetyStopDone` event exists, else `none`. `computer`: `Divesoft Freedom
  7044-00006107` style.
- `ensureEntries()` (store): finds recordings without an entry and creates entries for
  them. Runs after every upload and once after login (covers the 30 stored dives).
- An entry's date stays editable even when linked (e.g. #99's clock-reset date of 2006 can
  be corrected without touching the recording).
- Entries without a site or buddy show an "add details" marker in the list.

## Screens (single page, hash routes)

`lab/dive-log.html` becomes the logbook. Routes:

| Route | Screen |
|---|---|
| `#/` | Logbook list |
| `#/new` | New dive (date first, then form) |
| `#/dive/<id>` | Dive detail |
| `#/dive/<id>/edit` | Edit form |
| `#/dive/<id>/analysis` | Analysis of the linked recording (existing component) |

Logged out, the page keeps today's behaviour (demo analysis, local files, login form).

**Logbook list.** Newest first: number, date, site, max depth, duration, buddies, first
photo thumbnail, "add details" marker. Buttons: **+ New dive** (fixed bottom-right on the
phone), **Upload DIVELOG**, **Export**, **Log out**.

**New dive.**
1. Date (default today).
2. "From your dive computer on this day": unlinked recordings on the server for that date,
   plus `.DLF` files in the computer folder for that date. Each shows time, depth and
   duration. Picking one prefills the form and links (uploading the recording first if it
   is new). "Without computer" opens an empty form.
3. The form; **Save** creates the entry.

**Computer folder.** On browsers with `showDirectoryPicker` (Chrome/Edge desktop) the
page remembers the picked `DIVELOG` folder (handle in IndexedDB) and later re-reads it after
one permission click. Elsewhere it falls back to the file picker.

**Form layout.** One column below 720 px, core and details side by side above. Touch
targets at least 44 px. Number inputs use `inputmode="decimal"` and accept a decimal comma.
Buddies: a text input with suggestions from earlier entries (chips). Gas: Air / EAN __ %
/ Trimix __/__.

**Site picker.** A site field with suggestions from existing sites, plus "Pick on map":
- full-screen Leaflet map (OpenStreetMap tiles, attribution shown);
- existing sites as pins (tap to choose), tap empty map to drop a new pin, "Use my
  location" (browser geolocation), name field, water and altitude optional;
- saving creates the site and returns to the form.

**Dive detail.** Read-only card: core fields, "More details" if any, the site with a small
map, photos as a gallery (tap to enlarge), video links, buttons **Edit**, **Analysis** (when
linked), **Delete** (with an in-page confirmation; deleting an entry keeps its recording).

**Photos.** Add from the form or detail. In the browser: read EXIF (`DateTimeOriginal`,
GPS) with exifr, resize to at most 2560 px on the long edge as JPEG quality 0.85, upload,
store width, height, `taken_at`, `lat`, `lon`. Accepted: JPEG, PNG, WebP; HEIC gets a plain
message ("save as JPEG first"). Video: paste a link (shown as a link, not embedded).

## Libraries (CDN, pinned)

- Leaflet 1.9.4 (cdnjs: `leaflet.js` and `leaflet.css`), loaded only when a map opens.
- exifr 7.1.3 lite (jsDelivr `dist/lite.umd.js`), loaded only when photos are added.
- supabase-js and JSZip as today.

## Code structure

```
js/logbook/
  entryModel.js       pure: entryFromRecording, nextLogNumber, normalizeEntry,
                      gasLabel, needsDetails, parseDecimal
  photo.js            resizeTarget (pure), resizeImage (canvas), readExif (exifr)
  router.js           pure: parseRoute, routeHref
  LogbookApp.js       screens, routing, wiring to the store
  EntryForm.js        form (core + More details), validation
  SitePicker.js       Leaflet map picker
js/backend/supabaseStore.js   + entries, sites, media, ensureEntries, photo upload,
                                signed URLs
supabase/migrations/0002_logbook.sql
```

The analysis screen reuses `RecordedDiveAnalysis` for the linked recording.

## Errors and edge cases

- Saving fails (offline, paused project): the form keeps its values and shows the
  unreachable message; nothing is lost on screen.
- Duplicate logbook number: "Number N is already used."
- A recording deleted outside the page: the entry keeps its values; the Analysis button
  disappears.
- Photo too large to resize (memory) or unsupported type: per-photo message, others go on.
- Geolocation denied: the map stays usable by tapping.

## i18n and notation

All strings under `diveLog.logbook.*` in en, cs, es. Units with a non-breaking space,
`fmtNum` for numbers, decimal comma in Czech, italic quantity symbols where symbols appear.
Choice lists (weather, current, waves, suit, tags) translated.

## Testing

- `tests/logbook.test.mjs` (node:test, added to `npm test`):
  - `entryFromRecording` on fixtures (#100 deco → `stops: 'deco'`, gas air, temperature,
    computer string; #99 keeps its 2006 date);
  - `nextLogNumber` (empty, gaps, ordering of automatic entries by device number);
  - `normalizeEntry` (decimal comma, empty strings → null, unknown `details` keys kept);
  - `needsDetails`, `gasLabel`, `parseRoute`/`routeHref`, `resizeTarget`;
  - store with a fake client: entries CRUD, `ensureEntries` creates entries only for
    unlinked recordings and is idempotent, site creation, photo upload path and media row,
    signed URL request, delete keeps the recording.
- Browser checks (delegated to a subagent; logged-out and layout at 390 px and 1280 px
  widths) and a live check by the user against the real project: 30 automatic entries, a
  manual entry with a map pin and a photo, editing, deleting.

## Open questions

- Field visibility settings (later).
- Start number for divers with earlier paper logbooks (later setting).
- Video uploads if storage moves to a larger plan or another store.
