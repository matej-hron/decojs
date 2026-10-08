/**
 * Recorded dive analysis tests (thinning, setup preparation, summary, chart overlays, page helpers).
 * Run: node --test tests/recorded-dive.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF } from '../js/import/divesoftDlf.js';
import { toDiveSetup, prepareRecordedSetup, THIN_TOLERANCE_M } from '../js/import/recordedDive.js';
import { thinProfile } from '../js/import/thinProfile.js';
import { analyzeRecordedDive, summarizeRecordedDive, CEILING_VIOLATION_TOLERANCE_M, DECO_CEILING_THRESHOLD_M } from '../js/import/recordedDiveSummary.js';
import { DiveProfileChart } from '../js/charts/DiveProfileChart.js';
import { isDlfFileName, loadDiveFiles, fetchDemoFiles, clampGfPair, deviceGf, canAnalyze, CHART_VIEWS, chartViewOptions, describeStart, carriedOverOptions } from '../js/components/RecordedDiveAnalysis.js';
import { getPressurePerMeter } from '../js/deco/environment.js';
import { DEFAULT_DIVE_PROFILE_OPTIONS, mergeOptions, normalizeDiveSetup } from '../js/charts/chartTypes.js';
import { matchEntryGases, recordedGasSetup, ASSUMED_SAC_LPM } from '../js/import/recordedGas.js';
import { computeGasConsumption } from '../js/diveSetup.js';
import { calculateTissueLoading } from '../js/deco/profile.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);

function loadDive(id) {
    return parseDivesoftDLF(new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES))), { fileName: `${id}.DLF` });
}

/** Depth of a polyline at time t (minutes), by linear interpolation. */
function depthAt(waypoints, t) {
    for (let i = 1; i < waypoints.length; i++) {
        const a = waypoints[i - 1];
        const b = waypoints[i];
        if (t <= b.time) {
            if (b.time === a.time) return b.depth;
            return a.depth + (t - a.time) / (b.time - a.time) * (b.depth - a.depth);
        }
    }
    return waypoints.at(-1).depth;
}

describe('thinProfile', () => {
    const full = toDiveSetup(loadDive('00000100')).dives[0].waypoints;
    const thin = thinProfile(full, 0.1);

    test('reduces a recorded dive to a chart-friendly size', () => {
        assert.equal(full.length, 683);
        assert.ok(thin.length >= 60 && thin.length <= 200, `${thin.length} waypoints`);
    });

    test('never deviates more than the tolerance from the original', () => {
        const kept = new Set(thin);
        for (const wp of full) {
            if (kept.has(wp)) continue; // kept waypoints are exact by construction; depthAt is ambiguous at duplicate times (t = 0)
            const dev = Math.abs(depthAt(thin, wp.time) - wp.depth);
            assert.ok(dev <= 0.1 + 1e-9, `deviation ${dev} m at ${wp.time} min`);
        }
    });

    test('keeps endpoints, the deepest point and gas-switch waypoints', () => {
        assert.equal(thin[0], full[0]);
        assert.equal(thin.at(-1), full.at(-1));
        const deepest = full.reduce((a, b) => (b.depth > a.depth ? b : a));
        assert.ok(thin.includes(deepest));
        for (const wp of full.filter(w => w.gasId)) assert.ok(thin.includes(wp));
    });

    test('keeps order and returns the same objects', () => {
        for (let i = 1; i < thin.length; i++) assert.ok(thin[i].time >= thin[i - 1].time);
        for (const wp of thin) assert.ok(full.includes(wp));
    });

    test('is idempotent', () => {
        assert.deepEqual(thinProfile(thin, 0.1), thin);
    });

    test('short inputs come back unchanged (as a copy)', () => {
        const two = [{ time: 0, depth: 0 }, { time: 1, depth: 5 }];
        const out = thinProfile(two, 0.1);
        assert.deepEqual(out, two);
        assert.notEqual(out, two);
        assert.deepEqual(thinProfile([], 0.1), []);
    });

    test('a straight line collapses to its endpoints', () => {
        const line = Array.from({ length: 11 }, (_, i) => ({ time: i, depth: i * 2 }));
        assert.deepEqual(thinProfile(line, 0.1), [line[0], line[10]]);
    });
});

