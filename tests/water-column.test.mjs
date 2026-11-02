import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    clamp, decimalsOf, fmtCs, snapDepth, niceStep, niceTicks, depthTicks, baseFontSize,
    defaultHeight, computeGeometry, depthReadout, joinReadout, sortLayers, splitLabel, wavePath,
    CORE_STATE_KEYS,
} from '../js/components/WaterColumn.js';
import {
    temperatureColor, hexToRgb, rgbToHex, rgbToOklab, oklabToRgb, temperatureTicks, sampleProfile,
    resolveBands, temperatureReadout, createTemperatureLayer, DEFAULT_TEMPERATURE_STOPS,
} from '../js/components/waterColumn/temperatureLayer.js';

const NBSP = ' ';

// Simple illustrative profile (summer lake): warm on top, 4 °C at the bottom.
const summer = (depth) => (depth < 6 ? 22 : depth < 12 ? 22 - ((depth - 6) / 6) * 16 : 6 - Math.min(2, (depth - 12) / 14));

// ---------------------------------------------------------------- core helpers

test('clamp and decimalsOf', () => {
    assert.equal(clamp(-1, 0, 40), 0);
    assert.equal(clamp(41, 0, 40), 40);
    assert.equal(clamp(12, 0, 40), 12);
    assert.equal(decimalsOf(1), 0);
    assert.equal(decimalsOf(0.5), 1);
    assert.equal(decimalsOf(0.25), 2);
    assert.equal(decimalsOf(1e-7), 7);
});

test('snapDepth clamps and rounds to the step', () => {
    assert.equal(snapDepth(12.4, 40), 12);
    assert.equal(snapDepth(12.5, 40), 13);
    assert.equal(snapDepth(-3, 40), 0);
    assert.equal(snapDepth(55, 40), 40);
    assert.equal(snapDepth(NaN, 40), 0);
    assert.equal(snapDepth('7', 40), 7);
    assert.equal(snapDepth(12.3, 40, 0.5), 12.5);
    assert.equal(snapDepth(0.1 + 0.2, 40, 0.1), 0.3, 'no floating-point noise');
    assert.equal(snapDepth(39.9, 39.5, 2), 39.5, 'max that is not a multiple of step stays reachable');
});

test('niceStep picks 1, 2 or 5 × 10^k', () => {
    assert.equal(niceStep(0.7), 1);
    assert.equal(niceStep(1), 1);
    assert.equal(niceStep(1.3), 2);
    assert.equal(niceStep(3), 5);
    assert.equal(niceStep(5.7), 10);
    assert.equal(niceStep(13), 20);
    assert.equal(niceStep(0.03), 0.05);
});

test('niceTicks cover the range on nice values', () => {
    assert.deepEqual(niceTicks(0, 40, 4), [0, 10, 20, 30, 40]);
    assert.deepEqual(niceTicks(0, 40, 8), [0, 5, 10, 15, 20, 25, 30, 35, 40]);
    assert.deepEqual(niceTicks(0, 3, 30, 1), [0, 1, 2, 3], 'minStep wins');
    assert.deepEqual(niceTicks(0, 0.3, 3), [0, 0.1, 0.2, 0.3], 'no floating-point noise');
});

test('depthTicks: whole metres, spaced by font size', () => {
    const t = depthTicks(40, 300, 14); // 300 / 35 = 8 intervals → step 5
    assert.deepEqual(t, [0, 5, 10, 15, 20, 25, 30, 35, 40]);
    assert.deepEqual(depthTicks(40, 160, 20), [0, 20, 40]);
    assert.ok(depthTicks(5, 2000, 14).every(Number.isInteger), 'never fractional metres');
    for (const [md, h, fs] of [[40, 380, 14], [40, 520, 20], [60, 300, 14], [12, 300, 16]]) {
        const ticks = depthTicks(md, h, fs);
        assert.equal(ticks[0], 0);
        const px = (h / md) * (ticks[1] - ticks[0]);
        assert.ok(px >= 2.5 * fs - 1e-9, `labels ≥ 2.5 em apart for ${md} m / ${h} px`);
    }
});

