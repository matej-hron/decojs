/**
 * DecoTrail's bridge to libdivecomputer, which runs as a separate WebAssembly
 * module (js/vendor/libdivecomputer/, LGPL-2.1, built by scripts/libdivecomputer/build.sh).
 *
 * downloadDives() drives a download over any byte transport with read/write/purge
 * (BleSerial in the browser); parseDive() turns one downloaded dive into a plain
 * "libdc record" that maresDive.js maps onto DecoTheory's RecordedDive.
 */

const MODULE_URL = new URL('../vendor/libdivecomputer/libdc.mjs', import.meta.url).href;

/** libdivecomputer status codes (dc_status_t). */
export const DC_STATUS = Object.freeze({
    SUCCESS: 0, DONE: 1, UNSUPPORTED: -1, INVALIDARGS: -2, NOMEMORY: -3, NODEVICE: -4,
    NOACCESS: -5, IO: -6, TIMEOUT: -7, PROTOCOL: -8, DATAFORMAT: -9, CANCELLED: -10,
});
const STATUS_NAME = Object.fromEntries(Object.entries(DC_STATUS).map(([k, v]) => [v, k]));

/** Model numbers of the Mares Icon HD family that use the Genius dive format. */
export const MARES_MODELS = Object.freeze({ GENIUS: 0x1c, HORIZON: 0x2c, SIRIUS: 0x2f, QUAD_CI: 0x31, QUAD2: 0x32, SIRIUS_L: 0x33, PUCK4: 0x35 });

/** A libdivecomputer call that ended with a non-success status. */
export class LibdcError extends Error {
    constructor(status, message) {
        super(message ?? `libdivecomputer: ${STATUS_NAME[status] ?? status}`);
        this.name = 'LibdcError';
        this.status = status;
        this.kind = STATUS_NAME[status]?.toLowerCase() ?? 'unknown';
    }
}

let factoryPromise = null;

/** Load the module factory once (lazy: only when the user downloads or parses). */
async function factory() {
    if (!factoryPromise) factoryPromise = import(MODULE_URL).then(m => m.default).catch(error => {
        factoryPromise = null;
        throw error;
    });
    return factoryPromise;
}

/** A fresh module instance with no-op hooks; callers override what they need. */
async function instance(hooks = {}) {
    const create = await factory();
    return create({
        onLog() {}, onProgress() {}, onDevinfo() {}, onVendor() {}, onDive() { return true; },
        onField() {}, onSample() {},
        ...hooks,
    });
}

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/**
 * Download dives, newest first, stopping at the dive whose fingerprint `fingerprintFor(serial)` returns.
 *
 * @param {Object} transport - {read(size, timeoutMs) → Promise<Uint8Array>, write(bytes), purge()}; errors with
 *   `kind === 'timeout'` become libdivecomputer timeouts (it retries those)
 * @param {Object} [options]
 * @param {number} [options.model] - libdivecomputer model number
 * @param {(serial: number) => (string|null)} [options.fingerprintFor] - hex fingerprint of the newest dive already downloaded
 * @param {(fraction: number) => void} [options.onProgress] - 0…1
 * @param {(level: number, message: string) => void} [options.onLog]
 * @param {() => boolean} [options.cancelled]
 * @param {number} [options.logLevel] - 0 none … 5 all
 * @returns {Promise<{serial: ?number, model: ?number, firmware: ?number, version: ?Uint8Array, dives: Array<{data: Uint8Array, fingerprint: string}>}>}
 */
