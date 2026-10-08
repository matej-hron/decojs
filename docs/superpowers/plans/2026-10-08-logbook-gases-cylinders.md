# Logbook Gases & Cylinders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the logbook's single gas radio + bare cylinder fields with Sandbox-style per-gas cards (role, mix, cylinder preset, start/end pressure), prefilled from recordings, with gas-used and SAC summary.

**Architecture:** A new pure module `js/logbook/gasModel.js` owns presets, legacy migration, recording mapping, form-string ↔ stored-row conversion and consumption maths. `EntryForm` renders/reads gas cards through it; `EntryDetail` shows them. Data lives in `details.gases`; `log_entries.gas` keeps the first bottom mix.

**Tech Stack:** Plain ES modules (no build), `node:test` + jsdom tests in `tests/logbook.test.mjs`, styles inline in `lab/dive-log.html`, locales `locales/{en,cs,es}.json`.

**Spec:** `docs/superpowers/specs/2026-10-08-logbook-gases-cylinders-design.md`

## Global Constraints

- No new Supabase migration; `details.gases` jsonb only.
- Old entries (`gas {o2,he}`, `details.cylinderL/cylinderMaterial/pressureStartBar/pressureEndBar`) must display and migrate on save (legacy keys removed).
- Notation: `&nbsp;`/U+00A0 between number and unit; decimal comma in cs (use `fmtNum`); units upright (`bar`, `l`, `l/min`); SAC upright; *p* lowercase.
- en/cs/es locale parity (test `en, cs and es have the same logbook keys`). Keep English loanwords Single, Twinset, Stage, AL80 in cs.
- Any new `.js` file is added to `sw.js` STATIC_ASSETS. No new HTML files.
- `npm test` must pass after every task. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Legacy entry with only cylinder data and `gas: null` → one bottom row with unknown mix, nothing invented; saving keeps `gas: null`.
2. Typing a decimal comma in pressures / custom volume (`11,1`) → parsed correctly, shown back with comma.
3. End pressure greater than start → no negative usage; row flagged, SAC omitted.
4. Re-rendering the form (language change, buddy add) must keep the typed gas cards.
5. Edit of a recording-linked entry when `loadDive` fails or the user already touched the gas block → form keeps what it had, no error shown.

---

### Task 1: Pure gas model

**Files:**
- Create: `js/logbook/gasModel.js`
- Modify: `js/logbook/entryModel.js` (DETAIL_KEYS.equipment, entryFromRecording)
- Modify: `sw.js` (add `'./js/logbook/gasModel.js'` after `'./js/logbook/entryModel.js'`)
- Test: `tests/logbook.test.mjs` (new `describe('gas model', …)`)

**Interfaces (Produces):**
- `MIX_PRESETS: {id, o2, he}[]` — ids `air, ean32, ean36, ean50, ean80, o2`.
- `CYLINDER_PRESETS: {id, group: 'single'|'twinset'|'stage', volumeL, material: 'steel'|'aluminium', name?, twinL?}[]`; `CYLINDER_GROUPS`.
- `cylinderPreset(id) → preset|null`
- `cylinderText(row, {fmt, material: m => string}) → string` ('' when nothing known)
- `mixKindOf({o2, he}) → preset id | 'nx' | 'tx' | ''`
- `gasesFromEntry(entry) → GasRow[]`
- `gasesFromRecording(dive) → GasRow[]`
- `primaryGas(rows) → {o2, he} | null`
- `gasUsage(rows, {durationS, avgDepthM}) → {rows: {usedBar, usedL}[], totalL, sacLpm}`
- `formRowsFromGases(rows, {comma}) → FormGasRow[]`; `gasesFromFormRows(formRows) → {gases: GasRow[], errors: {index, field}[]}`
- `newGasRow(role) → FormGasRow`
- `GasRow = {role, o2, he, cylinder, volumeL, material, startBar, endBar}`; `FormGasRow = {role, mix, o2, he, cylinder, volumeL, material, startBar, endBar}` (strings except role/mix/cylinder/material ids).

- [ ] **Step 1: Write failing tests** — add to `tests/logbook.test.mjs` (import from `../js/logbook/gasModel.js`):

