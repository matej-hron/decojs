Per-file API walkthrough. Signatures, line references, dependencies. For the math behind the algorithm functions listed here, see [Decompression-Model](Decompression-Model.md) and the individual algorithm chapters.

All paths are relative to the repository root. Line numbers are kept current per the wiki-update rule in `CLAUDE.md`.

## Core algorithm

### `js/decoModel.js`

Implements Haldane and Schreiner kinetics, M-values, gradient-factor interpolation, NDL search, and the deco-stop scheduling loop. The largest module in the code base (~1300 lines).

Imports: `COMPARTMENTS`, `getRateConstant` from `tissueCompartments.js`.
Imported by: `diveSetup.js`, `mvalues.js`, `main.js`, `tissueEducation.js`, `visualization.js`, and every chart in `js/charts/`.

**Constants**

| Name | Value | Purpose |
|---|---|---|
| `CALC_INTERVAL` | `10` | Simulation time step, seconds |
| `SURFACE_PRESSURE` | `1.01325` | 1 atm in bar |
| `WATER_VAPOR_PRESSURE` | `0.0627` | At 37 °C, in bar |
| `N2_FRACTION` | `0.7902` | Lumps argon with N₂ (standard deco-model convention) |
| `PRESSURE_PER_METER` | `0.1` | bar per metre of sea water |
| `DEFAULT_GF_LOW`, `DEFAULT_GF_HIGH` | `1.0`, `1.0` | As fractions (not percentages) |
| `DECO_STOP_MAX_MINUTES` | `300` | Safety cap per stop; exceeding throws `DecoCapExceededError` |
| `DecoCapExceededError` | class | Thrown when a single stop would need > 5 h |

**Exports — Pressure & alveolar**

| Signature | Line | Description |
|---|---|---|
| `getAmbientPressure(depth)` | 72 | `SURFACE_PRESSURE + depth × 0.1` |
| `getAlveolarN2Pressure(ambient, n2=0.7902)` | 84 | `(ambient − 0.0627) × n2Frac` |
| `getInitialTissueN2(n2=0.7902)` | 93 | Alveolar N₂ at surface (saturation initialiser) |

**Exports — Kinetics**

| Signature | Line | Description |
|---|---|---|
| `haldaneEquation(P0, Palv, t, halfTime)` | 108 | Constant-depth exponential loading. See [Model-02-Haldane-Equation](Model-02-Haldane-Equation.md). |
| `schreinerEquation(P0, Palv0, R, t, halfTime)` | 125 | Linear-rate loading. See [Model-03-Schreiner-Equation](Model-03-Schreiner-Equation.md). |
| `simulateDepthTime(tissues, depth, t, n2)` | 700 | Vector-apply Haldane across all 16 compartments |
| `simulateDepthChange(tissues, startDepth, endDepth, t, n2)` | 722 | Vector-apply Schreiner across all 16 compartments |

**Exports — M-values & ceilings**

| Signature | Line | Description |
|---|---|---|
| `getMValue(ambient, a, b)` | 145 | `a + ambient/b` — raw Bühlmann limit |
| `getAdjustedMValue(ambient, a, b, gf)` | 160 | `ambient + gf × (M − ambient)` |
| `getCompartmentCeiling(Pt, a, b, gf)` | 244 | Minimum ambient pressure this compartment permits |
| `getDiveCeiling(tissues, gf)` | 260 | Deepest (most-restrictive) ceiling across 16 compartments; returns `{ceiling, ceilingDepth, controllingCompartment}` |
| `getFirstStopDepth(tissues, gfLow, stopIncrement=3)` | 390 | First mandatory stop rounded up to 3 m grid |

**Exports — Gradient factors**

| Signature | Description |
|---|---|
| `calculateInstantGF(Pt, ambient, compartment)` | `(Pt − ambient) / (M − ambient)`, expressed as 0–1 |
| `calculateMaxGF(tissues, ambient)` | Returns `{gfMax, leadingCompartment, allGFs}` |
| `findFirstStopAtGFLow(tissues, depth, n2, gfLow, stopIncrement, ascentRate, gasSwitchPoints)` | The convention's first-stop search: shallowest stop-grid depth where the dive ceiling at GF_low is satisfied after simulated ascent. Returns `{anchorDepth, pAnchor, tissuesAtAnchor}`. **The canonical pAnchor source** used by `generateDecoSchedule`, `calculateCeilingTimeSeriesDetailed`, `MValueChart`, and `GFChart`. See [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md). |
| `interpolateGF(ambient, pAnchor, gfLow, gfHigh)` | Linear ramp from GF-low at pAnchor to GF-high at surface (1.01325 bar) |
| `getFirstStopDepth(tissues, gfLow, stopIncrement=3)` | Static (no ascent simulation): rounds the current dive ceiling at GF_low up to the stop grid. Used for quick lookups; the deco scheduler uses `findFirstStopAtGFLow` instead. |

**Exports — NDL & deco scheduling**

| Signature | Line | Description |
|---|---|---|
| `calculateNDL(depth, n2=0.7902, gfLow=1.0, initialTissuePressures=null)` | 602 | Binary search; returns `{ndl, controllingCompartment, descentTime, ndlExact}`. When `initialTissuePressures` is a `{ [compartmentId]: nitrogenPressureBar }` map, the descent starts from that residual tissue state instead of surface equilibrium, yielding a pre-saturation-aware NDL. Defaults to `null` (surface equilibrium; original behaviour unchanged). |
| `generateDecoSchedule(tissues, depth, n2, gfLow, gfHigh, gases=null, options={})` | 761 | Returns `{stops, gasSwitches, totalTime, totalAscentTime, pAnchor, anchorDepth}`. Throws `DecoCapExceededError` if any stop would exceed `DECO_STOP_MAX_MINUTES`. See [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) and [Algo-05-Multi-Gas-Switching](Algo-05-Multi-Gas-Switching.md). |

`generateDecoSchedule` options:

- `stopIncrement` (default 3 m) — vertical grid; pass 0.1 for continuous mode
- `timeIncrement` (default 1 min) — stop-time quantum
- `ascentRate` (default 10 m/min) — transit between stops
- `gasSwitchTime` (default 0) — minutes held at switch depth
- `maxPpO2` (default 1.6) — cap for deco gas MOD
- `safetyStop` — passed through for safety-stop handling

