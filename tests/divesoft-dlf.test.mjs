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
import { toDiveSetup, gasName } from '../js/import/recordedDive.js';
import {
    getDiveSetupWaypoints,
    getDiveSetupSurfacePressure,
    getDiveSetupPressurePerMeter,
} from '../js/diveSetup.js';
import { calculateTissueLoading } from '../js/deco/profile.js';
import { calculateCeilingTimeSeriesDetailed } from '../js/deco/ceiling.js';

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

    test('a gas of 0% O₂ or over 100% total creates no gas and no event', () => {
        const modeChange = { type: 1, t: 5, u16: { 4: 24 }, u8: { 6: 0, 7: 0, 8: 5 } };
        const dive = parseDivesoftDLF(buildDlf({ records: [point(0, 100), modeChange, gasSwitch(10, 80, 30), point(20, 200)] }));
        assert.deepEqual(dive.gases, [{ id: 'g0', o2: 0.21, he: 0, n2: 0.79, role: 'oc' }]);
        assert.deepEqual(dive.events, []);
    });

    test('serial number drops NUL padding', () => {
        const chars = [...'12345678'].map(c => c.charCodeAt(0));
        const u8 = Object.fromEntries(chars.map((c, i) => [4 + i, c]));
        const dive = parseDivesoftDLF(buildDlf({ records: [{ type: 6, t: 0, sub: 3, u8 }, point(0, 100)] }));
        assert.equal(dive.device.serial, '12345678');
    });

    test('a file cut mid-record warns trailing-bytes', () => {
        const full = fixtureBytes('00000101');
        const dive = parseDivesoftDLF(full.subarray(0, full.length - 5));
        const whole = parseDivesoftDLF(full);
        assert.ok(dive.warnings.includes('trailing-bytes'));
        assert.ok(dive.samples.length <= whole.samples.length);
    });

    test('all-0xFF padding records are skipped', () => {
        const bytes = buildDlf({ records: [point(0, 100), point(1, 200)] });
        bytes.fill(0xff, 32 + 16, 32 + 32);
        const dive = parseDivesoftDLF(bytes);
        assert.deepEqual(dive.samples.map(s => s.t), [0]);
        assert.deepEqual(dive.warnings, []);
    });
});

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
        assert.deepEqual(setup.environment, { surfacePressure: dive.environment.surfacePressure, waterDensity: 1.028 });
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

    test('vendor and file name come from the recorded dive, not a hard-coded brand', () => {
        const dive = parseDivesoftDLF(buildDlf({ records: [point(0, 100)] }));
        dive.device.vendor = 'Acme';
        dive.source = { diveNumber: 7 };
        const setup = toDiveSetup(dive);
        assert.match(setup.name, /^Acme #7 · \d{4}-\d{2}-\d{2}$/);
        assert.equal(setup.description, 'Imported from a dive log');
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