```js
describe('gas model', () => {
    const multi = {
        gases: [
            { id: 'g0', o2: 0.21, he: 0, role: 'oc' }, { id: 'g1', o2: 0.5, he: 0, role: 'oc' },
            { id: 'g2', o2: 1, he: 0, role: 'oc' }, { id: 'g3', o2: 0.21, he: 0, role: 'diluent' },
        ],
        events: [{ t: 0, type: 'gasSwitch', gasId: 'g0' }, { t: 1800, type: 'gasSwitch', gasId: 'g1' },
            { t: 2400, type: 'gasSwitch', gasId: 'g0' }, { t: 2500, type: 'gasSwitch', gasId: 'g1' }],
    };

    test('gasesFromRecording: bottom = first breathed, deco = later switches, unused and CCR gases left out', () => {
        const rows = gasesFromRecording(multi);
        assert.deepEqual(rows.map(r => [r.role, r.o2]), [['bottom', 0.21], ['deco', 0.5]]);
        assert.equal(rows[0].cylinder, null);
        assert.equal(rows[0].startBar, null);
        assert.deepEqual(gasesFromRecording({ gases: [{ id: 'g0', o2: 0.32, he: 0, role: 'oc' }], events: [] }).map(r => r.o2), [0.32]);
        assert.deepEqual(gasesFromRecording({ gases: [{ id: 'g0', o2: 0.21, he: 0, role: 'diluent' }], events: [] }), []);
        assert.equal(gasesFromRecording(diveOf('00000100')).length, 1);
    });

    test('entryFromRecording stores the recording gases in details.gases', () => {
        const e = entryFromRecording({ ...diveOf('00000100'), gases: multi.gases, events: multi.events });
        assert.deepEqual(e.details.gases.map(r => r.role), ['bottom', 'deco']);
        assert.deepEqual(e.gas, { o2: 0.21, he: 0 });
    });

    test('gasesFromEntry migrates the legacy single cylinder', () => {
        const legacy = { gas: { o2: 0.32, he: 0 }, details: { cylinderL: 12, cylinderMaterial: 'steel', pressureStartBar: 200, pressureEndBar: 60 } };
        assert.deepEqual(gasesFromEntry(legacy), [{ role: 'bottom', o2: 0.32, he: 0, cylinder: 's12', volumeL: 12, material: 'steel', startBar: 200, endBar: 60 }]);
        const odd = gasesFromEntry({ gas: null, details: { cylinderL: 13 } });
        assert.deepEqual(odd, [{ role: 'bottom', o2: null, he: null, cylinder: 'custom', volumeL: 13, material: null, startBar: null, endBar: null }]);
        assert.deepEqual(gasesFromEntry({ gas: { o2: 0.21, he: 0 }, details: {} }).map(r => [r.o2, r.cylinder]), [[0.21, null]]);
        assert.deepEqual(gasesFromEntry({ gas: null, details: {} }), []);
        const stored = [{ role: 'deco', o2: 0.5, he: 0, cylinder: 'al40', volumeL: 5.7, material: 'aluminium', startBar: 200, endBar: 150 }];
        assert.deepEqual(gasesFromEntry({ gas: { o2: 0.21, he: 0 }, details: { gases: stored, cylinderL: 12 } }), stored);
    });

    test('primaryGas is the first bottom mix that is known', () => {
        assert.deepEqual(primaryGas([{ role: 'deco', o2: 0.5, he: 0 }, { role: 'bottom', o2: 0.18, he: 0.45 }]), { o2: 0.18, he: 0.45 });
        assert.deepEqual(primaryGas([{ role: 'deco', o2: 0.5, he: 0 }]), { o2: 0.5, he: 0 });
        assert.equal(primaryGas([{ role: 'bottom', o2: null, he: null }]), null);
        assert.equal(primaryGas([]), null);
    });

    test('gasUsage: bar, litres and SAC at mean ambient pressure 1 + avg/10', () => {
        const rows = [
            { role: 'bottom', volumeL: 12, startBar: 200, endBar: 80 },
            { role: 'deco', volumeL: 5.7, startBar: 200, endBar: 160 },
        ];
        const u = gasUsage(rows, { durationS: 3000, avgDepthM: 20 });
        assert.deepEqual(u.rows, [{ usedBar: 120, usedL: 1440 }, { usedBar: 40, usedL: 228 }]);
        assert.equal(u.totalL, 1668);
        assert.equal(u.sacLpm, 1668 / (50 * 3));
        assert.equal(gasUsage(rows, { durationS: 3000, avgDepthM: null }).sacLpm, null);
        assert.equal(gasUsage(rows, { durationS: 0, avgDepthM: 20 }).sacLpm, null);
        const noVol = gasUsage([{ volumeL: null, startBar: 200, endBar: 100 }, rows[1]], { durationS: 3000, avgDepthM: 20 });
        assert.deepEqual(noVol.rows[0], { usedBar: 100, usedL: null });
        assert.equal(noVol.totalL, null); // a partial sum would understate the gas used
        assert.equal(noVol.sacLpm, null);
        const bad = gasUsage([{ volumeL: 12, startBar: 50, endBar: 200 }], { durationS: 3000, avgDepthM: 20 });
        assert.deepEqual(bad.rows[0], { usedBar: null, usedL: null });
        assert.equal(bad.totalL, null);
        assert.deepEqual(gasUsage([{ volumeL: 12, startBar: null, endBar: null }], { durationS: 3000, avgDepthM: 20 }), { rows: [{ usedBar: null, usedL: null }], totalL: null, sacLpm: null });
    });

    test('form rows round-trip, with a decimal comma', () => {
        const rows = [
            { role: 'bottom', o2: 0.32, he: 0, cylinder: 'al80', volumeL: 11.1, material: 'aluminium', startBar: 200, endBar: 70 },
            { role: 'deco', o2: 0.5, he: 0, cylinder: 'custom', volumeL: 6.5, material: 'steel', startBar: 210, endBar: null },
            { role: 'bottom', o2: 0.18, he: 0.45, cylinder: null, volumeL: null, material: null, startBar: null, endBar: null },
            { role: 'bottom', o2: 0.33, he: 0, cylinder: null, volumeL: null, material: null, startBar: null, endBar: null },
        ];
        const form = formRowsFromGases(rows, { comma: true });
        assert.deepEqual(form.map(r => r.mix), ['ean32', 'ean50', 'tx', 'nx']);
        assert.equal(form[1].volumeL, '6,5');
        assert.equal(form[2].o2, '18');
        assert.equal(form[2].he, '45');
        assert.deepEqual(gasesFromFormRows(form), { gases: rows, errors: [] });
    });

    test('gasesFromFormRows: preset cylinders fill volume and material; bad input is reported', () => {
        const { gases } = gasesFromFormRows([{ ...newGasRow('bottom'), startBar: '200', endBar: '50' }]);
        assert.deepEqual(gases, [{ role: 'bottom', o2: 0.21, he: 0, cylinder: 's12', volumeL: 12, material: 'steel', startBar: 200, endBar: 50 }]);
        assert.deepEqual(newGasRow('deco').cylinder, 'al40');
        assert.deepEqual(newGasRow('deco').mix, 'ean50');
        const bad = gasesFromFormRows([
            { ...newGasRow('bottom'), mix: 'nx', o2: '' },
            { ...newGasRow('bottom'), mix: 'tx', o2: '60', he: '50' },
            { ...newGasRow('bottom'), startBar: '2oo' },
            { ...newGasRow('bottom'), cylinder: 'custom', volumeL: 'x' },
        ]);
        assert.deepEqual(bad.errors, [{ index: 0, field: 'mix' }, { index: 1, field: 'mix' }, { index: 2, field: 'startBar' }, { index: 3, field: 'volumeL' }]);
        assert.deepEqual(gasesFromFormRows([{ ...newGasRow('bottom'), mix: '' }]).gases[0].o2, null);
    });

    test('cylinderText names presets and custom cylinders', () => {
        const opts = { fmt: (v, d) => String(v).replace('.', ','), material: m => ({ steel: 'ocel', aluminium: 'hliník' })[m] };
        assert.equal(cylinderText({ cylinder: 'al80', volumeL: 11.1 }, opts), 'AL80 (11,1 l)');
        assert.equal(cylinderText({ cylinder: 'd12', volumeL: 24 }, opts), '2×12 l');
        assert.equal(cylinderText({ cylinder: 's12', volumeL: 12 }, opts), '12 l, ocel');
        assert.equal(cylinderText({ cylinder: 'custom', volumeL: 13, material: 'aluminium' }, opts), '13 l, hliník');
        assert.equal(cylinderText({ cylinder: 'custom', volumeL: 13, material: null }, opts), '13 l');
        assert.equal(cylinderText({ cylinder: null, volumeL: null }, opts), '');
    });
});
```

