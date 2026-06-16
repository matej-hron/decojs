# Calendar Trip Planner — Calendar UX: Real Dates, Hour Grid, Add-Dive Dialog

**Date:** 2026-06-15
**Status:** Approved design, ready for implementation planning
**Depends on:** Sub-project ③-core (the editable calendar), branch `feat/calendar-trip-planner-core`.

## Background & Motivation

③-core delivered a working editable calendar, but testing surfaced UX gaps: the
day columns are derived from the dives plus a phantom "next day" column (so a
single-day trip surprisingly showed Jan 1 + Jan 2), the columns are blank white
boxes with no hour markings, and adding a dive drops a default 40 m/30 min block
that must then be edited. This refinement makes the calendar look and behave like a
real calendar and replaces the create flow with a proper dialog — including a
**pre-saturation-aware NDL** that makes the repetitive-diving lesson interactive.

## Goals

- A real **date model**: trip start date + number of days; day columns show real
  dates; no phantom column.
- A calendar **look**: a time ruler with hour labels and hour gridlines per day.
- An **add-dive dialog** with two modes: *Custom* (depth + bottom-time) and
  *No-deco* (depth → bottom-time computed as the NDL, displayed read-only).
- The NDL shown is the **pre-saturation-aware** NDL for the dive's position in the
  trip (a later dive's NDL is shorter than a first dive's at the same depth).

## Non-goals (still ③-rich or later)

- Drag-to-reschedule (③-rich).
- Dive-chart display-mode toggles (③-rich).
- URL persistence of a trip (③-rich/later).
- Per-dive GF (trip-shared).
- MOD enforcement / gas validity in the dialog (the gas list is whatever the trip
  default is; deco consequences show on the calendar).

## A. Trip date model

The trip gains two display/structure fields:

```js
trip = { startDate: 'YYYY-MM-DD', dayCount: 3, gases, gfLow, gfHigh,
         dives: [ { id, startDateTime, maxDepth, bottomTime, gases }, ... ] }
```

- **`startDateTime` stays minutes-from-trip-start** (base = day 0, 00:00). `startDate`
  is a *display anchor* only: a column's real date = `startDate + dayIndex` days. So
  changing `startDate` relabels headers without moving any dive. `dayCount` sets how
  many columns render.
- `dayCount` must be at least `max(dive day) + 1`; an "add day" control increments it.
  Removing the last day is allowed only if it holds no dives (or clamps to the last
  occupied day).
- The edit panel's epoch↔datetime-local mapping (`DiveEditPanel`, currently a fixed
  `BASE = Jan 1 2026`) is re-based on the trip's `startDate` so the panel's date
  matches the column the dive sits in.

## B. Hour grid + calendar look — `js/components/TripCalendar.js`

Render changes (the pure `computeCalendarLayout` is unchanged except it takes an
explicit `dayCount` — see below):

- A left **time-ruler** column: hour labels for each hour in the visible window
  (default `06:00–20:00`), aligned to the same percentage scale as the blocks.
- Each **day column**: a **date header** (`startDate + dayIndex`, formatted e.g.
  "Mon 15 Jun") at top; **horizontal hour gridlines** behind the blocks; blocks
  positioned as today (`topPct`/`heightPct`).
- Pure-layout change: `computeCalendarLayout(planResult, windowConfig)` gains
  `windowConfig.dayCount` and renders exactly that many columns with `baseDay = 0`
  (trip-relative), instead of deriving `dayCount`/`baseDay` from the dives. Update
  its tests accordingly (a trip with 1 dive but `dayCount: 3` → 3 columns).

## C. Add-dive dialog — `js/components/AddDiveDialog.js` (new)

Triggered by clicking an empty time slot (the existing `createAt` event carries the
clicked `dayIndex` + snapped `minutesOfDay`). The page opens the dialog pre-filled
with that day + time. Contents:

- **Max depth** (number input) and **gas** (defaults to the trip gas; for v1 a
  read-only label or a simple select of the trip's gases).
- **Mode toggle:**
  - *Custom time* → an editable **bottom-time** input.
  - *No-deco* → bottom time is the computed **NDL** (read-only display, "Bottom time
    = NDL N min").
- A live **NDL readout** for `(startDateTime, maxDepth, gas)` at this trip position
  (see D). In *Custom* mode it's shown as guidance with a "⚠ deco (exceeds NDL)"
  warning when the entered time > NDL.
- **Add** → emits `add` with `{ startDateTime, maxDepth, bottomTime, gases }` (the
  page calls `addDive` + `rerender`); **Cancel** closes.

The dialog is dumb about trip physics: the page injects a
`computeNdl(startDateTime, maxDepth, gases) → minutes` callback so the dialog stays
decoupled from `planTrip`.

## D. Engine: pre-saturation-aware NDL

**Seam — `calculateNDL` (`js/decoModel.js:599`).** Add an optional 4th parameter
`initialTissuePressures = null`. Today it seeds every compartment with
`getInitialTissueN2(n2Fraction)` before descending (line 609, used in the
`afterDescent` loop ~617-625). When `initialTissuePressures` is provided, seed each
compartment from it instead. Default `null` → behaviour identical to today. This is
the same default-preserving seam pattern used for `calculateTissueLoading`,
`generateDecoProfile`, and the chart components. Unit-tested: a fresh (surface-
equilibrium) seed reproduces today's NDL exactly; a loaded seed yields a shorter NDL.

**Seed-from-position + NDL preview — `js/ndlPreview.js` (new, pure).**
`previewNdl(trip, { startDateTime, maxDepth, gases }, gfLow) → minutes`:

1. Insert a candidate dive at `startDateTime` with a placeholder `bottomTime` (e.g.
   1) via `addDive` — its `startingTissue` does NOT depend on its own depth/duration,
   only on the dives before it, so the placeholder is safe (no circularity).
2. `planTrip(candidate)`; find the candidate dive by its assigned id; read its
   `startingTissue` (this is the carried-in seed: prior dives chained + surface
   off-gassing to `startDateTime`).
3. `calculateNDL(maxDepth, gases[0].n2, gfLow / 100, startingTissue).ndl`.

Returns the pre-saturation-aware NDL in minutes. Unit-tested: for the earliest dive
in a trip it equals the surface NDL (`calculateNDL` with no seed); for a later dive
after a deep morning dive it is strictly less.

## E. Wiring — `sandbox/repetitive-dives.html`

- **Trip-config bar** gains a **start-date** picker and a **day count** (number, with
  an "add day" affordance), alongside the existing GF inputs.
- `createAt` now opens `AddDiveDialog` (pre-filled, with the injected
  `computeNdl = (s, d, g) => previewNdl(trip, { startDateTime: s, maxDepth: d, gases: g }, trip.gfLow)`)
  instead of immediately adding a default dive.
- The calendar is constructed/updated with `startDate` + `dayCount` for headers and
  column count.
- Everything else (`rerender`, overview, detail view, conflict display, chart
  disposal) is unchanged.

## Testing

- **Unit (`tests/run-tests.mjs`):**
  - seeded `calculateNDL`: fresh seed == unseeded result; loaded seed → smaller NDL;
    the existing suite stays green (default path unchanged).
  - `computeCalendarLayout` with explicit `dayCount`: 1 dive + `dayCount: 3` → 3
    columns; blocks still positioned correctly; existing layout tests updated to pass
    `dayCount`.
  - `previewNdl`: first dive == surface NDL; later (pre-saturated) dive < surface NDL;
    no circular dependency on the candidate's bottom time (placeholder-independent).
- **Browser smoke (mandatory):** set start date + 3 days → three dated columns with
  an hour ruler and gridlines; click an empty slot → dialog pre-filled with that
  day/time; in No-deco mode the bottom time tracks depth AND trip position (a 2nd-dive
  NDL is shorter than a 1st-dive NDL at the same depth); Custom mode shows the deco
  warning past NDL; Add creates the dive at the right slot; zero console errors.

## Integration / Versioning

- New modules (`js/ndlPreview.js`, `js/components/AddDiveDialog.js`) added to
  `STATIC_ASSETS` in `sw.js`; bump `CACHE_NAME` and `css/styles.css`
  `.version-number::after` to the same new version.
- Wiki: document the `calculateNDL` `initialTissuePressures` seam, `js/ndlPreview.js`,
  and `js/components/AddDiveDialog.js`; note the calendar's date model + `dayCount`.

## Build Order

1. Seeded `calculateNDL` (+ test) — engine seam, default-preserving.
2. `js/ndlPreview.js` `previewNdl` (+ tests) — pure, uses planTrip + addDive + seeded NDL.
3. `computeCalendarLayout` explicit `dayCount` (+ updated tests).
4. `TripCalendar` time ruler + date headers + hour gridlines (render + CSS); re-base
   `DiveEditPanel` datetime mapping on the trip `startDate`.
5. `AddDiveDialog` component (two modes, injected `computeNdl`).
6. Wire trip-config (start date + day count) + dialog-based create into the page;
   browser smoke; version/sw.js.
7. Wiki.

## Open Questions / To Settle During Planning

- Gas selection in the dialog: read-only trip-default label vs a select of the trip's
  gases (lean: simple select of the trip gases for v1, default = first).
- "Add day" / day-count UI affordance (a number input vs +/- buttons).
- Hour-window configurability (fixed 06:00–20:00 for v1 vs user-set) — lean fixed.