**Exports — Full-dive simulation**

| Signature | Line | Description |
|---|---|---|
| `calculateTissueLoading(profile, surfaceInterval=60, options={})` | 1044 | Main entry: walks the waypoint array at `CALC_INTERVAL` resolution, returns `{timePoints, depthPoints, ambientPressures, compartments: {1:{pressures:[]},…}, n2Fractions}`. Accepts optional `options.initialTissuePressures` — a `{ [compartmentId]: nitrogenPressureBar }` map to seed compartments from a prior dive's residual state instead of surface equilibrium. See [repetitive-dive chaining](#repetitive-dive-chaining-initialTissuePressures). |
| `calculateCeilingTimeSeries(results, gfLow, gfHigh=gfLow)` | 453 | Flat array of ceiling depths at each time point |
| `calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh, providedPAnchor=null)` | 480 | Returns per-compartment ceiling series plus `gfValues` and `pAnchor`; used by M-value and profile charts |

**Implementation notes**

- Haldane is coded as `Palv + (P0 − Palv) × e^(−k·t)` at `decoModel.js:110`.
- Schreiner is coded as a three-term form at `decoModel.js:127–129`: constant inert-gas source + exponential offset.
- `pAnchor` is an ambient-pressure value, not a depth. `findFirstStopAtGFLow` iterates the stop grid surface-up, simulating the ascent to each candidate and checking the dive ceiling at `gfLow` (`getDiveCeiling`). The first depth that passes is the anchor — also the first decompression stop. See [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md).
- Ascent permission in the deco loop (`decoModel.js:955–968`) checks the GF-adjusted ceiling at the destination stop depth against the destination depth, without Schreiner-crediting the short ascent segment. This matches decotengu's convention.
- `gasKey()` helper at `decoModel.js:780` normalises gases with or without an `id` field, so the deco loop tolerates both library gases and custom mixes.

### `js/tissueCompartments.js`

16 Bühlmann ZH-L16 compartment definitions, runtime-switchable between variants A / B / C.

Imports: none.
Imported by: `decoModel.js`, `diveSetup.js`, `mvalues.js`, `tissueEducation.js`, every chart, every test file.

**Exports**

| Name | Signature | Description |
|---|---|---|
| `ZHL16_VARIANTS` | `{A: 'ZH-L16A', B: 'ZH-L16B', C: 'ZH-L16C'}` | Enum |
| `COMPARTMENTS` | array of 16 objects | Current active compartments. Rebuilt in-place on variant switch. |
| `getZHL16Variant()` | `() => string` | Current active variant name |
| `setZHL16Variant(variant)` | `(string) => void` | Switch variant and rebuild `COMPARTMENTS` in place |
| `getCompartmentsForVariant(variant)` | `(string) => Array` | Inspect a variant without mutating global state |
| `getRateConstant(halfTime)` | `(number) => number` | `ln(2) / halfTime` |
| `getCompartmentCategory(halfTime)` | `(number) => string` | Returns "Fast" / "Medium" / "Medium-Slow" / "Slow" |

**Implementation notes**

- Each compartment object has `{id, halfTime, bN2, aN2, label, color}` after build; see `buildCompartments()` around `tissueCompartments.js:140`.
- TC1's half-time and `b` coefficient swap as a pair between variants. ZH-L16A uses 4.0 min / `b=0.5050`; B and C use 5.0 min / `b=0.5578`. See `COMPARTMENT_1_HALFTIME` at line 46 and `COMPARTMENT_1_B_N2` around line 55.
- All variants share TC2–16 half-times; only the `a` coefficient varies between A, B, C for compartments 5–15 (A_COEFFICIENTS_16A/B/C at lines 102, 115, 128).
- `setZHL16Variant()` clears and repushes the existing `COMPARTMENTS` array (`tissueCompartments.js:190–191`) rather than reassigning, so downstream code holding a reference (e.g. `decoModel.js`) picks up the change without reimporting.
- Default active variant is ZH-L16C (`currentVariant = ZHL16_VARIANTS.C` at line 40). Matches the decotengu default.
- All times in minutes, pressures in bar. See [Model-01-Compartments](Model-01-Compartments.md) for the full coefficient table.

### `js/mvalues.js`

Standalone page controller for the interactive M-value diagram on `m-values.html`. Not an algorithm module — it orchestrates dataset building for the Chart.js P-P diagram.

Imports: `COMPARTMENTS` from `tissueCompartments.js`; `calculateTissueLoading`, `getAmbientPressure`, `getAdjustedMValue`, `getFirstStopDepth`, etc. from `decoModel.js`; `loadDiveSetup`, `getDiveSetupWaypoints`, `getGases`, `getGradientFactors` from `diveSetup.js`.
Imported by: `m-values.html` only (direct script tag).

**Exports**

| Name | Description |
|---|---|
| `CHART_CONFIG` | Render settings (colours, point sizes, playback speed) |
| `loadSelectedProfile()` | Fetches profile, runs `calculateTissueLoading`, draws the P-P chart |
| `populateCoefficientsTable()` | Builds the HTML reference table of ZH-L16 coefficients for the active variant |

**Implementation notes**

- Dataset construction (`buildDatasets`, around line 811) draws the ambient line `y=x`, the alveolar line `y=0.7902·x`, one M-value line per visible compartment, the GF-adjusted corridor (GF-low at pAnchor, GF-high at surface), the tissue trail, and the current-time points.
- pAnchor for the GF corridor comes from `getFirstStopDepth()` + `interpolateGF()`; see `mvalues.js:869–892`. The same pAnchor is passed into `calculateCeilingTimeSeriesDetailed()` so the chart and the profile ceiling agree.
- Chart animation is disabled on update (`mvalues.js:1118`) so timeline-slider scrubbing is smooth.
- Pure UI — no algorithm equations live here. All math delegates to `decoModel.js`.

### `js/diveSetup.js`

Dive configuration, gas library, profile generation, and gas-switch waypoint insertion. The second-largest module (~1470 lines).

Imports: `calculateNDL`, `generateDecoSchedule`, `simulateDepthTime`, `simulateDepthChange`, `getInitialTissueN2`, and other helpers from `decoModel.js`; `COMPARTMENTS` from `tissueCompartments.js`; `translate` from `i18n.js`.
Imported by: `main.js`, `mvalues.js`, every chart, `DiveSetupEditor.js`.