Also update the existing `detail keys cover the spec groups` test to assert `!DETAIL_KEYS.equipment.includes('cylinderL')`.

- [ ] **Step 2: Run `node --test tests/logbook.test.mjs`** — expected FAIL (module missing).

- [ ] **Step 3: Implement `js/logbook/gasModel.js`:**

```js
/**
 * Logbook gases: one row per cylinder (bottom or deco gas) with its mix, cylinder and
 * start/end pressure. Stored in `log_entries.details.gases`; `log_entries.gas` keeps the
 * first bottom mix so lists and the feed card can read it directly.
 *
 * Pure: no DOM, no network.
 */

import { BOTTOM_GASES, DECO_GASES } from '../diveSetup.js';

const NBSP = ' ';
const frac = pct => Math.round(pct * 100) / 10000;
const pctText = (fraction, comma) => {
    const s = String(Math.round(fraction * 10000) / 100);
    return comma ? s.replace('.', ',') : s;
};

/** Number from a number or a typed string (decimal comma or point); null when empty or invalid. */
function toNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).trim().replace(',', '.');
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
}

/** Mix presets in Sandbox order (Air stored as 21 % O₂, as the logbook always has). */
export const MIX_PRESETS = Object.freeze([...BOTTOM_GASES, ...DECO_GASES].map(g => Object.freeze({
    id: g.id, o2: g.id === 'air' ? 0.21 : g.o2, he: g.he,
})));

export const CYLINDER_GROUPS = Object.freeze(['single', 'twinset', 'stage']);

/** Cylinder presets: water volume (l) and material. AL80 / AL40 are Luxfer S080 / S040. */
export const CYLINDER_PRESETS = Object.freeze([
    { id: 's10', group: 'single', volumeL: 10, material: 'steel' },
    { id: 's12', group: 'single', volumeL: 12, material: 'steel' },
    { id: 's15', group: 'single', volumeL: 15, material: 'steel' },
    { id: 's18', group: 'single', volumeL: 18, material: 'steel' },
    { id: 'al80', group: 'single', volumeL: 11.1, material: 'aluminium', name: 'AL80' },
    { id: 'd7', group: 'twinset', volumeL: 14, material: 'steel', twinL: 7 },
    { id: 'd85', group: 'twinset', volumeL: 17, material: 'steel', twinL: 8.5 },
    { id: 'd10', group: 'twinset', volumeL: 20, material: 'steel', twinL: 10 },
    { id: 'd12', group: 'twinset', volumeL: 24, material: 'steel', twinL: 12 },
    { id: 'al40', group: 'stage', volumeL: 5.7, material: 'aluminium', name: 'AL40' },
    { id: 's7', group: 'stage', volumeL: 7, material: 'steel' },
].map(p => Object.freeze(p)));

export const MATERIALS = Object.freeze(['steel', 'aluminium']);

/** The preset with this id; null for 'custom', null or unknown ids. */
export function cylinderPreset(id) {
    return CYLINDER_PRESETS.find(p => p.id === id) ?? null;
}

/** Preset id for a legacy volume/material pair: a unique match, 'custom' for other volumes, null without a volume. */
function presetIdFor(volumeL, material) {
    if (volumeL === null) return null;
    const hits = CYLINDER_PRESETS.filter(p => p.volumeL === volumeL && (!material || p.material === material));
    return hits.length === 1 ? hits[0].id : 'custom';
}

/** Preset id of a mix, 'nx' for other nitrox, 'tx' for any helium mix, '' when unknown. */
export function mixKindOf(gas) {
    if (!gas || !Number.isFinite(gas.o2)) return '';
    const he = Number.isFinite(gas.he) ? gas.he : 0;
    if (he > 0) return 'tx';
    const hit = MIX_PRESETS.find(p => Math.round(p.o2 * 100) === Math.round(gas.o2 * 100) && Math.abs(p.o2 - gas.o2) < 0.005);
    return hit ? hit.id : 'nx';
}

const emptyRow = role => ({ role, o2: null, he: null, cylinder: null, volumeL: null, material: null, startBar: null, endBar: null });

function cleanRow(row) {
    const r = { ...emptyRow(row?.role === 'deco' ? 'deco' : 'bottom') };
    if (Number.isFinite(row?.o2)) {
        r.o2 = row.o2;
        r.he = Number.isFinite(row.he) ? row.he : 0;
    }
    r.cylinder = row?.cylinder ?? null;
    for (const k of ['volumeL', 'startBar', 'endBar']) r[k] = toNumber(row?.[k]);
    r.material = MATERIALS.includes(row?.material) ? row.material : null;
    return r;
}

/**
 * The gas rows of an entry: `details.gases` when present, else the legacy single gas and
 * cylinder (`gas`, `details.cylinderL`, `cylinderMaterial`, `pressureStartBar`, `pressureEndBar`).
 */
export function gasesFromEntry(entry) {
    const d = entry?.details ?? {};
    if (Array.isArray(d.gases)) return d.gases.map(cleanRow);
    const volumeL = toNumber(d.cylinderL);
    const material = MATERIALS.includes(d.cylinderMaterial) ? d.cylinderMaterial : null;
    const startBar = toNumber(d.pressureStartBar);
    const endBar = toNumber(d.pressureEndBar);
    const mix = entry?.gas && Number.isFinite(entry.gas.o2) ? entry.gas : null;
    if (!mix && volumeL === null && material === null && startBar === null && endBar === null) return [];
    return [{
        role: 'bottom',
        o2: mix ? mix.o2 : null,
        he: mix ? (Number.isFinite(mix.he) ? mix.he : 0) : null,
        cylinder: presetIdFor(volumeL, material),
        volumeL, material, startBar, endBar,
    }];
}

/**
 * Open-circuit gases a recording actually used, in order of first use: the first is the
 * bottom gas, the rest deco gases. Without switch events the first listed gas is used.
 */
export function gasesFromRecording(dive) {
    const oc = (dive?.gases ?? []).filter(g => (g.role ?? 'oc') === 'oc' && Number.isFinite(g.o2));
    if (!oc.length) return [];
    const switches = (dive.events ?? []).filter(e => e.type === 'gasSwitch').sort((a, b) => a.t - b.t);
    const used = [];
    const first = switches.find(s => s.t <= 60 && oc.some(g => g.id === s.gasId));
    used.push(first ? oc.find(g => g.id === first.gasId) : oc[0]);
    for (const s of switches) {
        const g = oc.find(x => x.id === s.gasId);
        if (g && !used.includes(g)) used.push(g);
    }
    return used.map((g, i) => ({ ...emptyRow(i === 0 ? 'bottom' : 'deco'), o2: g.o2, he: g.he ?? 0 }));
}

/** `{o2, he}` of the first bottom gas with a known mix (else the first known mix); null when none. */
export function primaryGas(rows) {
    const known = (rows ?? []).filter(r => Number.isFinite(r.o2));
    const pick = known.find(r => r.role === 'bottom') ?? known[0];
    return pick ? { o2: pick.o2, he: Number.isFinite(pick.he) ? pick.he : 0 } : null;
}

/**
 * Gas used per cylinder and the SAC over the whole dive.
 * Ideal gas: litres at 1 bar = Δp × V. SAC (l/min) = litres ÷ (minutes × mean ambient pressure),
 * mean ambient pressure = 1 bar + average depth ÷ 10 m per bar.
 * `totalL` and `sacLpm` are null unless every row with pressures also has a volume.
 */
export function gasUsage(rows, { durationS, avgDepthM } = {}) {
    const out = (rows ?? []).map(r => {
        const start = toNumber(r.startBar);
        const end = toNumber(r.endBar);
        const vol = toNumber(r.volumeL);
        if (start === null || end === null || end > start) return { usedBar: null, usedL: null };
        const usedBar = start - end;
        return { usedBar, usedL: vol !== null && vol > 0 ? usedBar * vol : null };
    });
    const withBar = out.filter(u => u.usedBar !== null);
    const complete = withBar.length > 0 && withBar.every(u => u.usedL !== null)
        && out.every((u, i) => u.usedBar !== null || (toNumber(rows[i].startBar) === null && toNumber(rows[i].endBar) === null));
    const totalL = complete ? withBar.reduce((s, u) => s + u.usedL, 0) : null;
    const minutes = toNumber(durationS) === null ? null : toNumber(durationS) / 60;
    const avg = toNumber(avgDepthM);
    const sacLpm = totalL !== null && minutes > 0 && avg !== null && avg >= 0 ? totalL / (minutes * (1 + avg / 10)) : null;
    return { rows: out, totalL, sacLpm };
}

/** Form strings for stored rows. */
export function formRowsFromGases(rows, { comma = false } = {}) {
    const num = v => (v === null || v === undefined ? '' : (comma ? String(v).replace('.', ',') : String(v)));
    return (rows ?? []).map(r => {
        const mix = mixKindOf(r);
        return {
            role: r.role === 'deco' ? 'deco' : 'bottom',
            mix,
            o2: mix === 'nx' || mix === 'tx' ? pctText(r.o2, comma) : '',
            he: mix === 'tx' ? pctText(r.he, comma) : '',
            cylinder: r.cylinder ?? '',
            volumeL: r.cylinder === 'custom' ? num(r.volumeL) : '',
            material: r.cylinder === 'custom' ? (r.material ?? '') : '',
            startBar: num(r.startBar),
            endBar: num(r.endBar),
        };
    });
}

/** A new form row: bottom = Air in a 12 l steel single, deco = EAN50 in an AL40 stage. */
export function newGasRow(role) {
    const deco = role === 'deco';
    return { role: deco ? 'deco' : 'bottom', mix: deco ? 'ean50' : 'air', o2: '', he: '', cylinder: deco ? 'al40' : 's12', volumeL: '', material: '', startBar: '', endBar: '' };
}

/**
 * Stored rows from form rows. `errors` lists `{index, field}` for a mix that is not valid
 * (field 'mix') and for non-blank numbers that do not parse (field name).
 */
export function gasesFromFormRows(formRows) {
    const gases = [];
    const errors = [];
    (formRows ?? []).forEach((f, index) => {
        const row = emptyRow(f.role === 'deco' ? 'deco' : 'bottom');
        const preset = MIX_PRESETS.find(p => p.id === f.mix);
        if (preset) {
            row.o2 = preset.o2;
            row.he = preset.he;
        } else if (f.mix === 'nx' || f.mix === 'tx') {
            const o2 = toNumber(f.o2);
            const he = f.mix === 'tx' ? (toNumber(f.he) ?? 0) : 0;
            if (o2 === null || o2 <= 0 || o2 > 100 || he < 0 || o2 + he > 100) errors.push({ index, field: 'mix' });
            else {
                row.o2 = frac(o2);
                row.he = frac(he);
            }
        }
        const numField = field => {
            const text = f[field];
            if (text === null || text === undefined || String(text).trim() === '') return null;
            const n = toNumber(text);
            if (n === null || n < 0) errors.push({ index, field });
            return n === null || n < 0 ? null : n;
        };
        const cyl = cylinderPreset(f.cylinder);
        if (cyl) Object.assign(row, { cylinder: cyl.id, volumeL: cyl.volumeL, material: cyl.material });
        else if (f.cylinder === 'custom') {
            row.cylinder = 'custom';
            row.volumeL = numField('volumeL');
            row.material = MATERIALS.includes(f.material) ? f.material : null;
        }
        row.startBar = numField('startBar');
        row.endBar = numField('endBar');
        gases.push(row);
    });
    return { gases, errors };
}

/**
 * Short cylinder text: "AL80 (11,1 l)", "2×12 l", "12 l, steel", "13 l"; '' when unknown.
 * @param {Object} row - gas row
 * @param {{fmt: (v: number) => string, material: (m: string) => string}} t
 */
export function cylinderText(row, { fmt, material }) {
    const p = cylinderPreset(row?.cylinder);
    if (p?.name) return `${p.name} (${fmt(p.volumeL)}${NBSP}l)`;
    if (p?.twinL) return `2×${fmt(p.twinL)}${NBSP}l`;
    const vol = p ? p.volumeL : toNumber(row?.volumeL);
    if (vol === null) return '';
    const mat = p ? p.material : row?.material;
    return mat ? `${fmt(vol)}${NBSP}l, ${material(mat)}` : `${fmt(vol)}${NBSP}l`;
}
```

