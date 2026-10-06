/**
 * Divesoft dive log (.DLF) parser.
 *
 * Written from DecoTheory's own format notes
 * (docs/superpowers/plans/2026-10-05-divesoft-dlf-import.md, "DLF Format Reference").
 * Pure ES module: runs in the browser, in Node tests and on a server.
 *
 * Input: the raw bytes of one .DLF file. Output: a RecordedDive, the
 * brand-neutral record described in
 * docs/superpowers/specs/2026-10-05-divesoft-dlf-import-design.md.
 */

const MAGIC = { 0x45766944: 1, 0x45566944: 2 }; // "DivE", "DiVE"
const HEADER_SIZE = { 1: 32, 2: 64 };
const RECORD_SIZE = 16;
const EPOCH_2000_MS = Date.UTC(2000, 0, 1);

const RECORD_POINT = 0;
const RECORD_CONFIG = 6;
const CONFIG_SERIAL = 3;
const CONFIG_DECO = 4;
const CONFIG_VERSION = 5;
const CONFIG_TANK = 7;
const CONFIG_DILUENTS = 9;

const MODES = ['unknown', 'oc', 'ccr', 'ccr', 'freedive', 'gauge', 'scr', 'scr', 'ccr'];
const CCR_MODE_CODES = new Set([2, 3, 6, 7, 8]);
const GAUGE_MODE_CODE = 5;

const EVENT_SETPOINT_MANUAL = 1;
const EVENT_SETPOINT_AUTO = 2;
const EVENT_GAS = 5;
const EVENT_DILUENT = 23;
const EVENT_MODE = 24;
const EVENT_CNS = 30;
const SIMPLE_EVENTS = {
    7: 'ascentTooFast',
    8: 'ceilingViolated',
    21: 'safetyStopMissed',
    26: 'bookmark',
    34: 'safetyStopDone',
    35: 'decoStopDone',
    37: 'ndlEnded',
};

const NDL_UNLIMITED = 1000;
const MAX_BACKSTEP_S = 5;
const SALT_DENSITY = 1028;
const FRESH_DENSITY = 1000;
const EARLIEST_PLAUSIBLE_MS = Date.UTC(2010, 0, 1);
const DAY_MS = 86400000;
const MAX_PLAUSIBLE_DURATION_S = 6 * 3600;
const MAX_GAUGE_DEPTH_M = 200;

/** Thrown when the bytes are not a readable Divesoft dive log. */
export class DlfFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DlfFormatError';
    }
}

/** CRC-16/ARC: reflected polynomial 0xA001, initial value 0xFFFF. */
function crc16arc(bytes) {
    let crc = 0xffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc;
}

/** Interpret the low 10 bits as a two's-complement number. */
function signExtend10(value) {
    return value & 0x200 ? value - 0x400 : value;
}

function isPadding(bytes, offset) {
    for (let i = 0; i < RECORD_SIZE; i++) if (bytes[offset + i] !== 0xff) return false;
    return true;
}

function isEventType(type) {
    return (type >= 1 && type <= 5) || type === 9;
}

function readHeader(view, version) {
    if (version === 1) {
        const misc1 = view.getUint32(12, true);
        const misc2 = view.getUint32(16, true);
        return {
            startRaw: view.getUint32(8, true),
            utcOffsetMin: null,
            duration: misc1 & 0x1ffff,
            modeCode: (misc1 >>> 27) & 0x7,
            minTemp: signExtend10((misc2 >>> 18) & 0x3ff) / 10,
            maxDepth: view.getUint16(20, true) / 100,
            surfacePressure: view.getUint16(24, true) / 10000,
            diluent: [view.getUint8(26), view.getUint8(27)],
        };
    }
    return {
        startRaw: view.getUint32(8, true),
        utcOffsetMin: view.getInt16(40, true),
        duration: view.getUint32(12, true),
        modeCode: view.getUint8(18),
        minTemp: view.getInt16(24, true) / 10,
        maxDepth: view.getUint16(28, true) / 100,
        surfacePressure: view.getUint16(32, true) / 10000,
        diluent: null,
    };
}

