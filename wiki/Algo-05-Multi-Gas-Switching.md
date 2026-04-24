# Algo-05 — Multi-Gas Switching

Real technical dives carry one bottom gas plus one or more deco gases — EAN50 for shallow stops, pure O₂ for the last 6 m. DecoJS handles this across three layers: MOD calculation, gas-priority selection inside the deco loop, and waypoint-level switch insertion for chart rendering.

## MOD calculation

```javascript
// js/diveSetup.js:807-811
export function calculateMOD(o2Fraction, maxPpO2 = 1.4) {
    if (o2Fraction <= 0) return Infinity;
    const maxAmbient = maxPpO2 / o2Fraction;
    return Math.floor((maxAmbient - 1) * 10);
}
```

$$MOD = \left\lfloor \left(\frac{ppO_2^{max}}{f_{O_2}} - 1\right) \cdot 10 \right\rfloor \text{ m}$$

Default `maxPpO2 = 1.4` for bottom gas; `1.6` for deco (relaxed because the diver is resting at a stop, not working). `Math.floor` rounds toward shallower — conservative, always-below-MOD.

The deco loop then snaps MOD to the 3 m stop grid:

```javascript
// js/decoModel.js:944
const switchDepth = Math.max(0, Math.floor(mod / stopIncrement) * stopIncrement);
```

Examples at $ppO_2 = 1.6$:

| Gas | $f_{O_2}$ | MOD (m) | switchDepth (3 m grid) |
|-----|-----------|---------|------------------------|
| EAN50 | 0.50 | 22 | 21 |
| EAN80 | 0.80 | 10 | 9 |
| Pure O₂ | 1.00 | 6 | 6 |

## Gas priority in the deco loop

When multiple deco gases are eligible at a depth (i.e. within MOD and not yet switched), DecoJS picks the one with the **deepest** MOD — the richest gas that's still safe. This enforces sequential switching: EAN50 at 21 m before O₂ at 6 m, never the other way around.

```javascript
// js/decoModel.js:968-994
const switchToBestGas = (atDepth, recordSwitch = true) => {
    const eligible = gasSwitchPoints.filter(gas =>
        atDepth <= gas.switchDepth &&
        gas.n2 < currentN2 &&
        !usedGases.has(gasKey(gas))
    );
    if (eligible.length === 0) return false;

    // Pick the gas with the deepest MOD (highest switchDepth) - ensures sequential switching
    const best = eligible.reduce((a, b) => (b.switchDepth > a.switchDepth ? b : a));
    const key = gasKey(best);
    currentN2 = best.n2;
    currentGasName = best.name;
    usedGases.add(key);
    if (recordSwitch) {
        gasSwitches.push({ depth: atDepth, gas: best.name, gasId: key });
    }
    return true;
};
```

`usedGases` is a `Set` preventing re-selection of a gas already switched to. `gasKey(g) = g.id ?? g.name` (`js/decoModel.js:918`) handles gases without an explicit id field. The `gas.n2 < currentN2` guard ensures we never "switch" to a gas with equal or worse inert-gas fraction than the current one.

## Where switches are handled — three layers

### 1. Anchor search (`findGFLowAnchor`)

The simulated 0.1 bar ascent accepts `gasSwitchPoints` and applies them as it crosses each switch depth (`js/decoModel.js:290-296`). Without this, `pAnchor` would be computed as if the diver stayed on bottom gas to the surface, yielding an incorrectly deep anchor. See [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md).

### 2. Deco scheduler (`generateDecoSchedule`)

Gas switches can occur either:
- **During ascent to first stop**, at MOD depths that lie between `currentDepth` and `firstStopDepth` (`js/decoModel.js:1044-1064`). Important when a rich deco gas is usable before the first mandatory stop.
- **On arrival at a stop depth**, via `switchToBestGas(depth)` inside the stop loop (`js/decoModel.js:1086`).
- **During ascent in a no-deco scenario**, if the dive is within NDL but deco gases are still carried for ascent richness (`js/decoModel.js:1007-1037`).

