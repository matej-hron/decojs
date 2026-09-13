# Model-02 — Haldane Equation

## Fixed target versus moving target

Haldane and Schreiner describe the same exponential tissue response under two
different input conditions:

| Model | Alveolar target | Tissue response |
|---|---|---|
| **Haldane** | Set to a new value at $t = 0$, then constant | Exponentially approaches the fixed target |
| **Schreiner** | Changes linearly throughout the segment | Follows the moving target with a delay |

The vertical change shown in the Haldane sandbox is an **idealized change of the
input alveolar pressure**, not a claim that physical depth changes instantaneously.
A real descent or ascent takes time and is modeled by the
[Schreiner equation](Model-03-Schreiner-Equation.md).

## Mental model

Imagine a horizontal target line at $p_{\mathrm{alv}}$. At $t = 0$, that line is
placed at its new constant value. The tissue starts at $p_{\mathrm{t},0}$ and follows
a smooth exponential curve toward the line. A faster compartment bends toward it
more quickly; a slower compartment takes longer.

## Teaching form

This model applies to **constant-depth segments**. The interactive sandbox presents
the completed-change form first because it reads naturally during both on-gassing
and off-gassing:

$$
p_{\mathrm{t}}(t)
= p_{\mathrm{t},0}
+ \left(p_{\mathrm{alv}} - p_{\mathrm{t},0}\right)
  \left(1 - e^{-k t}\right)
$$

In words:

> current pressure = starting pressure + total change toward equilibrium ×
> completed fraction of the change

The total change $p_{\mathrm{alv}} - p_{\mathrm{t},0}$ is positive during
on-gassing and negative during off-gassing. The completed fraction
$1 - e^{-k t}$ starts at 0 and approaches 1, so the same interpretation works
without changing signs or rules.

## Canonical form as coded

The implementation uses the algebraically equivalent canonical form:

$$
p_{\mathrm{t}}(t)
= p_{\mathrm{alv}}
+ \left(p_{\mathrm{t},0} - p_{\mathrm{alv}}\right)e^{-k t}
$$

```javascript
// js/decoModel.js:193-196
export function haldaneEquation(initialPressure, alveolarPressure, time, halfTime) {
    const k = getRateConstant(halfTime);
    return alveolarPressure + (initialPressure - alveolarPressure) * Math.exp(-k * time);
}
```

The canonical form naturally tracks the remaining deviation from equilibrium:

$$
p_{\mathrm{t}}(t) - p_{\mathrm{alv}}
= \left(p_{\mathrm{t},0} - p_{\mathrm{alv}}\right)e^{-k t}
$$

Where $k = \ln(2)/t_{1/2}$ (see
[Model-01-Compartments](Model-01-Compartments.md#rate-constant)). At $t = 0$,
the completed fraction is 0 and $p_{\mathrm{t}}(0) = p_{\mathrm{t},0}$. As
$t \to \infty$, the exponential term approaches 0, the completed fraction
approaches 1, and $p_{\mathrm{t}} \to p_{\mathrm{alv}}$. After one half-time,
50% of the total change has been completed; after two half-times, 75%; after
six, approximately 98.4%.

## Alveolar pressure

$p_{\mathrm{alv}}$ is not the raw ambient partial pressure of the inert gas — a
water-vapor correction is applied at body temperature:

$$
p_{\mathrm{alv}}
= \left(p_{\mathrm{amb}} - p_{\mathrm{H_2O}}\right)f_{\mathrm{N_2}}
$$

```javascript
// js/decoModel.js:168-170
export function getAlveolarN2Pressure(ambientPressure, n2Fraction = N2_FRACTION) {
    return (ambientPressure - WATER_VAPOR_PRESSURE) * n2Fraction;
}
```

With $p_{\mathrm{H_2O}} = 0.0627\ \mathrm{bar}$ at $37\ ^\circ\mathrm{C}$
and $f_{\mathrm{N_2}} = 0.7902$ for air (see
[Decompression-Model](Decompression-Model.md#unit-constants)). On a gas switch,
`n2Fraction` changes to the new gas's N₂-equivalent fraction (for trimix, the
N₂ and He fractions are summed as the inert-gas fraction — DecoJS does not
track helium kinetics separately).

## Worked example

Compartment TC1 (variant C, $t_{1/2} = 5.0\ \mathrm{min}$), 10 minutes at
20 m on air, starting from surface-equilibrated tissue.

Rate constant:
$$k = \frac{\ln 2}{5.0} = 0.13863\ \mathrm{min}^{-1}$$

Ambient pressure at 20 m:
$$p_{\mathrm{amb}} = 1.01325 + 20 \cdot 0.1 = 3.01325\ \mathrm{bar}$$

Alveolar N₂ at depth:
$$p_{\mathrm{alv}} = (3.01325 - 0.0627) \cdot 0.7902 = 2.3347\ \mathrm{bar}$$

Initial tissue N₂ (surface saturation on air):
$$p_{\mathrm{t},0} = (1.01325 - 0.0627) \cdot 0.7902 = 0.7510\ \mathrm{bar}$$

Tissue pressure after 10 min (two half-times):
Using the primary teaching form:

$$
p_{\mathrm{t}}(10)
= 0.7510 + (2.3347 - 0.7510)\left(1 - e^{-0.13863 \cdot 10}\right)
$$
$$= 0.7510 + 1.5837 \cdot (1 - 0.25)$$
$$= 0.7510 + 1.1878 = 1.9388\ \mathrm{bar}$$

Verification with the canonical form gives the same result:

$$
2.3347 + (0.7510 - 2.3347)e^{-0.13863 \cdot 10}
= 2.3347 - 1.5837 \cdot 0.25
= 1.9388\ \mathrm{bar}
$$

## Entry point

```javascript
// js/decoModel.js:996 (signature)
export function simulateDepthTime(tissuePressures, depth, time, n2Fraction, surfacePressure = SURFACE_PRESSURE, pressurePerMeter = PRESSURE_PER_METER)
```

Iterates over all 16 compartments applying the Haldane equation at constant depth,
returning a new `tissues` object. Called from `calculateTissueLoading()`
(`js/decoModel.js:1645`) whenever two consecutive waypoints have the same depth.

`surfacePressure` defaults to sea level for backward compatibility. Altitude-aware
callers pass the local absolute atmospheric pressure, which changes the inspired
inert-gas pressure at every depth. `pressurePerMeter` defaults to the EN 13319
conversion and carries the selected freshwater or seawater conversion into the
constant-depth ambient pressure.

## Cross-references

- [Model-03-Schreiner-Equation](Model-03-Schreiner-Equation.md) — the generalization for when depth changes linearly. Haldane is the degenerate case with $R = 0$.
- [Algo-01-Ascent-Simulation](Algo-01-Ascent-Simulation.md) — how Haldane drives level-segment tissue loading inside the full simulation loop.
- [References](References.md#21-b%C3%BChlmann--zh-l16--keller-b%C3%BChlmann) — original Bühlmann sources.
