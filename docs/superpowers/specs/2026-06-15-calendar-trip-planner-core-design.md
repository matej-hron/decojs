# Calendar Trip Planner — Sub-project ③-core: Editable Calendar + Per-Dive Gases

**Date:** 2026-06-15
**Status:** Approved design, ready for implementation planning
**Depends on:** Sub-projects ① (`planTrip` engine) and ② (overview + seeded detail view), branch `feat/repetitive-dive-detail-view`.

## Background & Motivation

Sub-projects ① and ② built the decompression engine and the rich per-dive output
(overview panels + seeded detail view), but the trip's *input* is still a hardcoded
`dives` array in `sandbox/repetitive-dives.html`. This sub-project replaces that
with an **editable visual calendar**: the user builds a trip by creating dives on a
day/time grid, edits each dive's depth/bottom-time/gases, and sees the chained
result (deco growth, surface intervals, conflicts, detail view) update live.

This is the *input* side that produces the `dives` array `planTrip` consumes. It
turns the demo into a tool you can plan a real repetitive trip with.

## Split (this is ③-core; ③-rich follows)

The full calendar planner was split to keep each plan digestible:

- **③-core (this spec):** per-dive-gas engine change, a pure trip-state reducer, the
  duration-spanning calendar render with conflicts, create/edit dives via a reused
  editor, and full page wiring + trip config. Usable end-to-end. Rescheduling is
  done by editing a dive's start date/time field.
- **③-rich (next spec):** pointer drag-to-reschedule, day-management polish, the
  **dive-chart display-mode toggles** (tissue loading / partial pressures /
  consumption / etc. in the detail view), and optional URL persistence of a trip.

## Goals (③-core)

- Build/edit a trip on a visual calendar: create dives, edit depth/bottom-time/gases,
  set each dive's date+time, remove dives.
- Per-dive gases (each dive can use different gases).
- Duration-spanning calendar blocks; surface intervals visible as gaps; overlap
  conflicts shown in red.
- The existing overview + seeded detail view update live from the edited trip;
  clicking a calendar block opens that dive's detail view.

## Non-goals (deferred to ③-rich or later)

