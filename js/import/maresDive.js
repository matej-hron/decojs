/**
 * Mares (Genius-format: Quad 2, Sirius, Genius …) dive → RecordedDive.
 *
 * Input is the plain "libdc record" produced by libdc.js parseDive() from the bytes
 * libdivecomputer downloaded; output is the same brand-neutral RecordedDive the
 * Divesoft import produces (docs/superpowers/specs/2026-10-05-divesoft-dlf-import-design.md),
 * so the logbook, the analysis charts and the engine use Mares dives unchanged.
 * Pure: no DOM, no WebAssembly.
 */

/** Version of this mapping; stored with each saved dive (parser_version) so it can be re-mapped later. */
export const MARES_PARSER_VERSION = 1;

/** RecordedDive.source.format of dives downloaded from a Mares computer. */
export const MARES_FORMAT = 'mares-genius';

const RECORD_SCHEMA = 1;

// libdivecomputer enums (parser.h)
const DIVEMODE = ['freedive', 'gauge', 'oc', 'ccr', 'scr'];
const DC_WATER_FRESH = 0;
const DECO_NDL = 0;
const DECO_DECOSTOP = 2;
const DECO_DEEPSTOP = 3;
const DECOMODEL = [null, 'buhlmann', 'vpm', 'rgbm', 'dciem'];
const EVENT_ASCENT = 3;
const EVENT_CEILING = 4;
const EVENT_BOOKMARK = 8;
const QUAD2 = 0x32;

const SALT_DENSITY = 1028;
const FRESH_DENSITY = 1000;
/** EN 13319 water: 1 bar per 10 m at standard gravity (1019.7 kg/m³). */
const EN13319_DENSITY = 1019.7;
const EARLIEST_PLAUSIBLE_MS = Date.UTC(2010, 0, 1);
const DAY_MS = 86400000;

/** Mares model numbers → names (libdivecomputer's list). */
export const MARES_MODEL_NAMES = Object.freeze({
    0x1c: 'Genius', 0x2c: 'Horizon', 0x2d: 'Puck Air 2', 0x2f: 'Sirius', 0x31: 'Quad Ci',
    0x32: 'Quad 2', 0x33: 'Sirius L', 0x35: 'Puck 4',
});

const HEADER_SIZE_V1 = 0xb8 + 16;
const GF_WORD = 0x14;
const DSTR = 0x44535452; // "DSTR", the dive start record

/**
 * What libdivecomputer does not decode from a Quad 2 dive, read from the raw bytes:
 * - GF low/high: header word at 0x14, low 7 bits = GF low, next 7 bits = GF high
 *   (verified on a Quad 2, firmware 01.02.00, set to GF custom 70/80: 0x2846);
 * - the computer's own dive number: first field after the marker of the dive start record.
 * Returns nulls for anything that does not look right.
 *
 * @param {Uint8Array} data - Dive bytes as downloaded (header object + profile object)
 * @returns {{gfLow: ?number, gfHigh: ?number, diveNumber: ?number}}
 */
export function readMaresExtras(data) {
    const out = { gfLow: null, gfHigh: null, diveNumber: null };
    if (!(data instanceof Uint8Array) || data.length < HEADER_SIZE_V1 + 4 + 16) return out;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.getUint16(0, true) !== 1 || data[3] < 1 || data[0x10] !== 0) return out; // Genius v1.x header only
    const gf = view.getUint16(GF_WORD, true);
    const gfLow = gf & 0x7f;
    const gfHigh = (gf >> 7) & 0x7f;
    if (gfLow >= 1 && gfHigh >= gfLow && gfHigh <= 100) Object.assign(out, { gfLow, gfHigh });
    const dstr = HEADER_SIZE_V1 + 4;
    if (view.getUint32(dstr, false) === DSTR) {
        const n = view.getUint32(dstr + 8, true);
        if (n > 0 && n < 100000) out.diveNumber = n;
    }
    return out;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