#### Gas definitions

| Export | Line | Description |
|---|---|---|
| `BOTTOM_GASES` | 40 | Air (O₂ 0.2098 / N₂ 0.7902), EAN32, EAN36 |
| `DECO_GASES` | 50 | EAN50, EAN80, O₂ 100% |
| `PREDEFINED_GASES` | 59 | Union of the two above |
| `BOTTOM_CYLINDERS`, `STAGE_CYLINDERS` | 65, 81 | Cylinder size presets (litres) |
| `getPredefinedGas(id)`, `getBottomGas(id)`, `getDecoGas(id)` | 118, 127, 136 | ID lookups |

Note: `BOTTOM_GASES[0].n2` is `0.7902`, matching `N2_FRACTION` in `decoModel.js`.

#### Setup loading

| Signature | Line | Description |
|---|---|---|
| `loadDiveSetup(path='data/dive-setup.json')` | 145 | async; tries localStorage, falls back to JSON fetch, caches in module scope |
| `getDefaultSetup()` | 176 | Hardcoded 40 m / 20 min air dive |
| `clearCache()` | 1187 | Clears the module-level cache |
| `saveDiveSetup(setup, key='diveSetup')` | 1196 | Persist to localStorage |
| `loadSavedSetup(key='diveSetup')` | 1209 | Restore from localStorage |
| `extendDiveSetup(base, overrides)` | 694 | Deep merge with validation |

#### Profile generation