test('font size: ≥ 14 px on a phone, 20 px on a projector', () => {
    assert.equal(baseFontSize(358), 14);
    assert.equal(baseFontSize(390), 14);
    assert.equal(baseFontSize(768), 16);
    assert.equal(baseFontSize(1280), 20);
    assert.equal(baseFontSize(1920), 20);
    assert.ok(defaultHeight(358) >= 300);
    assert.ok(defaultHeight(1280) <= 600);
});

// ---------------------------------------------------------------- geometry

test('depthToY and yToDepth are inverse and anchored at the surface and bottom', () => {
    const g = computeGeometry({ width: 390, maxDepth: 40, panels: 1 });
    assert.equal(g.depthToY(0), g.column.y);
    assert.equal(g.depthToY(40), g.column.y + g.column.h);
    for (const d of [0, 1, 7.5, 12, 39, 40]) {
        assert.ok(Math.abs(g.yToDepth(g.depthToY(d)) - d) < 1e-9, `inverse at ${d} m`);
    }
    for (const y of [g.column.y, g.column.y + 100.5, g.column.y + g.column.h]) {
        assert.ok(Math.abs(g.depthToY(g.yToDepth(y)) - y) < 1e-9);
    }
    assert.ok(g.yToDepth(g.column.y - 10) < 0, 'linear, not clamped (snapDepth clamps)');
});

test('geometry fits the width; panels sit right of the column and share its height', () => {
    for (const width of [358, 390, 600, 1024, 1280, 1920]) {
        for (const panels of [0, 1, 2]) {
            const g = computeGeometry({ width, maxDepth: 40, panels });
            assert.equal(g.panels.length, panels);
            assert.equal(g.aside, null, 'aside is set per layer by the component');
            assert.ok(g.column.x > 0 && g.column.w > 0);
            let right = g.column.x + g.column.w;
            for (const p of g.panels) {
                assert.ok(p.x >= right, 'panel right of the previous element');
                assert.equal(p.y, g.column.y);
                assert.equal(p.h, g.column.h);
                assert.ok(p.w > 0, `panel visible at ${width} px`);
                right = p.x + p.w;
            }
            assert.ok(right <= g.width, `content within ${width} px`);
            assert.ok(g.column.y + g.column.h < g.height);
        }
    }
});

test('aside stays visible (and usable) on a 390 px phone', () => {
    const g = computeGeometry({ width: 358, maxDepth: 40, panels: 1 }); // 390 minus page padding
    assert.equal(g.fontSize, 14);
    assert.ok(g.panels[0].w >= 120, `panel ${g.panels[0].w} px wide`);
    assert.ok(g.column.w >= 100, `column ${g.column.w} px wide`);
});

test('explicit height and font size are honoured', () => {
    const g = computeGeometry({ width: 800, height: 420, fontSize: 18, maxDepth: 30 });
    assert.equal(g.height, 420);
    assert.equal(g.fontSize, 18);
    assert.equal(g.maxDepth, 30);
});

test('wavePath starts and ends on the surface line', () => {
    const d = wavePath(10, 50, 200, 14);
    assert.match(d, /^M10 50 Q/);
    assert.match(d, / 210 50$/);
});

// ---------------------------------------------------------------- formatting

test('fmtCs: decimal comma, real minus, no negative zero', () => {
    assert.equal(fmtCs(2.81, 2), '2,81');
    assert.equal(fmtCs(12, 0), '12');
    assert.equal(fmtCs(-3.5, 1), '−3,5');
    assert.equal(fmtCs(-0.3, 0), '0');
    assert.equal(fmtCs(-0.04, 1), '0,0');
});

