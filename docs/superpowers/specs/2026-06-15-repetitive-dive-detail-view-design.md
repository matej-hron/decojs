# Repetitive-Dive Trip Planner — Sub-project ②: Seeded Detail View + Pre-Saturation Indicators

**Date:** 2026-06-15
**Status:** Approved design, ready for implementation planning
**Depends on:** Sub-project ① (the `planTrip` chaining engine + minimal POC page), branch `feat/repetitive-dive-engine`.

## Background & Motivation

Sub-project ① delivered the `planTrip` engine and a minimal stacked-panel POC
(`sandbox/repetitive-dives.html`) that proves deco grows dive-over-dive. Two
follow-ups requested after reviewing the POC:

1. **Click-through to the full dive experience** — from each dive in the trip,
   open a rich view with all charts (profile, M-value, GF) and a runtime table.
2. **Express the pre-saturation** carried in from previous dives, in a way that is
   informative but not chatty.

The defining constraint: the full charts today render every dive starting from
**surface equilibrium**. For a repetitive dive that is the wrong assumption — a
"fresh" render would understate deco and contradict the planner's whole point. So
the detail view must be **seeded** with each dive's carried-in tissue state (which
`planTrip` already returns as `startingTissue`). The model seam for this
(`initialTissuePressures`) already exists from sub-project ①; this sub-project
threads it into the chart components and builds the detail view around it.

## Goals

- A seeded, full-fidelity **per-dive detail view** (all charts + runtime table)
  reachable by clicking a dive in the trip overview.
- **Pre-saturation indicators**: a one-line headline on each overview panel, and a
  full per-tissue strip in the detail view.
- Zero behavioural change to the standalone sandbox or any existing page.

## Non-goals (deferred)

- A real multi-dive editor / calendar UI (still future sub-project work; the POC's
  hardcoded dives remain for now).
- Order optimisation.
- Per-dive gases (still shared top-level).
- Gas-consumption fidelity under seeding (the runtime table covers depths/times/gas
  switches and deco; SAC-based volume estimates are out of scope here).
- Deep-linking to a specific dive's detail view via URL (optional nice-to-have, not
  required — see Detail View section).

## Decisions Locked During Brainstorming

- **Fidelity:** seeded, full-fidelity. The detail view's charts + runtime table
  reflect the real repetitive dive.
- **Location:** a detail view **inside the planner** (not the standalone sandbox).
  The seed is in-memory from `planTrip`, so no tissue state is encoded in URLs, and
  the standalone sandbox stays a clean editable fresh-dive teaching tool.
- **Pre-saturation metric:** the **surfacing gradient factor** — "if you ascended
  straight to the surface now, how close to each tissue's Bühlmann limit are you."
  0% = off-gassed to a fresh-diver baseline; 100% = at the surfacing M-value limit.
- **Granularity by context:** overview shows the single controlling (max) surfacing
  GF; the detail view shows the full per-tissue distribution.
- **Click-through:** a dedicated full-width detail view that swaps in over the trip
  overview, with a "← back to trip" link.

## A. Pre-saturation metric — `js/preSaturation.js` (new, pure)

No new decompression math. The metric reuses existing `js/decoModel.js` functions
evaluated at surface ambient pressure:

- `calculateMaxGF(tissuePressures, ambientPressure)` →
  `{ gfMax, leadingCompartment, allGFs }` (`js/decoModel.js:212`).
- `getAmbientPressure(0)` → surface ambient (`js/decoModel.js:72`).

New thin wrapper:

```js
surfacingGF(tissuePressures) -> {
  controllingPct,           // max(0, gfMax) * 100, rounded for display
  controllingCompartmentId, // leadingCompartment
  perCompartmentPct: { [compId]: max(0, gf) * 100 }  // clamped, in COMPARTMENT order
}
```

Rationale for clamping at 0: a fresh diver's tissues sit below surface ambient
(negative GF), which is physiologically "no surfacing stress" — clamping to 0 makes
"fresh = 0%" read correctly. Pure and unit-tested.

## B. Seed-aware chart components (the foundation)

Today the charts call the model assuming surface equilibrium, e.g.
`DiveProfileChart` calls `calculateTissueLoading(waypoints, surfaceInterval, { gases })`
(`js/charts/DiveProfileChart.js:842`). Each chart that runs its own tissue
simulation gains an optional seed:

- **`DiveProfileChart`**, **`MValueChart`**, **`GFChart`**: read an optional
  `initialTissuePressures` (from `diveSetup.initialTissuePressures` or an
  options field — pick one convention and apply it to all three) and pass it into
  their internal `calculateTissueLoading` / deco-schedule / GF calls via the
  `options.initialTissuePressures` seam added in sub-project ①.
