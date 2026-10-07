# Dive Logbook (4c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `lab/dive-log.html` into a logbook: entries with or without a dive computer, automatic entries from uploads, sites on a map, buddies, conditions, photos (resized) and video links, phone-friendly.

**Architecture:** Pure helpers in `js/logbook/` (entry mapping, numbering, routing, photo sizing), new tables and store methods in Supabase behind the existing `DiveStore`, and a `LogbookApp` component that owns the page when logged in (hash routes: list, new, detail, edit, analysis) and mounts the existing `RecordedDiveAnalysis` when logged out and for the analysis route.

**Tech Stack:** Vanilla ES modules; Supabase (supabase-js 2.117.2 as today); Leaflet 1.9.4 (cdnjs, on demand); exifr 7.1.3 lite (jsDelivr, on demand); Node 26 `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-07-dive-logbook-design.md`

## Global Constraints

- No build step, no npm runtime dependencies; browser libraries from pinned CDN URLs, loaded on demand (`<script>`/`<link>` appended once).
- `js/logbook/entryModel.js`, `js/logbook/router.js` and the pure part of `js/logbook/photo.js` are free of DOM and `node:` imports.
- Logged-out behaviour of `lab/dive-log.html` stays as today (demo analysis, local files, login form).
- Every row has `owner`; RLS owner-only on every new table and on the `dive-photos` bucket; grants only to `authenticated`.
- Photos: at most 2560 px on the long edge, JPEG quality 0.85; EXIF time and GPS read before resizing; videos are links only.
- `details` JSON keeps unknown keys on save.
- i18n: all strings under `diveLog.logbook.*` in `en`, `cs`, `es` (identical key sets). Static labels translated with the existing `translateStatic` pattern (js/i18n.js only translates at load); dynamic text via `translate()`; re-render on `languagechange`. Numbers with `fmtNum`; units after ` `; decimal comma accepted in inputs.
- Phone first: one column below 720 px, touch targets ≥ 44 px, no horizontal page scroll at 390 px.
- `js/backend/config.js` holds the real project URL and publishable key — do not change it. Never log in, send login emails or call the real Supabase project from code or tests.
- Repo page tests scan every HTML file on disk: no extra HTML files. Do not bump `CACHE_NAME` (done at release).
- Commits end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_013ZjhKy8AS4bdb6WDiQVPzU`
- `npm test` stays green (currently `run-tests.mjs` 640/640 + node:test suites).

## Review Focus

- **Two automatic-entry runs at once** (upload finishing while the post-login run is going): `ensureEntries` must not create duplicate entries (unique `recording_id` + idempotent logic). Test in Task 2.
- **Decimal comma and empty inputs on the phone** (`12,5`, `''`, spaces): stored as numbers or null, never `NaN`. Test in Task 1.
- **A duplicate logbook number typed by hand:** a plain message, the form keeps its values. Test in Task 2 (store error kind) and Task 4.
- **Huge or unsupported photos (HEIC, 40 MP):** per-photo message, other photos continue; resize keeps the aspect ratio. Test in Task 1 (`resizeTarget`) and Task 5.
- **Opening `#/dive/<id>` for a deleted or foreign id:** "Dive not found" with a way back, no crash. Test in Task 1 (`parseRoute`) and Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `js/logbook/entryModel.js` | `entryFromRecording`, `nextLogNumber`, `orderRecordingsForNumbering`, `normalizeEntry`, `needsDetails`, `parseDecimal`, `DETAIL_KEYS` |
| `js/logbook/router.js` | `parseRoute(hash)`, `routeHref(route)` |
| `js/logbook/photo.js` | `resizeTarget` (pure), `resizeImage` (canvas), `readExif` (exifr on demand), `isSupportedImage` |
| `js/logbook/transfer.js` | `uploadDivelog(store, files, onProgress)`, `exportZip(store)` (moved out of RecordedDiveAnalysis) |
| `js/logbook/LogbookApp.js` | auth switch, routing, list + detail screens |
| `js/logbook/EntryForm.js` | new/edit form, new-dive flow, buddy suggestions |
| `js/logbook/SitePicker.js` | Leaflet map picker, site field |
| `js/backend/supabaseStore.js` | entries, sites, media, `ensureEntries`, photo upload, signed URLs |
| `supabase/migrations/0002_logbook.sql` | tables, RLS, grants, bucket |
| `js/components/RecordedDiveAnalysis.js` | options `embedded`, `focusRecordingId`, method `destroy()`; uses `transfer.js` |
| `lab/dive-log.html` | mounts `LogbookApp`; page CSS for logbook screens |
| `locales/*.json` | `diveLog.logbook.*` |
| `sw.js` | add new JS files to `STATIC_ASSETS` |
| `tests/logbook.test.mjs` | tests for Tasks 1–5 (pure parts and store with fake client) |
| `supabase/README.md` | "Run 0002_logbook.sql" step |

