import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    TOUCH_READOUT_MEDIA, touchReadoutMatches, readoutTime, nearestIndex, profileReadoutView,
    profileReadoutLines, pointReadoutLines, segmentText, readoutText, nearestChartPoint, noPointLines,
} from '../js/charts/touchReadout.js';

const NB = ' ';
const locale = lang => JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
const translatorFor = lang => {
    const dict = locale(lang);
    return (key, fallback) => key.split('.').reduce((o, k) => o?.[k], dict) ?? fallback;
};
const en = { lang: 'en', t: translatorFor('en') };
const cs = { lang: 'cs', t: translatorFor('cs') };

const snap = {
    t: 23 + 40 / 60, depth: 18.24, gas: 'EAN32',
    ceiling: 2.06, deviceCeiling: 3, gf: { value: 0.614, compartment: 5 },
    pAmb: 2.8213, pO2: 0.9028, pN2: 1.9185,
    tissues: [{ id: 1, p: 2.312 }, { id: 2, p: 2.05 }, { id: 5, p: 1.9 }, { id: 8, p: 1.2 }],
    rate: 18.44, cylinders: [{ name: 'EAN32', bar: 152.4 }, { name: 'O₂', bar: 180 }],
};

test('media query and matcher', () => {
    assert.equal(TOUCH_READOUT_MEDIA, '(pointer: coarse)');
    assert.equal(touchReadoutMatches({ matchMedia: q => ({ matches: q === '(pointer: coarse)' }) }), true);
    assert.equal(touchReadoutMatches({ matchMedia: () => ({ matches: false }) }), false);
    assert.equal(touchReadoutMatches({}), false, 'no matchMedia (node) → off');
    assert.equal(touchReadoutMatches({ matchMedia: () => { throw new Error('x'); } }), false);
});

test('readoutTime formats minutes as m:ss and rounds to the second', () => {
    assert.equal(readoutTime(23 + 40 / 60), '23:40');
    assert.equal(readoutTime(0), '0:00');
    assert.equal(readoutTime(1.9999), '2:00');
    assert.equal(readoutTime(65.5), '65:30');
});

test('nearestIndex finds the closest time point', () => {
    const times = [0, 0.5, 1, 2, 4];
    assert.equal(nearestIndex(times, -3), 0);
    assert.equal(nearestIndex(times, 0.7), 1);
    assert.equal(nearestIndex(times, 0.8), 2);
    assert.equal(nearestIndex(times, 3.1), 4);
    assert.equal(nearestIndex(times, 99), 4);
    assert.equal(nearestIndex([], 1), -1);
});

test('profileReadoutView follows the chart options', () => {
    assert.equal(profileReadoutView({ showCeiling: true }), 'profile');
    assert.equal(profileReadoutView({ showAmbientPressure: true }), 'pressure');
    assert.equal(profileReadoutView({ showPartialPressures: true }), 'pp');
    assert.equal(profileReadoutView({ showTissueLoading: true, showAmbientPressure: true, showCeiling: true }), 'tissue');
    assert.equal(profileReadoutView({ showGasConsumption: true }), 'gas');
});

test('profile view: time, depth, gas; ceiling, computer ceiling, leading GF', () => {
    assert.equal(readoutText(profileReadoutLines('profile', snap, en)),
        `23:40 · 18.2${NB}m · EAN32\nceiling 2.1${NB}m · computer 3.0${NB}m · GF 61${NB}% (TC5)`);
});

test('profile view: no ceiling, no device ceiling, no supersaturation', () => {
    const s = { ...snap, ceiling: 0, deviceCeiling: null, gf: null };
    assert.equal(readoutText(profileReadoutLines('profile', s, en)), `23:40 · 18.2${NB}m · EAN32\nno ceiling`);
    assert.doesNotMatch(readoutText(profileReadoutLines('profile', { ...s, deviceCeiling: 0 }, en)), /computer/,
        'a zero dive-computer ceiling is not shown');
});

test('pressure, partial pressure, tissue and gas views', () => {
    assert.equal(readoutText(profileReadoutLines('pressure', snap, en)).split('\n')[1],
        `pamb 2.82${NB}bar · ceiling 2.1${NB}m`);
    assert.equal(readoutText(profileReadoutLines('pp', snap, en)).split('\n')[1],
        `pO₂ 0.90${NB}bar · pN₂ 1.92${NB}bar`);
    assert.equal(readoutText(profileReadoutLines('tissue', snap, en)).split('\n')[1],
        `pamb 2.82${NB}bar · TC1 2.31${NB}bar · TC2 2.05${NB}bar · +2`);
    assert.equal(readoutText(profileReadoutLines('gas', snap, en)).split('\n')[1],
        `use 18.4${NB}L/min · EAN32 152${NB}bar · O₂ 180${NB}bar`);
});

