# Decompression Model

The mathematical machinery DecoJS uses to track inert gas loading across 16 theoretical tissue compartments and compute ascent limits from them. These pages are the developer-facing counterpart to `pressure.html`, `tissue-loading.html`, `m-values.html`, and `gradient-factors.html` — they assume the reader already knows what inert-gas loading is and want to see the algorithm as it is coded.

For algorithm-level orchestration (how these equations drive a simulated ascent, deco-stop search, NDL computation), see [Algorithms](Algorithms.md). For the JavaScript module/function index, see [Architecture](Architecture.md).

## Notation

Used consistently across all Model pages.

| Symbol | Meaning | Units |
|--------|---------|-------|
| $P_{amb}$ | Ambient (absolute) pressure | bar |
| $P_{alv}$ | Alveolar inert-gas partial pressure | bar |
| $P_t$ | Tissue inert-gas pressure | bar |
| $P_{t,0}$ | Initial tissue inert-gas pressure (segment start) | bar |
| $P_{alv,0}$ | Initial alveolar inert-gas pressure (segment start) | bar |
| $T_{1/2}$ | Compartment half-time | min |
| $k$ | Rate constant, $k = \ln(2) / T_{1/2}$ | min⁻¹ |
| $R$ | Rate of change of alveolar pressure ($dP_{alv}/dt$) | bar/min |
| $a, b$ | Bühlmann M-value coefficients (per compartment, per variant) | $a$: bar; $b$: dimensionless |
| $M$ | M-value, maximum tolerable $P_t$ at a given $P_{amb}$ | bar |
| $GF$ | Gradient factor, fraction of supersaturation budget used | 0–1 internally |

**GF storage convention**: DecoJS UI code (`js/diveSetup.js`) stores GF as percent (`DEFAULT_GF_LOW = 100`, `DEFAULT_GF_HIGH = 100`); algorithmic code in `js/decoModel.js` uses fractions (`DEFAULT_GF_LOW = 1.0`, `DEFAULT_GF_HIGH = 1.0`). Conversion happens at the boundary.

All depths are in meters, all times in minutes.

## Unit constants

Defined at the top of `js/decoModel.js`:

```javascript
// js/deco/constants.js:12-24
export const SURFACE_PRESSURE = 1.01325;       // 1 atm exactly, in bar
export const WATER_VAPOR_PRESSURE = 0.0627;    // alveolar H2O correction at 37°C, in bar
export const N2_FRACTION = 0.7902;             // N2 + Ar lumped, per ZH-L convention
export const PRESSURE_PER_METER = 0.1;         // EN 13319 convention, bar/m
```

`N2_FRACTION = 0.7902` (not 0.79) is the standard Bühlmann convention — argon (~0.93%) is lumped into the nitrogen compartment because it has similar kinetics.
`PRESSURE_PER_METER = 0.1` is the default EN 13319 indicated-depth
convention. `getPressurePerMeter(environment)` also supports freshwater
(1000&nbsp;kg/m³, 0.0980665&nbsp;bar/m) and seawater (1025&nbsp;kg/m³,
0.1005181625&nbsp;bar/m). Profiles without `environment.waterType` remain on
the EN default for backward compatibility.

`SURFACE_PRESSURE` remains the backward-compatible sea-level default. Altitude-aware
calculations call `getPressureAtAltitude(altitude)` and pass the resulting absolute
surface pressure through ambient-pressure conversion, initial tissue saturation, NDL,
ceilings, the GF ramp, gas consumption, and the decompression scheduler. The standard
atmosphere is used to convert altitude to pressure; the sandbox currently assumes the
diver is fully acclimatized to the selected altitude.

### Atmospheric pressure at altitude

The familiar exponential barometric equation

$$
p_{\mathrm{atm}}(h) = p_0 e^{-h/H}
$$

is an isothermal approximation: it assumes a constant atmospheric temperature
and a fixed scale height $H$ (approximately 8.4&nbsp;km). It is useful for
explaining why pressure decreases approximately exponentially with altitude, but
it is not the exact equation used by DecoJS.

`getPressureAtAltitude(h)` uses the standard-atmosphere troposphere model, which
accounts for the standard temperature lapse rate:

$$
p_{\mathrm{atm}}(h)
=
p_0
\left(1 - 2.25577 \times 10^{-5} h\right)^{5.25588},
\qquad
p_0 = 1.01325\ \mathrm{bar}.
$$

Here $h$ is altitude in metres and $p_{\mathrm{atm}}$ is the absolute
atmospheric pressure at the dive site's water surface. For example, at
2,000&nbsp;m the model gives approximately 0.795&nbsp;bar; the exponential
approximation gives approximately 0.799&nbsp;bar.

The absolute ambient pressure at depth $d$ is then

$$
p_{\mathrm{amb}}(h,d)
=
p_{\mathrm{atm}}(h) + \frac{\rho g d}{10^5}.
$$

The EN mode substitutes exactly 0.1&nbsp;bar/m; the density-based modes use
$\rho = 1000$&nbsp;kg/m³ or 1025&nbsp;kg/m³ and standard gravity. Thus, in EN mode
at an altitude of 2,000&nbsp;m and a depth of 7.5&nbsp;m, DecoJS uses
$p_{\mathrm{amb}} \approx 0.795 + 0.750 = 1.545\ \mathrm{bar}$. This local
surface pressure is threaded through initial tissue saturation, inspired-gas
pressure, NDL, ceilings, the GF ramp, MOD adjustment, and decompression
scheduling.

## Chapter TOC

1. [Model-01-Compartments](Model-01-Compartments.md) — the 16 ZH-L16 compartments, their half-times, the a/b coefficients, and the A/B/C variants.
2. [Model-02-Haldane-Equation](Model-02-Haldane-Equation.md) — constant-depth tissue loading.
3. [Model-03-Schreiner-Equation](Model-03-Schreiner-Equation.md) — linear-rate-of-pressure-change tissue loading (the workhorse during descent and ascent).
4. [Model-04-M-Values](Model-04-M-Values.md) — Bühlmann M-value lines, ceiling equation, instantaneous GF.
5. [Model-05-Gradient-Factors](Model-05-Gradient-Factors.md) — Baker GFs, `pAnchor`, and the GF ramp.

Cross-cutting: [Algorithms](Algorithms.md) drives these equations across a full dive; [References](References.md) lists primary sources.