- **Default-preserving:** when the seed is absent, every chart behaves exactly as
  today. The standalone sandbox and all theory pages are untouched.

Testing note: these chart components are not exercised by `tests/run-tests.mjs`
(they require Chart.js, loaded via CDN in the browser, not in the node harness) —
consistent with how charts are tested today. Their seeded correctness is verified
by the mandatory browser smoke test (below); the underlying model seam is already
unit-tested from sub-project ①.

## C. Runtime table — `js/components/RuntimeTable.js` (new)

Split pure logic from rendering:

- **`buildRuntimeRows(profile, gases)`** (pure, unit-tested): from a dive's executed
  `profile.waypoints` (+ `profile.decoStops`, `gases`), produce ordered rows:
  `{ phase, depth, segmentTime, runTime, gas, isStop }` covering descent, bottom,
  each ascent segment and deco/safety stop. `runTime` is cumulative minutes.
- A thin renderer turns rows into a table element. The renderer is DOM-only and
  verified via the browser smoke test.

## D. Detail view + indicators — `sandbox/repetitive-dives.html`

The page grows from a static overview into overview + detail, switched in-page (no
routing framework).

- **Overview panel headline (per dive):** one line showing the controlling
  surfacing GF from `surfacingGF(dive.startingTissue)`, e.g.
  *"Pre-load: 41% (tissue #5)"*; the first dive reads *"fresh"*. Each panel becomes
  clickable ("View detail →").
- **View swap:** clicking a dive hides the overview container and shows a detail
  container for that dive; a "← back to trip" control returns. Optional: reflect the
  selected dive in `location.hash` for deep-linking/refresh (nice-to-have).
- **Detail view composition** (for the selected dive, seeded with its
  `startingTissue`):
  - `DiveProfileChart`, `MValueChart`, `GFChart` — each constructed with the seed.
  - `RuntimeTable` for the dive.
  - **Per-tissue surfacing-GF strip:** 16 bars, fast→slow compartment order, bar
    height = `perCompartmentPct[compId]`, positioned next to the M-value chart it
    corresponds to. A small shared render (`PreSaturationStrip`) is used for both
    the overview headline (controlling value only) and the detail strip.
- Header/meta for the detail view: dive label, clock time, surface interval, total
  deco — reusing the formatting already in the POC page.

## Build Order

1. `js/preSaturation.js` (+ unit tests) — pure; gates the indicators.
2. Seed-aware `DiveProfileChart`, `MValueChart`, `GFChart` — foundation for fidelity.
3. `js/components/RuntimeTable.js` — pure `buildRuntimeRows` (+ tests), then renderer.
4. Wire the detail view + overview headline + per-tissue strip into
   `sandbox/repetitive-dives.html`; browser smoke test; version bump + `sw.js`
   registration for the new modules.

## Testing

- **Unit (in `tests/run-tests.mjs`):**
  - `surfacingGF`: a fresh surface-equilibrium tissue state → controlling ≈ 0%;
    a loaded state → controlling > 0% and equal to the clamped max of the
    per-compartment values; per-compartment map has all 16 compartments; monotonic
    (more load → higher controlling GF).
  - `buildRuntimeRows`: a known deco dive profile → expected ordered rows with
    correct cumulative `runTime`, a row per deco stop, correct gas per segment, and
    a final surfacing row.
- **Regression:** the existing 214-test suite stays green (chart seams are gated on
  the new option; `preSaturation`/`RuntimeTable` are additive).
- **Browser smoke test (mandatory, per project policy):** load
  `sandbox/repetitive-dives.html`; confirm zero console/page errors; the overview
  shows growing pre-load headlines; clicking a dive opens the detail view with all
  three charts rendered, a runtime table, and the per-tissue strip; the seeded deco
  in the detail view matches the overview's figure for that dive; "← back to trip"
  returns to the overview.

## Integration / Versioning

- New modules (`js/preSaturation.js`, `js/components/RuntimeTable.js`) added to
  `STATIC_ASSETS` in `sw.js`.
- Bump `CACHE_NAME` in `sw.js` and `.version-number::after` in `css/styles.css` to
  the same new version (per CLAUDE.md).
- Wiki: add `js/preSaturation.js` and `js/components/RuntimeTable.js` to
  `Module-Reference.md`; note the chart components' new optional
  `initialTissuePressures` where they are documented.

## Open Questions / To Settle During Planning

- Seed convention for the charts: `diveSetup.initialTissuePressures` vs. an explicit
  options field — pick one and apply consistently to all three charts.
- Exact fast→slow ordering/labels for the per-tissue strip (compartment order is
  already defined in `js/tissueCompartments.js`; confirm the display order and
  whether to label compartments by number or half-time).
