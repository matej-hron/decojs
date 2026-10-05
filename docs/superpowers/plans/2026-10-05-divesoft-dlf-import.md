# Divesoft DLF Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse Divesoft Freedom `.DLF` dive logs into a brand-neutral RecordedDive and convert it into DecoTheory's existing DiveSetup so the Bühlmann engine can replay recorded dives.

**Architecture:** Two pure ES modules in `js/import/`: `divesoftDlf.js` (bytes → RecordedDive) and `recordedDive.js` (RecordedDive → DiveSetup). Tests use Node's built-in `node:test` against ten real fixture dives plus small synthetic buffers, and are added to `npm test`.

**Tech Stack:** Vanilla ES modules (no build step, no new dependencies), Node 26 `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-05-divesoft-dlf-import-design.md`

## Global Constraints

- **Clean room:** do not open, copy or port libdivecomputer source or the spike decoder. Implement only from this plan and the spec. (DecoTheory is MIT; libdivecomputer is LGPL-2.1.)
- `js/import/*.js` are pure ES modules: no DOM, no `node:` imports, no `Buffer`. Input is `Uint8Array` or `ArrayBuffer`.
- Units in RecordedDive: time s, depth m, pressure bar, temperature °C, gas fractions 0–1, GF in %. Sample `ndl`/`tts` are whole minutes.
- GF comes from the **first** GF pair (deco config bytes +6/+7); the second pair (+8/+9) is `deco.gfAlt`.
- Keep only the first point record per second; small backsteps (≤ 5 s) are dropped with a warning; larger ones throw `DlfFormatError`.
- The parser never filters dives; anomalies become `warnings` strings.
- Code style: 4-space indent, single quotes, JSDoc on exported functions (match `js/deco/*.js`). English comments use decimal points.
- Fixtures already exist in `tests/fixtures/divesoft/` (10 `.DLF` files, `expected.json`, `README.md`). Do not regenerate or edit them.
- Baseline: `npm test` currently passes 623/623. It must stay green.

## Review Focus

- **Browser file input arrives as an `ArrayBuffer`** (`await file.arrayBuffer()`): the parser must accept it, not only `Uint8Array`. Test in Task 1.
- **A `Uint8Array` view into a larger buffer** (non-zero `byteOffset`, e.g. one file sliced from a bigger download): reads must respect the offset. Test in Task 1.
- **A header-only file** (dive aborted at the surface): returns a dive with a `no-samples` warning and the default air gas, and `toDiveSetup` does not crash on it. Tests in Tasks 1 and 2.
- **A multi-gas dive** (none in the fixtures): a mid-dive switch to EAN50 creates gas `g1` and `toDiveSetup` puts `gasId: 'g1'` on the waypoint at the switch. Tests in Tasks 1 and 2.
- **Newer firmware with unknown record types or event codes**: skipped silently, with no warnings or events. Test in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `js/import/divesoftDlf.js` (create) | `parseDivesoftDLF(bytes, opts)` and `DlfFormatError`: binary layout, records, warnings |
| `js/import/recordedDive.js` (create) | `toDiveSetup(dive)` and `gasName(gas)`: brand-neutral RecordedDive → existing DiveSetup |
| `tests/divesoft-dlf.test.mjs` (create) | All tests for both modules (`node:test`) |
| `package.json` (modify) | `test` script also runs the new suite |

## DLF Format Reference (for Task 1)

All integers little-endian. Byte offsets below are relative to the start of the file (header) or the start of a 16-byte record.

**Header.** The first 4 bytes are the magic:
- `0x45766944` (bytes `44 69 76 45`, "DivE") → version 1, header 32 bytes
- `0x45566944` (bytes `44 69 56 45`, "DiVE") → version 2, header 64 bytes

