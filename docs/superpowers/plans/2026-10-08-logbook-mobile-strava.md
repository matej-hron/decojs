# Logbook phone overhaul + Strava-style feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the logbook list into a Strava-like feed with photo/map/profile visuals and make every logbook screen work on a 360–390 px phone.

**Architecture:** Pure helpers in `js/logbook/feed.js`, `geo.js`, `listViews.js` (tested with node:test); rendering in `LogbookApp.js` and `EntryDetail.js`; all styling in the `<style>` block of `lab/dive-log.html`. No build step, plain ES modules.

**Tech Stack:** Vanilla JS ES modules, node:test + jsdom, Mapy.com REST static map API, Leaflet (existing, detail map only).

**Spec:** `docs/superpowers/specs/2026-10-08-logbook-mobile-strava-design.md`

## Global Constraints

- Do not edit `js/charts/*`. Do not bump the version (`sw.js` CACHE_NAME, `.version-number`). No new HTML files in the repo.
- Number + unit joined with U+00A0 in JS strings; decimal comma in Czech via `fmtNum(value, decimals)` from `js/format.js`.
- Every new UI string exists in `locales/en.json`, `cs.json`, `es.json` under `diveLog.logbook.*` (same key shape).
- Touch targets ≥ 44 px; no horizontal page scroll at 360 px; inputs `font-size: 16px` on phones.
- New `.js` files go into `sw.js` STATIC_ASSETS (pages workflow publishes the whole `js/` folder).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `npm test` green before each commit.

## Review Focus

- Entry with a site that has no position and no recording → feed card renders without a visual, no broken `<img>`.
- Empty `MAPY_API_KEY` → no map URLs at all (profile or nothing). Covered in Task 1 `chooseVisual` test.
- Map image fails to load (key rejected on another origin) → swapped for the profile slot / removed. Task 3 jsdom test fires `error`.
- Czech UI → stats show `18,5 m` with NBSP. Task 1 `feedStats` test.
- Stored view `list` from the old version → opens Feed, not a blank list. Task 1 `migrateView` test.

---

### Task 1: Pure helpers (feed.js, geo.js, listViews.js) — subagent

**Files:**
- Create: `js/logbook/feed.js`
- Modify: `js/logbook/geo.js` (append `mapyStaticMapUrl`), `js/logbook/listViews.js` (append `profileAreaPath`), `sw.js` (add `'./js/logbook/feed.js',` after `listViews.js`)
- Test: `tests/logbook.test.mjs` (new `describe('feed helpers')` at the end)

**Interfaces (produces):**
- `mapyStaticMapUrl({lat, lon, apiKey, width, height, zoom = 12, scale = 1, lang = 'en', mapset = 'outdoor', color = '#2980b9'}) → string|''`
- `profileAreaPath(samples, width, height, pad = 2) → string` (closed path, '' when sparklinePath is '')
- `diveTitle(entry, siteName, t) → string` — siteName, else `t('feed.untitled')` with `{0}` = log number, else `t('feed.untitledNoNumber')`
- `feedStats(entry, num) → {key, value, unit}[]` keys in order `depth, duration, avgDepth, temp, gas`; units `'m'`, `'min'`, `'m'`, `'°C'`, `''`
- `chooseVisual({photoUrl, site, apiKey, recordingId}) → {kind: 'photo'|'map'|'profile'|'none'}`
- `logbookTotals(entries) → {count, seconds, maxDepth|null}`
- `formatTotalTime(seconds, num) → string` (`'0 h'`, `'4,5 h'`, `'41 h'`; NBSP before h; one decimal below 10 h)
- `migrateView(stored) → 'feed'|'tiles'|'table'`
- `photoIndex(media) → Map<entryId, {path, count}>` (first photo with a path, count of photos with a path)
- `FEED_VIEWS = ['feed', 'tiles', 'table']`

- [ ] **Step 1: Write the failing tests** (append to `tests/logbook.test.mjs`; add imports at the top)

