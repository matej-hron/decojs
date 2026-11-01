import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { downloadDives, parseDive, libdcVersion, MARES_MODELS, LibdcError } from '../js/import/libdc.js';
import { mapMaresDive, readMaresExtras, MARES_FORMAT } from '../js/import/maresDive.js';
import { BleSerial } from '../js/import/bleSerial.js';
import { toDiveSetup } from '../js/import/recordedDive.js';
import { buildGeniusDive, fingerprintOf, FakeQuad2 } from './helpers/maresFake.mjs';

/** 40 samples: down to 20 m, a 3 m stop, back up, then the surface timeout tail at 0 m. */
function sampleDive({ day = 12, hour = 10, minute = 30, gases = [{ o2: 32 }] } = {}) {
    const samples = [];
    for (let i = 0; i < 4; i++) samples.push({ depth: 5 * (i + 1), temp: 19 - i, ndl: 40 });
    for (let i = 0; i < 20; i++) samples.push({ depth: 20, temp: 15, ndl: 30 - i, gas: 0 });
    for (let i = 0; i < 4; i++) samples.push({ depth: 3, temp: 17, stopDepth: 3, stopTime: 2, gas: gases.length > 1 ? 1 : 0 });
    for (let i = 0; i < 4; i++) samples.push({ depth: 2 - i * 0.5, temp: 18, ndl: 99, gas: gases.length > 1 ? 1 : 0 });
    for (let i = 0; i < 36; i++) samples.push({ depth: 0, temp: 19, ndl: 99, gas: gases.length > 1 ? 1 : 0 });
    return buildGeniusDive({ date: { year: 2026, month: 10, day, hour, minute }, gases, samples, surfaceMin: 3 });
}

describe('libdivecomputer WebAssembly module', () => {
    it('loads in Node and reports the pinned upstream revision', async () => {
        assert.match(await libdcVersion(), /^0\.10\.0-devel \(9e6c3c832856\)$/);
    });

    it('parses a Genius-format dive into fields and 5 s samples', async () => {
        const rec = await parseDive(sampleDive());
        assert.equal(rec.status, 0);
        assert.deepEqual(rec.datetime, { year: 2026, month: 10, day: 12, seconds: 10 * 3600 + 30 * 60, timezone: rec.datetime.timezone });
        assert.equal(rec.fields.maxdepth, 20);
        assert.equal(rec.fields.divetime, 68 * 5 - 180);
        assert.equal(rec.gasmixes.length, 1);
        assert.equal(rec.gasmixes[0].o2, 0.32);
        assert.equal(rec.samples.length, 68);
        assert.equal(rec.samples[0].t, 5);
        assert.equal(rec.samples[24].deco.depth, 3);
    });

    it('reports a damaged dive as a non-zero status instead of throwing', async () => {
        const bytes = sampleDive();
        bytes[bytes.length - 20] ^= 0xff; // breaks the last record's checksum
        const rec = await parseDive(bytes);
        assert.equal(rec.status, -9);
    });
});