---

### Task 1: Pure logbook helpers

**Files:** create `js/logbook/entryModel.js`, `js/logbook/router.js`, `js/logbook/photo.js` (pure functions only in this task), `tests/logbook.test.mjs`; modify `package.json` (append ` tests/logbook.test.mjs` to the `test` script).

**Interfaces — Produces:**
- `entryFromRecording(dive) → { dive_date: 'YYYY-MM-DD', entry_time: 'HH:MM:SS', duration_s, max_depth_m, gas: {o2, he}|null, water_temp_c, details: { stops, computer, avgDepthM? } }`
- `orderRecordingsForNumbering(rows)` → rows sorted by `diveNumber` (missing last) then `startLocal`.
- `nextLogNumber(entries) → number` (`max(log_number)+1`, or 1).
- `parseDecimal(value) → number|null` (accepts `12,5`, `12.5`, spaces; `''`/invalid → null).
- `normalizeEntry(form, previousDetails = {}) → row` (numbers via `parseDecimal`, empty strings → null, buddies trimmed/deduplicated/empty removed, `details` = `{...previousDetails, ...form.details}` with empty values removed).
- `needsDetails(entry) → boolean` (no `site_id` or no buddies).
- `DETAIL_KEYS` — the spec's detail keys grouped `{ conditions: [...], equipment: [...], dive: [...] }`.
- `parseRoute(hash) → { name: 'list'|'new'|'detail'|'edit'|'analysis'|'notFound', id? }`; `routeHref(route) → '#/…'`.
- `resizeTarget(width, height, maxEdge = 2560) → { width, height }` (integers, aspect kept, never upscaled); `isSupportedImage(mimeOrName) → boolean` (jpeg, png, webp).

- [ ] **Step 1: Failing tests.** Create `tests/logbook.test.mjs`:

```js
/**
 * Dive logbook tests.
 * Run: node --test tests/logbook.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF } from '../js/import/divesoftDlf.js';
import {
    entryFromRecording, orderRecordingsForNumbering, nextLogNumber, parseDecimal,
    normalizeEntry, needsDetails, DETAIL_KEYS,
} from '../js/logbook/entryModel.js';
import { parseRoute, routeHref } from '../js/logbook/router.js';
import { resizeTarget, isSupportedImage } from '../js/logbook/photo.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);
const diveOf = id => parseDivesoftDLF(new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES))), { fileName: `${id}.DLF` });

describe('entryFromRecording', () => {
    test('a deco dive', () => {
        const e = entryFromRecording(diveOf('00000100'));
        assert.equal(e.dive_date, '2026-09-27');
        assert.equal(e.entry_time, '12:01:01');
        assert.equal(e.duration_s, 3109);
        assert.equal(e.max_depth_m, 38.56);
        assert.deepEqual(e.gas, { o2: 0.21, he: 0 });
        assert.equal(e.water_temp_c, 4.8);
        assert.equal(e.details.stops, 'deco');
        assert.equal(e.details.computer, 'Divesoft Freedom 7044-00006107');
    });

    test('a no-deco dive with a safety stop', () => {
        const e = entryFromRecording(diveOf('00000092'));
        assert.equal(e.details.stops, 'safety');
    });

    test('a clock-reset dive keeps its recorded date', () => {
        assert.equal(entryFromRecording(diveOf('00000099')).dive_date, '2006-07-19');
    });
});

describe('numbering', () => {
    test('next number', () => {
        assert.equal(nextLogNumber([]), 1);
        assert.equal(nextLogNumber([{ log_number: 3 }, { log_number: 7 }]), 8);
    });

    test('recordings are numbered by device number, then start', () => {
        const rows = [
            { id: 'c', diveNumber: 101, startLocal: '2026-09-27T16:21:22' },
            { id: 'a', diveNumber: 99, startLocal: '2006-07-19T09:59:05' },
            { id: 'x', diveNumber: null, startLocal: '2026-01-01T00:00:00' },
            { id: 'b', diveNumber: 100, startLocal: '2026-09-27T12:01:01' },
        ];
        assert.deepEqual(orderRecordingsForNumbering(rows).map(r => r.id), ['a', 'b', 'c', 'x']);
    });
});

describe('form normalisation', () => {
    test('decimal comma, spaces and empty values', () => {
        assert.equal(parseDecimal('12,5'), 12.5);
        assert.equal(parseDecimal(' 7.25 '), 7.25);
        assert.equal(parseDecimal(''), null);
        assert.equal(parseDecimal('abc'), null);
        assert.equal(parseDecimal(null), null);
    });

    test('normalizeEntry keeps unknown detail keys and drops empty ones', () => {
        const row = normalizeEntry({
            log_number: '12', dive_date: '2026-10-01', entry_time: '', duration_min: '45',
            max_depth_m: '18,4', buddies: [' Petr ', '', 'Petr', 'Jirka'],
            vis_shallow_m: '8', vis_deep_m: '', notes: '  ',
            details: { weather: 'sun', current: '' },
        }, { futureKey: 'kept', current: 'light' });
        assert.equal(row.log_number, 12);
        assert.equal(row.entry_time, null);
        assert.equal(row.duration_s, 2700);
        assert.equal(row.max_depth_m, 18.4);
        assert.deepEqual(row.buddies, ['Petr', 'Jirka']);
        assert.equal(row.vis_deep_m, null);
        assert.equal(row.notes, null);
        assert.deepEqual(row.details, { futureKey: 'kept', weather: 'sun' });
        for (const v of Object.values(row)) assert.ok(!Number.isNaN(v));
    });

    test('needsDetails', () => {
        assert.equal(needsDetails({ site_id: null, buddies: ['A'] }), true);
        assert.equal(needsDetails({ site_id: 's', buddies: [] }), true);
        assert.equal(needsDetails({ site_id: 's', buddies: ['A'] }), false);
    });

    test('detail keys cover the spec groups', () => {
        assert.ok(DETAIL_KEYS.conditions.includes('weather'));
        assert.ok(DETAIL_KEYS.equipment.includes('weightsKg'));
        assert.ok(DETAIL_KEYS.dive.includes('rating'));
    });
});

describe('router', () => {
    test('routes', () => {
        assert.deepEqual(parseRoute(''), { name: 'list' });
        assert.deepEqual(parseRoute('#/'), { name: 'list' });
        assert.deepEqual(parseRoute('#/new'), { name: 'new' });
        assert.deepEqual(parseRoute('#/dive/abc-1'), { name: 'detail', id: 'abc-1' });
        assert.deepEqual(parseRoute('#/dive/abc-1/edit'), { name: 'edit', id: 'abc-1' });
        assert.deepEqual(parseRoute('#/dive/abc-1/analysis'), { name: 'analysis', id: 'abc-1' });
        assert.deepEqual(parseRoute('#/nonsense/x'), { name: 'notFound' });
        assert.deepEqual(parseRoute('#error_code=otp_expired'), { name: 'list' });
        assert.equal(routeHref({ name: 'edit', id: 'abc-1' }), '#/dive/abc-1/edit');
        assert.equal(routeHref({ name: 'list' }), '#/');
    });
});

describe('photos', () => {
    test('resizeTarget keeps aspect and never upscales', () => {
        assert.deepEqual(resizeTarget(8000, 6000), { width: 2560, height: 1920 });
        assert.deepEqual(resizeTarget(3000, 4000), { width: 1920, height: 2560 });
        assert.deepEqual(resizeTarget(1200, 800), { width: 1200, height: 800 });
    });

    test('supported image types', () => {
        assert.ok(isSupportedImage('image/jpeg'));
        assert.ok(isSupportedImage('photo.WEBP'));
        assert.ok(!isSupportedImage('image/heic'));
        assert.ok(!isSupportedImage('IMG_1.HEIC'));
    });
});
```