- [ ] **Step 4: Update `entryModel.js`:** import `{ gasesFromRecording, primaryGas }` from `./gasModel.js`; `DETAIL_KEYS.equipment = ['weightsKg', 'suit', 'suitMm', 'computer']`; in `entryFromRecording` compute `const gases = gasesFromRecording(dive);`, set `if (gases.length) details.gases = gases;` and `gas: primaryGas(gases) ?? (first ? {o2: first.o2, he: first.he} : null)`. Add `'gases'` to `COMPUTER_KEYS` (harmless; it is not in DETAIL_KEYS). Add gasModel.js to `sw.js` STATIC_ASSETS.

- [ ] **Step 5: Run `npm test`** — expected PASS (the old `invalidNumberFields` test using `cylinderL` stays valid until Task 2 changes it; fix if it fails).

- [ ] **Step 6: Commit** `feat(logbook): gas model for per-cylinder gases`.

### Task 2: Entry form gas cards

**Files:**
- Modify: `js/logbook/EntryForm.js`, `lab/dive-log.html` (styles), `locales/{en,cs,es}.json` (`diveLog.logbook.form`)
- Test: `tests/logbook.test.mjs`

**Interfaces (Consumes):** everything from Task 1. **Produces:** `formValuesFromEntry(entry, {comma})` returns `gases: FormGasRow[]` instead of `gasKind/gasO2/gasHe`; `invalidNumberFields(values)` no longer looks at gas fields (gas errors come from `gasesFromFormRows`); `gasFromForm` is removed (tests updated).

