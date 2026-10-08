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