- [ ] **Step 2:** Run `node --test tests/logbook.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement.**

`js/logbook/entryModel.js`:

```js
/**
 * Logbook entry helpers: mapping computer recordings to entries, numbering,
 * and normalising form input. Pure: no DOM, no network.
 */

/** "More details" keys, grouped as in the form. */
export const DETAIL_KEYS = Object.freeze({
    conditions: ['surfaceTempC', 'airTempC', 'weather', 'current', 'waves'],
    equipment: ['cylinderL', 'cylinderMaterial', 'pressureStartBar', 'pressureEndBar', 'weightsKg', 'suit', 'suitMm', 'computer'],
    dive: ['entry', 'avgDepthM', 'stops', 'tags', 'guide', 'rating'],
});

/**
 * Logbook fields a dive computer recording can fill in.
 * @param {Object} dive - RecordedDive
 */
export function entryFromRecording(dive) {
    const [date, time] = dive.start.local.split('T');
    const first = dive.gases?.[0];
    const hasDeco = dive.samples?.some(s => (s.ceiling ?? 0) > 0);
    const hasSafety = dive.events?.some(e => e.type === 'safetyStopDone');
    const device = [dive.device?.vendor, dive.device?.model, dive.device?.serial].filter(Boolean).join(' ');
    const details = { stops: hasDeco ? 'deco' : hasSafety ? 'safety' : 'none' };
    if (device) details.computer = device;
    if (Number.isFinite(dive.avgDepth)) details.avgDepthM = dive.avgDepth;
    return {
        dive_date: date,
        entry_time: time ?? null,
        duration_s: dive.duration ?? null,
        max_depth_m: dive.maxDepth ?? null,
        gas: first ? { o2: first.o2, he: first.he } : null,
        water_temp_c: dive.minTemp ?? null,
        details,
    };
}

/** Recording rows in the order automatic entries are numbered. */
export function orderRecordingsForNumbering(rows) {
    return rows.slice().sort((a, b) => {
        const na = a.diveNumber ?? Infinity;
        const nb = b.diveNumber ?? Infinity;
        if (na !== nb) return na - nb;
        return String(a.startLocal).localeCompare(String(b.startLocal));
    });
}

/** The next free logbook number. */
export function nextLogNumber(entries) {
    return entries.reduce((max, e) => Math.max(max, e.log_number ?? 0), 0) + 1;
}

/** Parse a number typed with a decimal comma or point; null when empty or invalid. */
export function parseDecimal(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replace(',', '.');
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
}

const emptyText = v => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null);