Behaviour:
- Core section: replace `<fieldset class="lb-gas">` with `<fieldset class="lb-field lb-gases"><legend>Gases</legend>` containing one `.lb-gas-card[data-gas-index]` per row and an add button. With zero rows show the hint `gasesEmpty` and a button `+ Add gas` (adds bottom). With ≥ 1 row show `+ Add deco gas` (adds deco).
- Card layout (phone: stacked; ≥ 600 px: 2 columns): header row = role `<select name="gas.role">` (Bottom gas / Deco gas) + remove button (×, aria-label `gasRemove`). Then `Mix` `<select name="gas.mix">` (options: `–` (unknown, value ''), MIX_PRESETS names via `gasName`, `Nitrox…` ('nx'), `Trimix…` ('tx')), O₂/He % inputs shown only for nx/tx. `Cylinder` `<select name="gas.cylinder">` with `<optgroup>` per CYLINDER_GROUPS (labels Single/Twinset/Stage) + `–` + `Custom…`; custom shows volume (l) input + material select. Start / End pressure (bar) inputs, `inputmode="decimal"`. Under the inputs a muted line with this row's usage: `−120 bar · 1 440 l`.
- Under all cards: `.lb-gas-summary` (aria-live polite): `Gas used: 1 668 l · SAC 11,1 l/min`; when SAC cannot be computed and avg depth is missing show hint `sacNeedsAvg`. Updated on every `input`/`change` inside the form (reads duration, avg depth field `d.avgDepthM` or stored detail).
- `_readDom` reads card inputs into `this.values.gases` (keep order). Add / remove / role / mix / cylinder change → `_readDom()` + `render()` (keeps everything typed, focus the changed control by name+index).
- `_save`: `const { gases, errors } = gasesFromFormRows(v.gases)`; first error → message `gasInvalid` for mix or `invalidNumber` with the field label; `gas = primaryGas(gases)`; `details.gases = gases.length ? gases : null`; set legacy keys `cylinderL, cylinderMaterial, pressureStartBar, pressureEndBar` to null in the details passed to `normalizeEntry` so they are removed.
- Edit with `entry.recording_id` and no `entry.details.gases`: after render, `store.loadDive?.(entry.recording_id)`; when it resolves, form not destroyed and `!this.gasTouched`: rows = `gasesFromRecording(record)`; if a legacy row exists, copy its `cylinder, volumeL, material, startBar, endBar` (and mix when the recording row has none) onto the bottom row; then `_readDom(); this.values.gases = formRowsFromGases(rows, {comma}); render()`. Errors are logged only. `gasTouched` = true on any input inside `.lb-gases`.
- Remove from More details: cylinderL, cylinderMaterial, pressureStartBar, pressureEndBar inputs. Equipment keeps weights, suit, suit thickness, computer.
- Locale keys (en / cs / es) under `form`: `gases` "Gases" / "Plyny" / "Gases"; `gasRole` "Use" / "Použití" / "Uso"; `roleBottom` "Bottom gas" / "Dýchací směs" … pick: cs "Dno" is wrong — use cs "Hlavní směs", es "Gas de fondo"; `roleDeco` "Deco gas" / "Dekompresní směs" / "Gas de deco"; `gasMix` "Mix"/"Směs"/"Mezcla"; `mixNx` "Nitrox…"; `mixTx` "Trimix…"; `cylinder` "Cylinder"/"Láhev"/"Botella"; `cylinderCustom` "Other…"/"Jiná…"/"Otra…"; `cylinderGroups.single/twinset/stage` "Single"/"Twinset"/"Stage" (cs same, es "Monobotella"/"Bibotella"/"Stage"); `volumeL` "Volume (l)"/"Objem (l)"/"Volumen (l)"; `material` "Material"/"Materiál"/"Material"; `startBar` "Start (bar)"/"Začátek (bar)"/"Inicio (bar)"; `endBar` "End (bar)"/"Konec (bar)"/"Final (bar)"; `gasAdd` "+ Add gas"/"+ Přidat směs"/"+ Añadir gas"; `gasAddDeco` "+ Add deco gas"/"+ Přidat dekompresní směs"/"+ Añadir gas de deco"; `gasRemove` "Remove gas {0}"/"Odebrat směs {0}"/"Quitar gas {0}"; `gasesEmpty` "No gas recorded yet."/"Zatím bez směsi."/"Aún sin gas."; `gasUsed` "Gas used"/"Spotřeba"/"Gas usado"; `sac` "SAC"; `sacNeedsAvg` "SAC needs the average depth (More details)."/"Pro SAC doplňte průměrnou hloubku (Další údaje)."/"Para el SAC falta la profundidad media (Más detalles)."; keep `gasO2`, `gasHe`, `gasInvalid`; delete `gasKind`-only keys `gasAir, gasEan, gasTx, gasNone` and the 4 legacy field labels from `form` and `detail.label`; keep `choices.cylinderMaterial`. Use U+00A0 between numbers and units in strings that contain them.