test('depth readout uses U+00A0 entity and the step decimals', () => {
    assert.equal(depthReadout({ depth: 12 }), 'hloubka 12&nbsp;m');
    assert.equal(depthReadout({ depth: 12.5 }, 0.5), 'hloubka 12,5&nbsp;m');
    assert.equal(joinReadout(['hloubka 12&nbsp;m', null, '', 'teplota 8&nbsp;°C']),
        'hloubka 12&nbsp;m · teplota 8&nbsp;°C');
});

test('sortLayers: zIndex first, then insertion order', () => {
    const a = { id: 'a' }, b = { id: 'b', zIndex: -10 }, c = { id: 'c' }, d = { id: 'd', zIndex: 5 };
    assert.deepEqual(sortLayers([a, b, c, d]).map((l) => l.id), ['b', 'a', 'c', 'd']);
});

test('splitLabel breaks long labels near the middle', () => {
    assert.deepEqual(splitLabel('termoklina', 200, 14), ['termoklina']);
    assert.deepEqual(splitLabel('studená voda u dna', 100, 13), ['studená', 'voda u dna']);
    assert.deepEqual(splitLabel('teplá vrstva', 40, 14), ['teplá', 'vrstva']);
});

test('core state keys are reserved', () => {
    assert.deepEqual([...CORE_STATE_KEYS], ['depth', 'maxDepth', 'surface']);
});

// ---------------------------------------------------------------- temperature colour

test('colour conversions round-trip', () => {
    for (const hex of ['#000000', '#ffffff', ...DEFAULT_TEMPERATURE_STOPS]) {
        assert.equal(rgbToHex(oklabToRgb(rgbToOklab(hexToRgb(hex)))), hex);
    }
    assert.deepEqual(hexToRgb('#fff'), [1, 1, 1]);
    assert.throws(() => hexToRgb('blue'), TypeError);
});

test('temperatureColor: end stops at the range ends, clamped outside', () => {
    const [cold, mid, warm] = DEFAULT_TEMPERATURE_STOPS;
    assert.equal(temperatureColor(0), cold);
    assert.equal(temperatureColor(25), warm);
    assert.equal(temperatureColor(12.5), mid);
    assert.equal(temperatureColor(-5), cold);
    assert.equal(temperatureColor(40), warm);
    assert.equal(temperatureColor(4, [4, 10]), cold);
    assert.equal(temperatureColor(NaN), null);
    assert.equal(temperatureColor(undefined), null);
    assert.equal(temperatureColor(null), null);
    assert.equal(temperatureColor(5, [0, 10], ['#000000', '#ffffff']), rgbToHex(oklabToRgb(
        rgbToOklab(hexToRgb('#000000')).map((x, i) => (x + rgbToOklab(hexToRgb('#ffffff'))[i]) / 2))));
});

test('temperatureColor is monotonic: warmer is never bluer', () => {
    // OKLab b axis (blue − / yellow +) and red − blue channel both grow with temperature
    let prevB = -Infinity, prevRB = -Infinity;
    for (let t = 0; t <= 25; t += 0.5) {
        const rgb = hexToRgb(temperatureColor(t));
        const b = rgbToOklab(rgb)[2];
        const rb = rgb[0] - rgb[2];
        assert.ok(b >= prevB - 1e-3, `OKLab b non-decreasing at ${t} °C`);
        assert.ok(rb >= prevRB - 1 / 255, `R − B non-decreasing at ${t} °C`);
        prevB = b;
        prevRB = rb;
    }
});

test('4 °C and 20 °C are clearly different colours', () => {
    const lab4 = rgbToOklab(hexToRgb(temperatureColor(4)));
    const lab20 = rgbToOklab(hexToRgb(temperatureColor(20)));
    const dE = Math.hypot(...lab4.map((x, i) => x - lab20[i])) * 100;
    assert.ok(dE > 20, `ΔE_OK ${dE.toFixed(1)}`);
});

// ---------------------------------------------------------------- temperature data