```js
import { diveTitle, feedStats, chooseVisual, logbookTotals, formatTotalTime, migrateView, photoIndex, FEED_VIEWS } from '../js/logbook/feed.js';
import { mapyStaticMapUrl } from '../js/logbook/geo.js';
// add profileAreaPath to the existing listViews import

describe('feed helpers', () => {
    const NB = ' ';
    const num = (v, d) => v.toFixed(d).replace('.', ',');
    test('mapyStaticMapUrl builds a centred marker map; empty without key or position', () => {
        const u = new URL(mapyStaticMapUrl({ lat: 50.08, lon: 14.4, apiKey: 'k y', width: 600, height: 300, scale: 2, lang: 'cs' }));
        assert.equal(u.origin + u.pathname, 'https://api.mapy.com/v1/static/map');
        assert.equal(u.searchParams.get('lon'), '14.4');
        assert.equal(u.searchParams.get('lat'), '50.08');
        assert.equal(u.searchParams.get('zoom'), '12');
        assert.equal(u.searchParams.get('width'), '600');
        assert.equal(u.searchParams.get('height'), '300');
        assert.equal(u.searchParams.get('scale'), '2');
        assert.equal(u.searchParams.get('mapset'), 'outdoor');
        assert.equal(u.searchParams.get('lang'), 'cs');
        assert.equal(u.searchParams.get('format'), 'jpg');
        assert.equal(u.searchParams.get('markers'), 'color:#2980b9;size:normal;14.4,50.08');
        assert.equal(u.searchParams.get('apikey'), 'k y');
        assert.equal(mapyStaticMapUrl({ lat: 50, lon: 14, apiKey: '', width: 10, height: 10 }), '');
        assert.equal(mapyStaticMapUrl({ lat: null, lon: 14, apiKey: 'k', width: 10, height: 10 }), '');
        assert.equal(new URL(mapyStaticMapUrl({ lat: 1, lon: 2, apiKey: 'k', width: 5000, height: 3, lang: 'de' })).searchParams.get('width'), '1024');
        assert.equal(new URL(mapyStaticMapUrl({ lat: 1, lon: 2, apiKey: 'k', width: 5000, height: 3, lang: 'xx' })).searchParams.get('lang'), 'en');
    });
    test('profileAreaPath closes the profile along the surface', () => {
        const p = profileAreaPath([{ t: 0, depth: 0 }, { t: 60, depth: 10 }, { t: 120, depth: 0 }], 100, 50);
        assert.match(p, /^M.* Z$/);
        assert.equal(profileAreaPath([], 100, 50), '');
    });
    test('diveTitle prefers the site name', () => {
        const t = k => ({ 'feed.untitled': 'Dive #{0}', 'feed.untitledNoNumber': 'Dive' }[k]);
        assert.equal(diveTitle({ log_number: 7 }, 'Lahošť', t), 'Lahošť');
        assert.equal(diveTitle({ log_number: 7 }, null, t), 'Dive #7');
        assert.equal(diveTitle({ log_number: null }, '', t), 'Dive');
    });
    test('feedStats formats with the given number formatter and NBSP, skipping missing values', () => {
        const s = feedStats({ max_depth_m: 18.5, duration_s: 2535, water_temp_c: 4.8, gas: { o2: 0.32, he: 0 }, details: { avgDepthM: 9.04 } }, num);
        assert.deepEqual(s, [
            { key: 'depth', value: '18,5', unit: 'm' }, { key: 'duration', value: '42:15', unit: 'min' },
            { key: 'avgDepth', value: '9,0', unit: 'm' }, { key: 'temp', value: '4,8', unit: '°C' },
            { key: 'gas', value: 'EAN32', unit: '' },
        ]);
        assert.deepEqual(feedStats({ details: {} }, num), []);
        assert.deepEqual(feedStats({ max_depth_m: 0, details: null }, num), [{ key: 'depth', value: '0,0', unit: 'm' }]);
    });
    test('chooseVisual: photo, then map, then profile, then none', () => {
        const site = { lat: 50, lon: 14 };
        assert.equal(chooseVisual({ photoUrl: 'x', site, apiKey: 'k', recordingId: 'r' }).kind, 'photo');
        assert.equal(chooseVisual({ site, apiKey: 'k', recordingId: 'r' }).kind, 'map');
        assert.equal(chooseVisual({ site, apiKey: '', recordingId: 'r' }).kind, 'profile');
        assert.equal(chooseVisual({ site: { lat: null, lon: 14 }, apiKey: 'k', recordingId: 'r' }).kind, 'profile');
        assert.equal(chooseVisual({ site: null, apiKey: 'k', recordingId: null }).kind, 'none');
    });
    test('logbookTotals and formatTotalTime', () => {
        const t = logbookTotals([{ duration_s: 3600, max_depth_m: 20 }, { duration_s: null, max_depth_m: 41.5 }, { duration_s: 1800 }]);
        assert.deepEqual(t, { count: 3, seconds: 5400, maxDepth: 41.5 });
        assert.deepEqual(logbookTotals([]), { count: 0, seconds: 0, maxDepth: null });
        assert.equal(formatTotalTime(5400, num), `1,5${NB}h`);
        assert.equal(formatTotalTime(0, num), `0${NB}h`);
        assert.equal(formatTotalTime(41 * 3600 + 1000, num), `41${NB}h`);
    });
    test('migrateView maps the old list view to the feed', () => {
        assert.equal(migrateView('list'), 'feed');
        assert.equal(migrateView('table'), 'table');
        assert.equal(migrateView('tiles'), 'tiles');
        assert.equal(migrateView(null), 'feed');
        assert.equal(migrateView('bogus'), 'feed');
        assert.deepEqual(FEED_VIEWS, ['feed', 'tiles', 'table']);
    });
    test('photoIndex keeps the first photo with a path and counts them', () => {
        const idx = photoIndex([
            { entry_id: 'a', path: null }, { entry_id: 'a', path: 'a1' }, { entry_id: 'a', path: 'a2' }, { entry_id: 'b', path: 'b1' },
        ]);
        assert.deepEqual(idx.get('a'), { path: 'a1', count: 2 });
        assert.deepEqual(idx.get('b'), { path: 'b1', count: 1 });
        assert.equal(idx.has('c'), false);
    });
});
```