describe('prepareRecordedSetup', () => {
    test('thins the profile and keeps the device GF by default', () => {
        const dive = loadDive('00000100');
        const { setup, samples } = prepareRecordedSetup(dive);
        assert.equal(THIN_TOLERANCE_M, 0.1);
        assert.equal(setup.gfLow, 60);
        assert.equal(setup.gfHigh, 90);
        const n = setup.dives[0].waypoints.length;
        assert.ok(n >= 60 && n <= 200, `${n} waypoints`);
        assert.equal(samples, dive.samples);
    });

    test('overrides GF without touching the dive', () => {
        const dive = loadDive('00000100');
        const { setup } = prepareRecordedSetup(dive, { gfLow: 30, gfHigh: 70 });
        assert.equal(setup.gfLow, 30);
        assert.equal(setup.gfHigh, 70);
        assert.equal(dive.deco.gfLow, 60);
    });

    test('exposes the logged ceiling in minutes at full resolution', () => {
        const dive = loadDive('00000100');
        const { deviceCeiling } = prepareRecordedSetup(dive);
        assert.equal(deviceCeiling.length, dive.samples.length);
        const peak = deviceCeiling.reduce((a, b) => (b.depth > a.depth ? b : a));
        assert.equal(peak.depth, 3.1);
        const sample = dive.samples.find(s => s.ceiling === 3.1);
        assert.equal(peak.t, sample.t / 60);
    });

    test('a dive without device GF or samples does not throw', () => {
        const dive = loadDive('00000101');
        const bare = { ...dive, deco: { model: null, gfLow: null, gfHigh: null, gfAlt: null }, samples: [], events: [] };
        const { setup, deviceCeiling } = prepareRecordedSetup(bare);
        assert.equal(setup.gfLow, 100);
        assert.equal(setup.gfHigh, 100);
        assert.deepEqual(deviceCeiling, []);
        assert.deepEqual(setup.dives[0].waypoints, [{ time: 0, depth: 0 }]);
    });
});

