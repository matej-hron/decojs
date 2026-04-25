# Algo-03 — First Stop and the GF Ramp Anchor

The first decompression stop is where two things coincide: it is the **deepest mandatory stop on the 3 m grid**, and it is the **anchor of the GF ramp**. Same depth, two roles. The deco loop then ascends from there toward the surface.

## Convention

DecoJS implements the standard Baker GF convention:

> The first stop is the shallowest stop-grid depth at which the dive ceiling at $GF_{low}$ — the maximum ceiling across all 16 compartments — is satisfied after a simulated ascent from current depth.

`pAnchor` is the ambient pressure at that depth. Below it the active GF is clamped at $GF_{low}$; above it the GF ramps linearly to $GF_{high}$ at the surface (see [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md)).

## findFirstStopAtGFLow

```javascript
// js/decoModel.js (signature)
export function findFirstStopAtGFLow(
    tissuePressures, currentDepth, n2Fraction, gfLow,
    stopIncrement = STOP_INCREMENT, ascentRate = ASCENT_SPEED, gasSwitchPoints = null
)
```

Returns `{ anchorDepth, pAnchor, tissuesAtAnchor }`.

### Method

Iterate the stop grid surface-up. For each candidate depth $d$:

1. Simulate the ascent from `currentDepth` to $d$ (Schreiner integration with gas switches if applicable).
2. Compute the dive ceiling at $GF_{low}$ — `getDiveCeiling(simTissues, gfLow)`.
3. If `ceilingDepth ≤ d`, the diver can arrive at $d$ within $GF_{low}$; this is the first stop.

```javascript
// js/decoModel.js findFirstStopAtGFLow
for (let candidate = 0; candidate <= currentDepth + 1e-9; candidate += stopIncrement) {
    let simTissues;
    if (safeGases) {
        simTissues = _simulateAscentWithGasSwitches(
            tissuePressures, currentDepth, candidate, n2Fraction, safeGases
        );
    } else {
        const ascentTime = (currentDepth - candidate) / ascentRate;
        simTissues = ascentTime > 0
            ? simulateDepthChange({ ...tissuePressures }, currentDepth, candidate, ascentTime, n2Fraction)
            : { ...tissuePressures };
    }
    const { ceilingDepth } = getDiveCeiling(simTissues, gfLow);
    if (ceilingDepth <= candidate + 1e-9) {
        anchorDepth = candidate;
        tissuesAtAnchor = simTissues;
        break;
    }
}
```

`stopIncrement` is 3 m by default (matching dive-computer practice) and 0.1 m in continuous-deco mode (educational visualization).

### Why "dive ceiling" and not "leading-compartment ceiling"

`getDiveCeiling` takes the maximum across all 16 compartments. The compartment with the highest *instantaneous* GF is not always the same as the compartment with the deepest GF_low ceiling — the two can disagree, especially after a gas switch shifts which compartment is loading vs off-gassing. The convention takes the deepest of all per-compartment ceilings, so the diver isn't sent shallower than safe.

### Gas switches

The simulated ascent within the search uses `_simulateAscentWithGasSwitches` when deco gases are provided. Switching to a richer mix at its MOD changes $f_{N_2}$ and therefore the off-gassing rate — without that, a pAnchor computed against bottom-gas alveolar pressures would be too deep.

```javascript
// js/decoModel.js _simulateAscentWithGasSwitches
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

### NDL edge case

If candidate = 0 (surface) already satisfies the ceiling check, the diver is within NDL. `findFirstStopAtGFLow` returns `anchorDepth = 0` and `pAnchor = SURFACE_PRESSURE`. The deco loop then takes the no-deco branch (`js/decoModel.js` no-deco path).

## Worked example

40 m on air, 25 min bottom time, $GF = 30/85$.

- After descent + 25 min at 40 m, the deepest GF_low ceiling lands somewhere around 12-13 m.
- Iterate the 3 m grid: candidates at 0, 3, 6, 9, 12 all fail (`ceilingDepth > candidate` after simulated ascent).
- Candidate 15 passes: dive ceiling at $GF_{low}$ on the post-ascent tissues is $\le 15$ m.
- First stop = 15 m. $pAnchor = 1.01325 + 1.5 = 2.51$ bar.
- The deco loop then runs from 15 m, with `interpolateGF` giving GF rising from 0.30 at 15 m to 0.85 at the surface.

## Cross-references

- [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — what $pAnchor$ does once it's been found.
- [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) — consumes `firstStopDepth` and `tissuesAtAnchor`.
- [Algo-05-Multi-Gas-Switching](Algo-05-Multi-Gas-Switching.md) — how `gasSwitchPoints` is constructed before being passed in.
