# Repetitive-Dive Trip Planner — URL Persistence (shareable trips)

**Date:** 2026-06-16
**Status:** Approved design, ready for implementation planning
**Depends on:** the calendar trip planner, branch `feat/calendar-trip-planner-core`.

## Background & Motivation

The repetitive-dive planner's trip lives only in page memory — a reload loses it and
there's no way to share a planned trip. DecoJS already shares single dives by encoding
the setup into a URL param (`js/urlParams.js`: `encodeDiveSetup`/`decodeDiveSetup`,
`updateUrlWithProfile` via `history.replaceState`, decode-on-load). This applies the
same pattern to the whole trip: the address bar becomes a live, shareable,
reload-surviving link, plus a "Copy trip link" button.

## Goals

- Editing a trip keeps the `?trip=` URL param in sync (address bar = shareable link).
- Reloading (or opening a shared link) restores the exact trip.
- A "Copy trip link" button for convenience.
- Encode/decode are pure and unit-tested; malformed links degrade gracefully.

## Non-goals

- Server-side storage / short links (the URL itself is the store).
- Drag-to-reschedule, the order optimizer (separate ③-rich items).
- Migrating the single-dive `urlParams.js` scheme — trips get their own module.

## A. `js/tripUrl.js` (new)

Encode/decode are pure (no DOM); the URL get/update functions touch `window`/`history`.

- **`encodeTrip(trip) → string`** — build a MINIMAL plain object and base64-encode its
  JSON (URL-safe), mirroring `encodeDiveSetup` (`btoa(unescape(encodeURIComponent(json)))`).
  Minimal shape:
  ```js
  {
    startDate, dayCount, gfLow, gfHigh,
    gases: [ { id, name, o2, n2, he }, ... ],   // trip-level shared gases, minimal
    dives: [ { name, startDateTime, maxDepth, bottomTime, gases? }, ... ]
  }
  ```
  A dive's `gases` is **omitted when it deep-equals the trip-level `gases`** (most trips
  share one gas → compact URL); when a dive uses different gas, its minimal gas list is
  stored inline. Dive `id` is NOT encoded (re-assigned on decode by `tripState`/the page).
- **`decodeTrip(str) → trip | null`** — base64-decode + `JSON.parse`; reconstruct the
  trip, filling each dive's `gases` from the trip-level set when omitted, and assigning
  fresh stable ids (`d1`, `d2`, …) in order. Returns `null` on ANY error (bad base64,
  bad JSON, missing required fields) so callers fall back to the default.
- **`getTripFromUrl() → trip | null`** — read the `?trip=` param from
  `window.location.search`; `decodeTrip` it (null if absent/invalid).
- **`updateUrlWithTrip(trip)`** — set `?trip=encodeTrip(trip)` on the URL via
  `history.replaceState` (no new history entry), exactly like `updateUrlWithProfile`.
- **`getTripShareUrl(trip) → string`** — the absolute URL (origin + path + `?trip=…`)
  for the Copy button.

Note: ids are intentionally not round-tripped — they're internal identity for
reshuffling within a session; on decode we re-mint them deterministically (`d1…dN`),
which is sufficient because the calendar/edit panel key off whatever ids the loaded
trip has.

## B. Page wiring — `sandbox/repetitive-dives.html`

- **On load:** before the first `rerender()`, do `const urlTrip = getTripFromUrl();
  if (urlTrip) trip = urlTrip;`. If null, keep the existing hardcoded default trip.
- **On every change:** call `updateUrlWithTrip(trip)` inside `rerender()` (which already
  runs for add/edit/remove/config; edits flow through the debounced `rerenderDeferred →
  rerender`, so the URL settles shortly after typing stops). Pure selection (`selectDive`)
  also calls `rerender()` but the trip is unchanged, so the URL write is idempotent.
- **Copy button:** add a "Copy trip link" control to the trip-config bar →
  `navigator.clipboard.writeText(getTripShareUrl(trip))`, then briefly show "Copied!"
  (revert after ~1.5 s). Guard for environments without `navigator.clipboard`.

## C. Robustness / edge cases

- Malformed or legacy `?trip=` → `decodeTrip` returns null → default trip, no crash.
- Minimal gas encoding (no `cylinderVolume`/`startPressure`) is fine: the chart's
  `normalizeDiveSetup` re-applies cylinder defaults, so gas-consumption still renders
  after a reload.
- Empty trip (`dives: []`) encodes/decodes cleanly.
- URL length: a few dives of base64 JSON is well under practical URL limits; the
  per-dive-gas-omission keeps shared-gas trips compact. (No compaction beyond that for
  v1 — YAGNI.)

## D. Testing

- **Unit (`tests/run-tests.mjs`):**
  - Round-trip: `decodeTrip(encodeTrip(trip))` reproduces `startDate`, `dayCount`,
    `gfLow/High`, the dives' `name/startDateTime/maxDepth/bottomTime`, and gases — for
    a trip where all dives share the trip gas (per-dive gases omitted then refilled) AND
    a trip where one dive uses a different gas (inline).
  - `decodeTrip('not-valid')` and `decodeTrip('')` return `null`.
  - Decoded dives have fresh sequential ids (`d1`, `d2`, …).
- **Browser smoke (mandatory):** rename a dive, change GF Low, add a dive → the `?trip=`
  param updates; **reload the page** → the trip is restored (same names/GF/dives); the
  "Copy trip link" button copies a URL containing `?trip=`; opening that URL in a fresh
  context reconstructs the trip; zero console errors.

## E. Integration / Versioning

- Add `js/tripUrl.js` to `STATIC_ASSETS` in `sw.js`; bump `CACHE_NAME` and
  `css/styles.css` `.version-number::after` to the same new version.
- Wiki: add a `js/tripUrl.js` entry to `Module-Reference.md`.

## Build Order

1. `js/tripUrl.js` — `encodeTrip`/`decodeTrip` (+ round-trip & failure unit tests).
2. `getTripFromUrl`/`updateUrlWithTrip`/`getTripShareUrl` (thin window/history wrappers).
3. Page: decode-on-load + `updateUrlWithTrip` in `rerender` + Copy button; browser smoke;
   version bump + `sw.js`.
4. Wiki.

## Open Questions / To Settle During Planning

- Exact param name (`trip`) and whether to also accept the param on the page's nav link.
- Copy-button placement/label in the trip-config bar.
