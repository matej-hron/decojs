/**
 * Logbook entry helpers: mapping computer recordings to entries, numbering,
 * and normalising form input. Pure: no DOM, no network.
 */

import { localeTag } from '../format.js';
import { gasesFromRecording, primaryGas } from './gasModel.js';
import { VISIBILITIES } from './community.js';

/**
 * A `YYYY-MM-DD` dive date shown for the language (cs "27. 9. 2026"). Parsed as a calendar date and
 * formatted in UTC so no time-zone shift can move it by a day. Anything else is returned as given.
 */
export function formatDiveDate(date, lang) {
    if (!date) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
    if (!m) return String(date);
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return new Intl.DateTimeFormat(localeTag(lang), { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

/** Entries of one calendar day, earliest first (entries without a time first). */
export function entriesOnDate(entries, date) {
    return entries.filter(e => e.dive_date === date)
        .sort((a, b) => String(a.entry_time ?? '').localeCompare(String(b.entry_time ?? '')));
}

/** "More details" keys, grouped as in the form. */
export const DETAIL_KEYS = Object.freeze({
    conditions: ['airTempC', 'weather', 'current', 'waves'],
    equipment: ['weightsKg', 'suit', 'suitMm', 'computer'],
    dive: ['entry', 'avgDepthM', 'stops', 'tags', 'guide', 'rating'],
});

/** Detail keys a dive computer fills in; they do not count as something the diver typed. */
const COMPUTER_KEYS = new Set(['computer', 'stops', 'avgDepthM', 'surfaceTempC', 'computerFillVersion']);

/** A rating is a quick tap on the card, not a typed detail: it does not open "More details". */
const NOT_DETAILS = new Set([...COMPUTER_KEYS, 'rating']);

/** True when `details` holds a value the diver entered (computer-derived keys, the rating and unknown keys do not count). */
export function hasUserDetails(details) {
    const d = details ?? {};
    return Object.values(DETAIL_KEYS).flat().filter(k => !NOT_DETAILS.has(k)).some(k => {
        const v = d[k];
        return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
    });
}

const round1 = n => Math.round(n * 10) / 10;

/**
 * Warmest temperature in shallow water (depth <= 6 m): within the first 10 minutes if any,
 * else anywhere in the dive. Undefined when no sample qualifies.
 * @param {Array<{t: number, depth: number, temp?: number}>} samples
 */
export function surfaceTempFromSamples(samples) {
    const shallow = (samples ?? []).filter(s => s.depth <= 6 && Number.isFinite(s.temp));
    const early = shallow.filter(s => s.t <= 600);
    const pool = early.length ? early : shallow;
    return pool.length ? round1(Math.max(...pool.map(s => s.temp))) : undefined;
}

/** Time-weighted average depth (trapezoid rule over the whole dive); undefined for fewer than 2 samples. */
export function avgDepthFromSamples(samples) {
    const s = samples ?? [];
    if (s.length < 2) return undefined;
    let area = 0;
    for (let i = 1; i < s.length; i++) area += ((s[i].depth + s[i - 1].depth) / 2) * (s[i].t - s[i - 1].t);
    const total = s[s.length - 1].t;
    return total > 0 ? round1(area / total) : undefined;
}

/** The `surfaceTempC` / `avgDepthM` detail values a recording yields (only those that exist). */
export function computerFieldsFromRecording(dive) {
    const out = {};
    const surface = surfaceTempFromSamples(dive.samples);
    if (surface !== undefined) out.surfaceTempC = surface;
    const avg = Number.isFinite(dive.avgDepth) ? dive.avgDepth : avgDepthFromSamples(dive.samples);
    if (avg !== undefined) out.avgDepthM = avg;
    return out;
}

/**
 * Logbook fields a dive computer recording can fill in.
 * @param {Object} dive - RecordedDive
 */
export function entryFromRecording(dive) {
    const [date, time] = dive.start.local.split('T');
    const first = dive.gases?.[0];
    const hasDeco = dive.samples?.some(s => (s.ceiling ?? 0) > 0);
    const hasSafety = dive.events?.some(e => e.type === 'safetyStopDone');
    const device = [dive.device?.vendor, dive.device?.model, dive.device?.serial].filter(Boolean).join(' ');
    const details = { stops: hasDeco ? 'deco' : hasSafety ? 'safety' : 'none' };
    if (device) details.computer = device;
    Object.assign(details, computerFieldsFromRecording(dive));
    const gases = gasesFromRecording(dive);
    if (gases.length) details.gases = gases;
    return {
        dive_date: date,
        entry_time: time ?? null,
        duration_s: dive.duration ?? null,
        max_depth_m: dive.maxDepth ?? null,
        gas: primaryGas(gases) ?? (first ? { o2: first.o2, he: first.he } : null),
        water_temp_c: dive.minTemp ?? null,
        details,
    };
}

/** Recording rows in the order automatic entries are numbered. */
export function orderRecordingsForNumbering(rows) {
    return rows.slice().sort((a, b) => {
        const na = a.diveNumber ?? Infinity;
        const nb = b.diveNumber ?? Infinity;
        if (na !== nb) return na - nb;
        return String(a.startLocal).localeCompare(String(b.startLocal));
    });
}

/** Sanitise the "dives logged before DecoTrail" setting: an integer >= 0, anything else counts as 0. */
export function normalizeLogOffset(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 99999) : 0;
}

/** The next free logbook number: past both the highest used number and the "dives before DecoTrail" offset. */
export function nextLogNumber(entries, offset = 0) {
    return entries.reduce((max, e) => Math.max(max, e.log_number ?? 0), normalizeLogOffset(offset)) + 1;
}

/**
 * Plan "renumber by date": entries sorted by dive date, entry time, then recording start get
 * offset + 1 .. offset + n. Returns the whole order (`all`) and the `changes` that need an update.
 * @param {Array<{id: string, log_number: number|null, dive_date: string, entry_time?: string|null, recording_id?: string|null}>} entries
 * @param {Map<string, string>|Object} recordingStarts - recording id -> local start ("2026-10-01T09:30:00")
 */
export function planRenumber(entries, recordingStarts = new Map(), offset = 0) {
    const start = id => (id ? (recordingStarts instanceof Map ? recordingStarts.get(id) : recordingStarts[id]) ?? '' : '');
    const timeOf = e => String(e.entry_time ?? '').slice(0, 8) || String(start(e.recording_id)).slice(11, 19) || '99:99:99';
    const base = normalizeLogOffset(offset);
    const sorted = entries.slice().sort((a, b) =>
        String(a.dive_date).localeCompare(String(b.dive_date))
        || timeOf(a).localeCompare(timeOf(b))
        || String(start(a.recording_id)).localeCompare(String(start(b.recording_id)))
        || (a.log_number ?? Infinity) - (b.log_number ?? Infinity)
        || String(a.id).localeCompare(String(b.id)));
    const all = sorted.map((e, i) => ({ id: e.id, from: e.log_number ?? null, to: base + i + 1 }));
    return { all, changes: all.filter(c => c.from !== c.to) };
}

/** A stored rating as a whole number 1–5, or null when absent or out of range. */
export function ratingOf(value) {
    const n = parseDecimal(value);
    return n === null ? null : Math.min(5, Math.max(1, Math.round(n)));
}

/** Parse a number typed with a decimal comma or point; null when empty or invalid. */
export function parseDecimal(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replace(',', '.');
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
}

/** Seconds as `m:ss` (minutes may exceed 59), so the stored seconds survive an edit; '' for none. */
export function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '';
    const total = Math.round(Number(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Seconds from `m:ss`, whole minutes or decimal minutes (comma or point); null when empty or invalid. */
export function parseDuration(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (text === '') return null;
    const clock = /^(\d+):(\d{1,2})$/.exec(text);
    if (clock) {
        const sec = Number(clock[2]);
        return sec < 60 ? Number(clock[1]) * 60 + sec : null;
    }
    if (!/^\d+([.,]\d*)?$|^[.,]\d+$/.test(text)) return null;
    const minutes = parseDecimal(text);
    return minutes === null ? null : Math.round(minutes * 60);
}

const emptyText = v => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null);

function cleanDetails(details) {
    const out = {};
    for (const [k, v] of Object.entries(details)) {
        if (v === '' || v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0 && k !== 'gases') continue; // gases: [] means "cleared on purpose"
        out[k] = v;
    }
    return out;
}

/**
 * Turn form values into a log_entries row.
 * @param {Object} form - raw form values (strings), `duration_min` as `m:ss` or minutes;
 *   optional `visibility` (one of VISIBILITIES) and `share_location` (boolean) pass through when valid
 * @param {Object} [previousDetails] - details stored before; unknown keys are kept
 */
export function normalizeEntry(form, previousDetails = {}) {
    const seconds = parseDuration(form.duration_min);
    const buddies = [...new Set((form.buddies ?? []).map(b => String(b).trim()).filter(Boolean))];
    const number = parseDecimal(form.log_number);
    // Who can see the dive: sent only when the form offers it (community available), never guessed.
    const sharing = {};
    if (typeof form.visibility === 'string' && VISIBILITIES.includes(form.visibility)) sharing.visibility = form.visibility;
    if (typeof form.share_location === 'boolean') sharing.share_location = form.share_location;
    return {
        log_number: number === null ? null : Math.round(number),
        dive_date: emptyText(form.dive_date),
        entry_time: emptyText(form.entry_time),
        duration_s: seconds,
        max_depth_m: parseDecimal(form.max_depth_m),
        site_id: emptyText(form.site_id),
        buddies,
        gas: form.gas ?? null,
        water_temp_c: parseDecimal(form.water_temp_c),
        vis_shallow_m: parseDecimal(form.vis_shallow_m),
        vis_deep_m: parseDecimal(form.vis_deep_m),
        notes: emptyText(form.notes),
        details: cleanDetails({ ...previousDetails, ...(form.details ?? {}) }),
        ...sharing,
    };
}

/** True when the entry still lacks the details a diver usually adds by hand. */
export function needsDetails(entry) {
    return !entry.site_id || !(entry.buddies?.length > 0);
}
