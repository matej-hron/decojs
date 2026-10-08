# Logbook: gases and cylinders like the Sandbox

Date: 2026-10-08 · Branch `feat/logbook-gas-cylinders` · Autonomous run (user away, gates pre-approved).

## Why

User feedback on the entry form's *Equipment* section (bare *Cylinder volume (l)*, *Cylinder material*,
*Start/End pressure (bar)* inputs): "this is poor — there should be a picker for bottom and deco gases, as we
have it in the Sandbox". A logbook dive can use several gases (bottom + deco stages); the form records only one
mix and one cylinder.

## Outcome / success criteria

- The entry form has one **Gases** block (core section, where the gas radio was) with one card per gas:
  role (bottom / deco), mix picker (Air, EAN32, EAN36, EAN50, EAN80, O₂ 100%, custom Nitrox, Trimix),
  cylinder picker (Single / Twinset / Stage presets + custom volume and material), start and end pressure.
  Add gas / remove gas buttons. The old gas radio and the four cylinder fields are gone.
- A dive with a computer recording gets its gases prefilled from the recording (bottom = first gas breathed,
  deco = later switches), both for new entries and for existing linked entries opened in Edit.
- Live summary under the cards: gas used per cylinder (bar and l), total litres, and SAC (l/min) when the
  duration, average depth and pressures + volumes allow it.
- Detail view shows the gases as compact cards plus the same consumption summary. Feed card gas label keeps
  working (`entry.gas` = bottom gas).
- No new migration. Old entries (`gas {o2,he}` + `details.cylinderL/cylinderMaterial/pressureStartBar/pressureEndBar`)
  display correctly and are migrated to the new shape when saved.
- Phone first (390 px), desktop, light + dark, en/cs/es parity, notation rules.

## Decisions

| Decision | Why |
|---|---|
| Store the list in `details.gases` (jsonb), keep `log_entries.gas` = mix of the first bottom gas | No migration; feed card, detail stat, exports keep reading `gas` unchanged. |
| Do not reuse `DiveSetupEditor` class directly; reuse its data (`BOTTOM_GASES`, `DECO_GASES` from `js/diveSetup.js`) and build a logbook gas card in its visual language | The editor is a 2 000-line class bound to Sandbox state, waypoints and MOD hints; a logbook only needs mix + cylinder + pressures. |
| Cylinder presets carry volume **and** material (`s12` = 12 l steel, `al80` = 11,1 l aluminium, `d12` = 2×12 l steel twinset, `al40` = 5,7 l aluminium stage …) plus `custom` | Material was a separate bare field; a preset answers both at once. Custom keeps any other cylinder possible. |
| One preset list for every role, grouped Single / Twinset / Stage; default for a new deco gas = AL40 + EAN50, for a new bottom gas = 12 l + Air | Divers do use stages as bottom gas (sidemount) and vice-versa; grouping keeps it scannable. |
| Manual new entry starts with **no** gas card, only "+ Add gas" | Pre-filling Air would store data the diver never entered. |
| CCR recordings: only open-circuit (`role: 'oc'`) gases are prefilled | Diluent / O₂ cylinders of a rebreather do not fit the bottom/deco model; diver can add them by hand. |
| SAC = total used litres ÷ (duration in min × mean ambient pressure), mean ambient pressure = 1 bar + average depth ÷ 10 m/bar; shown in l/min | Matches how the project already presents SAC (l/min, see `gasConsumption` page). Uses `details.avgDepthM` (computer-filled or typed). Ideal-gas volume (Δ*p* × *V*), no compressibility — same as the rest of the app. |
| SAC only when every gas with pressures also has a volume, duration > 0 and average depth known | A partial sum would understate consumption. Used gas per cylinder is still shown when computable. |
| Legacy keys removed from `details` on save (set to `null`, `cleanDetails` drops them) | Single source of truth after migration. |
| Edit of a recording-linked entry without `details.gases`: load the recording (`store.loadDive`), use its gases, and copy the legacy cylinder/pressures onto the bottom gas | User sees all their deco gases once without losing the cylinder they typed earlier. |

## Data shape

```js
details.gases = [
  { role: 'bottom', o2: 0.32, he: 0, cylinder: 'al80', volumeL: 11.1, material: 'aluminium', startBar: 200, endBar: 70 },
  { role: 'deco',   o2: 0.50, he: 0, cylinder: 'al40', volumeL: 5.7,  material: 'aluminium', startBar: 200, endBar: 150 },
]
```
`o2/he` fractions (or `null` when the mix is unknown), `cylinder` preset id, `'custom'` or `null`; `volumeL`,
`material`, `startBar`, `endBar` may be `null`. Rows are stored even when only the mix is known.

## Units

- `js/logbook/gasModel.js` (new, pure, tested): `CYLINDER_PRESETS`, `MIX_PRESETS`, `cylinderPreset(id)`,
  `gasesFromEntry(entry)` (new shape or legacy migration), `gasesFromRecording(dive)`, `primaryGas(gases)`,
  `gasUsage(gases, {durationS, avgDepthM})` → `{rows: [{usedBar, usedL}], totalL, sacLpm}`,
  `gasFormRows` / `gasesFromFormRows` (strings ↔ stored rows, with validation errors).
- `js/logbook/EntryForm.js`: gas block rendering + wiring, live summary; removes radio + cylinder fields.
- `js/logbook/entryModel.js`: `DETAIL_KEYS.equipment` drops the four legacy keys; `entryFromRecording` adds
  `details.gases`.
- `js/logbook/EntryDetail.js`: `gasCards(entry, t, fmt)` pure helper + section render.
- `lab/dive-log.html` (styles), `locales/{en,cs,es}.json`, `sw.js` STATIC_ASSETS.

## Testing

Unit tests in `tests/logbook.test.mjs` for every pure helper (legacy migration, recording mapping, usage/SAC,
form round trip, validation); jsdom tests for add/remove gas, save migrating legacy keys, edit prefilling from
the recording. Browser check at 390×844 and desktop, light + dark, on a scratch entry (never the user's dives).
