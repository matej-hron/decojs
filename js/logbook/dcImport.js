/**
 * Decisions for "Download from dive computer" (Bluetooth): which downloaded dives are
 * new, which are already stored, which look like a dive already typed into the logbook,
 * and where the last-downloaded fingerprint is remembered. Pure apart from the optional
 * storage passed in (localStorage in the browser).
 */

import { diveKey } from '../backend/sync.js';

/** Supported dive computers: what the browser chooser filters on and the libdivecomputer model. */
export const DIVE_COMPUTERS = Object.freeze([
    { id: 'mares-quad2', vendor: 'Mares', name: 'Quad 2', namePrefixes: ['Quad2'], model: 0x32 },
]);

/** Minutes either side of a logbook entry's time within which a downloaded dive counts as "already logged". */
export const SAME_DIVE_MINUTES = 20;

const minutesOf = time => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Sort downloaded dives into what the picker shows.
 *
 * @param {Array<{dive: Object}>} items - Downloaded and mapped dives
 * @param {Array<{deviceSerial: string, diveNumber: number, startLocal: string}>} rows - Recordings already stored
 * @param {Array<{dive_date: string, entry_time?: ?string, recording_id?: ?string, log_number?: ?number}>} entries - Logbook entries
 * @returns {Array<{item: Object, status: 'new'|'logged'|'stored', match: ?Object, selected: boolean}>} newest first
 */
export function planDeviceImport(items, rows, entries) {
    const stored = new Set(rows.map(r => `${r.deviceSerial}|${r.diveNumber}|${r.startLocal}`));
    const storedStarts = new Set(rows.map(r => r.startLocal));
    const out = items.map(item => {
        const start = item.dive.start.local;
        if (stored.has(diveKey(item.dive)) || storedStarts.has(start)) return { item, status: 'stored', match: null, selected: false };
        const [date, time] = start.split('T');
        const at = minutesOf(time);
        const match = entries.find(e => e.dive_date === date && !e.recording_id
            && (minutesOf(e.entry_time) === null || at === null || Math.abs(minutesOf(e.entry_time) - at) <= SAME_DIVE_MINUTES));
        if (match) return { item, status: 'logged', match, selected: false };
        return { item, status: 'new', match: null, selected: true };
    });
    return out.sort((a, b) => b.item.dive.start.local.localeCompare(a.item.dive.start.local));
}

const fpKey = (computerId, serial) => `decotrail.dc.fingerprint.${computerId}.${serial}`;

/**
 * The fingerprint of the newest dive already downloaded from this computer (or null).
 * @param {{getItem: Function}|null} storage
 */
export function loadFingerprint(storage, computerId, serial) {
    try {
        const v = storage?.getItem(fpKey(computerId, serial));
        return v && /^[0-9a-f]+$/i.test(v) ? v : null;
    } catch {
        return null; // private mode, blocked storage
    }
}

/** Remember the newest downloaded dive, so the next download only fetches newer ones. */
export function saveFingerprint(storage, computerId, serial, fingerprint) {
    try {
        if (fingerprint) storage?.setItem(fpKey(computerId, serial), fingerprint);
    } catch {
        // a convenience: without it the next download simply fetches every dive again
    }
}

/**
 * What to tell the user about a failure, as a translation key and fallback.
 * @param {Error} error - BleError, LibdcError or a store error
 * @returns {?{key: string, fallback: string}} null when the user simply closed the chooser
 */
export function explainDownloadError(error) {
    const kind = error?.kind;
    if (kind === 'cancelled' && error?.name === 'BleError') return null;
    if (kind === 'unsupported') return { key: 'errUnsupported', fallback: 'This browser can\'t use Bluetooth. Open DecoTrail in Chrome on Android or on a computer. iPhone, iPad and Firefox can\'t connect to a dive computer from a web page.' };
    if (kind === 'off') return { key: 'errOff', fallback: 'Bluetooth is off. Turn it on and try again.' };
    if (kind === 'disconnected') return { key: 'errDisconnected', fallback: 'The dive computer disconnected. Its Bluetooth screen may have timed out: open it again and retry.' };
    if (kind === 'cancelled') return { key: 'errCancelled', fallback: 'Download stopped. Nothing was saved.' };
    if (kind === 'dataformat') return { key: 'errFormat', fallback: 'The dive computer sent data DecoTrail can\'t read. Its firmware may be newer than this version supports.' };
    if (error?.name === 'DiveStoreError') return { key: 'errSave', fallback: 'The dives were downloaded but could not be saved. Check your connection and try again.' };
    return { key: 'errConnect', fallback: 'Couldn\'t talk to the dive computer. Check that it shows the Bluetooth screen, keep it next to the phone, and try again.' };
}
