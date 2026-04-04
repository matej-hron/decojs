# DecoJS Algorithm Reference

Technical reference for the Buhlmann ZH-L16 decompression algorithm implementation in DecoJS. Every code reference uses the format `file:line`.

---

## Table of Contents

1. [Core Algorithm Flow](#1-core-algorithm-flow)
2. [GF Anchor (pAnchor) Calculation](#2-gf-anchor-panchor-calculation)
3. [First Stop Finding](#3-first-stop-finding)
4. [GF Interpolation](#4-gf-interpolation)
5. [Deco Loop](#5-deco-loop)
6. [Ceiling Time Series](#6-ceiling-time-series)
7. [M-Value Chart Rendering](#7-m-value-chart-rendering)
8. [Known Limitations / Design Decisions](#8-known-limitations--design-decisions)

---

## 1. Core Algorithm Flow

### Entry Point: User clicks "Generate Profile"

The flow begins in `DiveSetupEditor._generateProfile()` (`js/components/DiveSetupEditor.js:1230`). This method:

1. Reads UI inputs: `maxDepth`, `bottomTime`, `gfLow`, `gfHigh`, safety stop settings, and `continuousDeco` flag.
2. Calls `generateDecoProfile()` with the current gas list and options:

```
const result = generateDecoProfile(maxDepth, bottomTime, this.currentGases, gfLow, gfHigh, safetyStop, { continuousDeco });
```
(`js/components/DiveSetupEditor.js:1254`)

3. Loads the resulting waypoints into the waypoints table and triggers `_onInputChange()`, which propagates the new dive setup to all connected chart components (DiveProfileChart, MValueChart).

### generateDecoProfile() -- js/diveSetup.js:319

This is the main orchestrator. Inputs:

- `maxDepth` (meters), `bottomTime` (minutes from dive start)
- `gases` -- array of gas objects `[{id, name, o2, n2, he}]`, first is always the bottom gas
- `gfLow`, `gfHigh` -- as percentages (0-100)
- `safetyStop` -- `{enabled, depth, time}`
- `options` -- `{continuousDeco: boolean}`

Key steps:

1. **Convert GF to decimals** (`js/diveSetup.js:331-332`):
   ```
   const gfLowDec = gfLow / 100;
   const gfHighDec = gfHigh / 100;
   ```

2. **Calculate NDL** (`js/diveSetup.js:338`): Calls `calculateNDL(maxDepth, bottomGas.n2, gfLowDec)`. NDL uses GF Low because that is the threshold that determines whether a first deco stop is required.

3. **Check if deco is required** (`js/diveSetup.js:345`): `requiresDeco = bottomTime > ndl`. If within NDL, delegates to `generateSimpleProfile()` (`js/diveSetup.js:238`) which builds a descent-bottom-safetyStop-ascent waypoint sequence.

4. **Simulate tissue loading to end of bottom time** (`js/diveSetup.js:365-378`):
   - Initialize all 16 compartments at surface saturation: `getInitialTissueN2(bottomGas.n2)` (`js/decoModel.js:63`)
   - Simulate descent with Schreiner equation: `simulateDepthChange(tissues, 0, maxDepth, descentTime, bottomGas.n2)` (`js/decoModel.js:830`)
   - Simulate bottom time at constant depth with Haldane equation: `simulateDepthTime(tissues, maxDepth, actualBottomDuration, bottomGas.n2)` (`js/decoModel.js:808`)

5. **Generate deco schedule** (`js/diveSetup.js:381-383`):
   ```
   const { stops, gasSwitches, totalTime, pAnchor, anchorDepth } = generateDecoSchedule(
       tissues, maxDepth, bottomGas.n2, gfLowDec, gfHighDec, gases, options
   );
   ```

6. **Build waypoints from deco schedule** (`js/diveSetup.js:386-502`): Merges deco stops and gas switches into a sorted event list (by depth, descending), then converts to waypoints with proper ascent times. Also decides whether to add a safety stop after deco clears.

### generateDecoSchedule() -- js/decoModel.js:869

This is the core deco engine. It receives tissue pressures at end of bottom time and produces deco stops. The algorithm proceeds through these phases:

1. Calculate gas switch depths (MOD)
2. Find pAnchor (GF Low anchor)
3. Find first stop depth
4. Execute deco loop (ascend stop-by-stop to surface)

Each phase is detailed in the sections below.

---

## 2. GF Anchor (pAnchor) Calculation

### What pAnchor represents

pAnchor is the ambient pressure during a hypothetical *unconstrained* ascent where the maximum instantaneous gradient factor across all 16 tissues first equals GF Low. It defines the deep end of the GF interpolation ramp: GF = GF_low at pAnchor, GF = GF_high at surface (1.0 bar), linearly interpolated between.

Physically, pAnchor represents the theoretical depth where decompression stress first reaches the GF Low threshold -- the point where, in Baker's model, the diver would need to begin respecting decompression limits.

### findGFLowAnchor() -- js/decoModel.js:227

**Signature:**
```
findGFLowAnchor(tissuePressures, currentDepth, n2Fraction, gfLow, ascentRate = 10, gasSwitchPoints = null)
```

**Algorithm, step by step:**

1. **Check initial condition** (`js/decoModel.js:233-241`): If `GF_max >= gfLow` at the current depth, the diver is already at or beyond the anchor -- return current depth/pressure immediately.

2. **Sort gas switch points** (`js/decoModel.js:244-248`): If `gasSwitchPoints` is provided, sort by `switchDepth` descending (deepest first). Track `currentN2` starting from the input `n2Fraction`.

3. **Simulate ascent in 0.1 bar steps** (~1 meter) (`js/decoModel.js:256-305`):
   - At each step, compute `nextAmbient = max(SURFACE_PRESSURE, currentAmbient - 0.1)` and corresponding `nextDepth`.
   - Check for gas switches: if `nextDepth <= sp.switchDepth` for any switch point and the new gas has lower N2, switch to it (`js/decoModel.js:261-265`).
   - Simulate tissue changes during this segment using `simulateDepthChange()` with the Schreiner equation (`js/decoModel.js:272`).
   - Calculate `GF_max` at the new pressure using `calculateMaxGF()` (`js/decoModel.js:276`).

4. **When GF_max >= gfLow** (`js/decoModel.js:278-298`):
   - Identify the leading compartment (highest GF).
   - Calculate the **exact** pAnchor using the compartment ceiling formula:
     ```
     pAnchor = getCompartmentCeiling(tissuePressure, comp.aN2, comp.bN2, gfLow)
     ```
     Which computes (`js/decoModel.js:331-336`):
     ```
     P_ceiling = b * (P_tissue - gfLow * a) / (b * (1 - gfLow) + gfLow)
     ```
   - This gives a precise pAnchor (not rounded to step boundaries).
   - Clamp to at least `SURFACE_PRESSURE` (1.0 bar).

5. **If surface reached without hitting GF Low** (`js/decoModel.js:308-315`): Return `pAnchor = SURFACE_PRESSURE` (no deco needed, or GF Low is never reached during ascent).

**Key detail -- gas-switch awareness:** The ascent simulation switches gases at MOD depths (`js/decoModel.js:261-265`). This means pAnchor accounts for the off-gassing benefit of richer deco gases. A diver carrying EAN50 will have a shallower pAnchor than one on air only, because the simulation shows tissues off-gassing faster during ascent through the EAN50 range.

**Key detail -- unconstrained ascent:** The ascent simulated here is continuous (no stops). This differs from `findFirstStopWithRampedGF()` which tests discrete grid-aligned candidates. This is why pAnchor and first stop depth can differ.

### Return value

```
{
  pAnchor: number,          // Ambient pressure in bar
  anchorDepth: number,      // Depth in meters
  leadingCompartment: number, // Compartment ID
  tissuesAtAnchor: Object   // Tissue pressures at the anchor point
}
```

---

## 3. First Stop Finding

### findFirstStopWithRampedGF() -- js/decoModel.js:505

**Signature:**
```
findFirstStopWithRampedGF(tissuePressures, currentDepth, pAnchor, currentN2, gfLow, gfHigh, stopIncrement = 3, gasSwitchPoints = null)
```

This function finds the shallowest depth on the stop grid where the diver can ascend and remain within GF-adjusted limits. It uses the **same ascent-permission logic as the deco loop** to ensure consistency.

**Algorithm:**

1. **Iterate from surface upward** (`js/decoModel.js:508`):
   ```
   for (let candidateDepth = 0; candidateDepth <= currentDepth; candidateDepth += stopIncrement)
   ```
   In standard mode, `stopIncrement = 3` (meters). In continuous mode, `stopIncrement = 0.1`.

2. **For each candidate depth, simulate the ascent** (`js/decoModel.js:512-521`):
   - If gas switch points exist, use `_simulateAscentWithGasSwitches()` which simulates segment-by-segment through each gas switch depth (`js/decoModel.js:450-477`).
   - Otherwise, simulate a single depth change from `currentDepth` to `candidateDepth`.

3. **Compute GF at the candidate depth** (`js/decoModel.js:524-525`):
   ```
   const gf = interpolateGF(candidateAmbient, pAnchor, gfLow, gfHigh);
   ```
   This uses the pAnchor-based ramp: deeper than pAnchor gets GF Low, shallower gets interpolated toward GF High.

4. **Check ceiling** (`js/decoModel.js:528-531`):
   ```
   const { ceilingDepth } = getDiveCeiling(simulatedTissues, gf);
   if (ceilingDepth <= candidateDepth) { return ... }
   ```
   If the ceiling (with post-ascent tissue state) permits staying at this depth, it is the first stop.

5. **Return** the shallowest passing candidate, including the simulated tissue state after ascent.

### _simulateAscentWithGasSwitches() -- js/decoModel.js:450

A helper that breaks the ascent into segments at each gas switch boundary:

1. Filters gas switch points to those between `fromDepth` and `toDepth` (`js/decoModel.js:456-458`).
2. For each switch point (deep to shallow), simulates ascent to that depth with the current gas, then switches gas (`js/decoModel.js:461-468`).
3. Simulates the final segment to the target depth (`js/decoModel.js:471-474`).

### How first stop differs from pAnchor

- **pAnchor** is found via a continuous 0.1-bar-step ascent simulation. It represents the *exact* pressure where GF_max = GF_low.
- **First stop** is found by testing grid-aligned candidates (0, 3, 6, 9... meters) with the GF ramp already applied. The first stop uses the interpolated GF (which may be higher than GF Low if the candidate is shallower than pAnchor).

This means the first stop can be **shallower** than pAnchor. For example, if pAnchor corresponds to 14.7m, the first stop grid candidate at 12m might pass the ceiling check because the interpolated GF at 12m is slightly higher than GF Low, allowing a bit more supersaturation.

---

## 4. GF Interpolation

### interpolateGF() -- js/decoModel.js:394

**Signature:**
```
interpolateGF(currentAmbient, pAnchor, gfLow, gfHigh)
```

**The math:**

```
GF(P_amb) = GF_low + (GF_high - GF_low) * (pAnchor - P_amb) / (pAnchor - 1.0)
```

Three cases (`js/decoModel.js:396-413`):

1. **At or deeper than pAnchor** (`currentAmbient >= pAnchor`): Returns `gfLow`. The GF ramp has not started yet.

2. **At or above surface** (`currentAmbient <= SURFACE_PRESSURE`): Returns `gfHigh`.

3. **Between pAnchor and surface**: Linear interpolation:
   ```
   fraction = (pAnchor - currentAmbient) / (pAnchor - SURFACE_PRESSURE)
   return gfLow + fraction * (gfHigh - gfLow)
   ```

**Example:** With GF 30/70 and pAnchor = 2.5 bar (15m):
- At 15m (2.5 bar): GF = 30%
- At 7.5m (1.75 bar): GF = 50% (halfway)
- At surface (1.0 bar): GF = 70%

**Why first stop can be shallower than pAnchor:** At pAnchor, GF = GF_low. As the diver ascends above pAnchor, the allowed GF increases. The ceiling check uses `getAdjustedMValue(P_amb, a, b, gf)` which computes `P_amb + gf * (M_raw - P_amb)`. A higher GF means a more permissive ceiling. So even though tissues are still loaded, the relaxed GF at a shallower depth may permit the diver to be there.

---

## 5. Deco Loop

### Overview -- js/decoModel.js:869

After finding pAnchor and first stop, `generateDecoSchedule()` enters the deco loop. Two modes exist: standard (3m grid) and continuous (0.1m grid).

### Pre-loop: Gas switch setup -- js/decoModel.js:892-922

For each gas beyond the bottom gas:
1. Calculate MOD: `mod = (switchPpO2 / gas.o2 - 1) * 10` (`js/decoModel.js:907`)
2. Round MOD toward shallower on the stop grid: `Math.floor(mod / stopIncrement) * stopIncrement` (`js/decoModel.js:914`)
3. Store as `gasSwitchPoints` sorted by depth descending.

### switchToBestGas() -- js/decoModel.js:938

Called on arrival at each stop depth. Selects the gas with the deepest MOD among those that:
- Are within MOD at current depth (`atDepth <= gas.switchDepth`)
- Have lower N2 than current gas
- Have not been used yet

This ensures sequential switching (e.g., EAN50 at 21m before O2 at 6m). Uses a "mark as used" set to prevent re-switching (`js/decoModel.js:930-963`).

### Pre-loop: Ascent to first stop -- js/decoModel.js:1006-1036

Before the deco loop, the algorithm ascends from bottom depth to first stop. Gas switches occur at MOD depths during this ascent (not just at stop depths). The ascent is simulated segment by segment through each gas switch depth, updating tissue state along the way.

### Unified Deco Loop -- js/decoModel.js:1039-1112

Both standard and continuous modes use identical logic. The only differences are `stopIncrement` (3m vs 0.1m), `timeIncrement` (1min vs 0.1min), and minimum stop time (0 vs 2min).

```
while (depth > 0) {
    switchToBestGas(depth);
    nextStopDepth = max(0, depth - stopIncrement);
    gfAtDestination = interpolateGF(getAmbientPressure(nextStopDepth), pAnchor, gfLow, gfHigh);

    // Check if ceiling at DESTINATION (with destination GF) allows ascent
    testTissues = simulateDepthChange({...tissues}, depth, nextStopDepth, ascentTime, currentN2);
    { ceilingDepth } = getDiveCeiling(testTissues, gfAtDestination);

    if (ceilingDepth <= nextStopDepth) {
        // Can ascend. Record stop if we waited here.
        if (pendingStopTime > 0) {
            // Enforce min stop time in continuous mode
            stops.push({ depth, time: pendingStopTime, gas: currentGasName });
            pendingStopTime = 0;
        }
        tissues = simulateDepthChange(tissues, depth, nextStopDepth, ...);
        depth = nextStopDepth;
    } else {
        // Cannot ascend - wait at this depth
        tissues = simulateDepthTime(tissues, depth, timeIncrement, currentN2);
        pendingStopTime += timeIncrement;
    }
}
```

Key logic:
- Steps upward by `stopIncrement` (3m standard, 0.1m continuous).
- At each step, simulates ascent to next shallower depth and checks ceiling there.
- GF is always interpolated at the **destination** depth, ensuring stops align with the GF line.
- If ceiling doesn't permit ascent, waits `timeIncrement` and retries.
- Stops are recorded only where waiting was required (`pendingStopTime > 0`).
- In continuous mode, each recorded stop has a minimum duration of 2 minutes.

### Gas Switching During Deco

`switchToBestGas(depth)` is called at the top of each loop iteration (`js/decoModel.js:1046` and `js/decoModel.js:1084`). The gas switch happens *on arrival* at a stop depth, before waiting begins. The stop time at that depth uses the new (richer) gas for tissue simulation.

---

## 6. Ceiling Time Series

### calculateCeilingTimeSeriesDetailed() -- js/decoModel.js:587

This function computes the ceiling depth at every time point from a `calculateTissueLoading()` result. It is used by `DiveProfileChart` to draw the ceiling line on the depth-time chart.

**Signature:**
```
calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh, providedPAnchor = null)
```

**Algorithm:**

1. **Find max depth and ascent start index** (`js/decoModel.js:604-618`): Scans `results.depthPoints` to find the last index at max depth (within 0.1m tolerance).

2. **Compute pAnchor if not provided** (`js/decoModel.js:622-635`): Extracts tissue pressures and N2 fraction at ascent start, then calls `findGFLowAnchor()`. This replicates the same computation done in `generateDecoSchedule()`.

3. **Process each time point** (`js/decoModel.js:638-680`):
   - Track whether ascent has started (depth decreasing from maximum).
   - Determine GF: before ascent or at/deeper than pAnchor, use GF Low. During ascent above pAnchor, use `interpolateGF()`.
   - Calculate ceiling for each compartment using `getCompartmentCeiling()` with the active GF.
   - The overall ceiling is the maximum (deepest) of all compartment ceilings.

**Relationship to deco schedule:** The ceiling time series uses the same pAnchor as the deco schedule when `providedPAnchor` is passed. When called without it (e.g., from the chart), it independently recomputes pAnchor from the tissue state at ascent start. The result should match because both use `findGFLowAnchor()` with the same tissue state.

**Note:** The ceiling time series does *not* account for gas switches during the visualization. The N2 fraction used for pAnchor calculation is taken from the ascent start point (`js/decoModel.js:630`), but the per-compartment ceiling computation at each time point does not switch gases. However, the gas switch points *are* passed to `findGFLowAnchor()` in the MValueChart rendering code (`js/charts/MValueChart.js:853-870`).

---

## 7. M-Value Chart Rendering

### MValueChart._calculate() -- js/charts/MValueChart.js:764

Calls `calculateTissueLoading()` with the dive waypoints, surface interval, and gases. This produces a time series of tissue pressures, ambient pressures, and depths at every `CALC_INTERVAL` (10 seconds, `js/decoModel.js:15`).

### MValueChart._render() -- js/charts/MValueChart.js:778

Renders a Chart.js scatter plot with X = ambient pressure, Y = tissue N2 pressure. The datasets include:

**Static reference lines:**
- **Ambient line** (y = x): The equilibrium/saturation line. Points above this are supersaturated. (`js/charts/MValueChart.js:798-809`)
- **Surface line** (x = 1 bar): Vertical line at surface pressure. (`js/charts/MValueChart.js:812-823`)

**pAnchor calculation and visualization** (`js/charts/MValueChart.js:826-889`):
1. Find max depth and ascent start index from the results.
2. Extract tissue pressures at ascent start (`js/charts/MValueChart.js:844-847`).
3. Build `gasSwitchPoints` (same MOD calculation as `generateDecoSchedule`) (`js/charts/MValueChart.js:853-864`).
4. Call `findGFLowAnchor()` with gas switch points (`js/charts/MValueChart.js:867-871`).
5. Draw a dashed vertical line at pAnchor, labeled "pAnchor (GF Low)" in orange (`js/charts/MValueChart.js:874-889`).

**Per-compartment lines (for each visible compartment):**

- **M-value line** (`js/charts/MValueChart.js:897-913`): The raw Buhlmann limit. Plotted as `y = getMValue(p, a, b) = a + p/b`. Dashed line in compartment color.

- **GF Low line** (`js/charts/MValueChart.js:918-933`): `y = getAdjustedMValue(p, a, b, gfLow) = p + gfLow * (a + p/b - p)`. Longer dashes.

- **GF High line** (`js/charts/MValueChart.js:935-950`): Same formula with gfHigh. Shorter dashes.

- **GF Corridor curve** (`js/charts/MValueChart.js:952-974`): The actual operational limit during ascent. This is a *curve* (not a straight line) because:
  ```
  M_adj(P) = P + gf(P) * (M_raw(P) - P)
  ```
  Both `gf(P)` (from interpolation) and `(M_raw(P) - P)` are linear in P, making their product quadratic. The corridor is sampled at 20 points from pAnchor to surface:
  ```
  for (let i = 0; i <= 20; i++) {
      const p = pAnchor - (pAnchor - SURFACE_PRESSURE) * (i / 20);
      const gf = interpolateGF(p, pAnchor, gfLow, gfHigh);
      const mAdj = getAdjustedMValue(p, comp.aN2, comp.bN2, gf);
      corridorData.push({ x: p, y: mAdj });
  }
  ```
  This is drawn as a solid line in the compartment color, on top of the M-value lines (order: 45).

**Tissue trajectory:**
- **Trail** (`js/charts/MValueChart.js:978-996`): Line from time 0 to current time index, showing how each tissue has moved through the P-amb/P-tissue space.
- **Current point** (`js/charts/MValueChart.js:998-1009`): Large dot at `(currentAmbient, currentTissuePressure)`.

### How to read the chart

- A tissue point *below* the ambient line is undersaturated.
- A tissue point *above* the ambient line but *below* the GF corridor curve is within the GF-adjusted limit (safe).
- A tissue point *above* the GF corridor curve but *below* the M-value line exceeds the GF limit but is within the raw Buhlmann limit.
- A tissue point *above* the M-value line has exceeded the Buhlmann M-value (dangerous).

---

## 8. Known Limitations / Design Decisions

### pAnchor != first stop (inherent to Baker's model)

`findGFLowAnchor()` simulates a *continuous* unconstrained ascent and finds the exact pressure where GF_max = GF_low. `findFirstStopWithRampedGF()` tests *discrete* grid-aligned candidates (0, 3, 6, ... meters) using the GF ramp that is already anchored at pAnchor. Because the GF increases above pAnchor, the first stop can be shallower than pAnchor.

This is not a bug -- it is inherent to Baker's pAnchor-based GF interpolation model. The pAnchor defines the GF ramp, but the actual stop depth is where the GF-adjusted ceiling permits the diver to be.

### 0.1m discrete overshoot at first stop in continuous mode

In continuous mode, `findFirstStopWithRampedGF()` uses a discrete search with `stopIncrement = 0.1` meters. This means the first stop can be up to ~0.2m deeper than pAnchor. Subsequent stops use the unified deco loop which checks ceiling at the destination GF, keeping gaps under 0.1m.

### findGFLowAnchor simulates unconstrained ascent vs findFirstStopWithRampedGF tests discrete candidates

`findGFLowAnchor` (`js/decoModel.js:227`) ascends in 0.1 bar steps (~1m) without stopping, simulating tissue changes during the ascent. `findFirstStopWithRampedGF` (`js/decoModel.js:505`) simulates a full ascent from current depth to each candidate stop depth, including tissue changes during that ascent. Both account for gas switches. The key difference is that pAnchor reflects the instantaneous GF crossing during continuous ascent, while first stop reflects the ceiling check at discrete grid points with the full GF ramp applied.

### Deco loop uses destination GF (both modes)

The unified deco loop checks ceiling at the **destination** depth with the destination's interpolated GF. This ensures deco stops align precisely with the GF interpolation line on the M-value diagram. Accuracy tests confirm subsequent stop gaps under 0.1m across all tested scenarios.

### N2-only model

The current implementation only tracks nitrogen loading. Helium is declared in gas objects (`he` field) but is not used in any tissue calculations. The `switchToBestGas()` comment explicitly notes this: "This is an N2-only model. For trimix (with He), selection logic would need to consider both inert gas fractions and their respective half-times." (`js/decoModel.js:937`)

### Ceiling time series gas-switch awareness

The `calculateCeilingTimeSeriesDetailed()` function (`js/decoModel.js:587`) computes pAnchor with gas switch points when called from MValueChart, but the per-time-point ceiling calculation does not dynamically switch the GF based on actual gas changes during the dive. It uses a single pAnchor computed at ascent start. This means the ceiling line is correct for the planned profile but would not adapt if the diver deviated from the plan.

### Calculation interval

Tissue loading in `calculateTissueLoading()` uses a 10-second interval (`CALC_INTERVAL = 10`, `js/decoModel.js:15`). This is the resolution of the time series data used for chart rendering. The deco schedule computation (`generateDecoSchedule`) uses its own simulation with exact segment durations (not discretized to 10 seconds).

### Ascent/descent rates

- Descent: 20 m/min (hardcoded in `generateDecoProfile` at `js/diveSetup.js:320` and `calculateNDL` at `js/decoModel.js:690`)
- Ascent: 10 m/min (hardcoded in `generateDecoSchedule` at `js/decoModel.js:693`, used for deco schedule and pAnchor calculation)

### Surface interval gas

During surface interval in `calculateTissueLoading()`, the gas is always air (N2 = 0.79) regardless of what gas the diver was breathing (`js/decoModel.js:1283`).

---

## Appendix: Key Equations

### Haldane Equation (constant depth) -- js/decoModel.js:78

```
P_t(t) = P_alv + (P_t0 - P_alv) * e^(-kt)
```

Where `k = ln(2) / halfTime` is the rate constant.

### Schreiner Equation (linear depth change) -- js/decoModel.js:95

```
P_t(t) = P_alv0 + R*(t - 1/k) - (P_alv0 - P_t0 - R/k) * e^(-kt)
```

Where `R` is the rate of change of alveolar pressure (bar/min).

### M-Value -- js/decoModel.js:115

```
M = a + P_amb / b
```

### GF-Adjusted M-Value -- js/decoModel.js:130

```
M_adjusted = P_amb + GF * (M_raw - P_amb)
            = P_amb + GF * (a + P_amb/b - P_amb)
```

### Compartment Ceiling -- js/decoModel.js:331

```
P_ceiling = b * (P_tissue - GF * a) / (b * (1 - GF) + GF)
```

Derived by solving `P_tissue = P_amb + GF * (a + P_amb/b - P_amb)` for `P_amb`.

### Instantaneous Gradient Factor -- js/decoModel.js:155

```
GF_i(P_amb) = (P_tissue[i] - P_amb) / (M_i(P_amb) - P_amb)
```

Negative if tissue is undersaturated, >1 if tissue exceeds the raw M-value.

### GF Interpolation -- js/decoModel.js:394

```
GF(P_amb) = GF_low + (GF_high - GF_low) * (pAnchor - P_amb) / (pAnchor - 1.0)
```
