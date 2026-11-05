import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    clamp, decimalsOf, fmtCs, snapDepth, niceStep, niceTicks, depthTicks, baseFontSize,
    defaultHeight, computeGeometry, depthReadout, joinReadout, sortLayers, splitLabel, wavePath,
    CORE_STATE_KEYS,
} from '../js/components/WaterColumn.js';
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

// ---------------------------------------------------------------- rozhraní vrstev (testovací vrstva)

/** Spustí tělo s DOM z jsdom; kostra potřebuje document, window a getComputedStyle. */
async function withDom(body) {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><div id="h"></div>');
    const g = globalThis;
    const saved = { document: g.document, window: g.window, getComputedStyle: g.getComputedStyle };
    g.window = dom.window; g.document = dom.window.document;
    g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    // jsdom nepočítá rozložení; bez šířky by se sloupec choval jako skrytý a nekreslil
    Object.defineProperty(dom.window.document.getElementById('h'), 'clientWidth', { value: 800 });
    try {
        const { createWaterColumn } = await import('../js/components/WaterColumn.js');
        await body(createWaterColumn, dom.window.document);
    } finally {
        Object.assign(g, saved);
    }
}

/** Nejmenší vrstva podle docs/course/water-column.md: kreslí, odečítá, uklízí. */
const testLayer = (log, extra = {}) => ({
    id: 'test',
    init(ctx) { log.push(`init:${ctx.uid ? 'uid' : 'bez uid'}`); },
    render(g, geom, state) {
        log.push(`render:${state.depth}:${geom.aside ? 'panel' : 'bez panelu'}`);
        g.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle'));
    },
    readout: (state) => `test ${state.depth}&nbsp;m`,
    destroy() { log.push('destroy'); },
    ...extra,
});

test('vrstva: init jednou, render při změně, odečet se přidá, destroy při odebrání', async () => {
    await withDom(async (createWaterColumn, doc) => {
        const log = [];
        const col = createWaterColumn(doc.getElementById('h'), { maxDepth: 40, depth: 10 });
        col.addLayer(testLayer(log));
        assert.equal(log.filter(x => x.startsWith('init')).length, 1);
        assert.ok(log.includes('init:uid'), 'vrstva dostane ctx.uid');
        assert.ok(log.includes('render:10:bez panelu'));
        col.setState({ depth: 20 });
        assert.ok(log.some(x => x === 'render:20:bez panelu'), log.join(' '));
        assert.match(doc.querySelector('.water-column-readout').innerHTML, /hloubka 20.*test 20/s);
        col.removeLayer('test');
        assert.ok(log.includes('destroy'));
        col.destroy();
    });
});

test('vrstva: je průhledná pro ukazatel a boční panel dostane jen s aside', async () => {
    await withDom(async (createWaterColumn, doc) => {
        const log = [];
        const col = createWaterColumn(doc.getElementById('h'), { maxDepth: 40, depth: 0 });
        col.addLayer(testLayer(log, { aside: true }));
        assert.ok(log.some(x => x.endsWith(':panel')), log.join(' '));
        const group = doc.querySelector('.wc-layer');
        assert.equal(group.getAttribute('pointer-events'), 'none');
        col.destroy();
    });
});

// --- rozesílání změn: setState v posluchači nesmí pozdějším posluchačům poslat starý stav ---
test('createWaterColumn: setState v posluchači — poslední snímek je u všech aktuální', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><div id="h"></div>');
    const g = globalThis;
    const saved = { document: g.document, window: g.window, getComputedStyle: g.getComputedStyle };
    g.window = dom.window; g.document = dom.window.document;
    g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    try {
        const { createWaterColumn } = await import('../js/components/WaterColumn.js');
        const col = createWaterColumn(document.getElementById('h'), { maxDepth: 40, depth: 0 });
        const seenByB = [];
        col.on('change', (s, { changed }) => { if (changed.includes('month')) col.setState({ depth: 30 }); });
        col.on('change', (s) => seenByB.push(s.depth));
        col.setState({ month: 1 });
        assert.equal(col.getState().depth, 30);
        assert.equal(seenByB.at(-1), 30, `B viděl ${seenByB.join(' → ')}`);
        col.destroy();
    } finally {
        Object.assign(g, saved);
    }
});