function cleanDetails(details) {
    const out = {};
    for (const [k, v] of Object.entries(details)) {
        if (v === '' || v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        out[k] = v;
    }
    return out;
}

/**
 * Turn form values into a log_entries row.
 * @param {Object} form - raw form values (strings), `duration_min` in minutes
 * @param {Object} [previousDetails] - details stored before; unknown keys are kept
 */
export function normalizeEntry(form, previousDetails = {}) {
    const minutes = parseDecimal(form.duration_min);
    const buddies = [...new Set((form.buddies ?? []).map(b => String(b).trim()).filter(Boolean))];
    const number = parseDecimal(form.log_number);
    return {
        log_number: number === null ? null : Math.round(number),
        dive_date: emptyText(form.dive_date),
        entry_time: emptyText(form.entry_time),
        duration_s: minutes === null ? null : Math.round(minutes * 60),
        max_depth_m: parseDecimal(form.max_depth_m),
        site_id: emptyText(form.site_id),
        buddies,
        gas: form.gas ?? null,
        water_temp_c: parseDecimal(form.water_temp_c),
        vis_shallow_m: parseDecimal(form.vis_shallow_m),
        vis_deep_m: parseDecimal(form.vis_deep_m),
        notes: emptyText(form.notes),
        details: cleanDetails({ ...previousDetails, ...(form.details ?? {}) }),
    };
}

/** True when the entry still lacks the details a diver usually adds by hand. */
export function needsDetails(entry) {
    return !entry.site_id || !(entry.buddies?.length > 0);
}
```

Note: `cleanDetails` runs after the merge, so an emptied field (e.g. `current: ''`) removes the old value — matching the test.

`js/logbook/router.js`:

```js
/** Hash routes of the logbook page. Pure. */

const DIVE = /^#\/dive\/([A-Za-z0-9-]+)(?:\/(edit|analysis))?$/;

/** @returns {{name: string, id?: string}} */
export function parseRoute(hash) {
    if (!hash || hash === '#' || hash === '#/' || !hash.startsWith('#/')) return { name: 'list' };
    if (hash === '#/new') return { name: 'new' };
    const m = DIVE.exec(hash);
    if (m) return { name: m[2] === 'edit' ? 'edit' : m[2] === 'analysis' ? 'analysis' : 'detail', id: m[1] };
    return { name: 'notFound' };
}

/** @param {{name: string, id?: string}} route */
export function routeHref(route) {
    switch (route.name) {
        case 'new': return '#/new';
        case 'detail': return `#/dive/${route.id}`;
        case 'edit': return `#/dive/${route.id}/edit`;
        case 'analysis': return `#/dive/${route.id}/analysis`;
        default: return '#/';
    }
}
```

`js/logbook/photo.js` (pure part; Task 5 adds the browser functions to the same file):

```js
/** Photo helpers for logbook uploads. */

export const PHOTO_MAX_EDGE = 2560;
export const PHOTO_QUALITY = 0.85;

/** Target size: longest edge at most maxEdge, aspect kept, never upscaled. */
export function resizeTarget(width, height, maxEdge = PHOTO_MAX_EDGE) {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** JPEG, PNG and WebP can be resized in every browser; HEIC cannot. */
export function isSupportedImage(mimeOrName) {
    return /(jpe?g|png|webp)$/i.test(String(mimeOrName ?? ''));
}
```

- [ ] **Step 4:** `node --test tests/logbook.test.mjs` → PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(logbook): pure entry, routing and photo helpers`.

---

### Task 2: Database migration and store methods

**Files:** create `supabase/migrations/0002_logbook.sql`; modify `js/backend/supabaseStore.js`, `supabase/README.md`, `tests/logbook.test.mjs`.

**Interfaces — Produces** (added to the object returned by `createSupabaseStore`):
- `listEntries() → Promise<Entry[]>` (all columns, ordered by `log_number` desc)
- `getEntry(id) → Promise<Entry|null>`
- `saveEntry(row, id?) → Promise<Entry>` (insert when no id, else update; on unique violation of `(owner, log_number)` throws `DiveStoreError('duplicate-number')`)
- `deleteEntry(id) → Promise<void>` (recording kept; media rows cascade; photo files removed from storage)
- `listSites() → Promise<Site[]>` (by name); `saveSite(row, id?) → Promise<Site>`
- `listBuddies() → Promise<string[]>` (distinct names from entries, most used first)
- `ensureEntries() → Promise<number>` (creates entries for recordings without one; returns how many)
- `listMedia(entryId) → Promise<Media[]>`; `addPhoto(entryId, { blob, width, height, takenAt, lat, lon }) → Promise<Media>`; `addVideoLink(entryId, url, caption?) → Promise<Media>`; `deleteMedia(media) → Promise<void>`; `photoUrls(paths) → Promise<Map<path, url>>` (signed, 1 h)
- `PHOTO_BUCKET = 'dive-photos'`, tables `log_entries`, `sites`, `media`.

`Entry` = the `log_entries` row as stored (snake_case columns). `DiveStoreError` gains kind `'duplicate-number'`.

- [ ] **Step 1: Migration.** `supabase/migrations/0002_logbook.sql`: the three `create table` statements from the spec, then for **each** of `sites`, `log_entries`, `media`:

```sql
alter table public.<t> enable row level security;
grant select, insert, update, delete on table public.<t> to authenticated;
create policy "owner reads and writes own <t>" on public.<t>
    for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
```

then:

```sql
insert into storage.buckets (id, name, public) values ('dive-photos', 'dive-photos', false);

create policy "owner reads and writes own dive photos" on storage.objects
    for all to authenticated
    using (bucket_id = 'dive-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'dive-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

Add to `supabase/README.md` a section "Logbook (step 4c): run `0002_logbook.sql` in the SQL editor".

- [ ] **Step 2: Failing tests.** Extend the test file with a fake Supabase client (copy the pattern of `fakeClient` in `tests/dive-log-backend.test.mjs`, extended with `insert(rows)`, `.in(col, values)`, `.delete().eq()`, `storage.remove(paths)`, `storage.createSignedUrls(paths, seconds)`, and an `error` with `code: '23505'` when inserting a duplicate `(owner, log_number)` or `recording_id`). Tests:
  - `saveEntry` insert then update; `getEntry`; `listEntries` order;
  - duplicate number → rejects with `kind === 'duplicate-number'`;
  - `ensureEntries` with three recordings and one already linked creates two entries numbered after the current max in device-number order, filled via `entryFromRecording`; a second call creates 0; two concurrent calls (`Promise.all`) end with exactly one entry per recording (unique `recording_id` violation is ignored, not thrown);
  - `deleteEntry` removes the entry and its photo files but not the recording;
  - `addPhoto` uploads to `<uid>/<entryId>/<mediaId>.jpg` with `contentType: 'image/jpeg'` and inserts a media row with width/height/taken_at/lat/lon; `photoUrls` maps paths to signed URLs;
  - `listBuddies` returns distinct names, most used first.

- [ ] **Step 3: Implement** in `supabaseStore.js`. Notes:
  - Generate ids client-side where the path needs them (`crypto.randomUUID()` for media ids).
  - `ensureEntries`: select `id, dive_number, start_local` from `dives`; select `recording_id, log_number` from `log_entries`; missing = recordings without an entry; if none return 0; select `id, record` for the missing ids (`.in('id', ids)`); order with `orderRecordingsForNumbering` (map rows to `{ id, diveNumber, startLocal }`); insert one entry per recording **one at a time** with `log_number = next++`, `recording_id`, `owner`, fields from `entryFromRecording(record)`; on error code `23505` for `recording_id` skip it (another run created it); on `23505` for `log_number` re-read the max and retry once.
  - `saveEntry` maps Postgres `23505` on the `log_number` constraint to `DiveStoreError('duplicate-number')`.
  - `deleteEntry`: list its photo media paths, `storage.remove(paths)`, then delete the entry.
- [ ] **Step 4:** tests pass; `npm test` green.
- [ ] **Step 5:** Commit `feat(logbook): logbook tables and store methods`.

---

### Task 3: Logbook shell, list and transfer

**Files:** create `js/logbook/transfer.js`, `js/logbook/LogbookApp.js`; modify `js/components/RecordedDiveAnalysis.js`, `lab/dive-log.html`, `locales/*.json`, `sw.js`, `tests/logbook.test.mjs`.

**Interfaces:**
- Consumes: Tasks 1–2; existing `RecordedDiveAnalysis`, `translateStatic`, `getDiveStore`.
- Produces:
  - `transfer.js`: `uploadDivelog(store, files, onProgress) → Promise<{ report, items }>` (the existing upload pipeline: `loadDiveFiles` → `listDives` → `planSync` → `saveDives`, then `store.ensureEntries()`), `exportZip(store) → Promise<void>` (existing JSZip export, now also adding `logbook.json` with entries, sites and media rows).
  - `RecordedDiveAnalysis` options: `embedded` (no account bar, no pickers; used inside the logbook), `focusRecordingId` (select that recording once loaded); method `destroy()` (removes listeners, destroys charts).
  - `new LogbookApp(root, { store, demoFiles })`.

Behaviour:
- **Logged out (or no store):** `LogbookApp` mounts `RecordedDiveAnalysis` exactly as the page does today (login form included). On sign-in it destroys it and shows the logbook; on sign-out the reverse.
- **Logged in:** run `store.ensureEntries()` once (background, errors to the account message), then route by `location.hash` (`hashchange` listener):
  - `list`: header bar (email, **Upload DIVELOG**, **Export**, **Log out**, reusing the current account-bar strings), a **+ New dive** button (fixed bottom-right below 720 px), and the entries as cards: `#number · date · site name or "Site not set" · max depth · duration · buddies`, first photo thumbnail (signed URL; skip if none), an "Add details" marker when `needsDetails`. Tap → detail.
  - `analysis`: mount `RecordedDiveAnalysis` with `{ store, embedded: true, focusRecordingId: entry.recording_id }` plus a "← Back" link.
  - `detail`, `new`, `edit`: placeholders in this task ("coming soon" text is acceptable only until Tasks 4–5 land; they replace it).
  - `notFound` or an unknown id: "Dive not found" + link to the list.
- Upload shows the existing progress/report strings, then reloads the list (entries created by `ensureEntries`).
- `lab/dive-log.html`: mount `LogbookApp` instead of `RecordedDiveAnalysis`; add logbook CSS (cards, header, fixed button; one column below 720 px).
- Strings: add `diveLog.logbook.{newDive, siteNotSet, addDetails, back, notFound, emptyList, number, comingSoon}` in en/cs/es.
- `sw.js` `STATIC_ASSETS`: add the new `js/logbook/*.js` files.
- Tests: `transfer.js` with fake store objects (upload calls ensureEntries after saving; export includes `logbook.json`).

- [ ] Steps: failing tests → implement → `npm test` → headless-Chrome check (logged out page unchanged; no console errors; at 390 px no horizontal scroll) → commit `feat(logbook): logbook shell, list and transfer`.

---

### Task 4: Entry form and new-dive flow

**Files:** create `js/logbook/EntryForm.js`; modify `js/logbook/LogbookApp.js`, `lab/dive-log.html` (CSS), `locales/*.json`, `tests/logbook.test.mjs`.

**Interfaces:**
- Consumes: Task 1 helpers, Task 2 store methods, `gasName` from `js/import/recordedDive.js`, `loadDiveFiles`, `planSync`, `sha256Hex`.
- Produces: `new EntryForm(container, { store, entry?, prefill?, recordingId?, onSaved(entry), onCancel })`; pure helpers exported for tests: `formValuesFromEntry(entry) → form`, `gasFromForm({ kind: 'air'|'ean'|'tx', o2, he }) → {o2, he}`, `formatDuration(seconds) → minutes string`.

Behaviour:
- **Core section** (always visible): number, date, time, duration (minutes), site field (text with suggestions from `listSites()`; "Pick on map" button opens the Task 5 picker — in this task the button may be present but disabled), max depth, buddies (chips with suggestions from `listBuddies()`), gas (Air / EAN __ % / Trimix __/__), water temperature, visibility shallow / deep, notes.
- **More details** (`<details>` element): the spec's groups and choice lists; open by default when any key inside has a value.
- Inputs: `inputmode="decimal"` for numbers; labels with units (`m`, `°C`, `bar`, `kg`, `l`, `min`) using ` `.
- **Save**: `normalizeEntry(form, entry?.details)`; new entries get `nextLogNumber` when the number is empty; `store.saveEntry`; on `duplicate-number` show `diveLog.logbook.duplicateNumber` ("Number {0} is already used.") and keep the values; on `unreachable` show the existing unreachable message and keep the values.
- **New dive flow** (`#/new`): step 1 date (default today); step 2 lists unlinked recordings for that date from the server (`listDives` + entries' `recording_id`s) and, if a computer folder is available, `.DLF` files for that date not yet stored. Folder: when `window.showDirectoryPicker` exists, a "Use dive computer folder" button picks it and stores the handle in IndexedDB (`decojs-logbook` db, `handles` store, key `divelog`); later visits call `handle.queryPermission`/`requestPermission({mode:'read'})` and read `.dlf` files; otherwise a file input. Choosing a server recording prefills via `entryFromRecording` and sets `recording_id`; choosing a folder file uploads it first (`saveDives`), then prefills and links. "Without computer" opens an empty form. Step 3 the form.
- `#/dive/<id>/edit`: the form with the entry's values; Save returns to detail.
- Strings under `diveLog.logbook.form.*` (labels, sections, choices: weather/current/waves/suit/cylinder/entry/stops/tags) in en/cs/es.
- Tests: `formValuesFromEntry` round-trip with `normalizeEntry`, `gasFromForm`, `formatDuration`, the date filter used for suggestions (pure helper `recordingsOnDate(rows, entries, date)`).

- [ ] Steps: failing tests → implement → `npm test` → headless-Chrome check of the form layout at 390 px and 1280 px using a stub store (no network; e.g. a test-only page is NOT allowed — instead drive `EntryForm` through a temporary HTML file in the scratchpad outside the repo that imports the repo modules via the static server, and delete it afterwards) → commit `feat(logbook): entry form and new-dive flow`.

---

### Task 5: Site picker, dive detail, photos

**Files:** create `js/logbook/SitePicker.js`; modify `js/logbook/photo.js`, `js/logbook/LogbookApp.js`, `js/logbook/EntryForm.js`, `lab/dive-log.html` (CSS), `locales/*.json`, `sw.js`, `tests/logbook.test.mjs`.

**Interfaces:**
- Produces: `openSitePicker({ store, sites, initial? }) → Promise<Site|null>` (full-screen overlay); `loadLeaflet() → Promise<L>` (appends `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js` and `leaflet.css` once); `photo.js`: `readExif(file) → Promise<{ takenAt, lat, lon }>` (loads `https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js` once; failures → nulls), `resizeImage(file) → Promise<{ blob, width, height }>` (createImageBitmap + canvas, `resizeTarget`, JPEG `PHOTO_QUALITY`).

Behaviour:
- **Site picker:** full-screen map (OpenStreetMap tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution "© OpenStreetMap contributors"), existing sites as markers (tap → choose), tap on the map → new pin; "Use my location" (geolocation; denial → message, map stays usable); form below the map: name (required), water (salt/fresh, optional), altitude (optional) → **Save site** (`saveSite`) → returns the site; **Cancel**. Initial view: the existing sites' bounds, else the browser location, else Central Europe (lat 49.8, lon 15.5, zoom 6).
- Enable the form's "Pick on map" button; picking fills the site field.
- **Dive detail** (`#/dive/<id>`): header `#number · date · time`; core fields as a definition list (only filled values; units, `fmtNum`); "More details" filled values grouped; site name + small static Leaflet map when the site has coordinates; photos as a responsive grid (signed URLs), tap → full-screen view with close; video links listed; buttons **Edit**, **Analysis** (only with `recording_id`), **Add photos**, **Add video link**, **Delete** (in-page confirmation panel, never `confirm()`).
- **Add photos:** multi-select file input (`accept="image/jpeg,image/png,image/webp"`, `capture` not set so the phone offers gallery and camera); for each file: unsupported → message `diveLog.logbook.photo.unsupported` ("{0}: save as JPEG first"); else `readExif`, `resizeImage`, `addPhoto`; progress "Uploading {0} / {1}…"; failures per file listed, others continue.
- **Video link:** URL input (must start with `https://`) + optional caption → `addVideoLink`.
- **Delete media:** small remove button on each photo/link with confirmation.
- `sw.js` `STATIC_ASSETS`: add `js/logbook/SitePicker.js` (if not yet).
- Strings under `diveLog.logbook.site.*`, `diveLog.logbook.detail.*`, `diveLog.logbook.photo.*` in en/cs/es.
- Tests: pure helpers only (e.g. `detailRows(entry, t)` building the definition list with units and hiding empty values; `isHttpsUrl`), `readExif`/`resizeImage` are browser-only and covered by the browser check.

- [ ] Steps: failing tests → implement → `npm test` → headless-Chrome check with a stub store (scratchpad page outside the repo): picker renders tiles and places a pin; detail shows grid and buttons; 390 px and 1280 px; no console errors → commit `feat(logbook): site picker, dive detail and photos`.
