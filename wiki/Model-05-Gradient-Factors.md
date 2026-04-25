# Model-05 — Gradient Factors

Bühlmann M-values represent the DCS-threshold supersaturation. Diving right up to M is "on the line" — any error, poor perfusion, or individual susceptibility and you cross over. **Gradient Factors** (Erik Baker, 1998; see [References](References.md#24-erik-baker--gradient-factors-articles)) add a configurable safety margin by treating the supersaturation budget as a fraction of the raw Bühlmann allowance. `GF 100/100` means Bühlmann-native. `GF 30/70` means deeper first stops (30% of the supersaturation budget used when the first stop triggers) and a more conservative surfacing (only 70% used at the surface).

## Two-parameter form

- $GF_{low}$: fraction of the supersaturation budget permitted at the **first stop depth**.
- $GF_{high}$: fraction permitted at the surface.

Between first stop and surface, the active GF is linearly interpolated. At and below the first stop depth, $GF = GF_{low}$. At and above the surface, $GF = GF_{high}$.

## DecoJS storage convention

The UI and dive-setup JSON store GF as **percent**; the algorithmic core uses **fractions**. Conversion happens at the boundary.

```javascript
// js/diveSetup.js (DEFAULT_GF_LOW, DEFAULT_GF_HIGH)
DEFAULT_GF_LOW = 100, DEFAULT_GF_HIGH = 100
```

```javascript
// js/decoModel.js (DEFAULT_GF_LOW, DEFAULT_GF_HIGH)
export const DEFAULT_GF_LOW = 1.0;   // 100%
export const DEFAULT_GF_HIGH = 1.0;  // 100%
```

Any function in `decoModel.js` taking a `gf` parameter expects the 0–1 form.

## Where the ramp is anchored

DecoJS anchors the GF ramp at **`pAnchor`** — the ambient pressure of the **first decompression stop**, defined as the shallowest stop-grid depth (3 m grid, or 0.1 m in continuous-deco mode) where the dive ceiling at $GF_{low}$ is satisfied after a simulated free ascent from current depth.

That depth depends on the actual tissue state at the moment ascent would begin, so two dives with the same maximum depth but different bottom times produce different `pAnchor` values — which is the intended behaviour, since their ascent ceilings genuinely differ.

At ambient pressures $\ge p_{anchor}$ the active GF is clamped at $GF_{low}$. From $p_{anchor}$ up to the surface it ramps linearly to $GF_{high}$.

## findFirstStopAtGFLow — how pAnchor is computed

```javascript
// js/decoModel.js (signature)
export function findFirstStopAtGFLow(
    tissuePressures, currentDepth, n2Fraction, gfLow,
    stopIncrement = STOP_INCREMENT, ascentRate = ASCENT_SPEED, gasSwitchPoints = null
)
```

The algorithm iterates the stop grid surface-up:

1. For each candidate stop depth $d \in \{0, \text{stopIncrement}, 2 \cdot \text{stopIncrement}, \ldots, \text{currentDepth}\}$:
2. Simulate the ascent from `currentDepth` to $d$ using Schreiner integration on every compartment (with gas switches if applicable).
3. Compute the dive ceiling at $GF_{low}$ — the deepest of the 16 per-compartment ceilings.
4. If that ceiling is $\le d$, the diver can arrive at $d$ within $GF_{low}$. The first such candidate is the first stop and the GF anchor.

If no candidate satisfies the check, the function falls back to `currentDepth` (degenerate case — should not happen in practice). If the surface candidate ($d = 0$) already satisfies $GF_{low}$, the dive is within NDL and the ramp collapses to $GF = GF_{high}$ everywhere.

Returns:

```js
{ anchorDepth, pAnchor, tissuesAtAnchor }
```

`tissuesAtAnchor` is the post-ascent tissue state at the first stop, used as the starting point for the deco loop.

## Interpolation

Once `pAnchor` is fixed, the GF at any ambient pressure is:

$$GF(P_{amb}) = \begin{cases} GF_{low} & P_{amb} \ge p_{anchor} \\ GF_{low} + (GF_{high} - GF_{low}) \cdot \dfrac{p_{anchor} - P_{amb}}{p_{anchor} - 1.0} & 1.0 \le P_{amb} < p_{anchor} \\ GF_{high} & P_{amb} \le 1.0 \end{cases}$$

```javascript
// js/decoModel.js interpolateGF
export function interpolateGF(currentAmbient, pAnchor, gfLow, gfHigh) {
    if (currentAmbient >= pAnchor) {
        return gfLow;
    }
    if (currentAmbient <= SURFACE_PRESSURE) {
        return gfHigh;
    }
    const range = pAnchor - SURFACE_PRESSURE;
    if (range <= 0) {
        return gfHigh;
    }
    const fraction = (pAnchor - currentAmbient) / range;
    return gfLow + fraction * (gfHigh - gfLow);
}
```

The denominator uses `SURFACE_PRESSURE = 1.01325` (the formula above uses 1.0 for brevity — the code uses the exact constant). The ramp converges to the surface atmospheric pressure, not to 1 bar.

## Visual — the GF corridor

The GFChart (`js/charts/GFChart.js`) renders the ramp as a shaded band:

- Left edge at `pAnchor`, height = $GF_{low}$.
- Right edge at the surface, height = $GF_{high}$.
- Linear ramp between.
- Per-compartment tissue trails show how each compartment's instantaneous GF evolved through the dive. The leading tissue at any given moment is the one whose trail is highest.

The M-value chart in `js/mvalues.js` renders the same ramp projected onto the P-P diagram: a segment from `(pAnchor, M_adj at GF_low)` to `(1.0 bar, M_adj at GF_high)`.

## Gas-switch wrinkle

During ascent, switching from back gas to a richer deco mix abruptly changes $P_{alv}$. `findFirstStopAtGFLow()` takes a `gasSwitchPoints` parameter so its simulated ascent respects these switches — otherwise the dive ceiling at the candidate would be computed assuming back gas all the way up and come out wrong. Switches are sorted deepest-first so the simulation applies the richest permissible gas at each depth. `generateDecoSchedule()` is the caller that passes in the switch points — see [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md).

## Why the convention matters

Two implementation choices show up in the GF literature:

1. Anchor at the unrounded GF_low ceiling depth.
2. Anchor at the rounded first-stop depth (this is what DecoJS does, what decotengu does, and what dive computers ship).

DecoJS originally used (1); aligning with (2) brought the 3900-scenario decotengu cross-check from 69% pass / 6.1 min mean error to 100% pass / 0.6 min mean error. See [Validation-and-Testing](Validation-and-Testing.md#decotengu-cross-check).

## Worked example

40 m dive on air, 25 min bottom time, GF 30/85.

1. `calculateTissueLoading()` simulates descent + bottom time.
2. `findFirstStopAtGFLow()` iterates stop-grid candidates surface-up. For this exposure, the deepest GF_low ceiling lands around 12-13 m. The first 3 m grid line that satisfies the check is **15 m** (the next stop-grid line at or below the unrounded ceiling).
3. `pAnchor` = ambient pressure at 15 m = $1.01325 + 1.5 = 2.51$ bar.
4. At $P_{amb} \ge 2.51$ bar (15 m or deeper): $GF = 0.30$.
5. At surface ($P_{amb} = 1.01$ bar): $GF = 0.85$.
6. Linear ramp between. E.g., at 6 m ($P_{amb} = 1.61$ bar): $GF = 0.30 + 0.55 \cdot (2.51 - 1.61)/(2.51 - 1.01) = 0.30 + 0.55 \cdot 0.6 = 0.63$.

Exact numbers depend on the variant (A/B/C) and the descent/ascent profile shape.

## Cross-references

- [Model-04-M-Values](Model-04-M-Values.md) — $M$, $M_{adj}$, and the ceiling equation that drives the first-stop search.
- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md) — the strict GF_low first-stop search and its role in the deco scheduler.
- [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) — how the loop uses the destination GF for ascent permission.
- [Algo-06-Ceiling-Time-Series](Algo-06-Ceiling-Time-Series.md) — how pAnchor is computed once and reused for the chart-overlay ceiling.
- [References](References.md#24-erik-baker--gradient-factors-articles) — Baker's original GF papers.