test('views without a computed ceiling leave it out', () => {
    assert.equal(readoutText(profileReadoutLines('pressure', { ...snap, ceiling: null }, en)).split('\n')[1], `pamb 2.82${NB}bar`);
    assert.doesNotMatch(readoutText(profileReadoutLines('profile', { ...snap, ceiling: null }, en)), /ceiling/);
});

test('quantity symbols are structured for <var> rendering', () => {
    const [, line2] = profileReadoutLines('pp', snap, en);
    assert.deepEqual(line2[0], { sym: 'p', sub: 'O₂', value: `0.90${NB}bar` });
    assert.equal(segmentText({ sym: 'p', sub: 'amb', value: '1' }), 'pamb 1');
    assert.equal(segmentText({ label: 'GF', value: '1' }), 'GF 1');
    assert.equal(segmentText({ value: 'EAN32' }), 'EAN32');
});

test('Czech: decimal comma, translated labels and subscripts, U+00A0 before units', () => {
    const text = readoutText(profileReadoutLines('profile', snap, cs));
    assert.equal(text, `23:40 · 18,2${NB}m · EAN32\nstrop 2,1${NB}m · počítač 3,0${NB}m · GF 61${NB}% (TC5)`);
    assert.equal(readoutText(profileReadoutLines('pressure', snap, cs)).split('\n')[1], `pokol 2,82${NB}bar · strop 2,1${NB}m`);
    assert.doesNotMatch(text, / (m|bar|%)\b/, 'never a normal space before a unit');
});

test('P-P and GF point readouts', () => {
    const point = { label: 'TC1 (5 min)', pAmb: 2.8126, y: 2.104 };
    assert.equal(readoutText(pointReadoutLines('mvalue', point, en)), `TC1 (5 min)\npamb 2.81${NB}bar · pt 2.10${NB}bar`);
    assert.equal(readoutText(pointReadoutLines('gf', { ...point, y: 61.36 }, en)), `TC1 (5 min)\npamb 2.81${NB}bar · GF 61${NB}%`);
    assert.equal(readoutText(pointReadoutLines('mvalue', point, cs)), `TC1 (5 min)\npokol 2,81${NB}bar · ptk 2,10${NB}bar`);
});

test('nearestChartPoint: closest visible point inside the plot area', () => {
    // 1 data unit = 10 px on both axes
    const scale = { getPixelForValue: v => v * 10 };
    const datasets = [
        { label: 'corridor', data: [{ x: 0, y: 9 }] },           // off-plot (x = 0 px < left)
        { label: 'hidden', data: [{ x: 3, y: 3 }] },
        { label: 'TC1', data: [{ x: 3, y: 4 }, { x: 8, y: 8 }] },
    ];
    const chart = {
        scales: { x: scale, y: scale },
        chartArea: { left: 10, right: 100, top: 10, bottom: 100 },
        data: { datasets },
        isDatasetVisible: i => i !== 1,
        getDatasetMeta: i => ({ data: datasets[i].data.map(p => ({ x: p.x * 10, y: p.y * 10 })) }),
    };
    assert.deepEqual(nearestChartPoint(chart, { x: 3, y: 3 }), { label: 'TC1', pAmb: 3, y: 4, marker: { x: 30, y: 40, r: 7 } });
    assert.equal(nearestChartPoint(chart, { x: 0, y: 9 }, 80).label, 'TC1', 'clipped helper points never win');
    assert.equal(nearestChartPoint({ ...chart, scales: {} }, { x: 1, y: 1 }), null);
    assert.equal(nearestChartPoint(chart, { x: 8, y: 1 }), null, 'nothing within reach (40 px)');
    assert.equal(nearestChartPoint(chart, { x: 8, y: 1 }, 80).label, 'TC1');
    assert.equal(readoutText(noPointLines(cs)), 'Tady není žádný bod: dotkněte se čáry nebo tečky');
});

test('en/cs/es carry the same chart.readout keys, units glued with U+00A0', () => {
    const keys = lang => Object.keys(locale(lang).chart.readout).sort();
    assert.ok(keys('en').length >= 8);
    assert.deepEqual(keys('cs'), keys('en'));
    assert.deepEqual(keys('es'), keys('en'));
    for (const lang of ['en', 'cs', 'es']) {
        for (const v of Object.values(locale(lang).chart.readout)) assert.doesNotMatch(v, /&nbsp;| /);
    }
});
