# Algo-06 — Ceiling Time Series

A per-timepoint ceiling overlay for chart rendering. This is separate from deco scheduling — the scheduler computes stops, this computes what the ceiling *looks like* moment-by-moment so the chart can draw it as a red line approaching zero as deco proceeds.

## Entry points

```javascript
// js/deco/ceiling.js:250 (signature)
export function calculateCeilingTimeSeries(
    results, gfLow, gfHigh = gfLow, providedPAnchor = null
)
```

Thin wrapper returning only the overall `ceilingDepths` array. Most callers want the detailed version:

```javascript
// js/deco/ceiling.js:281 (signature)
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
// js/deco/ceiling.js:295-316
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
// js/deco/ceiling.js:319-338 (calculateCeilingTimeSeriesDetailed)
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

### 3. Per-timepoint GF and ceiling

```javascript
// js/deco/ceiling.js:340-387
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
    if (pAnchor <= surfacePressure) {
        gf = gfHigh;
    } else if (!ascentStarted || currentAmbient >= pAnchor) {
        gf = gfLow;
    } else {
        gf = interpolateGF(currentAmbient, pAnchor, gfLow, gfHigh);
    }
    gfValues.push(gf);

    let maxCeilingDepth = 0;
    for (const comp of COMPARTMENTS) {
        const tissueP = tissuePressures[comp.id];
        const ceilingPressure = getCompartmentCeiling(tissueP, comp.aN2, comp.bN2, gf);
        const ceilingDepth = Math.max(
            0,
            (ceilingPressure - surfacePressure) / pressurePerMeter
        );
        compartmentCeilings[comp.id].push(ceilingDepth);
        if (ceilingDepth > maxCeilingDepth) maxCeilingDepth = ceilingDepth;
    }

    ceilingDepths.push(maxCeilingDepth);
    previousDepth = currentDepth;
}
```

Per iteration:

- Decide which GF to use. A profile without an anchor uses $GF_{high}$
  throughout. With a real anchor, use $GF_{low}$ before ascent and at or below
  the anchor; above it, interpolate toward $GF_{high}$.
- For each of the 16 compartments, call `getCompartmentCeiling` with the active GF. Convert to depth.
- Overall ceiling is the max (deepest) across all compartments.

## Three different ceilings, and why they disagree

This is the single most common source of confusion in the codebase, so it is
documented here rather than rediscovered. Three places in DecoJS compute
something called "the ceiling", and they deliberately do **not** agree.

| # | Where | GF evaluated at | Answers |
|---|---|---|---|
| 1 | This function (profile + tissue-loading chart) | the **diver's own** ambient pressure | "how shallow could I be *right now*?" |
| 2 | `completeStopLevels` (`js/deco/schedule.js:572-591`) | the **next stop's** ambient pressure | "may I leave this stop for the next one?" |
| 3 | The M-value / GF corridor in the P–P plane | every pressure along the ramp at once | "where does my tissue point cross the corridor line?" |

### 1 vs 2 — the same convention, one step apart

Both take a GF *from a depth* and then ask for the plain ceiling at that GF:

```javascript
// scheduler, js/deco/schedule.js:576
const gfThere = interpolateGF(
    getAmbientPressure(nextStopDepth, context.surfacePressure, context.pressurePerMeter),
    context.pAnchor, context.gfLow, context.gfHigh, context.surfacePressure
);
const { ceilingDepth } = getDiveCeiling(
    tissues, gfThere, context.surfacePressure, context.pressurePerMeter
);
if (ceilingDepth <= nextStopDepth) { /* ascend */ }
```

The only difference is *which* depth. The chart uses where the diver is; the
scheduler uses where the diver wants to go — one stop shallower, hence a
slightly higher GF, hence a slightly shallower ceiling. **The chart is therefore
one stop-step more conservative than the scheduler during ascent.**

Consequences, measured on nine profiles (31/29, 30/30, 45/25, 40/20, 18/60,
50/20, 20/40, 30/20, 55/15, GF 20/80 to 40/85):

- During descent and bottom time there is no ramp yet — both sit at $GF_{low}$,
  so the two agree exactly.
- Leaving a stop, the drawn ceiling steps up by 1.0 to 1.6 m in one sample.
  That step is the GF changing, not the tissues.
- On two of the nine profiles the drawn ceiling briefly sits *below* the
  diver's own scheduled stop — 0.17 m on 30 m / 30 min GF 30/80 and 0.01 m on
  50 m / 20 min GF 20/80. This is the same one-step offset, not a violation of
  the schedule.

These are known and accepted. Do not "fix" them by moving the chart onto the
scheduler's next-stop GF: the chart would then draw a ceiling for a depth the
diver has not reached.

### 1 vs 3 — a definition difference, not a bug

The corridor in the P–P plane is the straight line from
$(p_{anchor}, GF_{low})$ to $(p_{surface}, GF_{high})$. Reading a ceiling off it
means solving for the pressure where the tissue's tolerance curve meets that
line — i.e. applying the ramp at *every* pressure, including pressures the diver
never ascended to.

This function does not do that. Until ascent begins it holds $GF_{low}$ flat
(`!ascentStarted` in the GF selection above). On the reference dive
31 m / 29 min, air, GF 30/80 at the end of the bottom phase:

| | ceiling at t = 29 min |
|---|---|
| this function (flat $GF_{low}$) | 13.02 m |
| corridor intersection (ramp applied everywhere) | 10.06 m |

Roughly 3 m apart, and the corridor value is the *shallower*, more liberal one.

The flat-$GF_{low}$ reading is kept because the corridor reading is
retro-causal: `pAnchor` exists only because of an ascent that has not happened
yet, so at t = 9.9 min the corridor would show a 0.00 m ceiling while the
diver's actual obligation under their own $GF_{low}$ is 7.27 m. A ceiling line
that drops when you add bottom time is worse than one that disagrees with a
second chart.

If you are comparing the profile chart against the M-value chart and the numbers
differ by a couple of metres during the bottom phase, this is why. It is
expected.

## Pre-ascent behavior

For a decompression profile with a real anchor, descent and bottom time use
$GF_{low}$. For a direct-ascent profile there is no GF ramp, so the complete
time series uses $GF_{high}$. The displayed value is an instantaneous ceiling
for the tissue state at that sample; it does not predict the additional
on/off-gassing that will occur during a future ascent.

## Visual output

- **DiveProfileChart** (`js/charts/DiveProfileChart.js`) takes `ceilingDepths` and draws a red line. Above the depth curve = safe; crossing the depth curve = violation.
- **MValueChart** (`js/charts/MValueChart.js`) uses `compartmentCeilings[compId]` to color-code each compartment's ceiling individually, so the user can see which tissue is leading.

## Consistency with the scheduler

`generateDecoSchedule` returns `pAnchor`. `DiveProfileChart` obtains the same
scheduler decision through `calculateChartGFAnchor` and passes it as
`providedPAnchor`, so the profile overlay, M-value chart, GF chart, and audit
all agree about **whether a ramp exists and where it is anchored**.

They do not all produce the same ceiling *value* — see
[Three different ceilings](#three-different-ceilings-and-why-they-disagree)
above. Shared anchor, different readings off it.


## Cross-references

- [Algo-01-Ascent-Simulation](Algo-01-Ascent-Simulation.md) — produces the `results` object consumed here.
- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md) — `findFirstStopAtGFLow`, the canonical anchor computation.
- [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) — `generateDecoSchedule` returns the `pAnchor` to pass in as `providedPAnchor`.
- [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — `interpolateGF` and the ramp geometry.
