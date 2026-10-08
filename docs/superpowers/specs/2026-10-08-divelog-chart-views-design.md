# Dive log analysis: chart views (pressure, partial pressure, tissues, gas)

Date: 2026-10-08 · Branch `feat/divelog-chart-views` · Autonomous run (user away, gates pre-approved).

## Why

User: "chart analysis does not have option to switch chart types — pressure, partial pressure, gas consumption,
tissue loading and such". `RecordedDiveAnalysis` creates `DiveProfileChart` with the depth/ceiling view only, while
the same chart already supports `showAmbientPressure`, `showPartialPressures`, `showTissueLoading` and
`showGasConsumption`, and the Sandbox switches between them with five preset buttons (`dpc-depth` … `dpc-gas`).

## Outcome / success criteria

- Above the profile chart of the dive log analysis (standalone `lab/dive-log.html` and the logbook's embedded
  analysis) a compact segmented control switches between **Profile · Pressure · Partial pressure · Tissues · Gas**.
- Each view uses the Sandbox preset for that mode; the Profile view stays exactly what it is today
  (ceiling, violation shading, dive computer ceiling).
- The selected view survives GF changes, the repetitive-dive toggle and selecting another dive (same instance).
- Tissue view uses the repetitive-dive start state the analysis already computes (`setup.initialTissuePressures`).
- Gas view, inside the logbook: cylinder volume and start pressure come from the entry's gases
  (`gasesFromEntry`), and each gas's line ends at the recorded end pressure. Gases without cylinder data use an
  assumed SAC 20 l/min, 12 l at 200 bar. A note under the chart says which applies.
- Phone first (390 px portrait: the control wraps/fits without horizontal page scroll, 44 px touch targets),
  desktop, light + dark. en/cs/es parity. Notation rules (SAC upright, `&nbsp;`/U+00A0 before units, decimal comma
  in Czech via `fmtNum`).
- Sandbox, Theory pages and other charts render exactly as before.

## Decisions

| Decision | Why |
|---|---|
| Reuse the Sandbox's five presets (same option sets), with short labels in a segmented control (`aria-pressed` buttons) like the logbook's list-view switch (`.lb-seg`) | Same mental model as the Sandbox; the segmented look is already the logbook's phone pattern. |
| Recorded overlays (dive computer ceiling, above-ceiling shading) only in the Profile view | They belong to the depth/ceiling comparison; in the other views they add clutter. |
| `showLabels: false` in every view | The analysis already hides profile labels (dense recorded profile). |
| View lives in the instance (default Profile), no storage | Simple; opening a dive from the logbook starts on the familiar view. |
| Per-gas SAC override: a gas may carry `sacRate` (l/min); `computeGasConsumption` uses it instead of the setup's sac/deco SAC; `normalizeDiveSetup` keeps it when it is a positive number | Only way to make every cylinder's modelled line end at its recorded end pressure. Opt-in: no existing gas has the field, so Sandbox/Theory output is unchanged. |
| Calibration: `sacRate = used litres ÷ ∫ ambient pressure dt` for the time that gas was breathed (the integral comes from `computeGasConsumption` run with SAC 1) | Exact by construction with the same integrator the chart draws with; uses the entry's own volume and pressures. |
| Match recording gases to entry rows by mix (O₂ and He within 0,5 %), first unused row wins; leftover recording gases take leftover rows with unknown mix, in order | Entries prefilled from a recording carry the same mixes; legacy single-cylinder entries may have no mix. |
| Entry row with volume + start but no end pressure: its cylinder and start pressure, assumed SAC 20 l/min. No volume or no start: fully assumed | Use whatever the diver logged; never invent a calibration. |
| The entry's gases reach the analysis as a new `entryGases` config option, passed by `LogbookApp._showAnalysis` | The analysis only knows the recording; the entry is already loaded by the logbook. Standalone page: no entry → assumed values. |
| Gas data is computed only when the Gas view is active and cached per dive (independent of GF) | Keeps GF slider drags as cheap as today. |

## Units

- `js/import/recordedGas.js` (new, pure, tested):
  - `matchEntryGases(setupGases, entryRows)` → array (same order as `setupGases`) of the matched row or `null`.
  - `recordedGasSetup(setupGases, entryRows, results)` → `{ gases, assumed: string[] }`: setup gases with
    `cylinderVolume`, `startPressure` and `sacRate` filled; `assumed` = names of gases using assumed values.
  - `ASSUMED_SAC_LPM = 20`, `ASSUMED_CYLINDER_L = 12`, `ASSUMED_START_BAR = 200`.
- `js/diveSetup.js` `computeGasConsumption`: per-gas `sacRate` override.
- `js/charts/chartTypes.js` `normalizeDiveSetup`: keep a positive finite `gas.sacRate`.
- `js/components/RecordedDiveAnalysis.js`: `CHART_VIEWS` (exported, preset options per view), segmented control,
  `entryGases` option, gas note, view-aware chart options.
- `js/logbook/LogbookApp.js`: pass `entryGases: gasesFromEntry(entry)`.
- `lab/dive-log.html` styles; `locales/{en,cs,es}.json` (`diveLog.view.*`, `diveLog.gasNote.*`);
  `sw.js` STATIC_ASSETS for the new module; pages.yml allow-list if it enumerates files.

## Testing

- `tests/recorded-dive.test.mjs`: matching (exact mix, unknown-mix fallback, no rows), calibration end pressure
  equals recorded end pressure, partial data, assumed fallback, `CHART_VIEWS` profile view keeps recorded overlays.
- `computeGasConsumption` override test and a regression check that a gas without `sacRate` is unchanged.
- Browser: scratchpad harness running `RecordedDiveAnalysis` embedded with a fake store and the bundled fixture
  dives, at 390 px and desktop, light and dark, every view.
