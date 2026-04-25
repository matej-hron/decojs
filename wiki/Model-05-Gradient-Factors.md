# Model-05 — Gradient Factors

Bühlmann M-values represent the DCS-threshold supersaturation. Diving right up to M is "on the line" — any error, poor perfusion, or individual susceptibility and you cross over. **Gradient Factors** (Erik Baker, 1998; see [References](References.md#24-erik-baker--gradient-factors-articles)) add a configurable safety margin by treating the supersaturation budget as a fraction of the raw Bühlmann allowance. `GF 100/100` means Bühlmann-native. `GF 30/70` means deeper first stops (30% of the supersaturation budget used when the first stop triggers) and a more conservative surfacing (only 70% used at the surface).

## Two-parameter form

- $GF_{low}$: fraction of the supersaturation budget permitted at the first-stop depth.
- $GF_{high}$: fraction permitted at the surface.

Between first stop and surface, GF is linearly interpolated. Below first-stop depth, $GF = GF_{low}$ (used for deeper-first-stop behavior on ascent). At and above the surface, $GF = GF_{high}$ (used for NDL calculations and surfacing).

## DecoJS storage convention

The UI and dive-setup JSON store GF as **percent**; the algorithmic core uses **fractions**. Conversion happens at the boundary.

```javascript
// js/diveSetup.js (DEFAULT_GF_LOW, DEFAULT_GF_HIGH)
DEFAULT_GF_LOW = 100, DEFAULT_GF_HIGH = 100
```

```javascript
// js/decoModel.js:33-34
export const DEFAULT_GF_LOW = 1.0;   // 100%
export const DEFAULT_GF_HIGH = 1.0;  // 100%
```

Any function in `decoModel.js` taking a `gf` parameter expects the 0–1 form.

## Where the ramp is anchored

DecoJS anchors the GF ramp at **`pAnchor`** — the exact ambient pressure at which $GF_{max}$ across the 16 compartments first reaches $GF_{low}$ during a simulated free ascent (no 3 m grid rounding). From `pAnchor` upward the active GF ramps linearly to $GF_{high}$ at the surface; at any pressure deeper than `pAnchor` the active GF is clamped at $GF_{low}$.

`pAnchor` is a function of the actual tissue state at the moment ascent would begin, so two dives with the same maximum depth but different bottom times produce different `pAnchor` values — which is the intended behaviour, since their ascent ceilings genuinely differ.

## findGFLowAnchor — how pAnchor is computed

```javascript
// js/decoModel.js:257 (signature)
export function findGFLowAnchor(tissuePressures, currentDepth, n2Fraction, gfLow,
                                ascentRate = ASCENT_SPEED, gasSwitchPoints = null)
```

Simulates an ascent from `currentDepth` in 0.1-bar steps (~1 m precision). At each step it runs Schreiner over all 16 compartments for the segment, then computes $GF_{max}$ (the largest instantaneous GF across all tissues). When $GF_{max} \ge GF_{low}$, it refines: the exact pAnchor is the ambient pressure where the leading tissue's ceiling at $GF_{low}$ lies — which is computed from the ceiling equation, not from interpolating within the 0.1-bar step.

```javascript
// js/decoModel.js:308-321
if (gfMax >= gfLow) {
    const comp = COMPARTMENTS.find(c => c.id === leadingCompartment);
    const tissuePressure = tissues[leadingCompartment];
    // pAnchor = ceiling at GF_low = (Pt - GF_low * a) / (GF_low/b + 1 - GF_low)
    const exactPAnchor = getCompartmentCeiling(tissuePressure, comp.aN2, comp.bN2, gfLow);
    const exactAnchorDepth = Math.max(0, (exactPAnchor - SURFACE_PRESSURE) / PRESSURE_PER_METER);
    const finalPAnchor = Math.max(SURFACE_PRESSURE, exactPAnchor);
    // ...
    return { pAnchor: finalPAnchor, anchorDepth: finalAnchorDepth, leadingCompartment, tissuesAtAnchor };
}
```

Returns:

```js
{ pAnchor, anchorDepth, leadingCompartment, tissuesAtAnchor }
```

If the simulated ascent reaches the surface without hitting $GF_{low}$, pAnchor is clamped to `SURFACE_PRESSURE` (`js/decoModel.js:338-345`) — which means the dive is within NDL and no ramp applies.

## Interpolation

Once pAnchor is fixed, the GF at any ambient pressure is:

$$GF(P_{amb}) = \begin{cases} GF_{low} & P_{amb} \ge p_{anchor} \\ GF_{low} + (GF_{high} - GF_{low}) \cdot \dfrac{p_{anchor} - P_{amb}}{p_{anchor} - 1.0} & 1.0 \le P_{amb} < p_{anchor} \\ GF_{high} & P_{amb} \le 1.0 \end{cases}$$

```javascript
// js/decoModel.js:424-444
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

Note the denominator uses `SURFACE_PRESSURE = 1.01325` conceptually but the formula above uses 1.0 bar for brevity — the code uses the exact constant. Numerically the difference is ~1.3%; algorithmically it's deliberate (the ramp converges to the surface atmospheric pressure, not to 1 bar).

## Visual — the GF corridor

The GFChart (`js/charts/GFChart.js`) renders this as a shaded band:

- Left edge at pAnchor, height = $GF_{low}$.
- Right edge at surface, height = $GF_{high}$.
- Linear ramp between.
- Per-compartment tissue trails show how each compartment's instantaneous GF evolved through the dive. The leading tissue at any given moment is the one whose trail is highest — that's the one that constrains the next ascent step.

The M-value chart in `js/mvalues.js` renders the same ramp projected onto the P-P diagram: a segment from `(pAnchor, M_adj at GF_low)` to `(1.0 bar, M_adj at GF_high)`.

## Gas-switch wrinkle

During ascent, switching from back gas to a richer deco mix abruptly changes $P_{alv}$ (higher inert fraction → more on-gassing; lower → more off-gassing). `findGFLowAnchor()` takes a `gasSwitchPoints` parameter so its simulated ascent respects these switches — otherwise pAnchor would be computed assuming back gas all the way up and come out wrong:

```javascript
// js/decoModel.js:274-296
const switches = gasSwitchPoints
    ? [...gasSwitchPoints].sort((a, b) => b.switchDepth - a.switchDepth)
    : [];
let currentN2 = n2Fraction;
// ... inside the ascent loop ...
for (const sp of switches) {
    if (nextDepth <= sp.switchDepth && sp.n2 < currentN2) {
        currentN2 = sp.n2;
        break;
    }
}
```

Switches are sorted deepest-first so the simulation applies the richest permissible gas at each depth. `generateDecoSchedule()` (`js/decoModel.js:899`) is the caller that passes in the switch points — see [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) for how they're computed from MODs.

## Worked example

40 m dive on air, 25 min bottom time, GF 30/85.

`generateDecoProfile()` in `js/diveSetup.js` runs the full pipeline:

1. Simulate descent + bottom time via `calculateTissueLoading()`.
2. Call `findGFLowAnchor()` with the final tissues and `gfLow = 0.30`.
3. `findGFLowAnchor()` steps up in 0.1-bar increments. For this exposure, the leading tissue is typically TC4 or TC5; pAnchor comes out around 2.4 bar (roughly 14 m depth).
4. At $P_{amb} = 2.4$ bar, $GF = 0.30$ (just hits the GF-low ceiling).
5. At $P_{amb} = 1.0$ bar (surface), $GF = 0.85$.
6. Between: linear ramp. E.g., at 6 m ($P_{amb} = 1.61$ bar), $GF = 0.30 + (0.85 - 0.30) \cdot (2.4 - 1.61)/(2.4 - 1.01) = 0.30 + 0.55 \cdot 0.568 = 0.612$.

Exact numbers depend on the variant (A/B/C) and the descent/ascent profile shape, but 14 m ± 2 m is the typical pAnchor range for a 40 m / 25 min air dive with $GF_{low} = 0.30$.

## Cross-references

- [Model-04-M-Values](Model-04-M-Values.md) — $M$, $M_{adj}$, and the ceiling equation that pAnchor is computed from.
- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md) — the first-stop-finding loop that uses pAnchor to locate the shallowest mandatory stop.
- [Algo-06-Ceiling-Time-Series](Algo-06-Ceiling-Time-Series.md) — how pAnchor is pre-computed once and reused across a full dive's ceiling time series.
- [References](References.md#24-erik-baker--gradient-factors-articles) — Baker's original GF papers ("Understanding M-values", "Clearing Up The Confusion About 'Deep Stops'").