- Pointer drag-to-reschedule (③-core reschedules via the edit panel's datetime field).
- Dive-chart display-mode toggles in the detail view (③-rich).
- URL persistence / shareable trips (③-rich or later).
- Per-dive GF (GF stays trip-shared; it is a personal constant).
- Order optimisation (a later sub-project).

## Data Model + Engine Change

A trip dive gains a per-dive gas list:

```js
dives: [
  { id, startDateTime /* epoch minutes */, maxDepth, bottomTime, gases: [ {id,name,o2,n2,he,...}, ... ] }
]
// trip top-level: gfLow, gfHigh (shared), plus sacRate/decoSacRate defaults, and a
// default gas list used when a new dive is created.
```

**`planTrip` change (`js/tripPlanner.js`):** today it reads one shared
`diveSetup.gases` and passes it to every dive's `generateDecoProfile` /
`calculateTissueLoading`. Change it to use `dive.gases ?? diveSetup.gases` per dive.
The tissue carryover and surface off-gassing (always on air, `N2_FRACTION`) are
unchanged. This is small because both model functions already take a `gases`
argument per call. Unit-tested: a trip with different gases per dive → each dive's
deco/loading reflects its own gas (e.g. a dive on EAN32 has a different NDL/deco
than the same profile on air).

## Trip State Reducer — `js/tripState.js` (new, pure)

A pure module operating on a trip object (no DOM). Every operation returns a NEW
trip (immutable update) whose `dives` array is ready for `planTrip`:

- `addDive(trip, { startDateTime, maxDepth, bottomTime, gases }) → trip` — assigns a
  stable unique `id`.
- `editDive(trip, id, patch) → trip` — patch any of `startDateTime`/`maxDepth`/
  `bottomTime`/`gases`.
- `removeDive(trip, id) → trip`.
- `rescheduleDive(trip, id, startDateTime) → trip` — convenience over `editDive`.

Dives are kept sorted by `startDateTime` on read (or `planTrip` sorts — keep one
canonical place). This reducer is where future reshuffle/optimiser logic hooks in.
**Fully unit-tested** (add assigns id; edit updates fields; remove drops by id;
ids stable across edits; reschedule reorders).

## Calendar Component — `js/components/TripCalendar.js` (new)

Renders day columns over a vertical time axis and emits interaction events; it does
not own trip state (the page does) — it renders from `planTrip` results + the trip.

- **Layout:** one column per day present in the trip, plus one empty "next day"
  column to create into. Vertical axis is a fixed window (default 06:00–20:00);
  overnight between days is implied, not drawn to scale. (Dives outside the window
  are clamped/scrolled — a planning detail.)
- **Blocks:** each dive is a **duration-spanning block** positioned by
  `startDateTime`, height ∝ `endDateTime − startDateTime` (from the `planTrip`
  result for that dive). The block shows id, depth, deco. Surface intervals are the
  visible gaps. **Overlap conflicts** (from `planTrip().conflicts`) render the
  affected block(s) red.
- **Events emitted:** `createAt(day, minutesOfDay)` (click empty area),
  `selectDive(id)` (click a block). The page handles these via the reducer.
- Pure-ish: given a trip + `planTrip` result, render is deterministic. No drag in
  ③-core.

## Per-Dive Edit Panel (reuses `DiveSetupEditor`)

Clicking a block selects the dive and opens an edit panel (side panel or modal):

- A **start date + time** input (the trip's per-dive `startDateTime`; the editor has
  no datetime concept, so this lives in the panel wrapper).
- A **`DiveSetupEditor`** instance configured to the minimum needed:
  `showQuickSetup: true` (depth + bottom-time), gas management on, and
  `showMultiDive`/`showSurfaceInterval`/`showGradientFactors`/`showProfiles` OFF
  (GF is trip-level; multi-dive/surface-interval are owned by the calendar).
- On the editor's `change` event, read `getDiveSetup()` and extract
  `maxDepth`/`bottomTime` (from its quick-setup inputs) + `gases`; combine with the
  panel's datetime → `editDive(trip, id, {...})` → re-run `planTrip` → re-render
  calendar + overview/detail.
- A "remove dive" control → `removeDive`.

(Exact extraction of maxDepth/bottomTime from the editor's output, and whether to
read its quick inputs vs derive from emitted waypoints, is a planning-time detail.)

## Wiring + Trip Config — `sandbox/repetitive-dives.html`

- The hardcoded `setup.dives` is replaced by a trip held in page state, edited
  through the calendar + edit panel via `tripState`.
- **Trip-config bar:** shared `gfLow`/`gfHigh`, `sacRate`/`decoSacRate` defaults, and
  the default gas list for new dives. (A simple set of inputs; can reuse small
  pieces of the editor or be bespoke — planning detail.)
- On ANY trip change: re-run `planTrip`, re-render the calendar, and re-render the
  existing overview panels. Clicking a calendar block (or an overview panel) opens
  the **existing seeded detail view** (unchanged from ②).
- Seed a sensible default trip on first load (e.g. the current 3×40 m dives) so the
  page isn't empty.

## Testing

- **Unit (`tests/run-tests.mjs`):**
  - `planTrip` per-dive gases: a 2-dive trip where dive 1 uses air and dive 2 uses
    EAN32 (same depth/time) → the two dives' deco/NDL differ as expected; a trip
    with no per-dive `gases` still falls back to `diveSetup.gases` (unchanged
    behaviour — existing tests stay green).
  - `tripState`: add/edit/remove/reschedule produce the expected `dives` array
    (id assignment, field updates, id stability, ordering).
- **Regression:** existing suite stays green (the `planTrip` change is a fallback,
  so trips without per-dive gases behave identically).
- **Browser smoke (mandatory):** load the page; create a dive on the calendar; edit
  its depth/time/gas; confirm the block resizes and the overview/detail update;
  create an overlapping dive and confirm the conflict block renders red; click a
  block and confirm the seeded detail view opens; remove a dive. Zero console errors.

## Integration / Versioning

- New modules (`js/tripState.js`, `js/components/TripCalendar.js`) added to
  `STATIC_ASSETS` in `sw.js`; `DiveSetupEditor.js` added too if not already cached.
- Bump `CACHE_NAME` in `sw.js` and `.version-number::after` in `css/styles.css` to
  the same new version.
- Wiki: add `js/tripState.js` and `js/components/TripCalendar.js` to
  `Module-Reference.md`; note `planTrip`'s per-dive `gases` support.

## Build Order

1. `planTrip` per-dive gases (+ test) — tiny, foundational, default-preserving.
2. `js/tripState.js` reducer (+ tests) — pure.
3. `js/components/TripCalendar.js` render (duration blocks, day columns, conflicts) —
   read-only from `planTrip`; browser smoke for layout.
4. Per-dive edit panel (reuse `DiveSetupEditor`) + create/remove wiring.
5. Wire the calendar + trip-config bar into the page, replacing hardcoded dives;
   keep overview/detail working; browser smoke; version/sw.js; wiki.

## Open Questions / To Settle During Planning

- Exact extraction of `maxDepth`/`bottomTime` from `DiveSetupEditor` output (read its
  quick inputs vs derive from waypoints).
- Calendar time-window handling for dives outside the default 06:00–20:00 window
  (clamp, scroll, or auto-fit).
- Whether the trip-config bar reuses `DiveSetupEditor` pieces or is bespoke.
