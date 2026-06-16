# Algo-02 — NDL Calculation

The **No-Decompression Limit** is the maximum bottom time at a given depth such that the diver can ascend directly to the surface without triggering a mandatory deco stop. DecoJS finds it by binary search.

## Entry point

```javascript
// js/decoModel.js:602 (signature)
export function calculateNDL(depth, n2Fraction = N2_FRACTION, gfLow = 1.0, initialTissuePressures = null)
```

The optional fourth parameter `initialTissuePressures` is a `{ [compartmentId]: nitrogenPressureBar }` map. When provided, descent starts from that pre-saturated tissue state instead of surface equilibrium. Defaults to `null` (original behaviour). See [`js/ndlPreview.js`](Module-Reference.md#jsndlpreviewjs) for the trip-position-aware wrapper that supplies this seed.

Returns:

```javascript
{
  ndl: 20,                    // minutes, floor-rounded for display
  ndlExact: 20.3,             // exact (pre-rounding) value for comparison
  controllingCompartment: 7,  // TC id whose M-value bites first on direct ascent
  descentTime: 2              // minutes to reach depth at DESCENT_SPEED = 20 m/min
}
```

The NDL returned is **bottom time** — time at maximum depth after descent completes. Total dive duration is `descentTime + ndl`.

## Why $GF_{low}$, not $GF_{high}$

A common confusion: surely NDL should use $GF_{high}$, since that's the surface limit? Not for "first stop becomes mandatory." The moment a first stop is required, the deco algorithm starts enforcing $GF_{low}$ — so that is the threshold at which the no-deco window closes. Using $GF_{high}$ here would overstate the NDL by pretending the entire GF budget is available immediately.

```javascript
// js/decoModel.js:664
const { ceilingDepth } = getDiveCeiling(testPressures, gfLow);
```

Default `gfLow = 1.0` (100 %) — raw Bühlmann, no conservatism. Typical planning values like $30/85$ pass `gfLow = 0.30`, which tightens NDL substantially.

## Method — binary search

```javascript
// js/decoModel.js:615-629 (descent)
const descentTime = depth / DESCENT_SPEED;
const descentRate = (alveolarN2 - getAlveolarN2Pressure(SURFACE_PRESSURE, n2Fraction)) / descentTime;
const afterDescent = {};
COMPARTMENTS.forEach(comp => {
    const startN2 = initialTissuePressures ? initialTissuePressures[comp.id] : initialN2;
    afterDescent[comp.id] = schreinerEquation(
        startN2,
        getAlveolarN2Pressure(SURFACE_PRESSURE, n2Fraction),
        descentRate,
        descentTime,
        comp.halfTime
    );
});
```

Descent is simulated once via Schreiner at `DESCENT_SPEED = 20 m/min` (`js/decoModel.js:578`). That gives tissue state at the start of bottom time. When `initialTissuePressures` is set, `startN2` is read from the seed rather than surface equilibrium.

```javascript
// js/decoModel.js:654-669
while (maxTime - minTime > 0.1) {
    const testTime = (minTime + maxTime) / 2;
    const testPressures = {};
    COMPARTMENTS.forEach(comp => {
        testPressures[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, testTime, comp.halfTime);
    });
    const { ceilingDepth } = getDiveCeiling(testPressures, gfLow);
    if (ceilingDepth > 0) {
        maxTime = testTime; // Needs deco, reduce time
    } else {
        minTime = testTime; // No deco, can go longer
    }
}
```

For each candidate $t$, apply Haldane at depth for $t$ minutes, then check if the surface ceiling ($GF_{low}$-adjusted) is still zero. Precision 0.1 min (6 s). Upper bound is clamped to 300 min (5 h).

Two early exits bracket the search:
- If ceiling is already > 0 immediately after descent, return `ndl = 0` (very deep dive — descent alone triggers deco).
- If ceiling at 5 h is still 0, return `ndl = Infinity` (very shallow — NDL is effectively unbounded).

## Worked example

30 m on air, $GF_{low} = 0.30$ (conservative deco-planner setting).

- Descent: 30 m at 20 m/min = 1.5 min. Schreiner loads all 16 tissues.
- After descent, TC7 ($T_{1/2} = 54$ min) is leading at roughly 0.85 bar.
- Binary search converges on `ndlExact ≈ 15.6 min`; `ndl = 15` (floored).
- Controlling compartment: TC7 (medium-fast; typical for 20–40 m air dives).

For default raw Bühlmann ($gfLow = 1.0$) the same dive yields NDL ≈ 21 min — the conservatism cost of 30/85 is roughly 6 min of bottom time.

## Branching in `generateDecoProfile`

NDL is the pivot in the top-level dive planner:

```javascript
// js/diveSetup.js:346-373
const { ndl, controllingCompartment } = calculateNDL(maxDepth, bottomGas.n2, gfLowDec);
const seededTissues = options.initialTissuePressures || null;
const requiresDeco = bottomTime > ndl;
if (!requiresDeco && !seededTissues) {
    const waypoints = generateSimpleProfile(maxDepth, bottomTime, safetyStop, options);
    waypoints[1].gasId = bottomGas.id;
    return {
        waypoints, ndl, requiresDeco: false,
        decoStops: [], totalDecoTime: 0, controllingCompartment
    };
}
// else: proceed to generateDecoSchedule()
```

If `bottomTime ≤ ndl` **and** no pre-saturated tissue seed is provided, the planner returns a no-stop profile (optionally with a safety stop). Only when deco is unavoidable (or a seed is present) does the expensive `generateDecoSchedule()` pipeline run. The extra `!seededTissues` guard ensures repetitive dives always run the full deco scheduler — see [repetitive-dive chaining](Module-Reference.md#repetitive-dive-chaining-initialtissuepressures).

## Cross-references

- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md) — what happens when NDL is exceeded.
- [Model-04-M-Values](Model-04-M-Values.md) — the ceiling equation underlying `getDiveCeiling`.
- [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — why the $GF_{low}$ threshold is the right one for NDL.