test('temperatureTicks: steps of 5 °C, 10 °C when the panel is narrow', () => {
    assert.deepEqual(temperatureTicks([0, 25], 200, 14), [0, 5, 10, 15, 20, 25]);
    assert.deepEqual(temperatureTicks([0, 25], 600, 20), [0, 5, 10, 15, 20, 25], 'never finer than 5 °C');
    assert.deepEqual(temperatureTicks([0, 25], 90, 14), [0, 10, 20]);
    assert.deepEqual(temperatureTicks([0, 25], 60, 14), [0, 20]);
});

test('sampleProfile: surface to bottom, drops non-finite values', () => {
    const s = sampleProfile(summer, { maxDepth: 40 }, 41);
    assert.equal(s.length, 41);
    assert.equal(s[0].depth, 0);
    assert.equal(s.at(-1).depth, 40);
    assert.equal(s[0].t, 22);
    const holes = sampleProfile((d) => (d > 20 ? NaN : 10), { maxDepth: 40 }, 5);
    assert.deepEqual(holes.map((x) => x.depth), [0, 10, 20]);
    const fromState = sampleProfile((d, st) => st.month, { maxDepth: 10, month: 8 }, 2);
    assert.deepEqual(fromState.map((x) => x.t), [8, 8], 'profile receives the state');
});

test('resolveBands: array or function of state, clamped, sorted, invalid dropped', () => {
    const bands = (st) => (st.month === 8
        ? [{ from: 12, to: 60, label: 'studená voda u dna' }, { from: 0, to: 6, label: 'teplá vrstva' },
            { from: 12, to: 6, label: 'termoklina' }, { from: 5, to: 5, label: 'nic' }, { from: 1, to: 2, label: '' }]
        : []);
    assert.deepEqual(resolveBands(bands, { maxDepth: 40, month: 8 }), [
        { from: 0, to: 6, label: 'teplá vrstva' },
        { from: 6, to: 12, label: 'termoklina' },
        { from: 12, to: 40, label: 'studená voda u dna' },
    ]);
    assert.deepEqual(resolveBands(bands, { maxDepth: 40, month: 1 }), []);
    assert.deepEqual(resolveBands(undefined, { maxDepth: 40 }), []);
});

test('temperature readout: decimal comma, &nbsp; before °C, real minus', () => {
    assert.equal(temperatureReadout(8), 'teplota 8&nbsp;°C');
    assert.equal(temperatureReadout(4.4), 'teplota 4&nbsp;°C');
    assert.equal(temperatureReadout(3.96, 1), 'teplota 4,0&nbsp;°C');
    assert.equal(temperatureReadout(-1.5, 1), 'teplota −1,5&nbsp;°C');
    assert.equal(temperatureReadout(NaN), null);
    assert.ok(!temperatureReadout(12.25, 2).includes('.'), 'no decimal point');
});

test('temperature layer: shape and readout from its profile', () => {
    const layer = createTemperatureLayer({ profile: (d, st) => (st.surface === 'ice' && d === 0 ? 0 : summer(d)) });
    assert.equal(layer.id, 'temperature');
    assert.equal(layer.aside, true);
    assert.equal(typeof layer.render, 'function');
    assert.equal(layer.readout({ depth: 0, maxDepth: 40, surface: 'water' }), 'teplota 22&nbsp;°C');
    assert.equal(layer.readout({ depth: 0, maxDepth: 40, surface: 'ice' }), 'teplota 0&nbsp;°C');
    assert.equal(layer.readout({ depth: 9, maxDepth: 40 }), 'teplota 14&nbsp;°C');
    const full = `${'hloubka 9&nbsp;m'} · ${layer.readout({ depth: 9, maxDepth: 40 })}`;
    assert.equal(full.replaceAll('&nbsp;', NBSP), `hloubka 9${NBSP}m · teplota 14${NBSP}°C`);
    assert.throws(() => createTemperatureLayer({}), TypeError);
});
