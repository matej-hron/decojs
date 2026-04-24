# Algo-03 — First Stop with Ramped GF

The subtlest chapter. Two coupled questions have to be answered before the deco loop can start:

1. **What is `pAnchor`?** The ambient pressure at which $GF_{max}$ (the controlling tissue's instantaneous gradient factor) first equals $GF_{low}$ during a free ascent.
2. **What is the first stop depth?** The shallowest depth to which the diver can ascend, accounting for the fact that the GF ramp already starts at `pAnchor` — so the GF at destination is *not* $GF_{low}$ unless the first stop is exactly at `pAnchor`.

Many naïve implementations conflate the two, or ramp GF from first-stop-depth to surface. DecoJS follows the Baker-intended ramp: from `pAnchor` to surface. The two converge when first stop = `pAnchor`; they differ when they do not (e.g., after gas switches).

## Subproblem 1: `findGFLowAnchor`

```javascript
// js/decoModel.js:257 (signature)
export function findGFLowAnchor(tissuePressures, currentDepth, n2Fraction, gfLow, ascentRate = ASCENT_SPEED, gasSwitchPoints = null)
```

Returns `{pAnchor, anchorDepth, leadingCompartment, tissuesAtAnchor}`.

### Method

1. Simulate an ascent from `currentDepth` toward surface in 0.1 bar steps (≈ 1 m resolution).
2. At each step, Schreiner-advance all 16 compartments for the segment and recompute $GF_{max}$.
3. When $GF_{max}$ first exceeds $GF_{low}$, **refine** by solving the compartment-ceiling equation for the leading tissue at that exact pressure — rather than accepting the 0.1 bar step boundary.

```javascript
// js/decoModel.js:286-329
while (currentAmbient > SURFACE_PRESSURE) {
    const nextAmbient = Math.max(SURFACE_PRESSURE, currentAmbient - STEP_SIZE);
    const nextDepth = (nextAmbient - SURFACE_PRESSURE) / PRESSURE_PER_METER;

    // Check for gas switch at this depth (switch to best available gas)
    for (const sp of switches) {
        if (nextDepth <= sp.switchDepth && sp.n2 < currentN2) {
            currentN2 = sp.n2;
            break;
        }
    }

    const depthChange = prevDepth - nextDepth;
    const segmentTime = depthChange / ascentRate;

    if (segmentTime > 0) {
        tissues = simulateDepthChange(tissues, prevDepth, nextDepth, segmentTime, currentN2);
    }

    const { gfMax, leadingCompartment } = calculateMaxGF(tissues, nextAmbient);

    if (gfMax >= gfLow) {
        // Found the step where GF_max crosses GF_low
        // Now calculate the EXACT pAnchor for the leading compartment
        const comp = COMPARTMENTS.find(c => c.id === leadingCompartment);
        const tissuePressure = tissues[leadingCompartment];

        // pAnchor = ceiling at GF_low = (Pt - GF_low * a) / (GF_low/b + 1 - GF_low)
        const exactPAnchor = getCompartmentCeiling(tissuePressure, comp.aN2, comp.bN2, gfLow);
        …
        return { pAnchor: finalPAnchor, anchorDepth: finalAnchorDepth, leadingCompartment, tissuesAtAnchor: { ...tissues } };
    }
    …
}
```

The final `getCompartmentCeiling` call is a closed-form solve: given the leading tissue's $P_t$, the exact $P_{amb}$ at which its instantaneous GF equals $GF_{low}$ is its ceiling at that GF. This avoids quantizing `pAnchor` to 1 m grid boundaries and keeps it numerically precise.

### Gas switches during anchor search

If `gasSwitchPoints` is provided, the 0.1 bar loop consults it at each step and switches $f_{N_2}$ when the simulated ascent crosses a gas's switch depth. Without this, a deco gas with deeper MOD (e.g., EAN50 at 21 m) would be ignored during anchor search, producing a `pAnchor` as if the diver stayed on bottom gas the whole way up — usually yielding an incorrectly deep `pAnchor`.

### Edge case — dive is within NDL

If the while loop reaches `SURFACE_PRESSURE` without $GF_{max}$ ever exceeding $GF_{low}$:

```javascript
// js/decoModel.js:337-345
const { leadingCompartment } = calculateMaxGF(tissues, SURFACE_PRESSURE);
return {
    pAnchor: SURFACE_PRESSURE,
    anchorDepth: 0,
    leadingCompartment,
    tissuesAtAnchor: { ...tissues }
};
```

`pAnchor = 1.01325 bar` (surface). The deco loop will then skip all stops — consistent with an NDL dive being queried through this path.

## Subproblem 2: `findFirstStopWithRampedGF`

```javascript
// js/decoModel.js:535 (signature)
export function findFirstStopWithRampedGF(tissuePressures, currentDepth, pAnchor, currentN2, gfLow, gfHigh, stopIncrement = 3, gasSwitchPoints = null)
```

Returns `{depth, ambient, tissues}` — the shallowest grid-aligned depth at which the tissue ceiling permits staying (using the GF interpolated for *that destination*), plus the simulated tissue state after the ascent.

### Method

Candidate depths are scanned from surface upward, in `stopIncrement` meters (3 m by default, 0.1 m in continuous mode). For each candidate:

1. Simulate the ascent from `currentDepth` to `candidateDepth`, using `_simulateAscentWithGasSwitches` when deco gases are provided (applies the correct gas to each depth segment between switches).
2. Compute the GF *at the candidate depth* via `interpolateGF(candidateAmbient, pAnchor, gfLow, gfHigh)`.
3. Compute the dive ceiling under that GF; if `ceilingDepth ≤ candidateDepth`, the ascent is allowed — return this candidate.

```javascript
// js/decoModel.js:538-568
for (let candidateDepth = 0; candidateDepth <= currentDepth; candidateDepth += stopIncrement) {
    let simulatedTissues;
    if (gasSwitchPoints && gasSwitchPoints.length > 0) {
        simulatedTissues = _simulateAscentWithGasSwitches(
            tissuePressures, currentDepth, candidateDepth, currentN2, gasSwitchPoints
        );
    } else {
        const ascentTime = (currentDepth - candidateDepth) / ASCENT_SPEED;
        simulatedTissues = ascentTime > 0
            ? simulateDepthChange({ ...tissuePressures }, currentDepth, candidateDepth, ascentTime, currentN2)
            : { ...tissuePressures };
    }

    const candidateAmbient = getAmbientPressure(candidateDepth);
    const gf = interpolateGF(candidateAmbient, pAnchor, gfLow, gfHigh);
    const { ceilingDepth } = getDiveCeiling(simulatedTissues, gf);

    if (ceilingDepth <= candidateDepth) {
        return { depth: candidateDepth, ambient: candidateAmbient, tissues: simulatedTissues };
    }
}
```

This is the same ascent-permission test used in the deco stop loop itself (see [[Algo-04-Deco-Stop-Loop]]) — consistency between first-stop discovery and subsequent stops matters for stop-count agreement across tools.

### `_simulateAscentWithGasSwitches`

```javascript
// js/decoModel.js:480-507
function _simulateAscentWithGasSwitches(tissuePressures, fromDepth, toDepth, startN2, gasSwitchPoints) {
    let tissues = { ...tissuePressures };
    let currentDepth = fromDepth;
    let currentN2 = startN2;

    const relevantSwitches = gasSwitchPoints
        .filter(sp => sp.switchDepth < currentDepth && sp.switchDepth >= toDepth)
        .sort((a, b) => b.switchDepth - a.switchDepth);

    for (const sp of relevantSwitches) {
        const segmentTime = (currentDepth - sp.switchDepth) / ASCENT_SPEED;
        if (segmentTime > 0) {
            tissues = simulateDepthChange(tissues, currentDepth, sp.switchDepth, segmentTime, currentN2);
        }
        currentDepth = sp.switchDepth;
        currentN2 = sp.n2;
    }

    if (currentDepth > toDepth) {
        const segmentTime = (currentDepth - toDepth) / ASCENT_SPEED;
        tissues = simulateDepthChange(tissues, currentDepth, toDepth, segmentTime, currentN2);
    }

    return tissues;
}
```

The leading underscore marks this as internal — it is only called by `findGFLowAnchor` (indirectly) and `findFirstStopWithRampedGF`. Consumers should not call it directly.

## Worked example

40 m on air, 25 min bottom time, $GF = 30/85$.

- At end of bottom, TC5 ($T_{1/2} = 27$ min) is near-leading with $P_t \approx 2.85$ bar.
- Anchor search: ascent from 40 m in 0.1 bar steps. Around $P_{amb} \approx 2.4$ bar (≈ 14 m), $GF_{max}$ crosses 0.30.
- Refinement: for TC5 with $a = 0.6200$, $b = 0.8126$ and $P_t = 2.85$ bar, `getCompartmentCeiling(2.85, 0.62, 0.8126, 0.30)` resolves `pAnchor ≈ 2.40 bar`, `anchorDepth ≈ 13.9 m`.
- First-stop search (`stopIncrement = 3`): candidate = 0, 3, 6, 9, 12 all fail ceiling check; candidate = 15 passes. But the GF at 15 m is not $GF_{low}$ — it is `interpolateGF(2.5, 2.4, 0.30, 0.85)` ≈ 0.36. First stop = 15 m with the post-ascent tissue state, which is slightly off-gassed relative to the bottom state.

In practice, with these inputs first stop ≈ `pAnchor` rounded up to the 3 m grid; the two values diverge most noticeably when a deco-gas switch during the ascent to first stop changes which compartment leads.

## Edge case — `pAnchor = SURFACE_PRESSURE`

If `findGFLowAnchor` returned 1.01325 bar (NDL case), the candidate-zero check passes immediately in `findFirstStopWithRampedGF` — ceiling after a full ascent to 0 m is ≤ 0 m. First stop = 0 m. `generateDecoSchedule` then takes the no-deco branch (`js/decoModel.js:1007`).

## Cross-references

- [[Model-05-Gradient-Factors]] — the GF ramp equation and why `pAnchor` is its lower reference.
- [[Algo-04-Deco-Stop-Loop]] — consumes `firstStopDepth` and the simulated tissue state at first stop.
- [[Algo-05-Multi-Gas-Switching]] — how `gasSwitchPoints` is built before being passed in here.
