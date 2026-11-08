import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatKg, formatVolume, netLabel, diverReadout, netAxisRange, suitThickness, bcShape, forceLength, forceArrowPoints,
    placeForce, labelFontSize, surfaceHeadroom, diverTopOffset,
} from '../js/components/waterColumn/buoyancyLayer.js';
import {
    A1_SCENARIO, BUOYANCY_PARAMS, MODEL_MAX_DEPTH, stepState, onScenario, stepLabel, nextStep, bcAfterButton,
    initialStateFromParams, paramsFromState, buoyancyHeadroom,
} from '../js/course/buoyancyModel.js';
import { readParams } from '../js/course/modelParams.js';
import { suitVolume } from '../js/physics/buoyancy.js';

const NBSP = '\u00a0';

// ---------------------------------------------------------------- popisky vrstvy

test('kilogramy a litry česky: 4,4; 2,9; litry bez „,0“', () => {
    assert.equal(formatKg(-4.374), '4,4');
    assert.equal(formatKg(2.916), '2,9');
    assert.equal(formatVolume(12), '12');
    assert.equal(formatVolume(7.626), '7,6');
    assert.equal(formatVolume(0), '0');
});

test('výsledná síla slovy: chybí / přebývá v kg, vznáší se; na hladině vyvážený a plave', () => {
    assert.deepEqual(netLabel(-4.374, 10), { state: 'sink', amount: `chybí 4,4${NBSP}kg`, verb: 'klesá' });
    assert.deepEqual(netLabel(4.374, 10), { state: 'rise', amount: `přebývá 4,4${NBSP}kg`, verb: 'stoupá' });
    assert.deepEqual(netLabel(0, 10), { state: 'float', amount: '', verb: 'vznáší se' });
    assert.equal(netLabel(0.04, 10).verb, 'vznáší se');
    assert.equal(netLabel(0, 0).verb, 'vyvážený');
    assert.equal(netLabel(4.374, 0).verb, 'plave');
    assert.equal(netLabel(-1, 0).verb, 'klesá');
});

test('odečet: tlak, oblek, BCD a výsledek (krok 2 scénáře)', () => {
    const s = A1_SCENARIO[1];
    assert.equal(
        diverReadout(s.depth, s.amount),
        '<var>p</var> = 2&nbsp;bar · oblek 7,6&nbsp;l · BCD 0&nbsp;l · <strong class="wc-diver-result">chybí 4,4&nbsp;kg, klesá</strong>',
    );
    assert.match(diverReadout(5, 0), /<var>p<\/var> = 1,5&nbsp;bar/);
});

test('osa panelu pokryje celý scénář ve sloupci, na celé pětky, nula uvnitř', () => {
    const range = netAxisRange(A1_SCENARIO.map((s) => s.amount), MODEL_MAX_DEPTH);
    assert.deepEqual(range, { min: -10, max: 20 });
});

test('kresba: silueta hubne se stlačeným oblekem, vak BCD je vidět vždy a roste jako vesta, šipka roste se silou', () => {
    assert.ok(suitThickness(suitVolume(0)) > suitThickness(suitVolume(10)));
    assert.ok(suitThickness(suitVolume(10)) > suitThickness(suitVolume(20)));
    // R7-06: prázdný vak je tenký pruh přes lahev (širší než lahev 3 u), s vzduchem roste do šířky i výšky
    const empty = bcShape(0);
    assert.ok(empty.empty && empty.h > 0 && empty.w > 3, 'prázdný vak je vidět');
    const sizes = [2.9, 4.4, 5.8, 8.7].map(bcShape);
    for (let i = 1; i < sizes.length; i++) {
        assert.ok(sizes[i].w > sizes[i - 1].w && sizes[i].h > sizes[i - 1].h);
    }
    assert.ok(sizes.every((x) => !x.empty));
    assert.ok(bcShape(8.7).w / bcShape(8.7).h > 3, 'plochý jako vesta, ne kulatý balónek');
    assert.ok(diverTopOffset(12, 4.4) > diverTopOffset(12, 0));
    assert.ok(forceLength(4.4) > forceLength(2.9));
    assert.equal(forceLength(100), forceLength(50), 'délka je omezená');
    assert.equal(forceArrowPoints(0, 0, 10, 1, 4).split(' ').length, 7);
});

// ---------------------------------------------------------------- model: kroky, tlačítka, předvolby

test('scénář modelu má 10 kroků a začíná na hladině s vypuštěným BCD (rozhodnutí 4e a 5)', () => {
    assert.equal(A1_SCENARIO.length, 10);
    assert.deepEqual(stepState(0), { depth: 0, diverBcAir: 0, diverStep: 0 });
    assert.equal(MODEL_MAX_DEPTH, 30);
});

test('šipky jdou po krocích a na krajích zůstanou', () => {
    assert.equal(nextStep(0, -1), 0);
    assert.equal(nextStep(0, 1), 1);
    assert.equal(nextStep(9, 1), 9);
    assert.equal(nextStep(undefined, 1), 1);
    assert.deepEqual(stepState(99), stepState(9));
});

