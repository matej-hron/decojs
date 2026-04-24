# Model-01 — Compartments

Bühlmann ZH-L16 is a parallel-compartment model: 16 theoretical tissue groups, each with a half-time $T_{1/2}$ (how fast it on-/off-gasses) and two Bühlmann coefficients $a$ (bar) and $b$ (dimensionless) defining its M-value line. The letter suffix (A/B/C) picks one of three coefficient tables — same half-times, different `a` values (plus one $b$ quirk at TC1). See [References](References.md#6-zh-l16-constant-tables).

## Half-times in DecoJS

Quoted from `js/tissueCompartments.js:67-91` (variant C, the default):

| ID | $T_{1/2}$ (min) | $b$ | $a$ (variant C) | Category |
|----|-----------------|-----|-----------------|----------|
| 1  | 5.0   | 0.5578 | 1.1696 | Fast |
| 2  | 8.0   | 0.6514 | 1.0000 | Fast |
| 3  | 12.5  | 0.7222 | 0.8618 | Fast |
| 4  | 18.5  | 0.7825 | 0.7562 | Fast |
| 5  | 27.0  | 0.8126 | 0.6200 | Medium |
| 6  | 38.3  | 0.8434 | 0.5043 | Medium |
| 7  | 54.3  | 0.8693 | 0.4410 | Medium |
| 8  | 77.0  | 0.8910 | 0.4000 | Medium |
| 9  | 109.0 | 0.9092 | 0.3750 | Medium-Slow |
| 10 | 146.0 | 0.9222 | 0.3500 | Medium-Slow |
| 11 | 187.0 | 0.9319 | 0.3295 | Medium-Slow |
| 12 | 239.0 | 0.9403 | 0.3065 | Medium-Slow |
| 13 | 305.0 | 0.9477 | 0.2835 | Slow |
| 14 | 390.0 | 0.9544 | 0.2610 | Slow |
| 15 | 498.0 | 0.9602 | 0.2480 | Slow |
| 16 | 635.0 | 0.9653 | 0.2327 | Slow |

Variant A uses $T_{1/2} = 4.0$ min with $b = 0.5050$ for TC1; variants B and C use $T_{1/2} = 5.0$ min with $b = 0.5578$. The pairing is immutable — both coefficients swap together. See `js/tissueCompartments.js:46-61`:

```javascript
// js/tissueCompartments.js:46-61
const COMPARTMENT_1_HALFTIME = {
    [ZHL16_VARIANTS.A]: 4.0,   // Original Bühlmann specification
    [ZHL16_VARIANTS.B]: 5.0,   // Modified for printed tables
    [ZHL16_VARIANTS.C]: 5.0    // Modified for dive computers
};

const COMPARTMENT_1_B_N2 = {
    [ZHL16_VARIANTS.A]: 0.5050, // Paired with 4 min half-time
    [ZHL16_VARIANTS.B]: 0.5578, // Paired with 5 min half-time
    [ZHL16_VARIANTS.C]: 0.5578
};
```

## Rate constant

The exponential loading/unloading rate follows directly from the half-time:

$$k = \frac{\ln 2}{T_{1/2}}$$

```javascript
// js/tissueCompartments.js:216
export function getRateConstant(halfTime) {
    return Math.LN2 / halfTime;
}
```

Used by [Model-02-Haldane-Equation](Haldane.md) and [Model-03-Schreiner-Equation](Schreiner.md) equations.

## Bühlmann a/b — where they come from

Tabulated in `js/tissueCompartments.js` rather than computed at runtime, but they follow Baker's half-time formulas (see [References](References.md#24-erik-baker--gradient-factors-articles)):

$$a = 2 \cdot T_{1/2}^{-1/3} \quad (\text{bar}) \qquad b = 1.005 - T_{1/2}^{-1/2}$$

These give the ZH-L16A (experimental) values exactly. The B and C variants keep the same $b$ values across all 16 compartments (and TC2–TC16 keep the same $a$ values as A), but selectively lower $a$ for the middle-to-slow compartments in order to produce tables that proved more conservative empirically. The C variant lowers $a$ for TC5 through TC15 (see `js/tissueCompartments.js:128-133`).

## Variant semantics

| Variant | Purpose | Conservatism |
|---------|---------|--------------|
| ZH-L16A | Experimental (derived from formulas) | Least — found too permissive in middle compartments in use |
| ZH-L16B | Printed dive tables | More conservative $a$ for TC6–8 and TC13 |
| ZH-L16C | Dive computers (**DecoJS default**) | Most conservative — lowered $a$ for TC5 through TC15 |

```javascript
// js/tissueCompartments.js:40
let currentVariant = ZHL16_VARIANTS.C;
```

## Runtime switching

`setZHL16Variant()` mutates the exported `COMPARTMENTS` array in place (no reassignment) so downstream modules holding a reference pick up the change:

```javascript
// js/tissueCompartments.js:182-192
export function setZHL16Variant(variant) {
    if (!Object.values(ZHL16_VARIANTS).includes(variant)) {
        console.warn(`Unknown ZH-L16 variant: ${variant}, defaulting to ZH-L16C`);
        variant = ZHL16_VARIANTS.C;
    }
    currentVariant = variant;
    const newCompartments = buildCompartments(variant);
    COMPARTMENTS.length = 0;
    COMPARTMENTS.push(...newCompartments);
}
```

Callers must recalculate any cached tissue loading after switching (the charts in `js/mvalues.js` do this on the variant-select handler).

## Color coding

Used by the M-value and profile charts for quick visual grouping:

- **Reds / oranges** (TC1–4): fast compartments
- **Greens** (TC5–8): medium-fast
- **Blues** (TC9–12): medium-slow
- **Purples / magentas** (TC13–16): slow

See [Model-04-M-Values](Model-04-M-Values.md) for how $a$ and $b$ are actually used to compute the M-value line.
