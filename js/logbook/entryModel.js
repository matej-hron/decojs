/**
 * Logbook entry helpers: mapping computer recordings to entries, numbering,
 * and normalising form input. Pure: no DOM, no network.
 */

/** "More details" keys, grouped as in the form. */
export const DETAIL_KEYS = Object.freeze({
    conditions: ['surfaceTempC', 'airTempC', 'weather', 'current', 'waves'],
    equipment: ['cylinderL', 'cylinderMaterial', 'pressureStartBar', 'pressureEndBar', 'weightsKg', 'suit', 'suitMm', 'computer'],
    dive: ['entry', 'avgDepthM', 'stops', 'tags', 'guide', 'rating'],
});

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
    if (Number.isFinite(dive.avgDepth)) details.avgDepthM = dive.avgDepth;
    return {
        dive_date: date,
        entry_time: time ?? null,
        duration_s: dive.duration ?? null,
        max_depth_m: dive.maxDepth ?? null,
        gas: first ? { o2: first.o2, he: first.he } : null,
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

/** The next free logbook number. */
export function nextLogNumber(entries) {
    return entries.reduce((max, e) => Math.max(max, e.log_number ?? 0), 0) + 1;
}

/** Parse a number typed with a decimal comma or point; null when empty or invalid. */
export function parseDecimal(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replace(',', '.');
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
}

const emptyText = v => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null);

function cleanDetails(details) {
    const out = {};
    for (const [k, v] of Object.entries(details)) {
        if (v === '' || v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        out[k] = v;
    }
    return out;
}

/**
 * Turn form values into a log_entries row.
 * @param {Object} form - raw form values (strings), `duration_min` in minutes
 * @param {Object} [previousDetails] - details stored before; unknown keys are kept
 */
export function normalizeEntry(form, previousDetails = {}) {
    const minutes = parseDecimal(form.duration_min);
    const buddies = [...new Set((form.buddies ?? []).map(b => String(b).trim()).filter(Boolean))];
    const number = parseDecimal(form.log_number);
    return {
        log_number: number === null ? null : Math.round(number),
        dive_date: emptyText(form.dive_date),
        entry_time: emptyText(form.entry_time),
        duration_s: minutes === null ? null : Math.round(minutes * 60),
        max_depth_m: parseDecimal(form.max_depth_m),
        site_id: emptyText(form.site_id),
        buddies,
        gas: form.gas ?? null,
        water_temp_c: parseDecimal(form.water_temp_c),
        vis_shallow_m: parseDecimal(form.vis_shallow_m),
        vis_deep_m: parseDecimal(form.vis_deep_m),
        notes: emptyText(form.notes),
        details: cleanDetails({ ...previousDetails, ...(form.details ?? {}) }),
    };
}

/** True when the entry still lacks the details a diver usually adds by hand. */
export function needsDetails(entry) {
    return !entry.site_id || !(entry.buddies?.length > 0);
}