describe('analyzeRecordedDive / summarizeRecordedDive', () => {
    const dive = loadDive('00000100');
    const summaryAt = (gfLow, gfHigh) =>
        summarizeRecordedDive(analyzeRecordedDive(prepareRecordedSetup(dive, { gfLow, gfHigh }).setup));

    test('exports the agreed tolerances', () => {
        assert.equal(CEILING_VIOLATION_TOLERANCE_M, 0.1);
        assert.equal(DECO_CEILING_THRESHOLD_M, 0.05);
    });

    test('at the device GF 60/90 the dive stays within limits and has light deco', () => {
        const s = summaryAt(60, 90);
        assert.equal(s.aboveCeiling.seconds, 0);
        assert.equal(s.aboveCeiling.worstM, 0);
        assert.ok(s.deco, 'deco present');
        assert.ok(s.deco.maxCeiling > 1.5 && s.deco.maxCeiling < 3, `max ceiling ${s.deco.maxCeiling}`);
        assert.ok(s.deco.start < s.deco.end);
    });

    test('GF 30/70 deepens the ceiling but the recorded dive still clears it', () => {
        const strict = summaryAt(30, 70);
        const device = summaryAt(60, 90);
        assert.equal(strict.aboveCeiling.seconds, 0);
        assert.ok(strict.deco.maxCeiling > device.deco.maxCeiling + 5);
    });

    test('GF 20/50 puts part of the recorded dive above the ceiling', () => {
        const s = summaryAt(20, 50);
        assert.ok(s.aboveCeiling.seconds > 60, `${s.aboveCeiling.seconds} s`);
        assert.ok(s.aboveCeiling.worstM > 0.3, `${s.aboveCeiling.worstM} m`);
    });

    test('peak tissue GF does not depend on the GF setting', () => {
        const a = summaryAt(60, 90).peakGf;
        const b = summaryAt(20, 50).peakGf;
        assert.deepEqual(a, b);
        assert.ok(a.value > 0.3 && a.value < 1.2, `peak GF ${a.value}`);
        assert.ok(a.compartment >= 1 && a.compartment <= 16);
    });

    test('surface GF at the end is reported', () => {
        const s = summaryAt(60, 90);
        assert.ok(s.surfaceGfEnd);
        assert.ok(s.surfaceGfEnd.value > 0);
    });

    test('thinning does not move the peak ceiling by more than 0.1 m', () => {
        const thinned = analyzeRecordedDive(prepareRecordedSetup(dive).setup);
        const fullSetup = toDiveSetup(dive);
        const full = analyzeRecordedDive(fullSetup);
        const diff = Math.abs(Math.max(...thinned.ceilingDepths) - Math.max(...full.ceilingDepths));
        assert.ok(diff <= 0.1, `peak ceiling moved ${diff} m`);
    });

    test('a no-deco dive reports no deco and no violations', () => {
        const s = summarizeRecordedDive(analyzeRecordedDive(prepareRecordedSetup(loadDive('00000101')).setup));
        assert.equal(s.deco, null);
        assert.equal(s.aboveCeiling.seconds, 0);
    });
});

describe('DiveProfileChart recorded-dive overlays', () => {
    const results = { timePoints: [0, 1, 2, 3], depthPoints: [10, 5, 2, 0] };
    const ceilingDepths = [0, 3, 3, 0.05];
    const build = (options) =>
        DiveProfileChart.prototype._buildRecordedOverlayDatasets.call(
            { options: mergeOptions(DEFAULT_DIVE_PROFILE_OPTIONS, options) }, results, ceilingDepths);

    test('defaults leave existing charts unchanged', () => {
        assert.equal(DEFAULT_DIVE_PROFILE_OPTIONS.referenceCeiling, null);
        assert.equal(DEFAULT_DIVE_PROFILE_OPTIONS.highlightCeilingViolations, false);
        assert.deepEqual(build({}), []);
    });

    test('draws the reference ceiling as a dashed line on the depth axis', () => {
        const [ds] = build({ referenceCeiling: [{ t: 0, depth: 0 }, { t: 2, depth: 3.1 }], referenceCeilingLabel: 'Freedom ceiling' });
        assert.equal(ds.label, 'Freedom ceiling');
        assert.equal(ds.yAxisID, 'yDepth');
        assert.ok(Array.isArray(ds.borderDash));
        assert.equal(ds.fill, false);
    });

    test('resamples the reference ceiling onto the chart time points', () => {
        const [ds] = build({ referenceCeiling: [{ t: 0.5, depth: 0 }, { t: 2, depth: 3 }] });
        assert.deepEqual(ds.data.map(p => p.x), results.timePoints);
        // clamped before 0.5, linear between, clamped after 2
        assert.deepEqual(ds.data.map(p => p.y), [0, 1, 3, 3]);
    });

    test('an empty reference ceiling yields no dataset', () => {
        assert.deepEqual(build({ referenceCeiling: [] }), []);
    });

    test('marks the invisible fill helper so it can be hidden by flag', () => {
        const sets = build({ showCeiling: true, highlightCeilingViolations: true });
        assert.equal(sets[0].isOverlayHelper, undefined);
        assert.equal(sets[1].isOverlayHelper, true);
    });

    test('shades only where depth is shallower than ceiling minus the tolerance', () => {
        const sets = build({ showCeiling: true, highlightCeilingViolations: true });
        assert.equal(sets.length, 2);
        const [depthEdge, ceilingEdge] = sets;
        // t=1: depth 5, ceiling 3 -> fine; t=2: depth 2, ceiling 3 -> violation; t=3: 0 vs 0.05 -> within tolerance
        assert.deepEqual(depthEdge.data.map(p => p.y), [null, null, 2, null]);
        assert.deepEqual(ceilingEdge.data.map(p => p.y), [null, null, 3, null]);
        assert.equal(depthEdge.fill, '+1');
        assert.equal(depthEdge.spanGaps, false);
    });

    test('violation shading needs the ceiling to be shown', () => {
        assert.deepEqual(build({ showCeiling: false, highlightCeilingViolations: true }), []);
    });
});