| Offset | v1 | v2 |
|---|---|---|
| 4 | u16 CRC-16/ARC over bytes 6 … header end (poly 0xA001 reflected, init 0xFFFF, no final xor) | same |
| 8 | u32 start, seconds since 2000-01-01 00:00 **local time** | u32 start, seconds since 2000-01-01 00:00 **UTC** |
| 12 | u32 misc1: bits 0–16 dive time [s]; bits 27–29 mode code | u32 dive time [s] |
| 16 | u32 misc2: bits 18–27 minimum temperature [0.1 °C], 10-bit two's complement | — |
| 18 | — | u8 mode code |
| 20 | u16 max depth [cm] | — |
| 24 | u16 surface pressure [10 Pa] (bar = raw / 10000) | i16 minimum temperature [0.1 °C] |
| 26, 27 | u8 initial diluent O₂ %, He % (CCR only) | — |
| 28 | — | u16 max depth [cm] |
| 32 | — | u16 surface pressure [10 Pa] |
| 40 | — | i16 UTC offset [min]; local time = start + offset |

Mode codes: 0 unknown, 1 OC, 2 CCR, 3 manual CCR, 4 freedive, 5 gauge, 6 active SCR, 7 passive SCR, 8 bailout CCR. Mapped to `mode`: `['unknown','oc','ccr','ccr','freedive','gauge','scr','scr','ccr']`. CCR family (diluent context): codes 2, 3, 6, 7, 8.

**Records** follow the header, 16 bytes each. A record whose 16 bytes are all `0xFF` is padding: skip it. Bytes 0–3 are a u32 `flags`:
- `type = flags & 0xF`
- `t = (flags >>> 4) & 0x1FFFF` (seconds since dive start)
- `sub = (flags >>> 21) & 0x3FF`