describe('mapMaresDive', () => {
    it('produces a RecordedDive the logbook and engine understand', async () => {
        const dive = mapMaresDive(await parseDive(sampleDive()), { serial: 123456, model: MARES_MODELS.QUAD2, fingerprint: 'aabbccdd', now: Date.UTC(2026, 10, 1) });
        assert.equal(dive.source.format, MARES_FORMAT);
        assert.equal(dive.source.fileName, 'Quad2-aabbccdd.bin');
        assert.deepEqual(dive.device, { vendor: 'Mares', model: 'Quad 2', serial: '123456', firmware: null, hardware: null });
        assert.deepEqual(dive.start, { local: '2026-10-12T10:30:00', utcOffsetMin: null });
        assert.equal(dive.duration, 160);
        assert.equal(dive.maxDepth, 20);
        assert.equal(dive.minTemp, 15);
        assert.equal(dive.mode, 'oc');
        assert.deepEqual(dive.environment, { surfacePressure: 1.013, waterDensity: 1028, waterSetting: 'salt' });
        assert.deepEqual(dive.gases, [{ id: 'g0', o2: 0.32, he: 0, n2: 0.68, role: 'oc' }]);
        assert.deepEqual(dive.events, [{ t: 0, type: 'gasSwitch', gasId: 'g0' }]);
        assert.deepEqual(dive.warnings, []);
    });

    it('keeps NDL and the stop depth as ceiling, in the units of the Divesoft import', async () => {
        const dive = mapMaresDive(await parseDive(sampleDive()));
        assert.deepEqual(dive.samples[0], { t: 5, depth: 5, temp: 19, ndl: 40, tts: 0, ceiling: 0 });
        assert.deepEqual(dive.samples[24], { t: 125, depth: 3, temp: 17, ndl: 0, tts: 0, ceiling: 3 });
    });

    it('drops the surface-timeout tail but ends the profile at 0 m', async () => {
        const dive = mapMaresDive(await parseDive(sampleDive()));
        assert.equal(dive.samples.length, 33);
        assert.equal(dive.samples.at(-1).depth, 0);
        assert.ok(dive.samples.at(-2).depth > 0);
    });

    it('records gas switches and converts to a DiveSetup', async () => {
        const dive = mapMaresDive(await parseDive(sampleDive({ gases: [{ o2: 21 }, { o2: 50 }] })));
        assert.deepEqual(dive.gases.map(g => g.o2), [0.21, 0.5]);
        assert.deepEqual(dive.events.map(e => [e.t, e.gasId]), [[0, 'g0'], [125, 'g1']]);
        const setup = toDiveSetup(dive);
        assert.deepEqual(setup.gases.map(g => g.name), ['Air', 'EAN50']);
        assert.equal(setup.dives[0].waypoints.find(w => w.gasId === 'g1').time, 125 / 60);
        assert.equal(setup.environment.waterDensity, 1.028);
    });

    it('reads the Quad 2 GF setting and dive number that libdivecomputer does not decode', async () => {
        const bytes = buildGeniusDive({ date: { year: 2026, month: 10, day: 26, hour: 17, minute: 0 }, gases: [{ o2: 21 }],
            samples: [{ depth: 5 }, { depth: 0 }], gf: [70, 80], number: 3 });
        assert.deepEqual(readMaresExtras(bytes), { gfLow: 70, gfHigh: 80, diveNumber: 3 });
        const dive = mapMaresDive(await parseDive(bytes), { model: MARES_MODELS.QUAD2, data: bytes });
        assert.deepEqual(dive.deco, { model: 'buhlmann', gfLow: 70, gfHigh: 80, gfAlt: null });
        assert.equal(dive.source.diveNumber, 3);
        assert.equal(toDiveSetup(dive).gfLow, 70);
    });

    it('leaves the deco model unknown without the bytes or for models not verified', async () => {
        const bytes = sampleDive();
        assert.deepEqual(mapMaresDive(await parseDive(bytes)).deco, { model: null, gfLow: null, gfHigh: null, gfAlt: null });
        assert.equal(mapMaresDive(await parseDive(bytes), { model: MARES_MODELS.SIRIUS, data: bytes }).deco.model, null);
    });

    it('ignores an implausible GF word', () => {
        const bytes = sampleDive();
        new DataView(bytes.buffer).setUint16(0x14, 90 | (40 << 7), true); // low > high
        assert.deepEqual([readMaresExtras(bytes).gfLow, readMaresExtras(bytes).gfHigh], [null, null]);
        assert.deepEqual(readMaresExtras(new Uint8Array(10)), { gfLow: null, gfHigh: null, diveNumber: null });
    });

    it('maps fresh and EN 13319 water', async () => {
        const base = await parseDive(sampleDive());
        assert.equal(mapMaresDive({ ...base, fields: { ...base.fields, salinity: { type: 0, density: 0 } } }).environment.waterSetting, 'fresh');
        const en = mapMaresDive({ ...base, fields: { ...base.fields, salinity: { type: 1, density: 1019.716 } } }).environment;
        assert.deepEqual([en.waterSetting, en.waterDensity], ['en13319', 1019.7]);
    });

    it('flags a dive with no date or a date in the future', () => {
        const empty = mapMaresDive({ fields: {}, gasmixes: [], samples: [], datetime: null });
        assert.ok(empty.warnings.includes('no-date'));
        assert.ok(empty.warnings.includes('no-samples'));
        const future = mapMaresDive({ fields: {}, gasmixes: [], samples: [], datetime: { year: 2030, month: 1, day: 1, seconds: 0 } }, { now: Date.UTC(2026, 10, 1) });
        assert.ok(future.warnings.includes('implausible-date'));
    });
});