describe('RecordedDiveAnalysis helpers', () => {
    const fakeFile = (name, bytes) => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    const fixture = id => new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES)));

    test('only .dlf files are dive logs', () => {
        assert.ok(isDlfFileName('00000100.DLF'));
        assert.ok(isDlfFileName('dive.dlf'));
        assert.ok(!isDlfFileName('SUMMARY.DSM'));
        assert.ok(!isDlfFileName('00019302.SSF'));
        assert.ok(!isDlfFileName('DLF'));
    });

    test('loads dive logs from a picked computer root folder and ignores everything else', async () => {
        const files = [
            fakeFile('SUMMARY.DSM', new Uint8Array(16)),
            fakeFile('00019302.SSF', new Uint8Array(256)),
            fakeFile('00000101.DLF', fixture('00000101')),
            fakeFile('00000100.DLF', fixture('00000100')),
        ];
        const { dives, errors } = await loadDiveFiles(files);
        assert.deepEqual(dives.map(d => d.source.diveNumber), [100, 101]);
        assert.deepEqual(errors, []);
    });

    test('a corrupt file is reported and the others still load', async () => {
        const broken = fixture('00000101');
        broken[0] = 0;
        const { dives, errors } = await loadDiveFiles([fakeFile('00000099.DLF', broken), fakeFile('00000100.DLF', fixture('00000100'))]);
        assert.equal(dives.length, 1);
        assert.equal(errors.length, 1);
        assert.equal(errors[0].fileName, '00000099.DLF');
        assert.ok(errors[0].message.length > 0);
    });

    test('GF pairs are clamped and never inverted', () => {
        assert.deepEqual(clampGfPair(60, 90), { gfLow: 60, gfHigh: 90 });
        assert.deepEqual(clampGfPair(95, 70), { gfLow: 95, gfHigh: 95 });
        assert.deepEqual(clampGfPair(0, 150), { gfLow: 10, gfHigh: 100 });
        assert.deepEqual(clampGfPair(33.6, 80.2), { gfLow: 34, gfHigh: 80 });
    });

    test('device GF falls back to 100/100', () => {
        assert.deepEqual(deviceGf(loadDive('00000100')), { gfLow: 60, gfHigh: 90 });
        assert.deepEqual(deviceGf({ deco: { gfLow: null, gfHigh: null } }), { gfLow: 100, gfHigh: 100 });
    });

    test('only open-circuit dives with samples can be analysed', () => {
        const dive = loadDive('00000100');
        assert.ok(canAnalyze(dive));
        assert.ok(!canAnalyze({ ...dive, mode: 'ccr' }));
        assert.ok(!canAnalyze({ ...dive, mode: 'gauge' }));
        assert.ok(!canAnalyze({ ...dive, samples: [] }));
    });
});

