# Algo-06 — Ceiling Time Series

A per-timepoint ceiling overlay for chart rendering. This is separate from deco scheduling — the scheduler computes stops, this computes what the ceiling *looks like* moment-by-moment so the chart can draw it as a red line approaching zero as deco proceeds.

## Entry points

```javascript
// js/decoModel.js:483 (signature)
export function calculateCeilingTimeSeries(
    results, gfLow, gfHigh = gfLow, providedPAnchor = null
)
```

This wrapper returns the same ramp-ceiling envelope used by the detailed
per-compartment result:

```javascript
// js/decoModel.js:510 (signature)
export function calculateCeilingTimeSeriesDetailed(
    results, gfLow, gfHigh = gfLow, providedPAnchor = null
)
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
  gfValues: [...],             // GF at the controlling ceiling intersection
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
    const directAscent = evaluateDirectAscent(
        tissuesAtAscentStart, maxDepthSeen, n2Fraction, gfHigh, surfacePressure
    );
    pAnchor = directAscent.ceilingDepth === 0
        ? surfacePressure
        : findFirstStopAtGFLow(
            tissuesAtAscentStart, maxDepthSeen, n2Fraction, gfLow
        ).pAnchor;
}
```

If the caller passes `providedPAnchor`, it is used verbatim. Otherwise the
function first performs the scheduler's direct-ascent check at $GF_{high}$.
Only a failed direct ascent invokes the GF Low first-stop search.

**Why `pAnchor` must come from outside when possible**: it is a property of the *ascent* — of the tissue state right before the diver starts heading up. It is not recomputed per timepoint because that would produce a different value at every sample and cause the displayed ceiling to disagree with the scheduler's ceiling. Passing it in from `generateDecoSchedule` (or having both call sites use `findFirstStopAtGFLow`) guarantees chart-and-scheduler consistency.

### 3. Per-timepoint ramp ceiling

```javascript
// js/decoModel.js (calculateCeilingTimeSeriesDetailed)
for (let i = 0; i < results.timePoints.length; i++) {
    const tissuePressures = {};
    for (const compId of Object.keys(results.compartments)) {
        tissuePressures[compId] = results.compartments[compId].pressures[i];
    }

    let maxCeilingDepth = 0;
    for (const comp of COMPARTMENTS) {
        const tissueP = tissuePressures[comp.id];
        const intersection = getCompartmentCeilingOnGFRamp(
            tissueP, comp.aN2, comp.bN2,
            gfLow, gfHigh, pAnchor,
            surfacePressure, pressurePerMeter
        );
        const ceilingDepth = intersection.depth;
        compartmentCeilings[comp.id].push(ceilingDepth);
        if (ceilingDepth > maxCeilingDepth) maxCeilingDepth = ceilingDepth;
    }

    ceilingDepths.push(maxCeilingDepth);
}
```

Per iteration:

- Solve each compartment's intersection with the complete GF boundary.
  If its fixed-GF-Low ceiling is at or deeper than `pAnchor`, that value is
  valid. If it lies shallower than `pAnchor`, solve the intersection with the
  GF ramp instead.
- This choice depends on the **ceiling pressure**, not the diver's current
  depth. Once the anchor exists, a bottom-time tissue can therefore already
  have a ceiling on the ramp.
- A profile without an anchor uses $GF_{high}$ throughout. Equal GF Low and
  GF High values reduce to the ordinary fixed-GF calculation.
- Overall ceiling is the max (deepest) across all compartments.

## Pre-ascent behavior

Descent and bottom-time samples already use the complete piecewise GF boundary.
GF Low still determines the anchor, but it is not extrapolated into pressures
shallower than that anchor.
For a direct-ascent profile there is no GF ramp, so the complete time series
uses $GF_{high}$. The displayed value uses the tissue state at that sample; it
does not predict additional on/off-gassing during a future ascent.

## Visual output

- **DiveProfileChart profile mode** draws `ceilingDepths`, the maximum of all
  16 ramp-intersection ceilings.
- **DiveProfileChart tissue-loading mode** draws the corresponding
  `compartmentCeilings[compId]`, so their visible envelope exactly matches the
  profile ceiling and the M-value ruler.

## Consistency with the scheduler

`generateDecoSchedule` returns `pAnchor`. `DiveProfileChart` obtains the same
scheduler decision through `calculateChartGFAnchor` and passes it as
`providedPAnchor`, so the profile overlay, M-value chart, GF chart, and audit
all agree about whether a ramp exists.

## Cross-references

- [Algo-01-Ascent-Simulation](Algo-01-Ascent-Simulation.md) — produces the `results` object consumed here.
- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md) — `findFirstStopAtGFLow`, the canonical anchor computation.
- [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) — `generateDecoSchedule` returns the `pAnchor` to pass in as `providedPAnchor`.
- [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — `interpolateGF` and the ramp geometry.