describe('downloadDives over a fake Quad 2', () => {
    const newest = sampleDive({ day: 14 });
    const older = sampleDive({ day: 12 });

    it('downloads every dive newest first with serial and fingerprints', async () => {
        const fake = new FakeQuad2({ dives: [newest, older], serial: '004321' });
        let progress = 0;
        const out = await downloadDives(fake, { onProgress: f => { progress = f; } });
        assert.equal(out.serial, 4321);
        assert.equal(out.model, MARES_MODELS.QUAD2);
        assert.equal(out.dives.length, 2);
        assert.deepEqual(out.dives.map(d => d.fingerprint), [fingerprintOf(newest), fingerprintOf(older)]);
        assert.deepEqual(Array.from(out.dives[0].data), Array.from(newest));
        assert.equal(progress, 1);
        assert.equal(new TextDecoder().decode(out.version.subarray(0x46, 0x4b)), 'Quad2');
    });

    it('works with small BLE packets too (many segments per dive)', async () => {
        const out = await downloadDives(new FakeQuad2({ dives: [newest], maxPacket: 23 }));
        assert.deepEqual(Array.from(out.dives[0].data), Array.from(newest));
    });

    it('stops at the last dive already downloaded (fingerprint per serial)', async () => {
        const asked = [];
        const fp = serial => { asked.push(serial); return fingerprintOf(older); };
        const out = await downloadDives(new FakeQuad2({ dives: [newest, older] }), { fingerprintFor: fp });
        assert.deepEqual(asked, [123456]);
        assert.equal(out.dives.length, 1);
        const none = await downloadDives(new FakeQuad2({ dives: [newest, older] }), { fingerprintFor: () => fingerprintOf(newest) });
        assert.equal(none.dives.length, 0);
    });

    it('turns a lost connection into the transport error, not a hang', async () => {
        await assert.rejects(downloadDives(new FakeQuad2({ dives: [newest], failAfterWrites: 3 })), e => e.kind === 'disconnected');
    });

    it('can be cancelled between dives', async () => {
        let n = 0;
        const fake = new FakeQuad2({ dives: [newest, older] });
        const realWrite = fake.write.bind(fake);
        fake.write = async b => { n++; return realWrite(b); };
        let stop = false;
        const run = downloadDives(fake, { cancelled: () => stop });
        stop = true;
        await assert.rejects(run, e => e instanceof LibdcError && e.kind === 'cancelled');
        assert.ok(n < 10);
    });
});

describe('BleSerial packet queue', () => {
    const device = () => ({ addEventListener() {}, removeEventListener() {}, gatt: { connected: false } });

    it('hands out one notification per read and keeps the rest of a long one', async () => {
        const s = new BleSerial(device());
        s._push(Uint8Array.of(1, 2, 3));
        s._push(Uint8Array.of(4));
        assert.deepEqual(Array.from(await s.read(2, 10)), [1, 2]);
        assert.deepEqual(Array.from(await s.read(10, 10)), [3]);
        assert.deepEqual(Array.from(await s.read(10, 10)), [4]);
    });

    it('waits for a notification and times out with kind "timeout"', async () => {
        const s = new BleSerial(device());
        setTimeout(() => s._push(Uint8Array.of(9)), 5);
        assert.deepEqual(Array.from(await s.read(4, 1000)), [9]);
        await assert.rejects(s.read(4, 10), e => e.kind === 'timeout');
    });

    it('fails fast once the computer disconnects', async () => {
        const s = new BleSerial(device());
        const pending = s.read(4, 5000);
        s._onDisconnect();
        await assert.rejects(pending, e => e.kind === 'disconnected');
        s.purge();
    });
});
