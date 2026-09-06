# Algo-06 — Ceiling Time Series

A per-timepoint ceiling overlay for chart rendering. This is separate from deco scheduling — the scheduler computes stops, this computes what the ceiling *looks like* moment-by-moment so the chart can draw it as a red line approaching zero as deco proceeds.

## Entry points

```javascript
// js/decoModel.js:483 (signature)
export function calculateCeilingTimeSeries(results, gfLow, gfHigh = gfLow)
```

Thin wrapper returning only the overall `ceilingDepths` array. Most callers want the detailed version:

```javascript
// js/decoModel.js:510 (signature)
export function calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh = gfLow, providedPAnchor = null)
```

Both functions read `results.surfacePressure`, produced by
`calculateTissueLoading`, so a zero-metre ceiling means the selected altitude
surface rather than sea level.

Returns:

```javascript
{
  ceilingDepths: [...],        // overall ceiling depth (m) at each time point
  compartmentCeilings: {        // per-compartment ceilings for the M-value chart
    1: [0, 0, ..., 1.2, 2.1, ...],
    2: [...], ..., 16: [...]
  },
  gfValues: [...],             // GF in effect at each time point (for debugging)
  pAnchor: 2.40                // the anchor pressure actually used
}
```

`results` is the object returned by `calculateTissueLoading` (see [Algo-01-Ascent-Simulation](Algo-01-Ascent-Simulation.md)).

## Algorithm

### 1. Detect the start of ascent

```javascript
// js/decoModel.js:633-648
let maxDepthSeen = results.depthPoints[0];
…
for (let i = 0; i < results.timePoints.length; i++) {
    if (results.depthPoints[i] > maxDepthSeen) maxDepthSeen = results.depthPoints[i];
}
let ascentStartIndex = 0;
const depthTolerance = 0.1;
for (let i = 0; i < results.timePoints.length; i++) {
    if (Math.abs(results.depthPoints[i] - maxDepthSeen) < depthTolerance) {
        ascentStartIndex = i;
    }
}
```

"Start of ascent" = the **last** time index still at max depth. The 0.1 m tolerance absorbs floating-point drift in the waypoint interpolation.

### 2. Compute `pAnchor` once

```javascript
// js/decoModel.js (calculateCeilingTimeSeriesDetailed)
if (pAnchor === null) {
    const tissuesAtAscentStart = {};
    for (const compId of Object.keys(results.compartments)) {
        tissuesAtAscentStart[compId] = results.compartments[compId].pressures[ascentStartIndex];
    }
    const n2Fraction = results.n2Fractions ? results.n2Fractions[ascentStartIndex] : N2_FRACTION;
    ({ pAnchor } = findFirstStopAtGFLow(tissuesAtAscentStart, maxDepthSeen, n2Fraction, gfLow));
}
```

If the caller passes `providedPAnchor` (e.g., from `generateDecoSchedule`'s return value), it is used verbatim. Otherwise `findFirstStopAtGFLow` is called once on the tissue state at ascent start — the same helper the scheduler uses, so the chart and scheduler always agree on the anchor.

**Why `pAnchor` must come from outside when possible**: it is a property of the *ascent* — of the tissue state right before the diver starts heading up. It is not recomputed per timepoint because that would produce a different value at every sample and cause the displayed ceiling to disagree with the scheduler's ceiling. Passing it in from `generateDecoSchedule` (or having both call sites use `findFirstStopAtGFLow`) guarantees chart-and-scheduler consistency.

### 3. Per-timepoint GF and ceiling

```javascript
// js/decoModel.js:668-710
for (let i = 0; i < results.timePoints.length; i++) {
    const currentDepth = results.depthPoints[i];
    const currentAmbient = results.ambientPressures[i];

    const tissuePressures = {};
    for (const compId of Object.keys(results.compartments)) {
        tissuePressures[compId] = results.compartments[compId].pressures[i];
    }

    const isAscending = currentDepth < previousDepth;
    if (isAscending && !ascentStarted && currentDepth < maxDepthSeen) {
        ascentStarted = true;
    }

    let gf;
    if (!ascentStarted || currentAmbient >= pAnchor) {
        gf = gfLow;
    } else {
        gf = interpolateGF(currentAmbient, pAnchor, gfLow, gfHigh);
    }
    gfValues.push(gf);

    let maxCeilingDepth = 0;
    for (const comp of COMPARTMENTS) {
        const tissueP = tissuePressures[comp.id];
        const ceilingPressure = getCompartmentCeiling(tissueP, comp.aN2, comp.bN2, gf);
        const ceilingDepth = Math.max(0, (ceilingPressure - SURFACE_PRESSURE) / PRESSURE_PER_METER);
        compartmentCeilings[comp.id].push(ceilingDepth);
        if (ceilingDepth > maxCeilingDepth) maxCeilingDepth = ceilingDepth;
    }

    ceilingDepths.push(maxCeilingDepth);
    previousDepth = currentDepth;
}
```

Per iteration:

- Decide which GF to use. Before ascent, or at any moment $P_{amb} \ge pAnchor$, use $GF_{low}$. After ascent has started and we are above `pAnchor`, interpolate.
- For each of the 16 compartments, call `getCompartmentCeiling` with the active GF. Convert to depth.
- Overall ceiling is the max (deepest) across all compartments.

## Pre-ascent behavior

During descent and bottom time, `ascentStarted` is false and `gf = gfLow` regardless of depth. The ceiling is drawn as if the diver were already on the $GF_{low}$ line. This is informational — the diver is not ascending so there is no ceiling to violate at the bottom — but it makes the chart visually consistent: the ceiling line is always present, and the moment ascent starts, the GF ramp kicks in and the ceiling begins tracking upward smoothly.

## Visual output

- **DiveProfileChart** (`js/charts/DiveProfileChart.js`) takes `ceilingDepths` and draws a red line. Above the depth curve = safe; crossing the depth curve = violation.
- **MValueChart** (`js/charts/MValueChart.js`) uses `compartmentCeilings[compId]` to color-code each compartment's ceiling individually, so the user can see which tissue is leading.

## Consistency with the scheduler

`generateDecoSchedule` returns `pAnchor` in its result (`js/decoModel.js:1136`). The sandbox view passes this value as `providedPAnchor` when calling `calculateCeilingTimeSeriesDetailed`, so the displayed ceiling is computed with the same anchor used to find the actual stops. Without this, the displayed ceiling could disagree with the scheduler at sub-bar resolution — visible as a chart ceiling that "passes through" a planned deco stop.

## Cross-references

- [Algo-01-Ascent-Simulation](Algo-01-Ascent-Simulation.md) — produces the `results` object consumed here.
- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md) — `findFirstStopAtGFLow`, the canonical anchor computation.
- [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) — `generateDecoSchedule` returns the `pAnchor` to pass in as `providedPAnchor`.
- [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — `interpolateGF` and the ramp geometry.