- [ ] **Step 1: Failing tests** — replace the `gasFromForm` test and gas assertions in `formValuesFromEntry` tests:

```js
test('formValuesFromEntry gives gas cards, also for a legacy entry', () => {
    const v = formValuesFromEntry({ gas: { o2: 0.32, he: 0 }, details: { cylinderL: 12, pressureStartBar: 200 } });
    assert.deepEqual(v.gases.map(g => [g.role, g.mix, g.cylinder, g.startBar]), [['bottom', 'ean32', 's12', '200']]);
    assert.deepEqual(formValuesFromEntry({ gas: null }).gases, []);
});
```
and in the round-trip test build `gas: primaryGas(gasesFromFormRows(form.gases).gases)` instead of `gasFromForm(...)`.
jsdom tests (inside `entry form validation and races (jsdom)`):

```js
test('gas cards: add, remove, save migrates legacy cylinder keys', async () => {
    await withDom(async root => {
        const saves = [];
        const store = { listSites: async () => [], listBuddies: async () => [], listEntries: async () => [],
            saveEntry: async (row, id) => { saves.push(row); return { id, ...row }; } };
        const legacy = { ...entry, site_id: null, gas: { o2: 0.21, he: 0 }, duration_s: 3000,
            details: { cylinderL: 12, cylinderMaterial: 'steel', pressureStartBar: 200, pressureEndBar: 80, avgDepthM: 20, weather: 'sun' } };
        new EntryForm(root, { store, entry: legacy, onSaved() {}, onCancel() {} });
        await tick();
        assert.equal(root.querySelectorAll('.lb-gas-card').length, 1);
        assert.match(root.querySelector('.lb-gas-summary').textContent, /1\s?440/);
        root.querySelector('#lb-add-gas').click();
        assert.equal(root.querySelectorAll('.lb-gas-card').length, 2);
        assert.equal(root.querySelectorAll('[name="gas.role"]')[1].value, 'deco');
        root.querySelectorAll('[name="gas.startBar"]')[1].value = '200';
        root.querySelectorAll('[name="gas.endBar"]')[1].value = '150';
        root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await tick();
        const row = saves[0];
        assert.deepEqual(row.gas, { o2: 0.21, he: 0 });
        assert.deepEqual(row.details.gases.map(g => [g.role, g.cylinder, g.startBar, g.endBar]), [['bottom', 's12', 200, 80], ['deco', 'al40', 200, 150]]);
        for (const k of ['cylinderL', 'cylinderMaterial', 'pressureStartBar', 'pressureEndBar']) assert.equal(k in row.details, false, k);
        assert.equal(row.details.weather, 'sun');
    });
});

test('removing every gas saves no gas; a bad mix blocks the save', async () => {
    await withDom(async root => {
        const saves = [];
        const store = { listSites: async () => [], listBuddies: async () => [], listEntries: async () => [],
            saveEntry: async (row, id) => { saves.push(row); return { id, ...row }; } };
        new EntryForm(root, { store, entry: { ...entry, gas: { o2: 0.32, he: 0 } }, onSaved() {}, onCancel() {} });
        await tick();
        const mix = root.querySelector('[name="gas.mix"]');
        mix.value = 'tx';
        mix.dispatchEvent(new window.Event('change', { bubbles: true }));
        root.querySelector('[name="gas.o2"]').value = '60';
        root.querySelector('[name="gas.he"]').value = '50';
        root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await tick();
        assert.equal(saves.length, 0);
        assert.ok(!root.querySelector('.lb-form-error').hidden);
        root.querySelector('.lb-gas-remove').click();
        assert.equal(root.querySelectorAll('.lb-gas-card').length, 0);
        root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await tick();
        assert.equal(saves[0].gas, null);
        assert.equal('gases' in saves[0].details, false);
    });
});

test('editing a linked entry without gases prefills them from the recording, keeping the typed cylinder', async () => {
    await withDom(async root => {
        const record = { gases: [{ id: 'g0', o2: 0.21, he: 0, role: 'oc' }, { id: 'g1', o2: 0.5, he: 0, role: 'oc' }],
            events: [{ t: 0, type: 'gasSwitch', gasId: 'g0' }, { t: 1800, type: 'gasSwitch', gasId: 'g1' }] };
        const store = { listSites: async () => [], listBuddies: async () => [], listEntries: async () => [], loadDive: async () => record };
        new EntryForm(root, { store, entry: { ...entry, recording_id: 'r1', gas: { o2: 0.21, he: 0 }, details: { cylinderL: 15, pressureStartBar: 220 } }, onSaved() {}, onCancel() {} });
        await tick();
        const roles = [...root.querySelectorAll('[name="gas.role"]')].map(s => s.value);
        assert.deepEqual(roles, ['bottom', 'deco']);
        assert.equal(root.querySelector('[name="gas.cylinder"]').value, 's15');
        assert.equal(root.querySelector('[name="gas.startBar"]').value, '220');
    });
});
```
Update the `invalidNumberFields` test: drop the `cylinderL` and `gasKind` lines, use `{ weightsKg: '1 234', rating: 'x' }` → `['weightsKg', 'rating']`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** per Behaviour above. Styles in `lab/dive-log.html` near `.lb-row`: `.lb-gases` list gap 0.75rem; `.lb-gas-card` border 1px solid var(--border-color), radius 10px, padding 0.75rem, background var(--card-bg) tinted; left accent bar 4px — bottom: `var(--accent-color)`, deco: an amber token; `.lb-gas-head` flex with role select + remove button; `.lb-gas-grid` grid 2 columns at phone (mix | cylinder; start | end), `.lb-gas-use` muted small text; `.lb-gas-summary` pill row. Use existing CSS variables (check `css/styles.css` `:root` and dark theme) — no hard-coded colours that fail in dark mode.
- [ ] **Step 4: `npm test` PASS.**
- [ ] **Step 5: Commit** `feat(logbook): gas cards with cylinders in the entry form`.