function startLocal(dt) {
    if (!dt) return null;
    const s = Math.round(dt.seconds ?? 0);
    return `${pad(dt.year, 4)}-${pad(dt.month)}-${pad(dt.day)}T${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

function environmentOf(fields) {
    const surfacePressure = Number.isFinite(fields.atmospheric) && fields.atmospheric > 0 ? round(fields.atmospheric, 4) : null;
    const salinity = fields.salinity;
    if (!salinity) return { surfacePressure, waterDensity: null, waterSetting: null };
    if (salinity.type === DC_WATER_FRESH) return { surfacePressure, waterDensity: FRESH_DENSITY, waterSetting: 'fresh' };
    // libdivecomputer reports EN 13319 as salt water with an explicit density (MSW / GRAVITY).
    if (salinity.density > 0 && Math.abs(salinity.density - EN13319_DENSITY) < 1) {
        return { surfacePressure, waterDensity: EN13319_DENSITY, waterSetting: 'en13319' };
    }
    return { surfacePressure, waterDensity: SALT_DENSITY, waterSetting: 'salt' };
}

/**
 * Samples in the RecordedDive shape. Mares keeps recording for the surface timeout
 * after the dive; those surface-only samples after the last underwater one are
 * dropped (one surface sample is kept so the profile ends at 0 m).
 */
function samplesOf(raw) {
    const out = [];
    for (const r of raw) {
        if (!Number.isFinite(r.t) || !Number.isFinite(r.depth)) continue;
        const s = { t: r.t, depth: round(r.depth, 2) };
        if (Number.isFinite(r.temp)) s.temp = r.temp;
        if (r.deco) {
            const stop = r.deco.type === DECO_DECOSTOP || r.deco.type === DECO_DEEPSTOP;
            s.ndl = r.deco.type === DECO_NDL ? Math.round(r.deco.time / 60) : 0;
            s.tts = Math.round((r.deco.tts ?? 0) / 60);
            // Mares logs the current stop depth, not a continuous ceiling; it is the closest thing to one.
            s.ceiling = stop ? r.deco.depth : 0;
        }
        if (r.pressure?.length) s.pressure = r.pressure[0].bar;
        out.push(s);
    }
    let last = out.length - 1;
    while (last > 0 && out[last].depth <= 0 && out[last - 1].depth <= 0) last--;
    return out.slice(0, last + 1);
}

/**
 * Map one parsed Mares dive.
 *
 * @param {Object} record - libdc record from parseDive()
 * @param {Object} meta
 * @param {number|string} [meta.serial] - device serial (from the download)
 * @param {number} [meta.model] - libdivecomputer model number
 * @param {string} [meta.fingerprint] - hex fingerprint of the dive (identifies it on the computer)
 * @param {Uint8Array} [meta.data] - the downloaded bytes, for what libdivecomputer does not decode (GF, dive number)
 * @param {number} [meta.now] - current time in ms, for the implausible-date check
 * @returns {Object} RecordedDive
 */
export function mapMaresDive(record, { serial = null, model = null, fingerprint = null, data = null, now = Date.now() } = {}) {
    const fields = record.fields ?? {};
    const warnings = [];
    if (record.status && record.status !== 0) warnings.push(`libdc-status:${record.status}`);

    const gases = (record.gasmixes ?? []).map((g, i) => ({
        id: `g${i}`, o2: round(g.o2, 4), he: round(g.he, 4), n2: round(1 - g.o2 - g.he, 4), role: 'oc',
    }));

    const events = [];
    let lastGas = null;
    for (const r of record.samples ?? []) {
        if (Number.isInteger(r.gasmix) && r.gasmix !== lastGas && gases[r.gasmix]) {
            events.push({ t: lastGas === null ? 0 : r.t, type: 'gasSwitch', gasId: gases[r.gasmix].id });
            lastGas = r.gasmix;
        }
        for (const e of r.events ?? []) {
            if (e.type === EVENT_ASCENT) events.push({ t: r.t, type: 'ascentTooFast' });
            else if (e.type === EVENT_CEILING) events.push({ t: r.t, type: 'ceilingViolated' });
            else if (e.type === EVENT_BOOKMARK) events.push({ t: r.t, type: 'bookmark' });
        }
    }
    if (gases.length === 0) gases.push({ id: 'g0', o2: 0.21, he: 0, n2: 0.79, role: 'oc' });

    const samples = samplesOf(record.samples ?? []);
    const local = startLocal(record.datetime);
    if (!local) warnings.push('no-date');
    const localMs = local ? Date.parse(`${local}Z`) : NaN;
    if (local && (localMs < EARLIEST_PLAUSIBLE_MS || localMs > now + DAY_MS)) warnings.push('implausible-date');
    if (samples.length === 0) warnings.push('no-samples');

    const decomodel = fields.decomodel;
    const extras = readMaresExtras(data);
    let deco = { model: null, gfLow: null, gfHigh: null, gfAlt: null };
    if (decomodel) {
        deco = { model: DECOMODEL[decomodel.type] ?? null, gfLow: decomodel.gfLow || null, gfHigh: decomodel.gfHigh || null, gfAlt: null };
    } else if (model === QUAD2 && extras.gfLow !== null) {
        // Only where verified against the computer's own display (Quad 2).
        deco = { model: 'buhlmann', gfLow: extras.gfLow, gfHigh: extras.gfHigh, gfAlt: null };
    }

    const temps = samples.map(s => s.temp).filter(Number.isFinite);
    const minTemp = Number.isFinite(fields.tempMin) ? fields.tempMin : temps.length ? Math.min(...temps) : null;
    const serialText = serial === null || serial === undefined ? null : String(serial);
    const modelName = MARES_MODEL_NAMES[model] ?? null;

    return {
        schema: RECORD_SCHEMA,
        source: {
            format: MARES_FORMAT,
            formatVersion: MARES_PARSER_VERSION,
            fileName: fingerprint ? `${(modelName ?? 'Mares').replace(/\s+/g, '')}-${fingerprint}.bin` : null,
            diveNumber: extras.diveNumber,
            fingerprint,
        },
        device: { vendor: 'Mares', model: modelName, serial: serialText, firmware: null, hardware: null },
        start: { local: local ?? '1970-01-01T00:00:00', utcOffsetMin: null },
        duration: Number.isFinite(fields.divetime) ? fields.divetime : (samples.at(-1)?.t ?? 0),
        maxDepth: Number.isFinite(fields.maxdepth) ? fields.maxdepth : Math.max(0, ...samples.map(s => s.depth)),
        minTemp,
        mode: DIVEMODE[fields.divemode] ?? 'unknown',
        environment: environmentOf(fields),
        deco,
        gases,
        samples,
        events,
        warnings,
    };
}
