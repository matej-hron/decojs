# Algo-02 — NDL Calculation

The **No-Decompression Limit** is the maximum bottom time at a given depth such that the diver can ascend directly to the surface without triggering a mandatory deco stop. DecoJS finds it by binary search.

## Entry point

```javascript
// js/decoModel.js:640 (signature)
export function calculateNDL(depth, n2Fraction = N2_FRACTION, gfHigh = 1.0, initialTissuePressures = null, surfacePressure = SURFACE_PRESSURE)
```

The optional fourth parameter `initialTissuePressures` is a `{ [compartmentId]: nitrogenPressureBar }` map. When provided, descent starts from that pre-saturated tissue state instead of surface equilibrium. Defaults to `null` (original behaviour). See [`js/ndlPreview.js`](Module-Reference.md#jsndlpreviewjs) for the trip-position-aware wrapper that supplies this seed.

The fifth parameter selects the local atmospheric pressure for an acclimatized
altitude dive. Omitting it preserves the sea-level result.

Returns:

```javascript
{
  ndl: 20,                    // minutes from leaving the surface, floor-rounded for display
  ndlExact: 20.3,             // exact (pre-rounding) value — use this for comparisons
  ndlAtDepth: 18,             // same limit counted from arrival at depth, floor-rounded
  ndlAtDepthExact: 18.3,      // exact time at depth
  controllingCompartment: 7,  // TC id whose M-value bites first on direct ascent
  descentTime: 2              // minutes to reach depth at DESCENT_SPEED = 20 m/min
}
```

`ndl` follows the convention of published dive tables (PADI, US Navy): it is the maximum **bottom time measured from leaving the surface**, so the descent is already included and `ndlExact === descentTime + ndlAtDepthExact`. It can therefore be compared with — or assigned straight to — a bottom time, with no correction. Subtracting `descentTime` before such a comparison counts the descent twice.

Two rounding rules follow from this:

- **Display** uses `ndl` (whole minutes, rounded down) — that is what a diver would write into a plan.
- **Classification** (`requiresDeco`, the NDL badge) uses `ndlExact`. Using the floored value as a threshold would push the last fraction of a minute into the decompression branch, which then has no stop to schedule.

`ndlAtDepth` remains available for anything that genuinely reasons about the bottom phase alone.

## Why $GF_{high}$

NDL asks whether the diver can ascend directly to the surface without waiting.
There is no first decompression stop and therefore no anchor at which
$GF_{low}$ could apply. The ascent is simulated on the bottom gas and the
surfaced tissues are checked against $GF_{high}$, matching Decotengu's
`_ndl_ascent` path.

```javascript
const surfaced = simulateDepthChange(
    testPressures, depth, 0, depth / ASCENT_SPEED, n2Fraction, surfacePressure
);
const { ceilingDepth } = getDiveCeiling(surfaced, gfHigh, surfacePressure);
```

Only when this direct ascent fails does the decompression scheduler find a
$GF_{low}$ anchor and construct the ramp to $GF_{high}$.

## Method — binary search

```javascript
// js/decoModel.js:623-637 (descent)
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
// js/decoModel.js:671-686
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

For each candidate $t$, apply Haldane at depth, simulate the complete ascent
with Schreiner, then check the surfaced tissues at $GF_{high}$. The binary
search uses sub-second precision so `ndlExact` and the profile-generation
branch cannot disagree. The upper bound is clamped to 300 min (5 h).

Two early exits bracket the search:
- If ceiling is already > 0 immediately after descent, return `ndl = 0` (very deep dive — descent alone triggers deco).
- If ceiling at 5 h is still 0, return `ndl = Infinity` (very shallow — NDL is effectively unbounded).

## Worked example

30 m on air:

- Descent: 30 m at 20 m/min = 1.5 min. Schreiner loads all 16 tissues.
- At every binary-search candidate, simulate the 3-minute ascent to surface.
- $GF_{high}=1.00$ gives `ndl = 20` min.
- $GF_{high}=0.85$ gives `ndl = 15` min.
- $GF_{high}=0.80$ gives `ndl = 13` min.

These whole-minute values match Decotengu 0.14.1 for the same profile.

## Branching in `generateDecoProfile`

NDL is the pivot in the top-level dive planner:

```javascript
// js/diveSetup.js:346-378
const { ndl, controllingCompartment } = calculateNDL(maxDepth, bottomGas.n2, gfHighDec);
const descentTime = roundUp(maxDepth / DESCENT_SPEED);
const seededTissues = options.initialTissuePressures || null;
const requiresDeco = (bottomTime - descentTime) > ndl;
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

Both `bottomTime` and `ndl` run from leaving the surface, so they compare
directly. If the profile is within NDL and no pre-saturated tissue seed is
provided, the planner returns a no-stop profile. Seeded profiles run the full
scheduler, which now performs the same GF High direct-ascent check before
creating any GF Low anchor.

## Cross-references

- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md) — what happens when NDL is exceeded.
- [Model-04-M-Values](Model-04-M-Values.md) — the ceiling equation underlying `getDiveCeiling`.
- [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — why the $GF_{low}$ threshold is the right one for NDL.
