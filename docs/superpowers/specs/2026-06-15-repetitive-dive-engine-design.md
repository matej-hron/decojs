# Repetitive-Dive Trip Planner — Sub-project ①: Chaining Engine + Minimal View

**Date:** 2026-06-15
**Status:** Approved design, ready for implementation planning
**Scope:** First of three sub-projects toward a repeated-dive (trip) planner.

## Background & Motivation

DecoJS currently simulates a single dive starting from surface tissue equilibrium.
Real diving is repetitive: residual nitrogen from a prior dive raises the starting
tissue load ("pre-saturation") of the next dive, lengthening its decompression
obligation. The goal is a **practical multi-day trip planner**: define several
dives, arrange them on an explicit clock+calendar, and have the tool connect them
through surface-interval off-gassing and pre-saturation carryover.

A future sub-project will add an **order optimizer** ("reshuffle dives for the
least deco exposure"). That requirement drives a key design constraint *now*:
each dive must be a first-class object with stable identity, so it can be moved
between calendar positions and the engine re-run.

## Decomposition (full feature)

The overall feature splits into three independently shippable sub-projects, built
in order:

1. **Trip chaining engine** *(this spec)* — a pure model that, given an ordered
   set of dives with start datetimes, threads tissue state across surface
   intervals and produces per-dive starting load, deco schedule, and end time.
   Plus a minimal stacked-panel view to prove the physics end-to-end.
2. **Calendar arrangement UI + chained rendering** — define dives as movable
   objects, place/reshuffle them on a clock+day calendar, render the chained
   sequence. Unlocks the charts beyond `dives[0]`.
3. **Order optimizer** — permute the arrangement, score total deco exposure via
   the engine, recommend the lowest-exposure order. Trivial once ① exists.

This spec covers **sub-project ① only**.

## Goals (sub-project ①)

- A pure, heavily-tested function that chains 2+ dives through surface intervals.
- Correct pre-saturation carryover: dive N+1 starts from dive N's residual tissue
  state after off-gassing over the real clock gap (including overnight).
- A minimal visible slice: stacked per-dive profile panels showing deco growing
  dive-over-dive.

## Non-goals (deferred to ② / ③)

- Calendar/drag UI, reshuffle interactions, full dive editor for multiple dives.
- Continuous/merged-timeline rendering.
- Order optimization.
- Per-dive gas lists (v1 uses the existing **shared** top-level gas list).
- Per-dive GF overrides (GF stays trip-global, as it already is).

## Data Model

Reuse the existing `diveSetup` object verbatim. Today it already carries, at the
top level (shared across the whole setup): `gases`, `gfLow`, `gfHigh`,
`reservePressure`, `units`, `surfaceInterval`. Each dive today is just
`{ waypoints: [...] }`.

The **only** additions are two per-dive fields:

```js
dives: [
  {
    id: 'd1',            // NEW: stable identity, survives reshuffling
    startDateTime: ...,  // NEW: explicit clock+day (epoch minutes — see below)
    waypoints: [ { time, depth, gasId? }, ... ]   // existing shape
  },
  ...
]
// gases, gfLow, gfHigh, reservePressure, units stay top-level/shared (unchanged)
```

Decisions:

- **GF is trip-global** — already top-level (`gfLow`/`gfHigh`); no change.
- **Gases are shared** for v1 (one top-level list). Per-dive gases deferred to ②.
- **`startDateTime`** is stored as **epoch minutes** (integer minutes since an
  arbitrary epoch). This keeps surface-interval math as plain integer subtraction
  in minutes — the unit the model already works in — and avoids `Date` object
  plumbing in the pure engine. The UI layer formats it for display.
- **`id`** is a stable string unique within the trip.

## Engine — `js/tripPlanner.js` (new, pure module)

Public API:

```js
planTrip(diveSetup) -> {
  dives: [ PerDiveResult, ... ],   // in chronological order
  conflicts: [ Conflict, ... ]
}
```

`PerDiveResult`:

```js
{
  id,                     // echoes dive.id
  startDateTime,          // scheduled start
  endDateTime,            // ACTUAL end incl. computed deco (epoch minutes)
  surfaceIntervalBefore,  // minutes since previous dive's actual end (null for first)
  startingTissue,         // tissue pressures at dive start (the "pre-saturation")
  endTissue,              // tissue pressures at dive end
  profile,                // executed profile incl. deco stops (time series)
  decoSchedule,           // output of generateDecoSchedule
  ceiling                 // ceiling time series / summary
}
```

`Conflict` (recorded, not thrown):

```js
{ diveId, type: 'overlap', overrunMinutes }   // prev dive's deco overruns this start
```

### Algorithm

1. Sort `dives` by `startDateTime` ascending.
2. Initialise `tissue = getInitialTissueN2()` (surface equilibrium).
   Set `prevEndDateTime = null`.
3. For each dive in order:
   a. **Surface interval:** if `prevEndDateTime != null`, compute
      `gap = dive.startDateTime - prevEndDateTime` (minutes).
      - If `gap < 0`: record a `Conflict` (`overrunMinutes = -gap`); do **not**
        off-gas (the previous dive hasn't finished). `surfaceIntervalBefore = 0`.
      - Else: off-gas tissues at the surface (depth 0, air) for `gap` minutes via
        the existing surface-interval off-gassing path; `surfaceIntervalBefore = gap`.
   b. Capture `startingTissue = clone(tissue)`.
   c. **Run the dive from the loaded state:** generate the deco-extended profile
      using the existing single-dive orchestration, but seeded with
      `startingTissue` instead of surface equilibrium (see decoModel change below).
      This yields the executed `profile`, `decoSchedule`, `ceiling`, the updated
      `endTissue`, and the **actual end time** (planned profile + computed deco).
   d. `endDateTime = startDateTime + actualDurationMinutes`.
   e. Push `PerDiveResult`. Set `tissue = endTissue`, `prevEndDateTime = endDateTime`.
4. Return `{ dives, conflicts }`.

Reshuffling later = re-sort + re-run. Optimizer later = permute + score. No engine
changes needed for either.

## Core-algorithm change — `js/decoModel.js`

`calculateTissueLoading` (and the deco-schedule orchestration it drives) currently
hardcode the initial tissue state to surface equilibrium via `getInitialTissueN2()`.

**Change:** add an optional `initialTissuePressures` parameter (via the existing
`options` object). When provided, the simulation seeds tissues from it instead of
surface equilibrium. When omitted, behaviour is identical to today.

- Default path unchanged → existing 208 tests unaffected.
- This is the single seam the engine needs to inject pre-saturation.

**Wiki impact (per CLAUDE.md):** `decoModel.js` is a core-algorithm file. After
implementation, review/update `Algo-01-Ascent-Simulation.md` and
`Module-Reference.md` for the new optional parameter and the chaining behaviour.
A new `js/tripPlanner.js` module also needs a `Module-Reference.md` entry.

## Minimal View — `sandbox/repetitive-dives.html` (new page)

Purpose: prove the physics end-to-end with the least UI possible. Not the real
planner (that is sub-project ②).

- A minimal inline definition of 2–3 dives with start datetimes. Acceptable for v1
  to seed this from a hardcoded/JSON `diveSetup` plus simple inputs; a full
  multi-dive editor is out of scope here.
- Call `planTrip()` and render **stacked `DiveProfileChart` panels**, one per dive,
  in chronological order. Each panel annotated with:
  - surface interval before the dive (e.g. "SI 3h 20m" / "overnight 18h"),
  - starting residual load indicator (the pre-saturation),
  - resulting deco obligation.
- The reader should *see* deco grow dive-over-dive.
- Surface-interval scale problem is sidestepped entirely by the per-panel layout
  (no shared real-time x-axis).
- Conflicts (negative gaps) surfaced as a visible warning on the affected panel.

Integration housekeeping:

- Add `sandbox/repetitive-dives.html` (and any new asset) to `STATIC_ASSETS` in
  `sw.js`.
- Bump version in **both** `sw.js` (`CACHE_NAME`) and
  `css/styles.css` (`.version-number::after`), per CLAUDE.md.
- Navigation entry (`js/nav.js`) only if we want it discoverable; for a sandbox
  proof-of-concept this can wait until ②. Decide during planning.

## Testing — `tests/tripPlanner.test.js` (new)

The heart of v1. Cases:

1. **Single-dive parity:** a one-dive trip through `planTrip` produces a deco
   schedule equal to the existing single-dive path (no regression in the seam).
2. **Pre-saturation carryover:** two identical dives with a short surface interval
   → the second dive starts with a higher tissue load and a longer/deeper deco
   obligation than the first.
3. **Long surface interval:** an overnight gap (~18h) → tissues near-reset, but
   slow compartments retain measurable residual (not full equilibrium).
4. **Off-gassing monotonicity:** longer surface interval → lower starting load for
   the next dive (monotonic in interval length).
5. **Conflict detection:** schedule dive 2 to start before dive 1's deco-extended
   end → a `conflict` is recorded with correct `overrunMinutes`, no off-gassing.

Also: keep the full existing suite green (the decoModel change must be a no-op by
default).

## Open questions / to settle during planning

- Exact reuse boundary inside `decoModel.js`: which function the engine calls to
  get "loaded-state dive + deco" (`calculateTissueLoading` vs. the schedule
  orchestration the sandbox uses) — pick the smallest seam that returns both the
  executed profile and the end tissue state.
- Whether the minimal page gets a `nav.js` entry now or in ②.
```