test('popisky kroků: přesun s úsekem a „bez přifukování / upouštění“ (R7-01), BCD (R7-02); po ruční změně „upraveno“', () => {
    const labels = A1_SCENARIO.map((_, i) => stepLabel(stepState(i)));
    assert.deepEqual(labels, [
        'Krok 1 z 10: vyvážený na hladině, BCD vypuštěný',
        `Krok 2 z 10: sestup 0 → 10${NBSP}m bez přifukování`,
        `Krok 3 z 10: přifouknout BCD v${NBSP}10${NBSP}m`,
        `Krok 4 z 10: sestup 10 → 20${NBSP}m bez přifukování`,
        `Krok 5 z 10: přifouknout BCD v${NBSP}20${NBSP}m`,
        `Krok 6 z 10: výstup 20 → 10${NBSP}m bez upouštění`,
        `Krok 7 z 10: upustit BCD v${NBSP}10${NBSP}m`,
        `Krok 8 z 10: výstup 10 → 5${NBSP}m bez upouštění`,
        `Krok 9 z 10: upustit BCD v${NBSP}5${NBSP}m`,
        `Krok 10 z 10: výstup 5${NBSP}m → hladina bez upouštění`,
    ]);
    assert.ok(labels.every((l) => !/\bBC\b/.test(l)));
    const moved = { ...stepState(2), depth: 15 };
    assert.equal(onScenario(moved), false);
    assert.equal(stepLabel(moved), 'Krok 3 z 10 (upraveno)');
});

test('tlačítka BCD: 1 l v současné hloubce (ve 20 m 3 bar · l), upustit nikdy pod nulu', () => {
    assert.equal(bcAfterButton(0, 20, 1), 3);
    assert.equal(bcAfterButton(0, 0, 1), 1);
    assert.equal(bcAfterButton(3, 20, -1), 0);
    assert.equal(bcAfterButton(1, 10, -1), 0);
});

test('předvolba ?krok=6 otevře výstup do 10 m; krok 1 se do adresy nepíše', () => {
    const s = initialStateFromParams(readParams('?krok=6', BUOYANCY_PARAMS));
    assert.equal(s.depth, 10);
    assert.equal(s.diverStep, 5);
    assert.deepEqual(paramsFromState(s), { krok: 6 });
    assert.deepEqual(paramsFromState(stepState(0)), { krok: null });
    assert.equal(initialStateFromParams(readParams('?krok=99', BUOYANCY_PARAMS)).diverStep, 9);
    assert.equal(initialStateFromParams(readParams('', BUOYANCY_PARAMS)).diverStep, 0);
});

test('místo nad hladinou podle velikosti modelu (R7-04): nízký model má menší, náhled 1 em', () => {
    assert.equal(buoyancyHeadroom(true, 150), 1);
    const fn = buoyancyHeadroom(false, 150);
    assert.equal(typeof fn, 'function');
    const low = fn({ width: 1150, height: 380, fontSize: 15, maxDepth: MODEL_MAX_DEPTH });
    const high = fn({ width: 1700, height: 760, fontSize: 18, maxDepth: MODEL_MAX_DEPTH });
    assert.ok(low > 0 && low < 4.5, `720p: ${low} em`);
    assert.ok(high > low && high <= 6.5, `1080p: ${high} em`);
    // s tímto místem se potápěč v kroku 10 vejde nad hladinu i se šipkou
    const amount = A1_SCENARIO.at(-1).amount;
    assert.equal(surfaceHeadroom({ width: 1150, height: 380, fontSize: 15, maxDepth: 30, amount }), low);
});

test('popisek šipky nikdy přes hladinu (R7-03): krok 6 nad hladinu, na hladině vedle šipky, úzký sloupec menší písmo', () => {
    const col = { x: 100, w: 260 };
    const lines = [`přebývá 4,4${NBSP}kg`, 'stoupá'];
    const base = { dir: -1, u: 10, fs: 16, lines, cx: 209, col, surfaceY: 100, height: 600 };
    const crosses = (p) => p.top < 100 && p.top + lines.length * p.lineH > 100;
    // potápěč ve 3 m pod hladinou: popisek nad špičkou by hladinu křížil, posune se celý nad ni
    const near = placeForce({ ...base, start: 150, wanted: 40 });
    assert.ok(!crosses(near));
    assert.ok(near.top + 2 * near.lineH <= 100);
    // na hladině, nad potápěčem 60 px: popisek vedle šipky
    const surface = placeForce({ ...base, start: 60, wanted: 40, surfaceY: 90 });
    assert.equal(surface.anchor, 'start');
    assert.ok(surface.top >= 0 && surface.top + 2 * surface.lineH <= 90);
    // dolů: popisek pod špičkou
    const sink = placeForce({ ...base, dir: 1, start: 300, wanted: 40, lines: [`chybí 4,4${NBSP}kg`, 'klesá'] });
    assert.equal(sink.top, 300 + sink.len + 0.2 * 16);
    // úzký sloupec (telefon 320 px): o krok menší písmo
    assert.equal(labelFontSize(lines, 13, 96), 0.85 * 13);
    assert.equal(labelFontSize(lines, 13, 200), 13);
});