### 3. Waypoint insertion (`insertGasSwitchWaypoints`)

```javascript
// js/diveSetup.js:1009 (signature)
export function insertGasSwitchWaypoints(waypoints, gases, ascentRate = 10, maxPpO2 = 1.6, gasSwitchTime = DEFAULT_GAS_SWITCH_TIME)
```

Post-processes a complete waypoint array to add explicit switch waypoints at the correct depth/time. Pre-scans for existing stops to avoid inserting redundant waypoints where a deco stop is already scheduled at the switch depth:

```javascript
// js/diveSetup.js:1040-1047
const existingStopDepths = new Set();
for (let i = 0; i < waypoints.length - 1; i++) {
    if (waypoints[i].depth === waypoints[i + 1].depth && waypoints[i].depth > 0) {
        existingStopDepths.add(waypoints[i].depth);
    }
}
```

When inserting, the function:
- Rounds switch depth to 3 m grid with `Math.floor(decoGas.mod / 3) * 3` (`js/diveSetup.js:1071`).
- If there is no existing stop at that depth, inserts an arrival waypoint and a departure waypoint separated by `gasSwitchTime` minutes.
- If there is an existing stop, merges: updates the stop's `gasId` rather than inserting a parallel row.
- Marks every ascending waypoint with the `currentGasId` so downstream consumers (chart, tissue simulation) pick up the correct $f_{N_2}$.

### Gas-switch time

```javascript
// js/diveSetup.js (constant)
export const DEFAULT_GAS_SWITCH_TIME = 0;
```

Configurable 0–5 min. Zero matches decotengu (an instantaneous switch) — the diver is conceptually assumed to verify the regulator + clear O₂ windows within the natural stop duration. Conventions that add a minute or two at the switch as a safety margin are accommodated by setting `gasSwitchTime > 0` — the time is added to the stop at the switch depth, and tissue loading is simulated for that time on the *new* gas (`js/decoModel.js:1086-1089`).

## Gas fraction across a switch

Tissue pressure is continuous across a switch. What changes is the alveolar target $P_{alv}$ = $(P_{amb} - P_{H_2O}) \cdot f_{N_2,\text{new}}$, which drives the Schreiner / Haldane equations for subsequent segments. Because the new gas typically has a lower $f_{N_2}$, off-gassing accelerates immediately after the switch — the whole point of carrying deco gases.

## Worked example

40 m on air + EAN50 + O₂, 25 min bottom, $GF = 30/85$:

1. Descent to 40 m on **air**; bottom time 25 min on **air**.
2. Ascent 40 → 21 m on air. At 21 m, switch to **EAN50** (MOD 21 m on 3 m grid). `usedGases = { ean50 }`.
3. Ascent 21 → 15 m (first stop) on EAN50. Stop at 15 m, 12 m, 9 m on EAN50.
4. At 6 m, switch to **O₂** (MOD 6 m on 3 m grid). `usedGases = { ean50, o2 }`.
5. Stop at 6 m and 3 m on O₂.
6. Ascent 3 → 0 m on O₂.

Each switch is recorded in `gasSwitches: [{depth: 21, gas: 'EAN50', gasId: 2}, {depth: 6, gas: 'O2', gasId: 3}]` for chart annotation.

## Regression — gas switch at time 0

`tests/gasSwitchTime-zero-regression.test.mjs` guards a subtle case: a 0-minute gas switch waypoint at `time = 0` used to drift tissue state by one 10-second step. The fix ensures consecutive same-time waypoints are consumed without advancing the integration clock.

## Cross-references

- [Algo-03-First-Stop-Ramped-GF](Algo-03-First-Stop-Ramped-GF.md) — where `gasSwitchPoints` is first consumed.
- [Algo-04-Deco-Stop-Loop](Algo-04-Deco-Stop-Loop.md) — the stop-loop's `switchToBestGas` dispatcher.
- [Algo-06-Ceiling-Time-Series](Algo-06-Ceiling-Time-Series.md) — how gas changes propagate through the ceiling overlay.