describe('recorded profile chart fixes', () => {
    test('showDecoStops=false suppresses stop labels; default keeps them', () => {
        const waypoints = [
            { time: 0, depth: 0 }, { time: 2, depth: 30 }, { time: 20, depth: 30 },
            { time: 23, depth: 6 }, { time: 26, depth: 6 }, { time: 28, depth: 0 },
        ];
        const run = options => {
            const self = { options, _addStopLabels: DiveProfileChart.prototype._addStopLabels };
            const annotations = {};
            DiveProfileChart.prototype._addStopLabelsIfEnabled.call(self, annotations, waypoints);
            return Object.keys(annotations).filter(k => k.startsWith('stopLabel'));
        };
        assert.equal(run({ showDecoStops: false }).length, 0);
        assert.ok(run({}).length > 0);
        assert.ok(run({ showDecoStops: true }).length > 0);
    });

    test('charts use the recorded water density, matching the summary', () => {
        const { setup } = prepareRecordedSetup(loadDive('00000100'), { gfLow: 60, gfHigh: 90 });
        const normalized = normalizeDiveSetup(setup);
        assert.equal(normalized.environment.waterType, undefined);
        assert.ok(Math.abs(getPressurePerMeter(normalized.environment) - 1028 * 9.80665 / 1e5) < 1e-9);
        const peak = analysis => Math.max(...analysis.ceilingDepths);
        const viaChart = peak(analyzeRecordedDive(normalized));
        const viaSummary = peak(analyzeRecordedDive(setup));
        assert.ok(Math.abs(viaChart - viaSummary) < 0.01);
        // Inputs without a recorded density keep the standard water type.
        assert.equal(normalizeDiveSetup({ dives: [], gases: [{ o2: 0.21, he: 0 }] }).environment.waterType, 'standard');
    });
});

describe('fetchDemoFiles', () => {
    test('fetches each url into a file-like object', async () => {
        const fetchStub = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(3) });
        const files = await fetchDemoFiles(['a/b/X.DLF'], fetchStub);
        assert.equal(files[0].name, 'X.DLF');
        assert.equal((await files[0].arrayBuffer()).byteLength, 3);
    });
    test('throws on a non-ok response', async () => {
        const fetchStub = async () => ({ ok: false, status: 404 });
        await assert.rejects(() => fetchDemoFiles(['a/X.DLF'], fetchStub), /404/);
    });
});