| Signature | Line | Description |
|---|---|---|
| `generateSimpleProfile(maxDepth, bottomTime, safetyStop, options)` | 239 | No-deco profile. Descent 20 m/min, ascent 10 m/min, optional 3 min @ 5 m. |
| `generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh, safetyStop, options)` | 326 | Runs NDL check; if exceeded, calls `generateDecoSchedule()` and splices stops into the waypoint array. Returns `{waypoints, ndl, requiresDeco, decoStops, totalDecoTime, controllingCompartment, pAnchor, anchorDepth}`. Accepts optional `options.initialTissuePressures` — when provided, tissues are seeded from that map and the surface-based NDL early-return is bypassed so the deco scheduler always runs against the actual pre-saturated state. See [repetitive-dive chaining](#repetitive-dive-chaining-initialTissuePressures). |
| `generateDecoProfileSync(...)` | 557 | Variant accepting a pre-loaded `compartments` array. Does **not** support `options.initialTissuePressures`; callers needing a seeded profile must use `generateDecoProfile`. |
| `getNDLForDepth(depth, gas, gfLow)` | 682 | Convenience wrapper around `calculateNDL`. |

"Bottom time" means the absolute time at which ascent begins, not time spent at max depth. Descent duration is exact (not rounded); ascent time snaps to 0.1 min unless `continuousDeco=true` (`diveSetup.js:260`).

#### Gas calculations

| Signature | Line | Description |
|---|---|---|
| `calculateMOD(o2Fraction, maxPpO2=1.4)` | 807 | `floor((ppO₂/o2 − 1) × 10)`, metres |
| `calculateEND(depth, heFraction=0)` | 820 | `(depth + 10) × (1 − fHe) − 10` |
| `calculatePartialPressure(depth, gasFraction)` | 832 | `fraction × (1.01325 + depth/10)` |
| `getGasCylinderVolume(gas)`, `getCylinderVolume(setup)` | 842, 851 | Litres |
| `getGasStartPressure(gas)` | 861 | bar |
| `computeGasConsumption(results, gases, sacRate, decoSacRate, reservePressure=50)` | 1339 | Per-gas consumption over the profile |

#### Oxygen toxicity

| Signature | Line | Description |
|---|---|---|
| `NOAA_CNS_LIMITS` | 1259 | Discrete ppO₂ / max-exposure lookup table |
| `getCNSPerMinute(ppO2)` | 1282 | Percent per minute; 0 if ppO₂ < 0.5 |
| `calculateOTU(ppO2, timeMinutes)` | 1304 | `t × ((ppO₂ − 0.5)/0.5)^0.83` (NOAA form) |
| `OTU_LIMITS` | 1312 | Daily / series exposure limits |

Toxicity is informational; not fed back into the deco loop.

#### Waypoint & gas-switch helpers

| Signature | Line | Description |
|---|---|---|
| `getDiveSetupWaypoints(setup)` | 754 | Extracts `dives[0].waypoints` |
| `getSurfaceInterval(setup)`, `getGFLow(setup)`, `getGFHigh(setup)`, `getGradientFactors(setup)` | 767, 776, 785, 794 | Getters |
| `getGases(setup)`, `getBottomGasFromSetup(setup)`, `getDecoGasesFromSetup(setup)` | 884, 905, 915 | Gas collections |
| `getGasAtWaypoint(waypoint, gases)`, `getGasAtTime(waypoints, gases, time)` | 927, 949 | Active gas lookup |
| `getGasSwitchEvents(waypoints, gases)` | 974 | Returns `[{time, depth, fromGas, toGas}]` |
| `insertGasSwitchWaypoints(waypoints, gases, ascentRate=10, maxPpO2=1.6, gasSwitchTime=0)` | 1009 | Inserts switch waypoints at MOD depths on ascent; rounds to 3 m grid |

#### Presentation helpers

| Signature | Line | Description |
|---|---|---|
| `generateProfileName(setup)` | 1225 | Short label for UI |
| `formatDiveSetupSummary(setup)` | 1241 | Multi-line human summary |
| `renderDivePlanTableHTML(waypoints, gases, opts)` | 1435 | Returns HTML for the dive-plan table. Preserves explicit gas-switch rows; does not fold them into neighbouring rows. |

#### Defaults

`DEFAULT_GAS_SWITCH_TIME=0` (line 34), `DEFAULT_START_PRESSURE=200`, `DEFAULT_RESERVE_PRESSURE=50` (lines 91, 96), `DEFAULT_GF_LOW=100` / `DEFAULT_GF_HIGH=100` as percentages (lines 101–102), `DEFAULT_SAFETY_STOP={enabled:true, depth:5, time:3}` (line 107).

### `js/tripPlanner.js`

Repetitive-dive trip planner (sub-project ①). Chains a sequence of square dives in chronological order: tissues off-gas at the surface between dives via `simulateDepthTime`, and each dive's deco profile is regenerated from the carried-in tissue state via the `options.initialTissuePressures` seam in `generateDecoProfile`.

Pure module — no DOM, no side effects.

Imports: `generateDecoProfile` from `diveSetup.js`; `calculateTissueLoading`, `simulateDepthTime`, `N2_FRACTION` from `decoModel.js`.
Imported by: `js/components/TripCalendar.js` (indirectly, via the sandbox trip-planner page).

**Exports**

| Signature | Line | Description |
|---|---|---|
| `planTrip(diveSetup)` | 27 | Plans a sequence of dives; returns `{ dives, conflicts }` |

`diveSetup` shape:

```javascript
{
    gases: [...],    // shared gas list (same format as single-dive setup)
    gfLow: number,   // as percentage (default 100)
    gfHigh: number,  // as percentage (default 100)
    dives: [
        { id: string, startDateTime: number, maxDepth: number, bottomTime: number, gases?: Array },
        ...
    ]
}
```

Per-dive `gases` field (optional, `tripPlanner.js:55`): when present on an individual dive, it overrides the shared `diveSetup.gases` for that dive's profile generation and tissue-loading simulation. Falls back to `diveSetup.gases` when absent. This allows each dive in a trip to use a different gas set (e.g. different deco mix) while keeping a single shared default.

Return value:

```javascript
{
    dives: [
        {
            id,
            startDateTime,      // epoch minutes (input, passed through)
            endDateTime,        // epoch minutes — accounts for deco extension
            maxDepth,           // metres (input, passed through)
            bottomTime,         // minutes (input, passed through)
            surfaceIntervalBefore, // minutes; null for first dive
            startingTissue,     // { [compartmentId]: nitrogenPressureBar } at dive entry
            endTissue,          // { [compartmentId]: nitrogenPressureBar } at surfacing
            profile             // full generateDecoProfile result for this dive
        },
        ...
    ],
    conflicts: [
        { diveId, type: 'overlap', overrunMinutes }
        // emitted when a dive is scheduled to start before the previous dive's deco-extended end
    ]
}
```

`maxDepth` and `bottomTime` are echoed onto each result dive (`tripPlanner.js:80–81`) so callers such as `TripCalendar` can label blocks without re-parsing the waypoint array.

**Implementation notes**

- Dives are sorted by `startDateTime` before processing (`tripPlanner.js:32`).
- Surface off-gassing is computed by `simulateDepthTime(tissue, 0, gap, N2_FRACTION)` where `gap` is the actual surface interval in minutes (`tripPlanner.js:51`).
- Per-dive gas selection: `const diveGases = dive.gases ?? gases` at `tripPlanner.js:55`.
- When an overlap conflict is detected, the overlapping dive is still planned using the previous dive's end tissue state, with no surface off-gassing applied (the conflict entry records the overrun minutes).
- For the first dive, tissues start at surface equilibrium (no seed is passed).
- See [repetitive-dive chaining](#repetitive-dive-chaining-initialTissuePressures) for the `initialTissuePressures` seam used internally.

#### Repetitive-dive chaining (`initialTissuePressures`)

Both `calculateTissueLoading` and `generateDecoProfile` accept an optional `options.initialTissuePressures` — a `{ [compartmentId]: nitrogenPressureBar }` map.

When provided:

- **`calculateTissueLoading`** (`decoModel.js:1118–1129`): seeds each compartment from the map instead of calling `getInitialTissueN2`. Useful for plotting the tissue trajectory of a repetitive dive starting from residual saturation.
- **`generateDecoProfile`** (`diveSetup.js:351–373`): seeds the bottom-phase tissues from the map **and** bypasses the surface-based NDL early-return. The NDL computed by `calculateNDL` is a fresh-start figure — it is meaningless when the diver already carries residual nitrogen. By skipping the early-return and always running the full deco scheduler, `generateDecoProfile` computes the actual deco obligation against the pre-saturated tissue state (which may require stops even when bottom time is under the surface NDL).

`generateDecoProfileSync` intentionally does **not** support this option; its NDL early-return and surface-only tissue init assume a fresh surface start.

`planTrip` in `tripPlanner.js` is the only current consumer of this seam.

### `js/preSaturation.js`

Pre-saturation expressed as the surfacing gradient factor (sub-project ②).

"If you ascended straight to the surface right now, how close to each tissue's Bühlmann limit are you?" — 0 % means fully off-gassed to a fresh-diver baseline; 100 % means at the surfacing M-value limit. No new decompression math: it reuses `calculateMaxGF` from `decoModel.js` evaluated at `getAmbientPressure(0)` (1.01325 bar). Negative GFs are clamped to 0 (a tissue below surface ambient still has on-gassing capacity and reads as 0 % pre-saturation rather than a negative percentage).

Pure module — no DOM, no side effects.

Imports: `calculateMaxGF`, `getAmbientPressure` from `decoModel.js`.
Imported by: the repetitive-dive detail view (sandbox).

**Exports**

| Signature | Line | Description |
|---|---|---|
| `surfacingGF(tissuePressures)` | 25 | Returns `{ controllingPct, controllingCompartmentId, perCompartmentPct }`. `controllingPct` is the maximum clamped surfacing GF across all 16 compartments, as a percentage. `controllingCompartmentId` is the numeric id of the leading compartment. `perCompartmentPct` is keyed by numeric compartment id. |

`tissuePressures` input shape: `{ [compartmentId]: nitrogenPressureBar }` — the same shape produced by `planTrip` in `tripPlanner.js` (`startingTissue` / `endTissue` fields).

**Implementation notes**

- Calls `calculateMaxGF(tissuePressures, surfaceAmbient)` (`decoModel.js`), where `surfaceAmbient = getAmbientPressure(0)` (`preSaturation.js:26`).
- Clamp: `Math.max(0, g) * 100` at `preSaturation.js:28`.
- `perCompartmentPct` iterates `allGFs` from `calculateMaxGF` and applies the same clamp per compartment (`preSaturation.js:31–33`).

### `js/tripState.js`

Immutable reducer over a trip's dive list (sub-project ③). Every operation returns a **new** trip object; the original is never mutated. The `dives` array produced here is the direct input to `planTrip`.

Pure module — no DOM, no side effects.

Imports: none.
Imported by: the trip-planner sandbox page.

**Exports**

| Signature | Line | Description |
|---|---|---|
| `addDive(trip, fields)` | 22 | Appends a new dive with a stable max-based id (`'d<n>'`); returns new trip |
| `editDive(trip, id, patch)` | 27 | Shallow-merges `patch` onto the matching dive; returns new trip |
| `removeDive(trip, id)` | 34 | Filters the dive out; returns new trip |
| `rescheduleDive(trip, id, startDateTime)` | 38 | Sugar for `editDive` that only updates `startDateTime`; returns new trip |

A trip dive shape: `{ id, startDateTime (epoch minutes), maxDepth, bottomTime, gases }`.

**Implementation notes**

- `addDive` delegates id assignment to the private `nextId(dives)` helper (`tripState.js:13`), which scans existing ids for the highest numeric suffix and returns `'d<max+1>'`. This is max-based (not length-based) so ids never collide after a removal.
- All four exports are pure: `trip` in, new `trip` out, no mutation.

### `js/ndlPreview.js`

Position-aware NDL preview for a candidate dive at an arbitrary point in a trip. A dive's carried-in tissue load depends only on the dives before it, not on its own duration — so the candidate is inserted as a placeholder, `planTrip` is run to extract `startingTissue`, and that seed is passed to the new `initialTissuePressures` parameter of `calculateNDL`.

Pure module — no DOM, no side effects.

Imports: `planTrip` from `tripPlanner.js`; `addDive` from `tripState.js`; `calculateNDL` from `decoModel.js`.
Imported by: the trip-planner sandbox page (via `AddDiveDialog`).

**Exports**

| Signature | Line | Description |
|---|---|---|
| `previewNdl(trip, candidate, gfLow = trip.gfLow ?? 100)` | 21 | Returns the pre-saturation-aware NDL in minutes for a candidate dive. `candidate` shape: `{ startDateTime, maxDepth, gases }`. `gfLow` is a percentage (0–100). |

**Implementation notes**

- Inserts a placeholder dive with `bottomTime: 1` — the value is irrelevant because `startingTissue` depends only on prior dives and the surface gap (`ndlPreview.js:25`).
- Resolves N₂ fraction from `candidate.gases[0].n2`; falls back to `0.79` when no gases are supplied (`ndlPreview.js:32`).
- Passes `gfLow / 100` to `calculateNDL` because `calculateNDL` expects a decimal fraction, while the trip config and callers use percentages (`ndlPreview.js:33`).

### `js/calendarLayout.js`

Pure calendar layout engine (sub-project ③). Converts a `planTrip` result into day columns and absolutely-positioned duration blocks. No DOM; the renderer (`TripCalendar`) maps the output percentages to pixels.

Pure module — no DOM, no side effects.

Imports: none.
Imported by: `js/components/TripCalendar.js`.

**Exports**

| Signature | Line | Description |
|---|---|---|
| `computeCalendarLayout(planResult, windowConfig)` | 19 | Returns `{ dayCount, baseDay, blocks }` |

`windowConfig` shape: `{ dayStartMin, dayEndMin, dayCount }` — visible window as minutes-of-day (e.g. `{ dayStartMin: 360, dayEndMin: 1200 }` for 06:00–20:00) plus the caller-supplied column count. `dayCount` is **not** derived from the dives; it comes from the trip configuration.

`planResult` shape: `planTrip()` output — `{ dives: [{id, startDateTime, endDateTime}], conflicts: [{diveId}] }`. `startDateTime` values are trip-relative minutes (day 0 = trip-start midnight).

Return value:

```javascript
{
    dayCount: number,   // echoed from windowConfig.dayCount (caller-supplied)
    baseDay:  number,   // always 0 — days are trip-relative, not epoch-absolute
    blocks: [
        {
            diveId:        string,
            dayIndex:      number,   // floor(startDateTime / 1440) — trip-relative column index
            topPct:        number,   // top edge as % of window span (clamped 0–100)
            heightPct:     number,   // block height as % of window span (clamped 0–100)
            conflict:      boolean,  // true if diveId appears in planResult.conflicts
            startMinOfDay: number,   // dive start as minutes-of-day (may be < dayStartMin)
            endMinOfDay:   number    // dive end clamped to dayEndMin
        },
        ...
    ]
}
```

**Implementation notes**

- `baseDay` is always `0`; trip-relative epoch minutes already count from day 0 so no offset is needed (`calendarLayout.js:45`).
- `dayIndex` is `floor(startDateTime / 1440)` (`calendarLayout.js:27`).
- Block top clips early dives: `visibleStart = Math.max(startMinOfDay, dayStartMin)` (`calendarLayout.js:31`).
- Dives crossing midnight are clamped to `dayEndMin` for v1 (documented limitation, `calendarLayout.js:29`).
- `dayCount` is taken directly from `windowConfig.dayCount`; the function no longer derives it from the dives (`calendarLayout.js:20, 45`).

### `js/diveProfile.js`

Waypoint-array validation and statistics. No algorithm content.

Imports: none.
Imported by: `main.js`.

| Signature | Line | Description |
|---|---|---|
| `createDefaultProfile()` | 12 | Hardcoded 40 m × 20 min with 9/6/3 m stops |
| `validateProfile(profile)` | 32 | Returns `{valid, errors, warnings}` |
| `parseProfileInput(inputData)` | 105 | Parses `time\tdepth`-style text into waypoint array |
| `calculateRates(profile)` | 117 | Returns `[{from, to, rate, type: 'descent'|'ascent'|'level'}]` |
| `getDiveStats(profile)` | 145 | `{maxDepth, totalTime, maxDescentRate, maxAscentRate, waypointCount}` |

First waypoint must be `(time=0, depth=0)`; this is enforced so decompression dives can be detected correctly (`diveProfile.js:45–50`). Depths greater than 60 m and non-surface endings produce warnings, not errors.

### `js/tissueEducation.js`

Chart.js-driven educational animations for `tissue-loading.html`. Not imported as a library (no exports); executes on module load.

**Constants used** (duplicated from `decoModel.js` for page self-containment):

- `WATER_VAPOR_PRESSURE = 0.0627` (line 7)
- `SURFACE_PRESSURE = 1.01325` (line 8)
- `N2_FRACTION = 0.7902` (line 9)
- `SURFACE_ALVEOLAR_N2` ≈ 0.755 bar (line 10)

**Internal functions:** `animateTissueBars()` (line 129), `calculateOngassing()` (line 320), `calculateOffgassing()` (line 462). All use `P(T) = target + (initial − target) × e^(−ln2·T)` on a 0–6 half-time axis with 0.5 T steps.

## Charts (`js/charts/`)

### `DiveProfileChart.js`

Class component (~1600 lines) rendering the depth-vs-time chart with ceiling overlay, gas-switch markers, deco-stop annotations, and optional tissue-compartment overlays.

Exports: `class DiveProfileChart` (line 63), factory `createDiveProfileChart(container, config)` (line 1609).

Imports: `COMPARTMENTS` from `tissueCompartments.js`; `calculateTissueLoading`, `calculateCeilingTimeSeries`, `getAmbientPressure`, and others from `decoModel.js`; `theme`, `applyChartTheme`, `formatAxis` from `chartTheme.js`; `validateDiveSetup`, `normalizeDiveSetup`, `mergeOptions`, `DEFAULT_DIVE_PROFILE_OPTIONS` from `chartTypes.js`; `translate` from `i18n.js`; `getGases`, `getGasSwitchEvents` from `diveSetup.js`.

Key methods: `constructor(container, config)`, `_render()`, `update(diveSetup)`, `destroy()`, `_buildTissueControls()`. Accepts `options.mode` values for profile-only, tissue-overlay, or ppO₂/ppN₂ overlays. Listens for the global `languagechange` event.

### `MValueChart.js`

Class component (~1400 lines) rendering the pressure-pressure (P-P) M-value diagram with time-slider playback.

Exports: `class MValueChart` (line 87), factory `createMValueChart(container, config)` (line 1434).

Imports same as `DiveProfileChart.js` plus chart-specific helpers. Uses `createInteractionLockBtn` from `interactionLock.js`.

Key methods: `_setupKeyboardShortcuts()` (arrow keys step time, shift+arrow jumps waypoint, space toggles play/pause, home/end jump to start/end). Playback loop redraws with `chart.update('none')` to keep the slider smooth.

### `GFChart.js`

Class component (~1300 lines) plotting instantaneous GF (%) per compartment against ambient pressure, with the GF corridor as a shaded band.

Exports: `class GFChart` (line 81), factory `createGFChart(container, config)` (line 1311).

Plots `100 × (P_tissue − P_amb) / (a + P_amb/b − P_amb)` per compartment, the 100 % Bühlmann reference line, a shaded corridor from GF-low at pAnchor to GF-high at surface, and a vertical line at pAnchor.

### `chartTheme.js`

Chart.js theme glue (~200 lines). No state; idempotent.

| Export | Line | Description |
|---|---|---|
| `theme()` | 30 | Reads CSS custom properties from `:root`, returns a palette object |
| `applyChartTheme()` | 62 | Applies defaults to `Chart.defaults` globally |
| `depthGradient(ctx, area, strong, weak)` | 149 | Canvas gradient helper |
| `formatAxis(v, decimals=0)` | 166 | Axis-tick formatter |
| `watchThemeChanges(onChange)` | 180 | Observes `prefers-color-scheme` / data-theme attribute |

### `chartTypes.js`

Validation and normalisation of `diveSetup` objects for chart consumption (~300 lines).

| Export | Line | Description |
|---|---|---|
| `DEFAULT_ENVIRONMENT` | 146 | Salinity, altitude |
| `DEFAULT_DIVE_PROFILE_OPTIONS` | 156 | Chart display toggles |
| `DEFAULT_TISSUE_PRESSURE_OPTIONS` | 184 | Tissue overlay defaults |
| `mergeOptions(defaults, user)` | 208 | Shallow-per-key deep merge |
| `validateDiveSetup(setup)` | 230 | Returns `{valid, errors}` |
| `normalizeDiveSetup(setup)` | 298 | Applies defaults, coerces types, returns a fresh object. Preserves `initialTissuePressures` from the input setup, defaulting to `null` (surface equilibrium). When non-null this value is threaded into each chart's `calculateTissueLoading` call (`DiveProfileChart.js:842`, `MValueChart.js:899`, `GFChart.js:871`) to seed tissues from a prior dive's residual state for repetitive-dive rendering. |

### `interactionLock.js`

Small helper (~100 lines) that adds a toggle button to lock/unlock Chart.js zoom/pan on mobile.

| Export | Line | Description |
|---|---|---|
| `createInteractionLockBtn(getChart, container, opts)` | 22 | Injects a button and wires the `zoom` plugin's `enabled` flag |

### `BubbleModel.js`

`class BubbleModel` (line 28). A visualisation-only toy model, not wired into the decompression algorithm.

## Components (`js/components/`)

### `DiveSetupEditor.js`

`class DiveSetupEditor extends EventTarget` (line 115; ~1700 lines). Embeddable form editor that produces the `diveSetup` JSON consumed by the three chart components.

Default export at line 1674. Emits `change` events with `detail.diveSetup` when the form mutates (configurable via `options.emitOnInput`). Sections: gas management (library + custom), waypoint editor with drag-reorder, gradient-factor sliders with presets (Bühlmann, Conservative, Deco Planner), safety stop, SAC rates, import/export JSON textarea. Re-renders on `languagechange`.

Multi-dive toggle (`showMultiDive`) exists but only `dives[0]` is rendered by the chart components; see the note in `CLAUDE.md`.

### `TripCalendar.js`

`class TripCalendar extends EventTarget` (line 21). Renders a `planTrip` result as duration-spanning blocks across day columns, with a left-side hour ruler, per-column date headers, and hour gridlines. Owns no trip state — it reads a plan result and emits interaction events; the caller mutates state and re-renders.

Imports: `computeCalendarLayout` from `../calendarLayout.js`.
Imported by: the trip-planner sandbox page.

**Constructor**

```javascript
new TripCalendar(container, config = {})
// config.window: { dayStartMin, dayEndMin, dayCount }
//   defaults: { dayStartMin: 360, dayEndMin: 1200, dayCount: 3 } (06:00–20:00, 3 columns)
// config.startDate: ISO date string for the first column header (default '2026-06-15')
```

**Methods**

| Signature | Line | Description |
|---|---|---|
| `configure({ startDate, dayCount })` | 30 | Updates `this.startDate` and/or `this.window.dayCount` without re-rendering; call before `render` |
| `render(planResult)` | 36 | Clears `container`; draws a left hour ruler, exactly `dayCount` day columns (each with a date header and hour gridlines), and dive blocks from the `planTrip` result |
| `toStartDateTime(dayIndex, minutesOfDay)` | 112 | Converts a `createAt` event's `{dayIndex, minutesOfDay}` to a trip-relative epoch-minute start (`dayIndex * 1440 + minutesOfDay`) |

**Events** (CustomEvent dispatched on the instance)

| Event | `detail` | Trigger |
|---|---|---|
| `createAt` | `{ dayIndex, minutesOfDay }` | User clicks empty area in a day column |
| `selectDive` | `{ diveId }` | User clicks a rendered dive block |

**Implementation notes**

- Renders exactly `dayCount` columns (from `this.window.dayCount`); no phantom extra column (`TripCalendar.js:59`).
- Left hour ruler (`.tc-ruler`) contains `.tc-hour-label` divs positioned by `top` percentage (`TripCalendar.js:44–55`).
- Each column gets a `.tc-day-header` div showing the formatted date (`formatDayHeader` at line 15) using `this.startDate` and the column index (`TripCalendar.js:65–68`).
- Hour gridlines (`.tc-hour-line`) are injected into each column at the same percentage positions as the ruler labels (`TripCalendar.js:71–76`).
- Click position within a column is converted to `minutesOfDay` and snapped to `SNAP_MIN = 5` minutes (`TripCalendar.js:84`).
- Block labels read `dive.maxDepth` from the `planResult.dives` map (`TripCalendar.js:99`), so `planTrip` must echo `maxDepth` onto result dives.
- Conflict blocks receive the `tc-conflict` CSS class (`TripCalendar.js:96`).
- `toStartDateTime` no longer uses `_layout.baseDay` (always 0); it computes `dayIndex * 1440 + minutesOfDay` directly (`TripCalendar.js:113`).

### `AddDiveDialog.js`

`class AddDiveDialog extends EventTarget` (line 9). Modal dialog for adding a new dive at a given calendar position. Supports two modes:

- **Custom** — user enters depth and bottom time manually.
- **No-deco** — user enters depth; bottom time is computed as the NDL for that depth and position in the trip (read-only).

Physics is injected: the caller supplies a `computeNdl(startDateTime, maxDepth, gases) → minutes` callback so the dialog stays pure and testable without a full trip.

Imports: none (physics injected via callback).
Imported by: the trip-planner sandbox page.

**Constructor**

```javascript
new AddDiveDialog(container)
```

**Methods**

| Signature | Line | Description |
|---|---|---|
| `open(opts)` | 18 | Renders the dialog into `container`. `opts` shape: `{ startDateTime, gases, defaultDepth=18, defaultTime=40, computeNdl }`. Calls `computeNdl` on every depth change to update the NDL display and the No-deco bottom-time field. Shows a deco warning when Custom time exceeds NDL. |
| `close()` | 73 | Clears `container.innerHTML`. |

**Events** (CustomEvent dispatched on the instance)

| Event | `detail` | Trigger |
|---|---|---|
| `add` | `{ startDateTime, maxDepth, bottomTime, gases }` | User clicks "Add" |
| `cancel` | — | User clicks "Cancel" |

**Implementation notes**

- `computeNdl` is called with the dialog's current `startDateTime` and the live depth value on every depth input and mode switch (`AddDiveDialog.js:46`).
- In No-deco mode, `timeEl.disabled = true` and `timeEl.value` is overwritten with the NDL each refresh (`AddDiveDialog.js:49–50`).
- The deco warning reads: "⚠ deco — exceeds NDL (N min) for this depth at this point in the trip" (`AddDiveDialog.js:53`).

### `DiveEditPanel.js`

`class DiveEditPanel extends EventTarget` (line 26). Per-dive edit panel combining a start date/time field with a stripped-down `DiveSetupEditor` (quick-setup depth/bottom-time + gas management). Emits `apply` and `remove` events; owns no trip state.

Imports: `DiveSetupEditor` from `./DiveSetupEditor.js`.
Imported by: the trip-planner sandbox page.

**Constructor**

```javascript
new DiveEditPanel(container)
```

**Methods**

| Signature | Line | Description |
|---|---|---|
| `open(dive, startDate)` | 34 | Renders the edit panel for `dive` into `container`; `startDate` is an ISO date string (`'YYYY-MM-DD'`) for the trip start, used to re-base the epoch↔datetime-local conversion. Defaults to `'2026-01-01'` when not supplied. Wires change listeners. |
| `close()` | 104 | Destroys the embedded editor and clears `container` |

**Events** (CustomEvent dispatched on the instance)

| Event | `detail` | Trigger |
|---|---|---|
| `apply` | `{ id, patch: { startDateTime, maxDepth, bottomTime, gases } }` | Any field changes (gas editor `change`, datetime input `change`, quick depth/time `change`) |
| `remove` | `{ id }` | "Remove dive" button clicked |

**Implementation notes**

- The embedded `DiveSetupEditor` is opened with `showProfiles: false`, `showQuickSetup: true`, `showGradientFactors: false`, `showSacRate: false`, `showMultiDive: false`, `showSurfaceInterval: false`, `showDescription: false`, `showImportExport: false` (`DiveEditPanel.js:56–62`).
- `maxDepth` and `bottomTime` are read from `editor.elements.quickDepth` / `editor.elements.quickTime` rather than from `getDiveSetup().dives[0].waypoints`, because waypoints are only populated after "Generate Profile" is clicked (`DiveEditPanel.js:81–82`).
- Quick-setup depth/time inputs only fire `_updateNDLDisplay` internally, not the editor's `change` event, so `DiveEditPanel` attaches its own `change` listeners to those inputs (`DiveEditPanel.js:95–98`).
- Epoch-minute ↔ `<input type="datetime-local">` conversion uses a `base` computed from the `startDate` argument at `open` time via `Date.UTC(y, m-1, d)` (`DiveEditPanel.js:41–42`). UTC reads/writes ensure the displayed time is not shifted by the user's local UTC offset. The helper functions `epochMinToLocalInput` and `localInputToEpochMin` are module-private (`DiveEditPanel.js:13–24`).

### `RuntimeTable.js`

Runtime table for a single executed dive profile (sub-project ②). Splits pure row derivation from DOM rendering so the logic is unit-testable without a browser.

Imports: none.
Imported by: the repetitive-dive detail view (sandbox).

**Exports**

| Signature | Line | Description |
|---|---|---|
| `buildRuntimeRows(profile, gases)` | 19 | Pure function. Derives ordered runtime rows from an executed dive profile. Returns `Array<{ phase, depth, segmentTime, runTime, gas, isStop }>`. |
| `renderRuntimeTable(rows)` | 71 | DOM-only. Accepts the output of `buildRuntimeRows` and returns an `HTMLTableElement` with class `runtime-table`. |

`buildRuntimeRows` row shape:

| Field | Type | Description |
|---|---|---|
| `phase` | `'descent'` \| `'bottom'` \| `'ascent'` \| `'stop'` | Phase label. Level segments at max depth are `bottom`; all other level segments are `stop`. |
| `depth` | `number` | Depth (m) at end of segment (arrival depth for descent/ascent; held level for bottom/stop). |
| `segmentTime` | `number` | Duration of this segment (minutes). |
| `runTime` | `number` | Absolute run time at end of segment (minutes from dive start). |
| `gas` | `string` | Human-readable name of the active gas for this segment. |
| `isStop` | `boolean` | `true` when `phase === 'stop'` (convenience flag for table row styling). |

`profile` input: the result object from `generateDecoProfile` — expects `{ waypoints: [{ time, depth, gasId? }], … }` with absolute times in minutes.
`gases` input: `[{ id, name, … }]`; `gases[0]` is the starting gas.

**Implementation notes**

- Zero-length segments (e.g. in-transit gas-switch marker waypoints) are skipped (`RuntimeTable.js:38`).
- Gas tracking follows `wp.gasId` on each waypoint; falls back to `gases[0]` for unmarked segments (`RuntimeTable.js:27`, `RuntimeTable.js:35`).

### `TissueSaturationSim.js`

`class TissueSaturationSim` (line 51). Pure UI controller for the tissue-saturation canvas on `tissue-loading.html`. No algorithm exports.

### `HeroMotion.js` / `StickyTOC.js` / `tooltipShortcut.js`

Small UI helpers:

| Export | Line | Description |
|---|---|---|
| `mountHeroMotion(root)` | 82 in `HeroMotion.js` | Landing-page animated background |
| `initStickyTOC(options)` | 26 in `StickyTOC.js` | Scroll-spy for theory-page TOCs |
| `initTooltipShortcut()` | 13 in `tooltipShortcut.js` | Keyboard access for help tooltips |

## Utilities

### `js/i18n.js`

Custom JSON-based i18n (no library). Loads `locales/{lang}.json`, applies translations to `data-i18n` DOM attributes, persists selection in `localStorage['deco-theory-lang']`.

Exports (all from line 333):

| Name | Description |
|---|---|
| `initI18n()` | Detects browser language, loads translations, wires `languagechange` |
| `setLanguage(lang)` | Switches active language and fires `languagechange` |
| `getCurrentLanguage()` | Returns the active code (`'en'`, `'cs'`, `'es'`) |
| `createLanguageSwitcher(container, options)` | Renders the dropdown switcher |
| `translate(key, vars)` | Lookup by dot-notation key, supports `{0}`, `{1}` interpolation |
| `SUPPORTED_LANGS` | `['en', 'cs', 'es']` |

Locale files are in `locales/` (`en.json`, `cs.json`, `es.json`).

### `js/nav.js`

Centralised navigation menu for all HTML pages.

Exports (line 247): `initNavigation`, `NAV_ITEMS`. `NAV_ITEMS` is the authoritative menu structure (sandbox, theory, tests, about), and `initNavigation()` renders it into `.nav-links`, detects the active page, and handles subdirectory path prefixing for `/sandbox/`.

### `js/urlParams.js`

URL-based dive-setup share links.

| Export | Line | Description |
|---|---|---|
| `encodeDiveSetup(setup)` | 28 | Compact base64-ish encoding for `?p=…` |
| `decodeDiveSetup(encoded)` | 70 | Inverse |
| `getSandboxUrl(setup, options)` | 109 | Produces an "Open in Sandbox" link |
| `getChartModeFromUrl()` | 133 | Reads `?mode=…` |
| `getProfileFromUrl()` | 143 | Reads `?p=…` and decodes |
| `updateUrlWithProfile(setup)` | 155 | `history.replaceState` without reloading |

### `js/icons.js`

SVG-sprite helper.

| Export | Line | Description |
|---|---|---|
| `iconHTML(name, cls, title)` | 20 | Returns an `<svg><use …/></svg>` string |
| `iconElement(name, cls, title)` | 37 | Returns a live DOM element |

### `js/main.js`

Entry point for the legacy single-page sandbox view. No exports — executes on module load. Wires `DiveSetupEditor`-less controls directly: loads a setup, validates it with `validateProfile`, runs `calculateTissueLoading`, renders via `visualization.js`.

### `js/visualization.js`

Legacy Chart.js visualisation used by `main.js`. Modern pages use the class components in `js/charts/` instead.

| Export | Line | Description |
|---|---|---|
| `renderChart(canvas, results, visibleCompartments, gasSwitchEvents, ceilingDepths)` | 19 | One-shot chart render |
| `toggleCompartment(id, visible)` | 272 | Show/hide a compartment line |
| `showOnlyCompartments(ids)` | 289 | Isolate a selection |
| `showAllCompartments()` | 305 | Reset |
| `hideAllCompartments()` | 321 | Clear |
| `getChart()` | 338 | Access the underlying Chart instance |

### `js/quiz.js`

Generic quiz engine for the seven CMAS / SPČR quiz pages. No exports — executes on DOM load; reads `data/quiz-{name}.json` based on a URL parameter, renders questions with category filtering, shuffling, and scoring. See [Extending-DecoJS](Extending-DecoJS.md#adding-a-new-quiz) for the JSON format.

## Sandbox pages

- [`sandbox/m-values.html`](https://decotheory.eu/sandbox/m-values.html) — Two-playground sandbox for the M-value formula and its derivation. Top playground evaluates `M = a + P_amb/b`. Bottom playground exposes the analytical curves `a(t½)` and `b(t½)` with 16 ZH-L16 compartments overlaid as dots (variants A/B/C lift dots off the curves selectively).
