# Model-03 — Schreiner Equation

## Fixed target versus moving target

Haldane and Schreiner describe the same tissue response under different
alveolar inputs:

| Model | Alveolar input | Tissue response |
|---|---|---|
| **Haldane** | constant | the tissue exponentially approaches a fixed pressure |
| **Schreiner** | changes linearly | the tissue progressively follows a moving pressure |

The teaching page starts with one deliberately simple descent rather than
several competing scenarios.

## Basic example

The diver starts at the surface and descends at a constant rate. At
$t=0$, the selected tissue compartment is in equilibrium with alveolar inert-gas
pressure:

$$
p_{\mathrm{t},0}=p_{\mathrm{alv},0}.
$$

The blue alveolar-pressure curve and orange tissue-pressure curve therefore
start at the same point. Alveolar pressure then rises linearly:

$$
p_{\mathrm{alv}}(t)=p_{\mathrm{alv},0}+Rt,
$$

while tissue pressure responds progressively according to the compartment
half-time.

The graph uses one common, real pressure scale. Its optional green segment is
only the current separation of the two physical pressures; no theoretical
tracking line or independently rescaled value is drawn.

## Main teaching form

Because the basic example starts in equilibrium, its initial pressure
difference is zero:

$$
(p_{\mathrm{alv},0}-p_{\mathrm{t},0})
(1-e^{-kt})=0.
$$

The main explanation can therefore use only two visible parts:

$$
p_{\mathrm{t}}(t)
=
\underbrace{p_{\mathrm{t},0}}_{\text{initial tissue pressure}}
+
\underbrace{
R\left[t-\frac{1-e^{-kt}}{k}\right]
}_{\text{response to the moving target}}.
$$

In words:

> Current tissue pressure equals initial tissue pressure plus the response to
> the linear movement of alveolar pressure.

The moving-target term is a signed **contribution** to tissue-pressure change,
not a separate pressure, physical limit, or graph line. It is zero when
$R=0$, positive for positive $R$, and negative for negative $R$.

## Why the moving-target contribution is intuitive

A linear pressure movement can be imagined as many small pressure changes.
Each change occurs at a different time, so the tissue has a different amount
of time to respond to it. Each response has the same exponential character as
the Haldane equation. Adding all those small responses gives:

$$
R\left[t-\frac{1-e^{-kt}}{k}\right].
$$

The main page does not require differential or integral calculus to use this
interpretation.

## General case

In a complete dive profile, tissue pressure passed from the preceding segment
need not equal current alveolar pressure. The general teaching form therefore
restores the Haldane contribution from the initial pressure difference:

$$
p_{\mathrm{t}}(t)
=p_{\mathrm{t},0}
+(p_{\mathrm{alv},0}-p_{\mathrm{t},0})(1-e^{-kt})
+R\left[t-\frac{1-e^{-kt}}{k}\right].
$$

The three parts are:

1. initial tissue pressure,
2. Haldane response to the initial pressure difference,
3. correction for the linearly moving alveolar target.

The second part is exactly the completed-change form used on the Haldane
teaching page. When $R=0$, the third part is exactly zero and the general form
reduces to Haldane:

$$
p_{\mathrm{t}}(t)
=p_{\mathrm{t},0}
+(p_{\mathrm{alv},0}-p_{\mathrm{t},0})(1-e^{-kt}).
$$

## Algebraic equivalence to the canonical form

Expanding the two brackets in the general teaching form gives:

$$
\begin{aligned}
p_{\mathrm{t}}(t)
={}&p_{\mathrm{t},0}
+p_{\mathrm{alv},0}-p_{\mathrm{t},0}\\
&-(p_{\mathrm{alv},0}-p_{\mathrm{t},0})e^{-kt}\\
&+Rt-\frac{R}{k}+\frac{R}{k}e^{-kt}.
\end{aligned}
$$

The terms $+p_{\mathrm{t},0}$ and $-p_{\mathrm{t},0}$ cancel. Grouping the
remaining exponential terms gives:

$$
p_{\mathrm{t}}(t)
=p_{\mathrm{alv},0}+Rt-\frac{R}{k}
-\left(p_{\mathrm{alv},0}-p_{\mathrm{t},0}-\frac{R}{k}\right)e^{-kt}.
$$

Factoring $R$ produces the canonical Schreiner equation:

$$
p_{\mathrm{t}}(t)
=p_{\mathrm{alv},0}
+R\left(t-\frac{1}{k}\right)
-\left(p_{\mathrm{alv},0}-p_{\mathrm{t},0}-\frac{R}{k}\right)e^{-kt}.
$$

The page colors whole semantic contributions rather than repeated individual
symbols, so their terms can be followed through expansion and regrouping.

## Production implementation

The displayed tissue pressure is always calculated by the existing production
primitive:

```javascript
// js/decoModel.js:210-215
export function schreinerEquation(initialPressure, initialAlveolarPressure, rate, time, halfTime) {
    const k = getRateConstant(halfTime);
    const term1 = initialAlveolarPressure + rate * (time - 1/k);
    const term2 = (initialAlveolarPressure - initialPressure - rate/k) * Math.exp(-k * time);
    return term1 - term2;
}
```

The teaching contributions are calculated separately only to show their
current signed values. Tests compare their sum with `schreinerEquation()` over
positive, negative, and zero rates, multiple initial pressures, times, and
half-times.

Origin: Schreiner & Kelley 1971 (see
[References](References.md#22-schreiner--exponential-gas-uptake-with-changing-pressure)).

## Optional calculus note

For readers familiar with calculus, Haldane and Schreiner solve the same
differential law:

$$
\frac{\mathrm{d}p_{\mathrm{t}}}{\mathrm{d}t}
=k[p_{\mathrm{alv}}(t)-p_{\mathrm{t}}(t)].
$$

This is kept in a deeper collapsed note and is not required for the main
teaching path.

## Rate and half-time

$R$ is the signed rate of change of **alveolar pressure** in
$\mathrm{bar\,min^{-1}}$, not the diver's depth rate. For a depth-change rate
$v$:

$$
R=f_{\mathrm{N_2}}v\frac{\mathrm{d}p_{\mathrm{amb}}}{\mathrm{d}h}.
$$

The compartment rate constant is:

$$
k=\frac{\ln 2}{t_{1/2}}.
$$

A shorter half-time gives a larger $k$ and a faster response.

## Entry points

`simulateDepthChange()` applies Schreiner to all 16 compartments for one linear
segment:

```javascript
// js/decoModel.js:1024
export function simulateDepthChange(
    tissuePressures,
    startDepth,
    endDepth,
    time,
    n2Fraction,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
)
```

`calculateTissueLoading()` passes the resulting tissue state through the
complete waypoint sequence:

```javascript
// js/decoModel.js:1645
export function calculateTissueLoading(profile, surfaceInterval = 60, options = {})
```

## Cross-references

- [Model-02-Haldane-Equation](Model-02-Haldane-Equation.md) — fixed-target form.
- [Algo-01-Ascent-Simulation](Algo-01-Ascent-Simulation.md) — profile loop.
- [References](References.md#22-schreiner--exponential-gas-uptake-with-changing-pressure) — source literature.
