# Model-02 — Haldane Equation

Applies to **constant-depth segments** (stay at one depth for time $t$). Each compartment's tissue pressure evolves exponentially toward the alveolar inert-gas pressure at that depth.

## Formula as coded

$$P_t(t) = P_{alv} + (P_{t,0} - P_{alv}) \cdot e^{-k t}$$

```javascript
// js/decoModel.js:108-111
export function haldaneEquation(initialPressure, alveolarPressure, time, halfTime) {
    const k = getRateConstant(halfTime);
    return alveolarPressure + (initialPressure - alveolarPressure) * Math.exp(-k * time);
}
```

Where $k = \ln(2)/T_{1/2}$ (see [Model-01-Compartments](Model-01-Compartments.md#rate-constant)). As $t \to \infty$, $P_t \to P_{alv}$ (full equilibrium). After one half-time, 50% of the remaining gradient has been closed; after two half-times, 75%; after six, ~98.4%.

## Alveolar pressure

$P_{alv}$ is not the raw ambient partial pressure of the inert gas — a water-vapor correction is applied at body temperature:

$$P_{alv} = (P_{amb} - P_{H_2O}) \cdot f_{N_2}$$

```javascript
// js/decoModel.js:84-86
export function getAlveolarN2Pressure(ambientPressure, n2Fraction = N2_FRACTION) {
    return (ambientPressure - WATER_VAPOR_PRESSURE) * n2Fraction;
}
```

With $P_{H_2O} = 0.0627$ bar at 37 °C and $f_{N_2} = 0.7902$ for air (see [Decompression-Model](Decompression-Model.md#unit-constants)). On a gas switch, `n2Fraction` changes to the new gas's N₂-equivalent fraction (for trimix, $N_2$ and $He$ fractions are summed as the inert-gas fraction — DecoJS does not track helium kinetics separately).

## Worked example

Compartment TC1 (variant C, $T_{1/2} = 5.0$ min), 10 minutes at 20 m on air, starting from surface-equilibrated tissue.

Rate constant:
$$k = \frac{\ln 2}{5.0} = 0.13863 \text{ min}^{-1}$$

Ambient pressure at 20 m:
$$P_{amb} = 1.01325 + 20 \cdot 0.1 = 3.01325 \text{ bar}$$

Alveolar N₂ at depth:
$$P_{alv} = (3.01325 - 0.0627) \cdot 0.7902 = 2.3347 \text{ bar}$$

Initial tissue N₂ (surface saturation on air):
$$P_{t,0} = (1.01325 - 0.0627) \cdot 0.7902 = 0.7510 \text{ bar}$$

Tissue pressure after 10 min (two half-times):
$$P_t(10) = 2.3347 + (0.7510 - 2.3347) \cdot e^{-0.13863 \cdot 10}$$
$$= 2.3347 + (-1.5837) \cdot 0.25$$
$$= 2.3347 - 0.3959 = 1.9388 \text{ bar}$$

Verification: after two half-times the tissue should have closed 75% of the initial $0.7510 \to 2.3347$ gradient (a 1.5837 bar gap). $0.7510 + 0.75 \cdot 1.5837 = 0.7510 + 1.1878 = 1.9388$ bar — matches.

## Entry point

```javascript
// js/decoModel.js:759 (signature)
export function simulateDepthTime(tissuePressures, depth, time, n2Fraction, surfacePressure = SURFACE_PRESSURE)
```

Iterates over all 16 compartments applying the Haldane equation at constant depth, returning a new `tissues` object. Called from `calculateTissueLoading()` (`js/decoModel.js:1178`) whenever two consecutive waypoints have the same depth.

`surfacePressure` defaults to sea level for backward compatibility. Altitude-aware
callers pass the local absolute atmospheric pressure, which changes the inspired
inert-gas pressure at every depth.

## Cross-references

- [Model-03-Schreiner-Equation](Model-03-Schreiner-Equation.md) — the generalization for when depth changes linearly. Haldane is the degenerate case with $R = 0$.
- [Algo-01-Ascent-Simulation](Algo-01-Ascent-Simulation.md) — how Haldane drives level-segment tissue loading inside the full simulation loop.
- [References](References.md#21-b%C3%BChlmann--zh-l16--keller-b%C3%BChlmann) — original Bühlmann sources.
