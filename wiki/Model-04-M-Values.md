# Model-04 — M-Values

An **M-value** is the maximum tolerated inert-gas tissue pressure at a given ambient pressure, per compartment. Above M = supersaturation that the algorithm treats as unsafe. Workman (1965) introduced the concept (see [References](References.md#23-workman--m-values)); Bühlmann recast it as a linear function of ambient with two tabulated coefficients (see [References](References.md#24-erik-baker--gradient-factors-articles)).

## Bühlmann linear form

$$M(P_{amb}) = a + \frac{P_{amb}}{b}$$

```javascript
// js/decoModel.js:145-147
export function getMValue(ambientPressure, a, b) {
    return a + ambientPressure / b;
}
```

Where $a$ and $b$ are variant-specific per-compartment constants (see [Model-01-Compartments](Model-01-Compartments.md)). Both depend on the compartment (and $a$ on the variant A/B/C); neither depends on depth.

## Graphical interpretation

On a P-P diagram (tissue pressure $P_t$ on $y$, ambient pressure $P_{amb}$ on $x$), the M-value is a straight line:

- $y$-intercept: $a$
- slope: $1/b$

Above the line = M-value violation. The M-value chart in `js/mvalues.js` draws 16 of these lines in parallel (one per compartment) and plots the tissue state as 16 markers. The widely-used visual intuition: "how high above the ambient line, and how close to the M-value line, is each tissue right now?"

## Ceiling — the shallowest safe ambient pressure

Rearranging $M = a + P_{amb}/b$ for the case where the tissue sits exactly on the GF-adjusted M-value gives the **ceiling**: the minimum $P_{amb}$ at which the compartment is still within limits. For arbitrary GF:

$$P_{ceiling} = \frac{b \cdot (P_t - GF \cdot a)}{b \cdot (1 - GF) + GF}$$

```javascript
// js/decoModel.js:361-366
export function getCompartmentCeiling(tissuePressure, a, b, gf) {
    // P_ceiling = b × (P_tissue - GF × a) / (b × (1 - GF) + GF)
    const numerator = b * (tissuePressure - gf * a);
    const denominator = b * (1 - gf) + gf;
    return numerator / denominator;
}
```

### Derivation

At the ceiling, the tissue sits exactly at the GF-adjusted limit — the linear blend between $P_{amb}$ (at $GF = 0$) and the raw M-value (at $GF = 1$):

$$P_t = P_{amb} + GF \cdot (M(P_{amb}) - P_{amb})$$

Substitute $M(P_{amb}) = a + P_{amb}/b$ and expand:

$$P_t = P_{amb} + GF \cdot a + \frac{GF \cdot P_{amb}}{b} - GF \cdot P_{amb}$$

Collect $P_{amb}$ terms on the right:

$$P_t - GF \cdot a = P_{amb} \cdot \left(1 - GF + \frac{GF}{b}\right) = P_{amb} \cdot \frac{b \cdot (1 - GF) + GF}{b}$$

Solve for $P_{amb}$:

$$P_{amb} = \frac{b \cdot (P_t - GF \cdot a)}{b \cdot (1 - GF) + GF}$$

Sanity check: at $GF = 0$ this collapses to $P_{amb} = P_t$ (no supersaturation tolerated — the tissue must already be at ambient). At $GF = 1$ it reduces to $P_{amb} = b \cdot P_t - a \cdot b$, the raw Bühlmann inverse of $M = a + P_{amb}/b$ solved for ambient.

This is **the central equation for deco-stop depths**. DecoJS evaluates it for each of the 16 compartments and takes the deepest (highest $P_{amb}$) ceiling — that's the depth the diver cannot go shallower than right now:

```javascript
// js/decoModel.js:377-401 (body)
export function getDiveCeiling(tissuePressures, gf) {
    let maxCeiling = -Infinity;
    let controllingComp = null;
    for (const comp of COMPARTMENTS) {
        const tissueP = tissuePressures[comp.id];
        const ceiling = getCompartmentCeiling(tissueP, comp.aN2, comp.bN2, gf);
        if (ceiling > maxCeiling) {
            maxCeiling = ceiling;
            controllingComp = comp.id;
        }
    }
    const finalCeiling = Math.max(SURFACE_PRESSURE, maxCeiling);
    // ...
}
```

The compartment winning `maxCeiling` is the **controlling (leading) compartment** at that moment.

## GF-adjusted M-value

At GF = 1.0 (100%), the raw Bühlmann limit stands. At lower GF, only a fraction of the supersaturation budget is spent:

$$M_{adj}(P_{amb}, GF) = P_{amb} + GF \cdot (M(P_{amb}) - P_{amb})$$

```javascript
// js/decoModel.js:160-163
export function getAdjustedMValue(ambientPressure, a, b, gf) {
    const mValue = getMValue(ambientPressure, a, b);
    return ambientPressure + gf * (mValue - ambientPressure);
}
```

At GF = 0.5, the allowed tissue pressure sits exactly halfway between ambient and the raw M-value. At GF = 0, $M_{adj} = P_{amb}$ — no supersaturation tolerated at all. The ceiling equation above is the inverse of this, solved for $P_{amb}$.

See [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) for how $GF$ itself varies during ascent.

## Instantaneous GF — "how full is this tissue right now?"

Given a current tissue and ambient state, compute the fraction of the supersaturation budget already used:

$$GF_{inst}(P_t, P_{amb}) = \frac{P_t - P_{amb}}{M(P_{amb}) - P_{amb}}$$

```javascript
// js/decoModel.js:185-195
export function calculateInstantGF(tissuePressure, ambientPressure, compartment) {
    const mValue = getMValue(ambientPressure, compartment.aN2, compartment.bN2);
    const denominator = mValue - ambientPressure;
    if (Math.abs(denominator) < 1e-10) {
        return tissuePressure > ambientPressure ? Infinity : -Infinity;
    }
    return (tissuePressure - ambientPressure) / denominator;
}
```

- $GF_{inst} = 0$: tissue at ambient (no supersaturation)
- $GF_{inst} = 1$: tissue exactly at the raw M-value
- $GF_{inst} > 1$: violation
- Negative: undersaturated (still on-gassing)

Used by the GFChart (`js/charts/GFChart.js`) to render real-time saturation fraction per compartment. See also `calculateMaxGF()` at `js/decoModel.js:212` which finds the leading tissue.

## Worked example

TC1 under variant C: $a = 1.1696$, $b = 0.5578$. At $P_{amb} = 1.0$ bar (sea level):

$$M(1.0) = 1.1696 + \frac{1.0}{0.5578} = 1.1696 + 1.7928 = 2.9624 \text{ bar}$$

A tissue sitting at $P_t = 2.9624$ bar of N₂ at the surface would be exactly at the raw M-value — GF 100/100 would permit this, anything lower would not. That corresponds to a supersaturation gradient of $2.9624 - 1.0 = 1.9624$ bar above ambient, purely in nitrogen. No small amount.

At GF = 0.70: $M_{adj}(1.0) = 1.0 + 0.70 \cdot (2.9624 - 1.0) = 1.0 + 1.3737 = 2.3737$ bar. Same tissue would need to be below 2.3737 bar to surface cleanly under GF 30/70.

## Controlling compartment, dynamically

During an ascent the controlling compartment typically shifts:

- **Early in a deep ascent**: fast compartments (TC1–4) dominate — they took on the most gas and are closest to their M-value.
- **Later / shallower**: slow compartments (TC10+) take over — they're still loading while fast tissues have already off-gassed.

`getDiveCeiling()` re-evaluates every step, so the controlling compartment can and does change mid-dive.

## Cross-references

- [Model-01-Compartments](Model-01-Compartments.md) — where $a$ and $b$ come from.
- [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — how GF is varied with depth via `pAnchor`.
- [Algo-06-Ceiling-Time-Series](Algo-06-Ceiling-Time-Series.md) — the ceiling sampled at every dive-time point, for chart overlay.
- [Sandbox: M-Values](https://decotheory.eu/sandbox/m-values.html) — interactive playground for the M-value formula and where its coefficients come from.
