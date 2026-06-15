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

Reuse the existing `diveSetup` object. Today it already carries, at the top level
(shared across the whole setup): `gases`, `gfLow`, `gfHigh`, `reservePressure`,
`units`, `surfaceInterval`.

**How dives are actually authored:** the existing `DiveSetupEditor` defines a dive
by **max depth + bottom time** (`js/components/DiveSetupEditor.js:1261-1262,1303`)
and calls `generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh, ...)`
(`js/diveSetup.js:326`) to *generate* the waypoints. Waypoints are derived output,
not authored input. The trip engine mirrors this: a dive is **(maxDepth,
bottomTime)**, and the engine regenerates each dive's profile (incl. deco) from the
carried-in tissue state — which is exactly what makes deco grow dive-over-dive.

A **trip dive** for v1:

```js
dives: [
  {
    id: 'd1',            // stable identity, survives reshuffling
    startDateTime: ...,  // explicit clock+day (epoch minutes — see below)
    maxDepth: 40,        // metres
    bottomTime: 22       // minutes from dive start until leaving max depth
  },
  ...
]
// gases, gfLow, gfHigh stay top-level/shared (unchanged)
// waypoints are GENERATED per dive by the engine, not stored as input
```

Decisions:

- **Dives are square profiles** (maxDepth + bottomTime) for v1 — matches how the
  editor already authors them, and lets the engine regenerate deco from the
  pre-saturated state. Arbitrary multi-level waypoint dives deferred.
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
  startingTissue,         // { [compId]: pressure } at dive start (the "pre-saturation")
  endTissue,              // { [compId]: pressure } at dive end
  profile                 // the full generateDecoProfile return for this dive:
                          //   { waypoints, ndl, requiresDeco, decoStops,
                          //     totalDecoTime, controllingCompartment,
                          //     pAnchor, anchorDepth }
}
```

The minimal view renders each dive by building a per-dive `diveSetup`
(`{ ...sharedTopLevel, dives: [{ waypoints: result.profile.waypoints }] }`) and
handing it to a `DiveProfileChart`, which computes its own ceiling. So the engine
need not return a separate ceiling series for v1.

`Conflict` (recorded, not thrown):

```js
{ diveId, type: 'overlap', overrunMinutes }   // prev dive's deco overruns this start
```

### Algorithm

1. Sort `dives` by `startDateTime` ascending.
2. Initialise `tissue` to surface equilibrium: `getInitialTissueN2(gases[0].n2)` for
   every compartment. Set `prevEndDateTime = null`.
3. For each dive in order:
   a. **Surface interval:** if `prevEndDateTime != null`, compute
      `gap = dive.startDateTime - prevEndDateTime` (minutes).
      - If `gap < 0`: record a `Conflict` (`overrunMinutes = -gap`); do **not**
        off-gas (the previous dive hasn't finished). `surfaceIntervalBefore = 0`.
      - Else: off-gas at the surface for `gap` minutes via the existing primitive
        `simulateDepthTime(tissue, 0, gap, N2_FRACTION)`; `surfaceIntervalBefore = gap`.
   b. Capture `startingTissue = { ...tissue }`.
   c. **Run the dive from the loaded state:**
      - `profile = generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh,
        safetyStop, { initialTissuePressures: startingTissue })` → executed
        waypoints + deco info. Seeding makes the deco obligation reflect the
        residual load (see decoModel/diveSetup change below).
      - `loading = calculateTissueLoading(profile.waypoints, 0, { gases,
        initialTissuePressures: startingTissue })` → time series for rendering and
        the **end tissue** (last value per compartment) → `endTissue`.
      - `actualDurationMinutes = last waypoint time of profile.waypoints`.
   d. `endDateTime = startDateTime + actualDurationMinutes`.
   e. Push `PerDiveResult` (`profile`, `decoSchedule = profile.decoStops`,
      `ceiling` from `loading`). Set `tissue = endTissue`,
      `prevEndDateTime = endDateTime`.
4. Return `{ dives, conflicts }`.

Reshuffling later = re-sort + re-run. Optimizer later = permute + score. No engine
changes needed for either.

## Core-algorithm changes — two small, default-preserving seams

Both functions currently hardcode the initial tissue state to surface equilibrium.
Each gains an optional `options.initialTissuePressures`; when omitted, behaviour is
byte-for-byte identical to today, so the existing 208 tests are unaffected.

**Seam 1 — `calculateTissueLoading` (`js/decoModel.js:1115-1121`).** Today it seeds
every compartment with `getInitialTissueN2(initialN2Fraction)`. Change: if
`options.initialTissuePressures` is provided, seed `currentPressures[comp.id]` from
it instead. Used by the engine to get the end-of-dive tissue state and render series.

**Seam 2 — `generateDecoProfile` (`js/diveSetup.js:326,373`).** Today it seeds
tissues with `getInitialTissueN2(bottomGas.n2)` (line 373) and decides
deco-vs-no-deco via a *surface-based* NDL check (lines 346,352) before building
waypoints. Changes when `options.initialTissuePressures` is provided:
  - Seed `tissues` from it (line 373 area) instead of surface equilibrium.
  - **Skip the surface-NDL early-return** and always build via the
    `generateDecoSchedule` path. That path reads the *actual* bottom tissue state,
    so pre-saturation yields more/deeper stops; if no deco is needed it returns zero
    stops and the existing safety-stop logic still applies. (The surface-based NDL
    is wrong under pre-saturation, hence the bypass.)

Surface-interval off-gassing needs **no new code** — it reuses the existing
exported `simulateDepthTime(tissues, 0, gap, N2_FRACTION)`.

**Wiki impact (per CLAUDE.md):** `decoModel.js` and `diveSetup.js` are core files.
After implementation, review/update `Algo-01-Ascent-Simulation.md`,
`Algo-05-Multi-Gas-Switching.md`, and `Module-Reference.md` for the new optional
parameters and chaining behaviour. The new `js/tripPlanner.js` module also needs a
`Module-Reference.md` entry.

## Minimal View — `sandbox/repetitive-dives.html` (new page)

Purpose: prove the physics end-to-end with the least UI possible. Not the real
planner (that is sub-project ②).

- A minimal inline definition of 2–3 dives, each as `{ startDateTime, maxDepth,
  bottomTime }`, sharing the top-level gases/GF. Acceptable for v1 to seed this from
  a hardcoded `diveSetup` plus simple numeric inputs; a full multi-dive editor is
  out of scope here.
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

## Testing — append a `describe` block to `tests/run-tests.mjs`

`npm test` runs the single monolithic `tests/run-tests.mjs` (its own mini
`describe`/`test`/`expect` framework; the `.test.js` files are legacy Jest, not
run). New tests are added as a `describe('tripPlanner', ...)` block in that file,
with `planTrip` added to the module imports near the top.

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

## Resolved during planning

- **Reuse boundary:** engine calls `generateDecoProfile` (seeded) for the executed
  deco profile and `calculateTissueLoading` (seeded) for the end-tissue + render
  series; surface off-gassing uses `simulateDepthTime`. Two default-preserving
  seams (above). No new waypoint-building logic.
- **Dive model:** square `(maxDepth, bottomTime)`, mirroring the editor.

## Open questions / to settle during planning

- Whether the minimal page gets a `nav.js` entry now or in ②ish (lean: not yet —
  keep it an unlinked sandbox page until the real planner lands).
```
