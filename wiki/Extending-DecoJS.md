Practical how-tos for common modifications. All file paths are relative to the repository root.

## Before-commit checklist

Per `CLAUDE.md` root of repo:

1. `npm test` — all 208 tests must pass.
2. Bump the version badge: edit `css/styles.css`, find `.version-number::after`, update the `content` string.

## Adding a new gas mix

Gases are defined in `js/diveSetup.js`. Bottom gases go in `BOTTOM_GASES` (line 40), deco gases in `DECO_GASES` (line 50):

```javascript
// js/diveSetup.js:40
export const BOTTOM_GASES = [
    { id: 'air',   name: 'Air',   o2: 0.2098, n2: 0.7902, he: 0 },
    { id: 'ean32', name: 'EAN32', o2: 0.32,   n2: 0.68,   he: 0 },
    // add here:
    { id: 'tx1845', name: 'Trimix 18/45', o2: 0.18, n2: 0.37, he: 0.45 },
];
```

MOD is derived automatically by `calculateMOD()` (`diveSetup.js:807`) whenever the gas is used. The `he` fraction is tracked in the gas record but the decompression algorithm lumps it into the inert-gas calculation via the gas's effective N₂-equivalent; separate helium kinetics are not implemented (see [Validation-and-Testing](Validation-and-Testing.md#test-gaps)).

The `DiveSetupEditor` picks new gases up automatically — no UI change is needed.

## Switching ZH-L16 variant at runtime

```javascript
import { setZHL16Variant, ZHL16_VARIANTS } from './js/tissueCompartments.js';

setZHL16Variant(ZHL16_VARIANTS.A); // or .B, or .C (default)
```

`setZHL16Variant()` (`tissueCompartments.js:182`) rebuilds the exported `COMPARTMENTS` array in place — clearing the existing array and repushing entries. Downstream modules that imported `COMPARTMENTS` by reference (e.g. `decoModel.js`, every chart) pick up the change automatically; no reimport is needed.

Recalculate any cached tissue-loading results after switching, since compartment parameters have changed. The three chart classes accept a fresh `update(diveSetup)` call.

Variant letter meaning: A = original experimental; B = printed tables (moderate conservatism); C = dive computers (most conservative). See [Model-01-Compartments](Model-01-Compartments.md).

## Adding a new quiz

Per `CLAUDE.md`:

1. Create `data/quiz-{name}.json`.
2. Create `quiz-{name}.html` (copy an existing quiz page as template).
3. Add an entry to the Tests submenu in `NAV_ITEMS` in `js/nav.js`.
4. Add a topic tile to `index.html`.
5. Bump the version (see top of this page).

JSON shape:

```json
{
  "title": "Quiz Title",
  "description": "Description",
  "questions": [
    {
      "id": 1,
      "category": "category-slug",
      "question": "Question text?",
      "options": [
        { "key": "a", "text": "Option A" },
        { "key": "b", "text": "Option B" }
      ],
      "correct": "a",
      "explanation": "Why A is correct…"
    }
  ]
}
```

Quizzes currently use Czech with proper diacritics (háčky, čárky) — matching the SPČR / CMAS exam source. The generic engine in `js/quiz.js` handles shuffling, category filtering, and scoring with no per-quiz code.

## Adding a chart overlay

The cleanest existing example is the tissue-compartment overlay in `DiveProfileChart`, which plots a dashed line per compartment:

```javascript
// js/charts/DiveProfileChart.js:949-996
if (this.options.showTissueLoading) {
    COMPARTMENTS.forEach(comp => {
        if (!this.visibleCompartments.has(comp.id)) return;
        const pressureData = results.compartments[comp.id].pressures;
        datasets.push({
            label: `TC${comp.id} (${comp.halfTime}min)`,
            data: results.timePoints.map((t, i) => ({ x: t, y: pressureData[i] })),
            borderColor: comp.color,
            yAxisID: 'yPressure',
            pointRadius: 0,
            borderWidth: 1.5,
            order: 20
        });
    });
}
```

Pattern to follow:

1. Add a flag to `options` in `chartTypes.js` (`DEFAULT_DIVE_PROFILE_OPTIONS`, line 156).
2. In the chart's `_render` method, gate the new dataset(s) on `this.options.yourFlag`.
3. Pull the data from the `results` object produced by `calculateTissueLoading()` — its shape is `{timePoints, depthPoints, ambientPressures, compartments: {1:{pressures:[]},…}, n2Fractions}`.
4. Assign `yAxisID` to an existing axis (`yDepth` / `yPressure`) or declare a new axis in the Chart.js config.
5. Use the `order` field to control z-layering (lower `order` draws on top).

The chart re-renders on every `update(diveSetup)` call, so there is no need to mutate Chart.js datasets incrementally.

## Adding an i18n locale

1. Create `locales/<lang>.json`. Copy `locales/en.json` as a template and translate values.
2. Register the code in `js/i18n.js` at line 16:

   ```javascript
   // js/i18n.js:16
   const SUPPORTED_LANGS = ['en', 'cs', 'es', 'de']; // added 'de'
   ```

3. Bump the version.

The language switcher (`createLanguageSwitcher` in `i18n.js`) reads from `SUPPORTED_LANGS`, so the new language appears automatically. Components that listen for the global `languagechange` event (nav, charts, `DiveSetupEditor`) re-render with the new strings without a page reload.

Translation keys use dot-notation (e.g. `chart.profile.datasetDepth`) and the `translate(key, fallback)` / `translate(key, vars)` function in `i18n.js` interpolates `{0}`, `{1}` placeholders.

## Changing the deco loop discretisation

`generateDecoSchedule()` in `js/decoModel.js` (line 899) accepts two discretisation options:

- `stopIncrement` — vertical stop grid in metres. Default `3` (standard Bühlmann / decotengu convention).
- `timeIncrement` — stop-time quantum in minutes. Default `1`.

For continuous-mode rendering (used on the theory pages to draw a smooth GF ramp animation rather than stepped stops):

```javascript
// continuous deco
generateDecoSchedule(tissues, depth, n2, gfLow, gfHigh, gases, {
    stopIncrement: 0.1,   // metres — finer than the gradient-factor ramp slope
    timeIncrement: 0.1,   // minutes (6 s)
});
```

Continuous mode enforces `MIN_STOP_TIME = 2 min` per recorded stop (`decoModel.js:1081`) so the output is not drowned in micro-stops. The deco-time cap `DECO_STOP_MAX_MINUTES = 300` still applies.

Also tunable on the same call: `ascentRate` (default 10 m/min), `gasSwitchTime` (default 0 — minutes held at switch depth), `maxPpO2` (default 1.6 — deco-gas MOD ceiling).

## Further reading

- [Module-Reference](Module-Reference.md) — full signatures and line references for every module.
- [Decompression-Model](Decompression-Model.md) — the math these extensions rest on.
- [Validation-and-Testing](Validation-and-Testing.md) — how to verify a change does not regress against decotengu.
