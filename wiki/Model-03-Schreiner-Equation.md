# Model-03 — Schreiner Equation

Applies when the ambient pressure changes at a **constant linear rate** — i.e. descent at a fixed m/min, ascent at a fixed m/min. This is the workhorse of DecoJS: every segment between waypoints except pure level-offs gets dispatched through Schreiner.

Origin: Schreiner & Kelley 1971 (see [[References#22-schreiner--exponential-gas-uptake-with-changing-pressure]]). The closed-form solution of the Haldane ODE with a time-varying alveolar source.

## Formula as coded

$$P_t(t) = P_{alv,0} + R \cdot \left(t - \frac{1}{k}\right) - \left(P_{alv,0} - P_{t,0} - \frac{R}{k}\right) \cdot e^{-k t}$$

```javascript
// js/decoModel.js:125-130
export function schreinerEquation(initialPressure, initialAlveolarPressure, rate, time, halfTime) {
    const k = getRateConstant(halfTime);
    const term1 = initialAlveolarPressure + rate * (time - 1/k);
    const term2 = (initialAlveolarPressure - initialPressure - rate/k) * Math.exp(-k * time);
    return term1 - term2;
}
```

Note: $R$ is the **rate of change of alveolar pressure**, not of depth. Convert before calling.

## R conversion

$R$ must reflect the alveolar N₂ rate, which equals the ambient pressure rate scaled by the gas's inert fraction:

$$R = \frac{dP_{alv}}{dt} = f_{N_2} \cdot \frac{dP_{amb}}{dt} = f_{N_2} \cdot \text{(m/min)} \cdot 0.1$$

Examples (air, $f_{N_2} = 0.7902$):

| Depth rate (m/min) | Direction | $dP_{amb}/dt$ (bar/min) | $R$ (bar/min) |
|---|---|---|---|
| +20 | Descent | +2.0 | +1.5804 |
| +10 | Descent | +1.0 | +0.7902 |
| −10 | Ascent | −1.0 | −0.7902 |
| −9  | Ascent | −0.9 | −0.7112 |

On EAN32 ($f_{N_2} = 0.68$), the same −10 m/min ascent yields $R = -0.68$ bar/min.

## Three-term decomposition

Useful as a mental model — rewrite as:

$$P_t(t) = \underbrace{P_{alv,0} + R \cdot t}_{\text{moving alveolar pressure}} \;-\; \underbrace{\frac{R}{k}}_{\text{phase lag}} \;-\; \underbrace{(P_{alv,0} - P_{t,0} - R/k) \cdot e^{-kt}}_{\text{decaying initial disequilibrium}}$$

The first two terms together ($P_{alv,0} + R(t - 1/k)$) describe a tissue that perfectly tracks the alveolar pressure but lags by $1/k$ minutes. The third term is the exponential settling of whatever gap existed at $t = 0$.

## Worked example

Ascent from 30 m to 21 m at 10 m/min, TC5 (variant C: $T_{1/2} = 27.0$ min), starting saturated at 30 m on air.

Segment time: $9 / 10 = 0.9$ min.

Rate constant: $k = \ln 2 / 27.0 = 0.02567$ min⁻¹.

Alveolar N₂ at 30 m (start):
$$P_{alv,0} = (4.01325 - 0.0627) \cdot 0.7902 = 3.1232 \text{ bar}$$

Initial tissue (saturated at 30 m):
$$P_{t,0} = P_{alv,0} = 3.1232 \text{ bar}$$

Rate: $R = -1.0 \cdot 0.7902 = -0.7902$ bar/min.

Plugging in:
$$\text{term1} = 3.1232 + (-0.7902) \cdot (0.9 - 1/0.02567)$$
$$= 3.1232 + (-0.7902) \cdot (0.9 - 38.959)$$
$$= 3.1232 + (-0.7902) \cdot (-38.059) = 3.1232 + 30.075 = 33.199$$

$$\text{term2} = (3.1232 - 3.1232 - (-0.7902)/0.02567) \cdot e^{-0.02567 \cdot 0.9}$$
$$= (30.779) \cdot e^{-0.02310}$$
$$= 30.779 \cdot 0.97717 = 30.076$$

$$P_t(0.9) = 33.199 - 30.076 = 3.123 \text{ bar}$$

Tissue barely moved — TC5 is slow relative to a 0.9-min segment. Compare to TC1 ($T_{1/2} = 5.0$, $k = 0.1386$): the same segment gives $P_t(0.9) \approx 3.077$ bar — a noticeable drop because fast tissues track ambient more tightly.

## Entry points

`simulateDepthChange()` runs Schreiner across all 16 compartments for a single linear segment:

```javascript
// js/decoModel.js:860 (signature)
export function simulateDepthChange(tissuePressures, startDepth, endDepth, time, n2Fraction)
```

`calculateTissueLoading()` iterates across an entire waypoint array:

```javascript
// js/decoModel.js:1178 (signature)
export function calculateTissueLoading(profile, surfaceInterval = 60, options = {})
```

It samples at 10-second resolution (`CALC_INTERVAL = 10` s) — for each interval it decides descent/level/ascent and dispatches to Haldane or Schreiner accordingly, threading tissue state forward. Gas switches are respected via the `gasId` field on waypoints.

## Haldane as degenerate case

When $R = 0$:

$$P_t(t) = P_{alv,0} - (P_{alv,0} - P_{t,0}) \cdot e^{-kt} = P_{alv,0} + (P_{t,0} - P_{alv,0}) \cdot e^{-kt}$$

Exactly the Haldane equation. DecoJS still dispatches to `haldaneEquation()` separately on level segments for code clarity — the arithmetic is equivalent either way, but numerical stability is better when you don't pass $R = 0$ into the Schreiner form (avoids the $R/k$ term evaluating to zero via subtraction).

## Cross-references

- [[Model-02-Haldane-Equation]] — the constant-depth specialization.
- [[Algo-01-Ascent-Simulation]] — the loop that drives Schreiner through a dive.
- [[References#22-schreiner--exponential-gas-uptake-with-changing-pressure]] — Schreiner & Kelley 1971, plus Baker's "Clearing Up The Confusion About 'Deep Stops'" which derives the same form in modern notation.