export async function downloadDives(transport, {
    model = MARES_MODELS.QUAD2, fingerprintFor = () => null, onProgress = () => {}, onLog = () => {},
    cancelled = () => false, logLevel = 2,
} = {}) {
    const result = { serial: null, model: null, firmware: null, version: null, dives: [] };
    let mod;
    let ioError = null;
    mod = await instance({
        onLog,
        onProgress: (current, maximum) => onProgress(maximum ? Math.min(1, current / maximum) : 0),
        onVendor: bytes => { result.version = bytes; },
        onDevinfo: (devModel, firmware, serial) => {
            Object.assign(result, { model: devModel, firmware, serial });
            const fp = fingerprintFor(serial);
            if (fp && /^[0-9a-f]+$/i.test(fp) && fp.length % 2 === 0) {
                const bytes = Uint8Array.from(fp.match(/../g), h => parseInt(h, 16));
                const ptr = mod._malloc(bytes.length);
                mod.HEAPU8.set(bytes, ptr);
                const rc = mod._ldc_set_fingerprint(ptr, bytes.length);
                mod._free(ptr);
                if (rc !== DC_STATUS.SUCCESS) onLog(2, `fingerprint ignored (${STATUS_NAME[rc] ?? rc})`);
            }
        },
        onDive: (data, fingerprint) => {
            result.dives.push({ data, fingerprint: hex(fingerprint) });
            return !cancelled();
        },
        ble: {
            async read(ptr, size, timeout) {
                try {
                    const packet = await transport.read(size, timeout);
                    mod.HEAPU8.set(packet, ptr); // HEAPU8 read after the await: memory may have grown
                    return packet.length;
                } catch (error) {
                    if (error?.kind === 'timeout') return DC_STATUS.TIMEOUT;
                    ioError = error;
                    return DC_STATUS.IO;
                }
            },
            async write(ptr, size) {
                try {
                    await transport.write(mod.HEAPU8.slice(ptr, ptr + size));
                    return 0;
                } catch (error) {
                    ioError = error;
                    return DC_STATUS.IO;
                }
            },
            purge: () => transport.purge(),
            cancelled: () => Boolean(cancelled()) || Boolean(ioError),
        },
    });
    // ccall with async: the download suspends (Asyncify) while waiting for Bluetooth.
    const rc = await mod.ccall('ldc_mares_download', 'number', ['number', 'number'], [model, logLevel], { async: true });
    if (ioError) throw ioError;
    if (rc === DC_STATUS.CANCELLED && cancelled()) {
        const error = new LibdcError(rc, 'Download cancelled');
        error.partial = result;
        throw error;
    }
    if (rc !== DC_STATUS.SUCCESS) {
        const error = new LibdcError(rc);
        error.partial = result;
        throw error;
    }
    return result;
}

/**
 * Parse one downloaded dive.
 *
 * @param {Uint8Array} data - Dive bytes as downloaded
 * @param {{model?: number}} [options]
 * @returns {Promise<Object>} libdc record: {datetime, fields, gasmixes, tanks, samples, warnings, status}
 *   samples: [{t (s), depth, temp?, gasmix?, deco?: {type, time (s), depth, tts (s)}, pressure?: [{tank, bar}], events?: [{type, value}]}]
 */
export async function parseDive(data, { model = MARES_MODELS.QUAD2 } = {}) {
    const record = { datetime: null, fields: {}, gasmixes: [], tanks: [], samples: [], warnings: [], status: 0 };
    let current = null;
    const SAMPLE = ['time', 'depth', 'pressure', 'temperature', 'event', 'rbt', 'heartbeat', 'bearing', 'vendor',
        'setpoint', 'ppo2', 'cns', 'deco', 'gasmix', 'location'];
    const mod = await instance({
        onLog: (level, message) => { if (level <= 2) record.warnings.push(message); },
        onField: (name, a, b, c, d, e) => {
            if (name === 'datetime') record.datetime = { year: a, month: b, day: c, seconds: d, timezone: e };
            else if (name === 'gasmix') record.gasmixes[a] = { o2: b, he: c, n2: d, usage: e };
            else if (name === 'tank') record.tanks[a] = { ...record.tanks[a], volume: b, workPressure: c, beginPressure: d, endPressure: e };
            else if (name === 'tankGas') record.tanks[a] = { ...record.tanks[a], gasmix: b < 0 ? null : b, volumeType: c };
            else if (name === 'salinity') record.fields.salinity = { type: a, density: b };
            else if (name === 'decomodel') record.fields.decomodel = { type: a, conservatism: b, gfLow: c, gfHigh: d };
            else record.fields[name] = a;
        },
        onSample: (type, a, b, c, d) => {
            const kind = SAMPLE[type];
            if (kind === 'time') {
                current = { t: a / 1000 };
                record.samples.push(current);
                return;
            }
            if (!current) return;
            if (kind === 'depth') current.depth = a;
            else if (kind === 'temperature') current.temp = a;
            else if (kind === 'gasmix') current.gasmix = a;
            else if (kind === 'deco') current.deco = { type: a, time: b, depth: c, tts: d };
            else if (kind === 'pressure') (current.pressure ??= []).push({ tank: a, bar: b });
            else if (kind === 'event') (current.events ??= []).push({ type: a, time: b, flags: c, value: d });
            else if (kind === 'cns') current.cns = a;
            else if (kind === 'ppo2') current.ppO2 = b;
            else if (kind === 'setpoint') current.setpoint = a;
        },
    });
    const ptr = mod._malloc(data.length);
    mod.HEAPU8.set(data, ptr);
    record.status = mod._ldc_mares_parse(ptr, data.length, model);
    mod._free(ptr);
    return record;
}

/** "0.10.0-devel (9e6c3c832856)" */
export async function libdcVersion() {
    const mod = await instance();
    return mod.UTF8ToString(mod._ldc_version());
}