| type | meaning | layout |
|---|---|---|
| 0 | point (sample) | +4 u16 depth [cm]; +6 u16 pO₂ [10 Pa] (0 = absent). Only when `sub` is 0 or 0x3FF: +8 u32 misc with bits 0–9 NDL [min] (1000 = unlimited), bits 10–19 TTS [min], bits 20–29 temperature [0.1 °C, 10-bit two's complement]; +12 u16 ceiling [cm] |
| 1–5, 9 | event | +4 u16 event code, payload below |
| 6 | configuration | by `sub`, below |
| 7, 8, other | measurements, tissue state, unknown | skip |

Configuration records (type 6):

| sub | content |
|---|---|
| 3 | serial: 12 ASCII bytes at +4 … +15 → `XXXX-XXXXXXXX` (first 4, dash, last 8) |
| 4 | deco: +4 u16 flags (bit 0x02 salt water, bit 0x20 VPM); +6 GF low, +7 GF high (**in use**); +8 GF low, +9 GF high (alternative preset) |
| 5 | version: +4 device type (0 observed on a Freedom); +5 hw major, +6 hw minor; +7, +8, +9 firmware major, minor, patch |
| 7 | tank: +4 O₂ %, +5 He %; +11 gas id (10 = oxygen, 11 = diluent, else open circuit) |
| 9 | diluents: four 3-byte entries from +4: O₂ %, He %, state (bit 0 = enabled) |

Event codes (record types 1–5 and 9):

| code | event | payload |
|---|---|---|
| 1, 2 | setpoint (manual, auto) | +6 u8 setpoint [0.01 bar] |
| 5 | gas switch, open circuit | +6 O₂ %, +7 He % |
| 7 | ascent too fast | — |
| 8 | ceiling violated | — |
| 21 | safety stop missed | — |
| 23 | diluent switch | +6 O₂ %, +7 He % |
| 24 | mode change | +6 O₂ %, +7 He %, +8 new mode code |
| 26 | bookmark | — |
| 30 | CNS | +6 u16 value, `value = raw / 100` (unverified scale, no fixture) |
| 34 | safety stop done | — |
| 35 | deco stop done | — |
| 37 | NDL ended | — |
| other | — | skip |

---

### Task 1: DLF parser

**Files:**
- Create: `js/import/divesoftDlf.js`
- Create: `tests/divesoft-dlf.test.mjs`
- Modify: `package.json` (the `"test"` script)

**Interfaces:**
- Consumes: fixtures in `tests/fixtures/divesoft/`.
- Produces:
  - `export class DlfFormatError extends Error` (`name === 'DlfFormatError'`)
  - `export function parseDivesoftDLF(input: Uint8Array | ArrayBuffer, options?: { fileName?: string, now?: number }): RecordedDive`
  - RecordedDive fields used by Task 2: `source.fileName`, `source.diveNumber`, `start.local`, `samples[] {t, depth, temp?, ppO2?, ndl?, tts?, ceiling?}`, `events[] {t, type, gasId?, value?}`, `gases[] {id, o2, he, n2, role}`, `deco {model, gfLow, gfHigh, gfAlt}`, `environment {surfacePressure, waterDensity, waterSetting}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/divesoft-dlf.test.mjs`:

```js
/**
 * Divesoft DLF import tests.
 *
 * Fixtures: tests/fixtures/divesoft/ (10 real dives, see README.md there).
 * Run: node --test tests/divesoft-dlf.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF, DlfFormatError } from '../js/import/divesoftDlf.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);
const EXPECTED = JSON.parse(readFileSync(new URL('expected.json', FIXTURES), 'utf8'));
const DIVE_IDS = Object.keys(EXPECTED);

function fixtureBytes(id) {
    return new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES)));
}

function loadDive(id) {
    return parseDivesoftDLF(fixtureBytes(id), { fileName: `${id}.DLF` });
}

// Independent CRC-16/ARC for building synthetic files.
function crc16arc(bytes) {
    let crc = 0xffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc;
}

const SYNTH_START = 836000000; // seconds since 2000-01-01, mid-2026

/**
 * Build a synthetic DLF file.
 * records: [{ type, t, sub?, u16?: {offset: value}, u8?: {offset: value} }]
 */
function buildDlf({ version = 1, records = [], mode = 1, maxDepthCm = 1000, utcOffsetMin = 120 } = {}) {
    const headerSize = version === 1 ? 32 : 64;
    const bytes = new Uint8Array(headerSize + records.length * 16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, version === 1 ? 0x45766944 : 0x45566944, true);
    view.setUint32(8, SYNTH_START, true);
    if (version === 1) {
        view.setUint32(12, (600 | (mode << 27)) >>> 0, true);
        view.setUint32(16, 150 << 18, true);
        view.setUint16(20, maxDepthCm, true);
        view.setUint16(24, 10132, true);
    } else {
        view.setUint32(12, 600, true);
        bytes[18] = mode;
        view.setInt16(24, 150, true);
        view.setUint16(28, maxDepthCm, true);
        view.setUint16(32, 10132, true);
        view.setInt16(40, utcOffsetMin, true);
    }
    records.forEach((record, i) => {
        const offset = headerSize + i * 16;
        view.setUint32(offset, ((record.type & 0xf) | (record.t << 4) | ((record.sub ?? 0) << 21)) >>> 0, true);
        for (const [rel, value] of Object.entries(record.u16 ?? {})) view.setUint16(offset + Number(rel), value, true);
        for (const [rel, value] of Object.entries(record.u8 ?? {})) bytes[offset + Number(rel)] = value;
    });
    view.setUint16(4, crc16arc(bytes.subarray(6, headerSize)), true);
    return bytes;
}

const point = (t, depthCm) => ({ type: 0, t, sub: 0, u16: { 4: depthCm } });
const gasSwitch = (t, o2, he = 0) => ({ type: 1, t, u16: { 4: 5 }, u8: { 6: o2, 7: he } });

describe('parseDivesoftDLF: real fixtures', () => {
    for (const id of DIVE_IDS) {
        test(`${id}: header, device and settings match the reference`, () => {
            const dive = loadDive(id);
            const exp = EXPECTED[id];
            assert.equal(dive.source.format, 'divesoft-dlf');
            assert.equal(dive.source.formatVersion, 1);
            assert.equal(dive.source.fileName, `${id}.DLF`);
            assert.equal(dive.source.diveNumber, Number(id));
            assert.equal(dive.start.local, exp.start);
            assert.equal(dive.start.utcOffsetMin, null);
            assert.equal(dive.duration, exp.duration);
            assert.equal(dive.maxDepth, exp.maxDepth);
            assert.equal(dive.minTemp, exp.minTemp);
            assert.equal(dive.mode, exp.mode);
            assert.ok(Math.abs(dive.environment.surfacePressure - exp.surfacePressure) < 1e-4);
            assert.equal(dive.environment.waterSetting, exp.waterSetting);
            assert.equal(dive.environment.waterDensity, exp.waterSetting === 'salt' ? 1028 : 1000);
            assert.deepEqual(dive.deco, { model: 'buhlmann', gfLow: exp.gfLow, gfHigh: exp.gfHigh, gfAlt: exp.gfAlt });
            assert.deepEqual(dive.device, {
                vendor: 'Divesoft', model: 'Freedom',
                serial: exp.serial, firmware: exp.firmware, hardware: exp.hardware,
            });
            assert.deepEqual(dive.gases, [{ id: 'g0', o2: 0.21, he: 0, n2: 0.79, role: 'oc' }]);
        });

        test(`${id}: samples and events match the reference`, () => {
            const dive = loadDive(id);
            const exp = EXPECTED[id];
            assert.equal(dive.samples.length, exp.sampleCount);
            for (const p of exp.points) {
                const s = dive.samples.find(x => x.t === p.t);
                assert.ok(s, `sample at t=${p.t} s`);
                assert.equal(s.depth, p.depth, `depth at t=${p.t}`);
                assert.equal(s.temp, p.temp, `temp at t=${p.t}`);
                assert.equal(s.ceiling, p.ceiling, `ceiling at t=${p.t}`);
                assert.equal(s.ndl, p.ndl, `ndl at t=${p.t}`);
                assert.equal(s.tts, p.tts, `tts at t=${p.t}`);
            }
            assert.deepEqual(dive.events, exp.events);
        });
    }

    test('samples have strictly increasing times', () => {
        for (const id of DIVE_IDS) {
            const { samples } = loadDive(id);
            for (let i = 1; i < samples.length; i++) assert.ok(samples[i].t > samples[i - 1].t, `${id} at index ${i}`);
        }
    });

    test('pO2 is reported in bar and tracks depth on air', () => {
        const s = loadDive('00000100').samples.find(x => x.depth > 30);
        const ambient = 0.9816 + s.depth * 1028 * 9.80665 / 1e5;
        assert.ok(Math.abs(s.ppO2 - 0.21 * ambient) < 0.03, `ppO2 ${s.ppO2} vs ${0.21 * ambient}`);
    });
});

describe('parseDivesoftDLF: warnings', () => {
    test('duplicate seconds are counted per dive', () => {
        for (const id of DIVE_IDS) {
            const n = EXPECTED[id].duplicateSeconds;
            const warnings = loadDive(id).warnings;
            if (n > 0) assert.ok(warnings.includes(`duplicate-seconds:${n}`), `${id}: ${warnings}`);
            else assert.ok(!warnings.some(w => w.startsWith('duplicate-seconds')), `${id}: ${warnings}`);
        }
    });

    test('a clock reset is flagged as an implausible date', () => {
        assert.deepEqual(loadDive('00000099').warnings, ['duplicate-seconds:1', 'implausible-date']);
    });

    test('a clean dive has no warnings', () => {
        assert.deepEqual(loadDive('00000101').warnings, []);
    });

    test('a corrupted header is reported but still parsed', () => {
        const bytes = fixtureBytes('00000101');
        bytes[20] ^= 0xff; // max depth field
        const dive = parseDivesoftDLF(bytes);
        assert.ok(dive.warnings.includes('header-crc-mismatch'));
        assert.equal(dive.samples.length, EXPECTED['00000101'].sampleCount);
    });

    test('gauge mode with an impossible depth is flagged as a test record', () => {
        const dive = parseDivesoftDLF(buildDlf({ mode: 5, maxDepthCm: 35000, records: [point(0, 100)] }));
        assert.equal(dive.mode, 'gauge');
        assert.ok(dive.warnings.includes('gauge-test-record'));
    });

    test('a header-only file returns a dive with no samples and default air', () => {
        const dive = parseDivesoftDLF(buildDlf());
        assert.deepEqual(dive.samples, []);
        assert.deepEqual(dive.warnings, ['no-samples']);
        assert.deepEqual(dive.gases, [{ id: 'g0', o2: 0.21, he: 0, n2: 0.79, role: 'oc' }]);
        assert.deepEqual(dive.deco, { model: null, gfLow: null, gfHigh: null, gfAlt: null });
        assert.equal(dive.environment.waterDensity, null);
        assert.equal(dive.source.fileName, null);
        assert.equal(dive.source.diveNumber, null);
    });

    test('a small time backstep drops the record with a warning', () => {
        const dive = parseDivesoftDLF(buildDlf({ records: [point(0, 100), point(10, 200), point(8, 300), point(11, 400)] }));
        assert.deepEqual(dive.samples.map(s => s.t), [0, 10, 11]);
        assert.ok(dive.warnings.includes('time-backstep:1'));
    });
});

describe('parseDivesoftDLF: errors and inputs', () => {
    test('a truncated file throws DlfFormatError', () => {
        assert.throws(() => parseDivesoftDLF(fixtureBytes('00000101').subarray(0, 20)), DlfFormatError);
        assert.throws(() => parseDivesoftDLF(new Uint8Array(2)), DlfFormatError);
    });

    test('a file with the wrong magic throws DlfFormatError', () => {
        const bytes = fixtureBytes('00000101');
        bytes[0] = 0;
        assert.throws(() => parseDivesoftDLF(bytes), DlfFormatError);
    });

    test('a large time backstep throws DlfFormatError', () => {
        const bytes = buildDlf({ records: [point(0, 100), point(60, 200), point(20, 300)] });
        assert.throws(() => parseDivesoftDLF(bytes), DlfFormatError);
    });

    test('accepts an ArrayBuffer (browser File.arrayBuffer())', () => {
        const bytes = fixtureBytes('00000100');
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        assert.equal(parseDivesoftDLF(buffer).samples.length, EXPECTED['00000100'].sampleCount);
    });

    test('accepts a Uint8Array view with a non-zero byteOffset', () => {
        const bytes = fixtureBytes('00000100');
        const padded = new Uint8Array(bytes.length + 7);
        padded.set(bytes, 7);
        const dive = parseDivesoftDLF(padded.subarray(7));
        assert.equal(dive.samples.length, EXPECTED['00000100'].sampleCount);
        assert.equal(dive.maxDepth, EXPECTED['00000100'].maxDepth);
    });
});

describe('parseDivesoftDLF: synthetic layouts', () => {
    test('reads a version 2 header with a UTC offset', () => {
        const dive = parseDivesoftDLF(buildDlf({ version: 2, records: [point(0, 250)] }));
        assert.equal(dive.source.formatVersion, 2);
        assert.equal(dive.duration, 600);
        assert.equal(dive.maxDepth, 10);
        assert.equal(dive.minTemp, 15);
        assert.equal(dive.mode, 'oc');
        assert.equal(dive.start.utcOffsetMin, 120);
        const expectedLocal = new Date(Date.UTC(2000, 0, 1) + (SYNTH_START + 120 * 60) * 1000).toISOString().slice(0, 19);
        assert.equal(dive.start.local, expectedLocal);
        assert.deepEqual(dive.warnings, []);
    });

    test('a mid-dive gas switch adds a second gas', () => {
        const dive = parseDivesoftDLF(buildDlf({
            records: [gasSwitch(0, 21), point(0, 100), point(60, 2100), gasSwitch(120, 50), point(120, 2100), point(180, 600)],
        }));
        assert.deepEqual(dive.gases, [
            { id: 'g0', o2: 0.21, he: 0, n2: 0.79, role: 'oc' },
            { id: 'g1', o2: 0.5, he: 0, n2: 0.5, role: 'oc' },
        ]);
        assert.deepEqual(dive.events, [
            { t: 0, type: 'gasSwitch', gasId: 'g0' },
            { t: 120, type: 'gasSwitch', gasId: 'g1' },
        ]);
    });

    test('unknown record types and event codes are skipped silently', () => {
        const dive = parseDivesoftDLF(buildDlf({
            records: [point(0, 100), { type: 0xa, t: 5 }, { type: 1, t: 6, u16: { 4: 99 } }, { type: 8, t: 7 }, point(10, 200)],
        }));
        assert.deepEqual(dive.events, []);
        assert.deepEqual(dive.warnings, []);
        assert.equal(dive.samples.length, 2);
    });

    test('all-0xFF padding records are skipped', () => {
        const bytes = buildDlf({ records: [point(0, 100), point(1, 200)] });
        bytes.fill(0xff, 32 + 16, 32 + 32);
        const dive = parseDivesoftDLF(bytes);
        assert.deepEqual(dive.samples.map(s => s.t), [0]);
        assert.deepEqual(dive.warnings, []);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/divesoft-dlf.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/import/divesoftDlf.js`.

- [ ] **Step 3: Implement the parser**

Create `js/import/divesoftDlf.js`:

```js
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
    const header = readHeader(view, version);

    const device = { vendor: 'Divesoft', model: null, serial: null, firmware: null, hardware: null };
    const deco = { model: null, gfLow: null, gfHigh: null, gfAlt: null };
    let waterSetting = null;

    const gases = [];
    const addGas = (o2Pct, hePct, role) => {
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
                const text = String.fromCharCode(...bytes.subarray(offset + 4, offset + 16));
                device.serial = `${text.slice(0, 4)}-${text.slice(4)}`;
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
                events.push({ t, type: 'gasSwitch', gasId: gas.id });
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/divesoft-dlf.test.mjs`
Expected: all tests PASS. If a fixture value differs, re-read the format reference and the test; do **not** edit `expected.json`.

- [ ] **Step 5: Add the suite to `npm test`**

In `package.json`, change the `test` script to:

```json
"test": "node tests/run-tests.mjs && node --test tests/divesoft-dlf.test.mjs",
```

Run: `npm test`
Expected: `📊 Test Results: 623/623 passed`, then the node:test summary with `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add js/import/divesoftDlf.js tests/divesoft-dlf.test.mjs package.json
git commit -m "feat(import): parse Divesoft DLF dive logs into a RecordedDive"
```

---

### Task 2: RecordedDive → DiveSetup

**Files:**
- Create: `js/import/recordedDive.js`
- Modify: `tests/divesoft-dlf.test.mjs` (append imports and a new `describe` block)

**Interfaces:**
- Consumes: `parseDivesoftDLF` from Task 1, and existing engine functions:
  - `getDiveSetupWaypoints(setup)`, `getDiveSetupSurfacePressure(setup)`, `getDiveSetupPressurePerMeter(setup)` from `js/diveSetup.js`
  - `calculateTissueLoading(waypoints, surfaceInterval, { gases, surfacePressure, pressurePerMeter })` from `js/deco/profile.js` (waypoint `time` in minutes)
  - `calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh)` from `js/deco/ceiling.js` (GF as 0–1), returning `{ ceilingDepths }` aligned with `results.timePoints` (minutes)
- Produces:
  - `export function gasName(gas: { o2, he }): string`
  - `export function toDiveSetup(dive: RecordedDive): DiveSetup` with `{ name, description, gases[{id,name,o2,n2,he}], gfLow, gfHigh, surfaceInterval: 0, environment: { surfacePressure?, waterDensity? }, dives: [{ waypoints: [{ time, depth, gasId? }] }] }`

- [ ] **Step 1: Write the failing tests**

Add these imports at the top of `tests/divesoft-dlf.test.mjs`, after the existing imports:

```js
import { toDiveSetup, gasName } from '../js/import/recordedDive.js';
import {
    getDiveSetupWaypoints,
    getDiveSetupSurfacePressure,
    getDiveSetupPressurePerMeter,
} from '../js/diveSetup.js';
import { calculateTissueLoading } from '../js/deco/profile.js';
import { calculateCeilingTimeSeriesDetailed } from '../js/deco/ceiling.js';
```

Append at the end of the file:

```js
describe('toDiveSetup', () => {
    test('gas names follow DecoTheory conventions', () => {
        assert.equal(gasName({ o2: 0.21, he: 0 }), 'Air');
        assert.equal(gasName({ o2: 0.32, he: 0 }), 'EAN32');
        assert.equal(gasName({ o2: 1, he: 0 }), 'O₂ 100%');
        assert.equal(gasName({ o2: 0.18, he: 0.45 }), 'Tx 18/45');
    });

    test('converts a recorded dive into a DiveSetup', () => {
        const dive = loadDive('00000100');
        const setup = toDiveSetup(dive);
        assert.equal(setup.name, 'Divesoft #100 · 2026-09-27');
        assert.equal(setup.description, 'Imported from 00000100.DLF');
        assert.deepEqual(setup.gases, [{ id: 'g0', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }]);
        assert.equal(setup.gfLow, 60);
        assert.equal(setup.gfHigh, 90);
        assert.equal(setup.surfaceInterval, 0);
        assert.deepEqual(setup.environment, { surfacePressure: dive.environment.surfacePressure, waterDensity: 1028 });
        const { waypoints } = setup.dives[0];
        assert.equal(waypoints.length, dive.samples.length + 1);
        assert.deepEqual(waypoints[0], { time: 0, depth: 0 });
        assert.deepEqual(waypoints[1], { time: 0, depth: dive.samples[0].depth, gasId: 'g0' });
        assert.equal(waypoints.at(-1).time, dive.samples.at(-1).t / 60);
    });

    test('the engine reads the setup with the recorded surface pressure and water density', () => {
        const setup = toDiveSetup(loadDive('00000100'));
        assert.ok(Math.abs(getDiveSetupSurfacePressure(setup) - 0.9816) < 1e-9);
        assert.ok(Math.abs(getDiveSetupPressurePerMeter(setup) - 1028 * 9.80665 / 1e5) < 1e-9);
        assert.equal(getDiveSetupWaypoints(setup).length, setup.dives[0].waypoints.length);
    });

    test('replaying dive #100 reproduces the computer ceiling', () => {
        const dive = loadDive('00000100');
        const setup = toDiveSetup(dive);
        const results = calculateTissueLoading(getDiveSetupWaypoints(setup), setup.surfaceInterval, {
            gases: setup.gases,
            surfacePressure: getDiveSetupSurfacePressure(setup),
            pressurePerMeter: getDiveSetupPressurePerMeter(setup),
        });
        const { ceilingDepths } = calculateCeilingTimeSeriesDetailed(results, setup.gfLow / 100, setup.gfHigh / 100);

        const devicePeak = Math.max(...dive.samples.map(s => s.ceiling ?? 0));
        const enginePeak = Math.max(...ceilingDepths);
        assert.equal(devicePeak, 3.1);
        assert.ok(Math.abs(enginePeak - devicePeak) <= 1.2, `engine peak ${enginePeak} m vs device ${devicePeak} m`);

        const deviceDecoStart = dive.samples.find(s => s.ceiling > 0).t;
        const engineDecoStart = results.timePoints[ceilingDepths.findIndex(c => c > 0.05)] * 60;
        assert.ok(Math.abs(engineDecoStart - deviceDecoStart) <= 90, `engine ${engineDecoStart} s vs device ${deviceDecoStart} s`);
    });

    test('a gas switch is carried onto the waypoint at the switch time', () => {
        const dive = parseDivesoftDLF(buildDlf({
            records: [gasSwitch(0, 21), point(0, 100), point(60, 2100), gasSwitch(120, 50), point(120, 2100), point(180, 600)],
        }));
        const setup = toDiveSetup(dive);
        assert.deepEqual(setup.gases.map(g => g.name), ['Air', 'EAN50']);
        assert.deepEqual(setup.dives[0].waypoints, [
            { time: 0, depth: 0 },
            { time: 0, depth: 1, gasId: 'g0' },
            { time: 1, depth: 21 },
            { time: 2, depth: 21, gasId: 'g1' },
            { time: 3, depth: 6 },
        ]);
    });

    test('a header-only dive converts without crashing', () => {
        const setup = toDiveSetup(parseDivesoftDLF(buildDlf()));
        assert.deepEqual(setup.dives[0].waypoints, [{ time: 0, depth: 0 }]);
        assert.equal(setup.gfLow, 100);
        assert.equal(setup.gfHigh, 100);
        assert.deepEqual(setup.environment, { surfacePressure: 1.0132 });
        assert.equal(setup.name, 'Divesoft dive · 2026-06-28');
    });
});
```

Note on the last test: `SYNTH_START` (836000000 s after 2000-01-01) is 2026-06-28T22:13:20 (verified).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/divesoft-dlf.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `js/import/recordedDive.js`.

- [ ] **Step 3: Implement the adapter**

Create `js/import/recordedDive.js`:

```js
/**
 * RecordedDive helpers.
 *
 * A RecordedDive is the brand-neutral record of a dive downloaded from a dive
 * computer (see docs/superpowers/specs/2026-10-05-divesoft-dlf-import-design.md).
 * toDiveSetup() converts it into the DiveSetup shape the rest of DecoTheory
 * already understands, so recorded dives can be replayed by the engine.
 */

/**
 * Display name for a gas mix, following DecoTheory's naming.
 *
 * @param {{o2: number, he: number}} gas - Fractions 0–1
 * @returns {string} e.g. 'Air', 'EAN32', 'O₂ 100%', 'Tx 18/45'
 */
export function gasName({ o2, he }) {
    const o2Pct = Math.round(o2 * 100);
    const hePct = Math.round(he * 100);
    if (hePct > 0) return `Tx ${o2Pct}/${hePct}`;
    if (o2Pct === 21) return 'Air';
    if (o2Pct === 100) return 'O₂ 100%';
    return `EAN${o2Pct}`;
}

/**
 * Convert a RecordedDive into a DiveSetup.
 *
 * Samples become waypoints (time in minutes). Each gas switch sets `gasId` on
 * the first waypoint at or after the switch time. A surface waypoint at time 0
 * frames the profile when the first sample is not at the surface.
 *
 * @param {Object} dive - RecordedDive
 * @returns {Object} DiveSetup
 */
export function toDiveSetup(dive) {
    const label = dive.source?.diveNumber != null ? `#${dive.source.diveNumber}` : 'dive';
    const date = dive.start?.local?.slice(0, 10) ?? 'unknown date';

    const waypoints = [];
    if (dive.samples.length === 0 || dive.samples[0].depth > 0) waypoints.push({ time: 0, depth: 0 });
    const gasSwitches = dive.events.filter(e => e.type === 'gasSwitch');
    let nextSwitch = 0;
    for (const sample of dive.samples) {
        const waypoint = { time: sample.t / 60, depth: sample.depth };
        while (nextSwitch < gasSwitches.length && gasSwitches[nextSwitch].t <= sample.t) {
            waypoint.gasId = gasSwitches[nextSwitch++].gasId;
        }
        waypoints.push(waypoint);
    }

    const environment = {};
    if (Number.isFinite(dive.environment?.surfacePressure)) environment.surfacePressure = dive.environment.surfacePressure;
    if (Number.isFinite(dive.environment?.waterDensity)) environment.waterDensity = dive.environment.waterDensity;

    return {
        name: `Divesoft ${label} · ${date}`,
        description: `Imported from ${dive.source?.fileName ?? 'a Divesoft dive log'}`,
        gases: dive.gases.map(g => ({ id: g.id, name: gasName(g), o2: g.o2, n2: g.n2, he: g.he })),
        gfLow: dive.deco?.gfLow ?? 100,
        gfHigh: dive.deco?.gfHigh ?? 100,
        surfaceInterval: 0,
        environment,
        dives: [{ waypoints }],
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/divesoft-dlf.test.mjs`
Expected: all tests PASS.

Then run: `npm test`
Expected: `623/623 passed` and `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/import/recordedDive.js tests/divesoft-dlf.test.mjs
git commit -m "feat(import): convert a RecordedDive into a DiveSetup for the engine"
```
