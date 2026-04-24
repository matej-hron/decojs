# Algo-01 — Ascent Simulation

Replay a full dive waypoint array over all 16 ZH-L16 compartments and produce a time series of tissue pressures. This drives both chart rendering (the tissue-loading plot) and downstream ceiling computation.

## Entry point

```javascript
// js/decoModel.js:1178 (signature)
export function calculateTissueLoading(profile, surfaceInterval = 60, options = {})
```

Returns:

```javascript
{
  timePoints: [...],          // minutes, at CALC_INTERVAL (10 s) resolution
  depthPoints: [...],         // meters, interpolated between waypoints
  ambientPressures: [...],    // bar
  alveolarN2Pressures: [...], // bar, post water-vapor correction
  n2Fractions: [...],         // reflects gas switches
  gasNames: [...],
  gasSwitches: [...],         // explicit {time, depth, fromGasName, gasName, gasId} events
  compartments: { 1: { pressures: [...], halfTime, label, color }, ..., 16: {...} }
}
```

`CALC_INTERVAL = 10` seconds (`js/decoModel.js:15`); every 10 s a new row is pushed. Smaller steps do not meaningfully change the final tissue state — the Schreiner equation is exact for a constant rate, so the step only affects *where samples are taken for plotting*, not numerical accuracy.

## Initial tissue state

```javascript
// js/decoModel.js:93-95
export function getInitialTissueN2(n2Fraction = N2_FRACTION) {
    return getAlveolarN2Pressure(SURFACE_PRESSURE, n2Fraction);
}
```

For air this evaluates to $(1.01325 - 0.0627) \cdot 0.7902 \approx 0.7510$ bar. All 16 compartments are initialized to the same value — reasonable because an extended surface interval at constant breathing gas equilibrates every half-time ($6 T_{1/2}$ closes 98.4 % of the gradient; even TC16's 635 min half-time reaches near-equilibrium within a few days).

```javascript
// js/decoModel.js:1254-1259
const currentPressures = {};
const initialN2Fraction = getN2FractionAtTime(0);
const initialN2 = getInitialTissueN2(initialN2Fraction);
COMPARTMENTS.forEach(comp => {
    currentPressures[comp.id] = initialN2;
});
```

## Segment dispatch

Inside the main loop, DecoJS avoids calling Schreiner with `rate = 0` (a numerically bad idea — the Schreiner form divides by $k$ and reduces to Haldane only in the limit). It explicitly dispatches:

```javascript
// js/decoModel.js:1399-1424
const ambientRate = (nextAmbient - currentAmbient) / stepDuration;
const avgN2Fraction = (stepN2Fraction + nextN2Fraction) / 2;
const alveolarRate = ambientRate * avgN2Fraction;

COMPARTMENTS.forEach(comp => {
    if (Math.abs(alveolarRate) < 0.0001) {
        // Constant depth - use Haldane equation
        currentPressures[comp.id] = haldaneEquation(
            currentPressures[comp.id], currentAlveolar, stepDuration, comp.halfTime
        );
    } else {
        // Depth change - use Schreiner equation
        currentPressures[comp.id] = schreinerEquation(
            currentPressures[comp.id], currentAlveolar, alveolarRate, stepDuration, comp.halfTime
        );
    }
});
```

Threshold `0.0001 bar/min` is tight enough that stop segments (rate exactly 0) always hit the Haldane branch. For a 3 m ascent at 10 m/min the alveolar rate is ≈ 0.079 bar/min — safely in the Schreiner branch.

## Waypoint-aware stepping

The loop does not simply advance by 10 s — it snaps to the next waypoint time if a straight 10 s step would cross one:

```javascript
// js/decoModel.js:1337-1352
let nextTime = currentTime + intervalMinutes;
const nextWaypointTime = (waypointIndex < profile.length - 1)
    ? profile[waypointIndex + 1].time
    : totalTime + 1;
if (currentTime < nextWaypointTime && nextTime > nextWaypointTime) {
    nextTime = nextWaypointTime;
}
if (currentTime < lastWaypoint.time && nextTime > lastWaypoint.time) {
    nextTime = lastWaypoint.time;
}
```

This guarantees each segment is driven by exactly one `(wp_i, wp_{i+1})` pair — no half-step spans a descent/level boundary, which would blur the rate into something neither Haldane nor Schreiner models exactly.

## Gas switches

Each waypoint may carry an optional `gasId` field. `calculateTissueLoading` reads this via the `getN2FractionAtTime()` closure (`js/decoModel.js:1188-1208`) — the current gas sticks until a waypoint with a new `gasId` is seen. Tissue pressure is continuous across a switch; only the alveolar target $P_{alv}$ changes, so the Schreiner rate for the *next* segment picks up the new $f_{N_2}$. See [Algo-05-Multi-Gas-Switching](Algo-05-Multi-Gas-Switching.md) for how these waypoints are produced.

## Surface interval

The `surfaceInterval` parameter (default 60 min) appends depth = 0 time *after* the final waypoint, using air (`N2_FRACTION = 0.7902`) regardless of the final in-water gas:

```javascript
// js/decoModel.js:1301-1303
const currentN2Fraction = currentTime > lastWaypoint.time
    ? N2_FRACTION  // Surface interval uses air
    : getN2FractionAtTime(currentTime);
```

This lets unit tests chain dives, though the current chart layer renders only `dives[0]` (see CLAUDE.md — repetitive-dive UI is on the roadmap).

## Cross-references

- [Model-02-Haldane-Equation](Model-02-Haldane-Equation.md) and [Model-03-Schreiner-Equation](Model-03-Schreiner-Equation.md) — the equations being dispatched.
- [Algo-06-Ceiling-Time-Series](Algo-06-Ceiling-Time-Series.md) — consumes the `results` object from `calculateTissueLoading` to overlay ceilings.
- [Architecture](Architecture.md) — `calculateTissueLoading` is the main hot-path consumed by every chart component.