function diveNumberFromName(fileName) {
    const match = /^(\d{8})\.dlf$/i.exec(fileName ?? '');
    return match ? Number(match[1]) : null;
}

/**
 * Parse one Divesoft .DLF dive log.
 *
 * @param {Uint8Array|ArrayBuffer} input - Raw file bytes
 * @param {Object} [options]
 * @param {string} [options.fileName] - Original file name, e.g. '00000100.DLF'
 * @param {number} [options.now] - Current time in ms, for the implausible-date check
 * @returns {Object} RecordedDive
 * @throws {DlfFormatError} When the bytes are not a readable dive log
 */
export function parseDivesoftDLF(input, { fileName = null, now = Date.now() } = {}) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < 4) throw new DlfFormatError('File is too short to be a Divesoft dive log');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const version = MAGIC[view.getUint32(0, true)];
    if (!version) throw new DlfFormatError('Not a Divesoft dive log (unknown file signature)');
    const headerSize = HEADER_SIZE[version];
    if (bytes.length < headerSize) throw new DlfFormatError('File is shorter than its header');

    const warnings = [];
    if (view.getUint16(4, true) !== crc16arc(bytes.subarray(6, headerSize))) {
        warnings.push('header-crc-mismatch');
    }
    if ((bytes.length - headerSize) % RECORD_SIZE !== 0) warnings.push('trailing-bytes');
    const header = readHeader(view, version);

    const device = { vendor: 'Divesoft', model: null, serial: null, firmware: null, hardware: null };
    const deco = { model: null, gfLow: null, gfHigh: null, gfAlt: null };
    let waterSetting = null;

    const gases = [];
    const addGas = (o2Pct, hePct, role) => {
        if (o2Pct === 0 || o2Pct + hePct > 100) return null;
        let gas = gases.find(g => g.o2 === o2Pct / 100 && g.he === hePct / 100 && g.role === role);
        if (!gas) {
            gas = { id: `g${gases.length}`, o2: o2Pct / 100, he: hePct / 100, n2: (100 - o2Pct - hePct) / 100, role };
            gases.push(gas);
        }
        return gas;
    };
    if (header.diluent && CCR_MODE_CODES.has(header.modeCode) && (header.diluent[0] || header.diluent[1])) {
        addGas(header.diluent[0], header.diluent[1], 'diluent');
    }

    const samples = [];
    const events = [];
    let lastT = -1;
    let duplicates = 0;
    let backsteps = 0;

    for (let offset = headerSize; offset + RECORD_SIZE <= bytes.length; offset += RECORD_SIZE) {
        if (isPadding(bytes, offset)) continue;
        const flags = view.getUint32(offset, true);
        const type = flags & 0xf;
        const t = (flags >>> 4) & 0x1ffff;
        const sub = (flags >>> 21) & 0x3ff;

        if (type === RECORD_POINT) {
            if (t === lastT) {
                duplicates++;
                continue;
            }
            if (t < lastT) {
                if (lastT - t > MAX_BACKSTEP_S) {
                    throw new DlfFormatError(`Sample time moved backwards from ${lastT} s to ${t} s`);
                }
                backsteps++;
                continue;
            }
            lastT = t;
            const sample = { t, depth: view.getUint16(offset + 4, true) / 100 };
            const ppO2 = view.getUint16(offset + 6, true);
            if (ppO2) sample.ppO2 = ppO2 / 10000;
            if (sub === 0 || sub === 0x3ff) {
                const misc = view.getUint32(offset + 8, true);
                const ndl = misc & 0x3ff;
                sample.ndl = ndl === NDL_UNLIMITED ? null : ndl;
                sample.tts = (misc >>> 10) & 0x3ff;
                sample.temp = signExtend10((misc >>> 20) & 0x3ff) / 10;
                sample.ceiling = view.getUint16(offset + 12, true) / 100;
            }
            samples.push(sample);
        } else if (type === RECORD_CONFIG) {
            const b = i => view.getUint8(offset + i);
            if (sub === CONFIG_SERIAL) {
                const text = String.fromCharCode(...bytes.subarray(offset + 4, offset + 16)).replace(/\0/g, '').trimEnd();
                device.serial = text.length >= 12 ? `${text.slice(0, 4)}-${text.slice(4)}` : text;
            } else if (sub === CONFIG_VERSION) {
                device.model = b(4) === 0 ? 'Freedom' : null;
                device.hardware = `${b(5)}.${b(6)}`;
                device.firmware = `${b(7)}.${b(8)}.${b(9)}`;
            } else if (sub === CONFIG_DECO) {
                const decoFlags = view.getUint16(offset + 4, true);
                waterSetting = decoFlags & 0x02 ? 'salt' : 'fresh';
                deco.model = decoFlags & 0x20 ? 'vpm' : 'buhlmann';
                deco.gfLow = b(6);
                deco.gfHigh = b(7);
                deco.gfAlt = [b(8), b(9)];
            } else if (sub === CONFIG_TANK) {
                const gasId = b(11);
                addGas(b(4), b(5), gasId === 10 ? 'oxygen' : gasId === 11 ? 'diluent' : 'oc');
            } else if (sub === CONFIG_DILUENTS) {
                for (let i = 0; i < 4; i++) {
                    if (b(6 + i * 3) & 0x01) addGas(b(4 + i * 3), b(5 + i * 3), 'diluent');
                }
            }
        } else if (isEventType(type)) {
            const code = view.getUint16(offset + 4, true);
            if (code === EVENT_GAS || code === EVENT_DILUENT || code === EVENT_MODE) {
                const toCcr = code === EVENT_MODE && CCR_MODE_CODES.has(view.getUint8(offset + 8));
                const role = code === EVENT_DILUENT || toCcr ? 'diluent' : 'oc';
                const gas = addGas(view.getUint8(offset + 6), view.getUint8(offset + 7), role);
                if (gas) events.push({ t, type: 'gasSwitch', gasId: gas.id });
            } else if (code === EVENT_CNS) {
                events.push({ t, type: 'cns', value: view.getUint16(offset + 6, true) / 100 });
            } else if (code === EVENT_SETPOINT_MANUAL || code === EVENT_SETPOINT_AUTO) {
                events.push({ t, type: 'setpoint', value: view.getUint8(offset + 6) / 100 });
            } else if (SIMPLE_EVENTS[code]) {
                events.push({ t, type: SIMPLE_EVENTS[code] });
            }
        }
    }

    if (gases.length === 0) addGas(21, 0, 'oc');

    const localMs = EPOCH_2000_MS + (header.startRaw + (header.utcOffsetMin ?? 0) * 60) * 1000;
    if (duplicates) warnings.push(`duplicate-seconds:${duplicates}`);
    if (backsteps) warnings.push(`time-backstep:${backsteps}`);
    if (localMs < EARLIEST_PLAUSIBLE_MS || localMs > now + DAY_MS) warnings.push('implausible-date');
    if (header.modeCode === GAUGE_MODE_CODE && header.maxDepth > MAX_GAUGE_DEPTH_M) warnings.push('gauge-test-record');
    if (header.duration > MAX_PLAUSIBLE_DURATION_S) warnings.push('implausible-duration');
    if (samples.length === 0) warnings.push('no-samples');

    return {
        source: { format: 'divesoft-dlf', formatVersion: version, fileName, diveNumber: diveNumberFromName(fileName) },
        device,
        start: { local: new Date(localMs).toISOString().slice(0, 19), utcOffsetMin: header.utcOffsetMin },
        duration: header.duration,
        maxDepth: header.maxDepth,
        minTemp: header.minTemp,
        mode: MODES[header.modeCode] ?? 'unknown',
        environment: {
            surfacePressure: header.surfacePressure,
            waterDensity: waterSetting === 'salt' ? SALT_DENSITY : waterSetting === 'fresh' ? FRESH_DENSITY : null,
            waterSetting,
        },
        deco,
        gases,
        samples,
        events,
        warnings,
    };
}