describe('recordedGas', () => {
    const air = { id: 'g0', name: 'Air', o2: 0.21, n2: 0.79, he: 0 };
    const ean50 = { id: 'g1', name: 'EAN50', o2: 0.5, n2: 0.5, he: 0 };
    const waypoints = [
        { time: 0, depth: 0 }, { time: 2, depth: 30, gasId: 'g0' }, { time: 20, depth: 30 },
        { time: 23, depth: 21, gasId: 'g1' }, { time: 30, depth: 6 }, { time: 40, depth: 6 }, { time: 41, depth: 0 },
    ];
    const results = calculateTissueLoading(waypoints, 0, { gases: [air, ean50] });
    const row = (o2, extra) => ({ role: 'bottom', o2, he: o2 === null ? null : 0, cylinder: null, volumeL: null, material: null, startBar: null, endBar: null, ...extra });

    test('matches by mix, then unknown-mix rows in order', () => {
        const rows = [row(0.5, { role: 'deco' }), row(null)];
        assert.deepEqual(matchEntryGases([air, ean50], rows), [rows[1], rows[0]]);
        assert.deepEqual(matchEntryGases([air], []), [null]);
        assert.deepEqual(matchEntryGases([air], [row(0.32)]), [null]);
    });

    test('calibrated gases end at the recorded end pressure', () => {
        const rows = [row(0.21, { volumeL: 12, startBar: 200, endBar: 90 }), row(0.5, { role: 'deco', volumeL: 5.7, startBar: 200, endBar: 160 })];
        const { gases, assumed } = recordedGasSetup([air, ean50], rows, results);
        assert.deepEqual(assumed, []);
        const gc = computeGasConsumption(results, gases, 99, 99, 50);
        assert.ok(Math.abs(gc.pressureByGasId.g0 - 90) < 1e-6);
        assert.ok(Math.abs(gc.pressureByGasId.g1 - 160) < 1e-6);
        assert.equal(gases[0].cylinderVolume, 12);
    });

    test('missing end pressure or volume falls back to assumed values', () => {
        const rows = [row(0.21, { volumeL: 15, startBar: 230 }), row(0.5, { role: 'deco', startBar: 200, endBar: 150 })];
        const { gases, assumed } = recordedGasSetup([air, ean50], rows, results);
        assert.equal(gases[0].cylinderVolume, 15);
        assert.equal(gases[0].startPressure, 230);
        assert.equal(gases[0].sacRate, ASSUMED_SAC_LPM);
        assert.equal(gases[1].cylinderVolume, 12);
        assert.deepEqual(assumed, ['Air', 'EAN50']);
        assert.deepEqual(recordedGasSetup([air, ean50], rows, results).assumedCylinder, ['EAN50']); // Air only lacks the end
    });

    test('end pressure equal to start is not calibrated; only the SAC is assumed', () => {
        const rows = [row(0.21, { volumeL: 12, startBar: 200, endBar: 200 }), row(0.5, { volumeL: 7, startBar: 200, endBar: 150 })];
        const { gases, assumed, assumedCylinder } = recordedGasSetup([air, ean50], rows, results);
        assert.equal(gases[0].sacRate, ASSUMED_SAC_LPM);
        assert.equal(gases[0].cylinderVolume, 12);
        assert.deepEqual(assumed, ['Air']);
        assert.deepEqual(assumedCylinder, []);
    });

    const o2 = { id: 'g2', name: 'O2', o2: 1, n2: 0, he: 0 };
    const airOnly = calculateTissueLoading([{ time: 0, depth: 0, gasId: 'g0' }, { time: 2, depth: 20, gasId: 'g0' }, { time: 30, depth: 20 }, { time: 32, depth: 0 }], 0, { gases: [air, o2] });

    test('a recorded gas never breathed is not reported as assumed', () => {
        const { assumed, assumedCylinder } = recordedGasSetup([air, o2], [row(0.21, { volumeL: 12, startBar: 200, endBar: 70 })], airOnly);
        assert.deepEqual(assumed, []);
        assert.deepEqual(assumedCylinder, []);
    });

    test('an unknown-mix row goes to the breathed gas, not an unused configured one', () => {
        // The integrator starts on gases[0], so the unused bottle sits between two breathed gases.
        const setup = [air, o2, ean50];
        const twoGas = calculateTissueLoading(waypoints, 0, { gases: setup });
        const rows = [row(0.21, { volumeL: 12, startBar: 200, endBar: 90 }), row(null, { volumeL: 7, startBar: 200, endBar: 80 })];
        assert.deepEqual(matchEntryGases(setup, rows, g => g.id !== 'g2'), [rows[0], null, rows[1]]);
        assert.deepEqual(matchEntryGases(setup, rows), [rows[0], rows[1], null]); // default: setup order
        const { gases, assumed } = recordedGasSetup(setup, rows, twoGas);
        assert.deepEqual(assumed, []);
        const gc = computeGasConsumption(twoGas, gases, 99, 99, 50);
        assert.ok(Math.abs(gc.pressureByGasId.g1 - 80) < 1e-6);
        assert.ok(Math.abs(gc.pressureByGasId.g0 - 90) < 1e-6);
    });

    test('bad pressures never give a negative or infinite SAC', () => {
        const rows = [row(0.21, { volumeL: 12, startBar: 100, endBar: 150 })];
        const { gases } = recordedGasSetup([air, ean50], rows, results);
        assert.equal(gases[0].sacRate, ASSUMED_SAC_LPM);
        const unused = recordedGasSetup([air, { ...ean50, id: 'g9' }], [row(0.5, { volumeL: 7, startBar: 200, endBar: 150 })], results);
        assert.ok(Number.isFinite(unused.gases[1].sacRate) && unused.gases[1].sacRate > 0);
    });

    test('computeGasConsumption without sacRate is unchanged; normalizeDiveSetup keeps sacRate', () => {
        const plain = computeGasConsumption(results, [air, ean50], 20, 15, 50);
        const withField = computeGasConsumption(results, [air, { ...ean50, sacRate: undefined }], 20, 15, 50);
        assert.deepEqual(withField.pressureByGasId, plain.pressureByGasId);
        const n = normalizeDiveSetup({ gases: [{ ...air, sacRate: 13 }, { ...ean50, sacRate: -1 }], dives: [{ waypoints }] });
        assert.equal(n.gases[0].sacRate, 13);
        assert.equal('sacRate' in n.gases[1], false);
    });
});

