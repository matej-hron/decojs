# Dive log: touch readout instead of the chart tooltip

**Problem.** On a phone (Pixel 8a) the Chart.js tooltip of the dive-log charts covers most of the
plot, follows the finger, and cannot be dismissed (the desktop `T` toggle has no touch equivalent).

## Decisions

| Decision | Why |
|---|---|
| Opt-in chart option `touchReadout: true`, passed only by `RecordedDiveAnalysis` | Sandbox, Theory and every desktop stay byte-for-byte the same; without the option no code path changes. |
| Active when `matchMedia('(pointer: coarse)')` matches (checked at each render) | The defect is touch-specific (no hover, nothing to dismiss). A narrow *desktop* window still has a mouse, hover and the `T` key, so it keeps the tooltip; a phone in landscape (>640 px) is still touch and gets the readout. Width would get both cases wrong. |
| Readout strip above the plot, reserved height of two lines | Never covers data; reserving the height means no layout jump while dragging. Placeholder hint when empty. |
| Canvas `touch-action: pan-y` while active | Vertical swipes scroll the page (browser cancels the pointer, readout reverts to its pre-gesture state); taps and horizontal drags move the readout. |
| Clear by: ✕ button in the strip, tapping the same spot again, tapping outside the chart | Explicit, discoverable control plus the two gestures the brief asked for. |
| Readout anchored in data coordinates (time, or P-P/GF point) | Charts are rebuilt on every GF/view/time change; the readout re-resolves after each render instead of going stale. |
| Profile: vertical crosshair at the touched time. P-P / GF: ring on the nearest point | Matches the chart's own geometry (time axis vs. pressure axis). |

## Readout content (pure, tested formatters in `js/charts/touchReadout.js`)

Line 1 (all profile views): `m:ss · depth · gas`, e.g. `23:40 · 18,2 m · EAN32`.
Line 2 per view:

- **Profile:** ceiling, dive-computer ceiling (if logged), GF of the leading compartment `GF 61 % (TC5)`.
- **Pressure:** *p*<sub>amb</sub>, ceiling.
- **Partial pressure:** *p*<sub>O₂</sub>, *p*<sub>N₂</sub>.
- **Tissues:** *p*<sub>amb</sub>, then the visible compartments `TC1 2,31 bar` (at most three, then `+n`).
- **Gas:** consumption rate, then each cylinder's pressure.
- **P-P chart:** `TC1 M-value · p_amb 2,81 bar · p_t 2,10 bar` (dataset label, condensed).
- **GF chart:** `TC1 · p_amb 2,81 bar · GF 61 %`.

Notation: U+00A0 between number and unit, decimal comma in cs (via `fmtNum`), quantity symbols as
`<var>` in the DOM. All labels translated (en/cs/es) under `chart.readout.*`.

## Out of scope

Desktop tooltip, the `T` shortcut, Sandbox/Theory pages, the timeline sliders (unchanged; the readout
does not move the time index).