- [ ] **Step 2: Run** `node --test tests/logbook.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement.** `geo.js` (append):

```js
const MAPY_STATIC_LANGS = ['cs', 'de', 'el', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'sk', 'tr', 'uk'];
const clampPx = n => Math.min(1024, Math.max(10, Math.round(Number(n) || 10)));

/**
 * Mapy.com static map (v1/static/map) centred on a site with one marker. The image carries the Mapy.com
 * logo and attribution itself. '' without a key or a valid position.
 */
export function mapyStaticMapUrl({ lat, lon, apiKey, width, height, zoom = 12, scale = 1, lang = 'en', mapset = 'outdoor', color = '#2980b9' }) {
    if (!apiKey || lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return '';
    const params = new URLSearchParams({
        lon: String(lon), lat: String(lat), zoom: String(zoom), width: String(clampPx(width)), height: String(clampPx(height)),
        scale: String(scale >= 2 ? 2 : 1), mapset, lang: MAPY_STATIC_LANGS.includes(lang) ? lang : 'en', format: 'jpg',
        markers: `color:${color};size:normal;${lon},${lat}`, apikey: apiKey,
    });
    return `${MAPY_BASE}/static/map?${params}`;
}
```

`listViews.js` (append):

```js
/** The sparkline path closed along the surface, for a filled "water column". '' when there is nothing to draw. */
export function profileAreaPath(samples, width, height, pad = 2) {
    const line = sparklinePath(samples, width, height, pad);
    if (!line) return '';
    const r = n => Math.round(n * 10) / 10;
    return `${line} L${r(width - pad)},${r(pad)} L${r(pad)},${r(pad)} Z`;
}
```

`feed.js`:

```js
/**
 * Pure helpers of the logbook feed: card titles and stats, the visual of a dive, totals, view names.
 * No DOM, no network.
 */

import { formatDuration } from './entryModel.js';
import { gasLabel } from './listViews.js';

const NB = ' ';
const has = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

/** Views of the dive list; the first is the default. */
export const FEED_VIEWS = Object.freeze(['feed', 'tiles', 'table']);

/** A stored view name of this or an older version ('list' became 'feed'). */
export function migrateView(stored) {
    if (stored === 'list') return 'feed';
    return FEED_VIEWS.includes(stored) ? stored : FEED_VIEWS[0];
}

/** Card title: the site name, else "Dive #n", else "Dive". `t(key)` looks up below `diveLog.logbook.`. */
export function diveTitle(entry, siteName, t) {
    if (siteName && String(siteName).trim()) return String(siteName).trim();
    return has(entry?.log_number) ? fill(t('feed.untitled'), entry.log_number) : t('feed.untitledNoNumber');
}

/**
 * The stat row of a card: max depth, duration (m:ss), average depth, water temperature, gas. Missing values are left out.
 * @param {(value: number, decimals: number) => string} num - number formatter (decimal comma in Czech)
 * @returns {{key: string, value: string, unit: string}[]}
 */
export function feedStats(entry, num) {
    const out = [];
    if (has(entry.max_depth_m)) out.push({ key: 'depth', value: num(Number(entry.max_depth_m), 1), unit: 'm' });
    if (has(entry.duration_s)) out.push({ key: 'duration', value: formatDuration(entry.duration_s), unit: 'min' });
    const avg = entry.details?.avgDepthM;
    if (has(avg)) out.push({ key: 'avgDepth', value: num(Number(avg), 1), unit: 'm' });
    if (has(entry.water_temp_c)) out.push({ key: 'temp', value: num(Number(entry.water_temp_c), 1), unit: '°C' });
    const gas = gasLabel(entry.gas);
    if (gas) out.push({ key: 'gas', value: gas, unit: '' });
    return out;
}

const positioned = site => site && site.lat !== null && site.lon !== null && Number.isFinite(site.lat) && Number.isFinite(site.lon);

/** Which visual a dive gets: its first photo, else a map of its site, else its depth profile, else none. */
export function chooseVisual({ photoUrl = null, site = null, apiKey = '', recordingId = null } = {}) {
    if (photoUrl) return { kind: 'photo' };
    if (apiKey && positioned(site)) return { kind: 'map' };
    if (recordingId) return { kind: 'profile' };
    return { kind: 'none' };
}

/** Dive count, total time in seconds and deepest depth of the logbook. */
export function logbookTotals(entries) {
    let seconds = 0;
    let maxDepth = null;
    for (const e of entries ?? []) {
        if (has(e.duration_s)) seconds += Number(e.duration_s);
        if (has(e.max_depth_m)) maxDepth = maxDepth === null ? Number(e.max_depth_m) : Math.max(maxDepth, Number(e.max_depth_m));
    }
    return { count: entries?.length ?? 0, seconds, maxDepth };
}

/** Total time in hours: one decimal below 10 h, whole hours above ("4,5 h", "41 h"). */
export function formatTotalTime(seconds, num) {
    const h = (Number(seconds) || 0) / 3600;
    if (h === 0) return `0${NB}h`;
    return `${h < 10 ? num(h, 1) : num(Math.round(h), 0)}${NB}h`;
}

/** Map(entryId -> {path, count}) from photo media rows (oldest first): the first photo with a path and how many there are. */
export function photoIndex(media) {
    const out = new Map();
    for (const m of media ?? []) {
        if (!m?.path) continue;
        const cur = out.get(m.entry_id);
        if (cur) cur.count++;
        else out.set(m.entry_id, { path: m.path, count: 1 });
    }
    return out;
}
```

- [ ] **Step 4: Run** `node --test tests/logbook.test.mjs` → PASS; then `npm test` → all green.
- [ ] **Step 5: Commit** `feat(logbook): pure helpers for the dive feed (titles, stats, visuals, totals, static map URL)`.

---

### Task 2: Locale strings — subagent (same as Task 1, before the UI)

**Files:** `locales/en.json`, `locales/cs.json`, `locales/es.json` (only `diveLog.logbook`).

Replace `views.list` with `views.feed` and add the keys below (values en / cs / es). Literal U+00A0 where a number meets a unit (none here: `{0}` placeholders carry their own units).

| key | en | cs | es |
|---|---|---|---|
| views.feed | Feed | Přehled | Resumen |
| feed.untitled | Dive #{0} | Ponor č. {0} | Inmersión n.º {0} |
| feed.untitledNoNumber | Dive | Ponor | Inmersión |
| feed.stats.depth | Max depth | Max. hloubka | Prof. máx. |
| feed.stats.duration | Time | Čas | Tiempo |
| feed.stats.avgDepth | Avg depth | Prům. hloubka | Prof. media |
| feed.stats.temp | Water | Voda | Agua |
| feed.stats.gas | Gas | Plyn | Gas |
| feed.morePhotos | {0} more photos | Další fotky: {0} | {0} fotos más |
| feed.mapAlt | Map of {0} | Mapa: {0} | Mapa de {0} |
| feed.profileAlt | Depth profile | Hloubkový profil | Perfil de profundidad |
| bar.title | Your dives | Moje ponory | Mis inmersiones |
| bar.more | More actions | Další akce | Más acciones |
| bar.timeUnderwater | {0} underwater | {0} pod vodou | {0} bajo el agua |
| bar.deepest | deepest {0} | nejhlubší {0} | máx. {0} |

- [ ] Add a test in `describe('form strings')` style: the three locale files have the same key shape under `diveLog.logbook` (if not already covered) and `views.list` is gone, `views.feed` exists.
- [ ] `npm test` green; commit `i18n(logbook): strings for the dive feed and compact bar`.

---

### Task 3: Feed, tiles, table and compact bar in LogbookApp — main session (needs browser iteration)

**Files:** `js/logbook/LogbookApp.js`, `lab/dive-log.html` (style block), `tests/logbook.test.mjs`.

- `VIEWS` → `FEED_VIEWS`; `loadView()` → `migrateView(localStorage.getItem(VIEW_KEY))`.
- `_showList`: store `this.photos = photoIndex(photos)`; thumbs map from `photos.get(id).path`.
- `_visual(entry, variant)` (`variant` 'feed'|'tile'): photo `<img class="lb-visual-img">` (+ `.lb-more-photos` chip "+n" with aria-label `feed.morePhotos`), map `<img class="lb-visual-img lb-map-img" data-rec="…">` from `mapyStaticMapUrl` (feed 640×320, tile 320×240, `scale` = devicePixelRatio ≥ 2 ? 2 : 1, `lang` = currentLang()), profile `<span class="lb-spark" data-rec data-area>`; tile 'none' shows the depth number.
- `_feedCard(entry)` per spec D2; `_tile(entry)` per D5; month grouping from `groupByMonth` used by Feed.
- Spark loader stores `{line, area}` paths at 300×100 and paints area slots as gradient-filled water column with a surface line.
- Capturing `error` listener on `this.view` for `.lb-map-img`: replace with profile slot if `data-rec`, else remove the visual, then `_watchSparks()`.
- `_renderBar()` per D7 (ids `#lb-upload`, `#lb-export`, `#lb-sites`, `#lb-logout` kept); `document.body.classList.toggle('lb-in', true)` in `_enterLogbook`, removed in `_leaveLogbook`.
- Select bar per D8 (ids kept); class `lb-selecting` on `.lb-root` hides the FAB.
- Tests: update the select-mode test (`data-view="list"` → `"feed"`, `.lb-dive-row` → `.lb-feed-card`); new jsdom test: an entry at a positioned site renders `img.lb-map-img` whose src starts with `https://api.mapy.com/v1/static/map`; an entry with a photo renders the photo and `+1` chip when it has two; firing `error` on the map image of an entry with a recording swaps in `.lb-spark`.
- Verify in the harness at 390 px and 1280 px, light and dark; commit.

### Task 4: Dive detail — main session

**Files:** `js/logbook/EntryDetail.js`, `lab/dive-log.html`.

- Top row: back link + Edit (`.lb-d-top`); title `diveTitle` in Fraunces; sub-line number/date/time; stat grid using `feedStats` labels + detail-only rows (visibility, surface temp, buddies) from `detailRows` (unchanged, tested).
- Photos grid 3 columns at ≤ 480 px; actions grid 2 columns on phones, Delete in its own row.
- Keep ids `#lb-add-photos`, `#lb-add-video`, `#lb-delete`. Verify in harness; commit.

### Task 5: Forms, new dive, sites, site picker, analysis entry — main session

**Files:** `lab/dive-log.html` (CSS), small markup tweaks in `EntryForm.js` / `NewDive.js` / `SitesPage.js` / `SitePicker.js` only where CSS cannot reach.

- `@media (max-width: 720px)`: inputs 16 px, `.lb-actions .btn` flex 1 1 auto full width, picker bar padding with `env(safe-area-inset-*)`, FAB `bottom: calc(1rem + env(safe-area-inset-bottom))`, hero compact under `body.lb-in`.
- Check each screen at 360/390 px for horizontal overflow with `document.documentElement.scrollWidth > innerWidth`.
- Commit.

### Task 6: Whole-branch review, PR, REPORT.md

- Opus reviewer subagent over `git diff origin/main...HEAD`; fix findings.
- `npm test`, `node scripts/build-pages.mjs` into scratchpad; push (`gh auth switch --user matej-hron`), open PR to main (no auto-merge, no merge), write `REPORT.md` (untracked) with changes, screenshot paths, known gaps.