describe('chart views', () => {
    test('five views; profile keeps the recorded overlays, others drop them', () => {
        assert.deepEqual(CHART_VIEWS.map(v => v.id), ['profile', 'pressure', 'pp', 'tissue', 'gas']);
        const ref = [{ t: 0, depth: 0 }];
        const p = chartViewOptions('profile', { referenceCeiling: ref, referenceCeilingLabel: 'x' });
        assert.equal(p.showCeiling, true); assert.equal(p.highlightCeilingViolations, true); assert.equal(p.referenceCeiling, ref);
        const g = chartViewOptions('gas', { referenceCeiling: ref, referenceCeilingLabel: 'x' });
        assert.equal(g.showGasConsumption, true); assert.equal(g.referenceCeiling, null); assert.equal(g.highlightCeilingViolations, false);
        assert.equal(chartViewOptions('tissue', {}).showTissueLoading, true);
        assert.equal(chartViewOptions('nope', {}).showCeiling, true); // unknown → profile
    });

    test('every view hides labels and sets all five mode flags explicitly', () => {
        for (const v of CHART_VIEWS) {
            const o = chartViewOptions(v.id, {});
            assert.equal(o.showLabels, false);
            for (const k of ['showCeiling', 'showAmbientPressure', 'showPartialPressures', 'showTissueLoading', 'showGasConsumption']) {
                assert.equal(typeof o[k], 'boolean', `${v.id}.${k}`);
            }
        }
    });
});

describe('describeStart (start-state summary)', () => {
    const locale = lang => JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
    const translator = lang => {
        const dict = locale(lang);
        return (key, fallback) => key.split('.').reduce((o, k) => o?.[k], dict) ?? fallback;
    };
    const numbered = n => ({ source: { diveNumber: n } });
    const preload = [{ id: 10, excessBar: 0.097 }, { id: 11, excessBar: 0.097 }, { id: 12, excessBar: 0.091 },
        { id: 9, excessBar: 0.089 }, { id: 8, excessBar: 0.068 }, { id: 15, excessBar: 0.059 }, { id: 16, excessBar: 0.048 }];
    const one = { reason: 'chained', chain: [{ dive: numbered(100), surfaceIntervalMin: 209 }], preload };
    const many = { reason: 'chained', chain: [{ dive: numbered(92), surfaceIntervalMin: 60 }, { dive: numbered(93), surfaceIntervalMin: 126 }], preload };

    test('en names the dive, the interval and where the nitrogen sits', () => {
        assert.equal(describeStart(one, translator('en'), 'en'), 'carries nitrogen from #100 (surface interval 3.5\u00a0h), mostly in TC8\u2013TC15');
        assert.equal(describeStart(many, translator('en'), 'en'), 'carries nitrogen from #92, #93 (last surface interval 2.1\u00a0h), mostly in TC8\u2013TC15');
    });

    test('cs uses a decimal comma and a no-break space before the unit', () => {
        assert.equal(describeStart(one, translator('cs'), 'cs'), 'nese dusík z #100 (povrchový interval 3,5\u00a0h), převážně v TC8\u2013TC15');
    });

    test('es', () => {
        assert.equal(describeStart(one, translator('es'), 'es'), 'arrastra nitrógeno de #100 (intervalo en superficie 3,5\u00a0h), sobre todo en TC8\u2013TC15');
    });

    test('without a positive preload the location is left out', () => {
        assert.equal(describeStart({ ...one, preload: [] }, translator('en'), 'en'), 'carries nitrogen from #100 (surface interval 3.5\u00a0h)');
    });

    test('fresh starts keep their reasons', () => {
        assert.equal(describeStart(null, translator('en'), 'en'), 'fresh start — earlier dives are ignored');
        assert.equal(describeStart({ reason: 'no-earlier-dive', chain: [], preload: [] }, translator('en'), 'en'), 'fresh start — no earlier dive loaded');
    });
});