### Task 3: Detail view gases

**Files:** `js/logbook/EntryDetail.js`, `lab/dive-log.html`, `locales/*.json` (`detail.gases`, `detail.roleBottom`, `detail.roleDeco`, `detail.gasUsed`, `detail.sac`), tests.

**Produces:** `gasCards(entry, t, fmt) → {cards: {role, roleLabel, mix, cylinder, pressures, used}[], summary: string|null}` (pure).
- `mix` = `gasName` or `t('detail.mixUnknown')` ("Unknown mix"); `pressures` = `200 → 80 bar` (NBSP before bar, `→` with spaces) or `''`; `used` = `−120 bar · 1 440 l` / `−120 bar` / `''` using `fmt` (fmtNum) — `fmtNum(1440, 0)`; summary = `Gas used 1 668 l · SAC 11,1 l/min` (SAC with one decimal), or just the litres, or null.
- Render after the stats (before the map) as `<section class="lb-d-gases"><h3>Gases</h3><ul>` cards: role chip (bottom/deco colours as in form), mix in bold, cylinder text, pressures, used; then summary line.
- The detail `core` row `gas` stays (it's a big stat); legacy keys no longer shown in More details (removed from DETAIL_KEYS in Task 1).

- [ ] **Step 1: failing test**

```js
test('gasCards: legacy and multi-gas entries', () => {
    const t = key => ({ 'detail.roleBottom': 'Bottom', 'detail.roleDeco': 'Deco', 'detail.gasUsed': 'Gas used', 'detail.sac': 'SAC',
        'detail.mixUnknown': '?', 'form.choices.cylinderMaterial.steel': 'steel', 'form.choices.cylinderMaterial.aluminium': 'alu' })[key] ?? key;
    const fmt = (v, d) => (d === undefined ? String(v) : v.toFixed(d));
    const legacy = gasCards({ gas: { o2: 0.32, he: 0 }, duration_s: 3000, details: { cylinderL: 12, pressureStartBar: 200, pressureEndBar: 80, avgDepthM: 20 } }, t, fmt);
    assert.deepEqual(legacy.cards.map(c => [c.roleLabel, c.mix, c.cylinder, c.pressures, c.used]),
        [['Bottom', 'EAN32', '12 l, steel', '200 → 80 bar', '−120 bar · 1440 l']]);
    assert.equal(legacy.summary, 'Gas used 1440 l · SAC 9.6 l/min');
    assert.deepEqual(gasCards({ gas: null, details: {} }, t, fmt), { cards: [], summary: null });
    const multi = gasCards({ gas: { o2: 0.21, he: 0 }, details: { gases: [{ role: 'bottom', o2: 0.21, he: 0 }, { role: 'deco', o2: null, he: null, cylinder: 'al40', volumeL: 5.7, material: 'aluminium' }] } }, t, fmt);
    assert.deepEqual(multi.cards.map(c => [c.role, c.mix, c.cylinder]), [['bottom', 'Air', ''], ['deco', '?', 'AL40 (5.7 l)']]);
    assert.equal(multi.summary, null);
});
```
- [ ] **Step 2–4:** implement, style (phone first; cards wrap 1 column phone, 2 columns ≥ 700 px), `npm test` PASS.
- [ ] **Step 5: Commit** `feat(logbook): gases on the dive detail`.

### Task 4: Verify in the browser, release

- Serve on port 5517 (`lsof -ti tcp:5517 | xargs kill`; `npx http-server -p 5517 -c-1` or `python3 -m http.server 5517`), open `http://localhost:5517/lab/dive-log.html` in a new Chrome tab. Use a throwaway entry (create new dive, never edit user dives — Edit view may be opened but not saved).
- Check form + detail at 390×844 and desktop, light + dark. Screenshots to scratchpad.
- Bump `sw.js` CACHE_NAME + `css/styles.css` `.version-number::after` above live; PR, squash merge, wait pages.yml, confirm live version.