describe('carried-over tissues in the Tissues view', () => {
    const numbered = n => ({ source: { diveNumber: n } });
    const preload = [{ id: 10, excessBar: 0.097 }, { id: 11, excessBar: 0.097 }, { id: 12, excessBar: 0.091 }, { id: 9, excessBar: 0.089 }];
    const en = (key, fallback) => fallback;

    test('marks every preloaded compartment and suggests the three most loaded', () => {
        const o = carriedOverOptions({ reason: 'chained', chain: [{ dive: numbered(100), surfaceIntervalMin: 209 }], preload }, en);
        assert.deepEqual(o, { compartments: [10, 11, 12, 9], suggested: [10, 11, 12], label: 'carried over from #100' });
    });

    test('a chain of dives is labelled first to last', () => {
        const chain = [92, 93, 94].map(n => ({ dive: numbered(n), surfaceIntervalMin: 60 }));
        assert.equal(carriedOverOptions({ reason: 'chained', chain, preload }, en).label, 'carried over from #92\u2013#94');
    });

    test('fresh starts and starts without a positive preload give no option', () => {
        assert.equal(carriedOverOptions(null, en), null);
        assert.equal(carriedOverOptions({ reason: 'settled', chain: [], preload: [] }, en), null);
        assert.equal(carriedOverOptions({ reason: 'chained', chain: [{ dive: numbered(1), surfaceIntervalMin: 9 }], preload: [] }, en), null);
    });

    const chartStub = carriedOver => ({
        options: { carriedOver }, visibleCompartments: new Set([1]), _defaultCompartments: [1], _userPickedCompartments: false,
        tissueControlsContainer: null, _buildTissueControls() {},
        _applyCompartmentSuggestion: DiveProfileChart.prototype._applyCompartmentSuggestion,
        _setOptions: DiveProfileChart.prototype._setOptions,
    });

    test('the chart shows the suggestion until the user picks, and falls back to its default', () => {
        const c = chartStub(null);
        c._setOptions({ carriedOver: { compartments: [10, 11, 12, 9], suggested: [10, 11, 12], label: 'x' } });
        assert.deepEqual([...c.visibleCompartments], [10, 11, 12]);
        c._setOptions({ carriedOver: null });
        assert.deepEqual([...c.visibleCompartments], [1]);
        c._userPickedCompartments = true;
        c.visibleCompartments = new Set([4]);
        c._setOptions({ carriedOver: { compartments: [9], suggested: [9], label: 'x' } });
        assert.deepEqual([...c.visibleCompartments], [4]);
    });

    test('a GF-only update keeps the selection the suggestion made', () => {
        const opt = { compartments: [10, 11, 12, 9], suggested: [10, 11, 12], label: 'x' };
        const c = chartStub(null);
        c._setOptions({ carriedOver: opt });
        c.visibleCompartments.add(1); // e.g. a keyboard expand that did not mark the pick
        c._setOptions({ carriedOver: { ...opt } });
        assert.deepEqual([...c.visibleCompartments].sort((a, b) => a - b), [1, 10, 11, 12]);
    });
});
