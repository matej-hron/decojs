import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatKg, formatVolume, netLabel, diverReadout, netAxisRange, suitThickness, bcRadii, forceLength, forceArrowPoints,
} from '../js/components/waterColumn/buoyancyLayer.js';
import {
    A1_SCENARIO, BUOYANCY_PARAMS, MODEL_MAX_DEPTH, stepState, onScenario, stepLabel, nextStep, bcAfterButton,
    initialStateFromParams, paramsFromState, buoyancyHeadroom, A1_HEADROOM_EM,
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

test('odečet: tlak, oblek, BC a výsledek (krok 2 scénáře)', () => {
    const s = A1_SCENARIO[1];
    assert.equal(
        diverReadout(s.depth, s.amount),
        '<var>p</var> = 2&nbsp;bar · oblek 7,6&nbsp;l · BC 0&nbsp;l · <strong class="wc-diver-result">chybí 4,4&nbsp;kg, klesá</strong>',
    );
    assert.match(diverReadout(5, 0), /<var>p<\/var> = 1,5&nbsp;bar/);
});

test('osa panelu pokryje celý scénář ve sloupci, na celé pětky, nula uvnitř', () => {
    const range = netAxisRange(A1_SCENARIO.map((s) => s.amount), MODEL_MAX_DEPTH);
    assert.deepEqual(range, { min: -10, max: 20 });
});

test('kresba: silueta hubne se stlačeným oblekem, vak BC roste s plochou, šipka roste se silou', () => {
    assert.ok(suitThickness(suitVolume(0)) > suitThickness(suitVolume(10)));
    assert.ok(suitThickness(suitVolume(10)) > suitThickness(suitVolume(20)));
    const a = bcRadii(2.5);
    const b = bcRadii(10);
    assert.ok(Math.abs((b.rx * b.ry) / (a.rx * a.ry) - 4) < 1e-9, 'plocha úměrná objemu');
    assert.deepEqual(bcRadii(0), { rx: 0, ry: 0 });
    assert.ok(forceLength(4.4) > forceLength(2.9));
    assert.equal(forceLength(100), forceLength(50), 'délka je omezená');
    assert.equal(forceArrowPoints(0, 0, 10, 1, 4).split(' ').length, 7);
});

// ---------------------------------------------------------------- model: kroky, tlačítka, předvolby

test('scénář modelu má 10 kroků a začíná na hladině s vypuštěným BC (rozhodnutí 4e a 5)', () => {
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

test('popisky kroků: sestup, přifouknout, výstup, upustit; po ruční změně „upraveno“', () => {
    const labels = A1_SCENARIO.map((_, i) => stepLabel(stepState(i)));
    assert.deepEqual(labels, [
        'Krok 1 z 10: vyvážený na hladině, BC vypuštěný',
        `Krok 2 z 10: sestup do${NBSP}10${NBSP}m`,
        `Krok 3 z 10: přifouknout BC v${NBSP}10${NBSP}m`,
        `Krok 4 z 10: sestup do${NBSP}20${NBSP}m`,
        `Krok 5 z 10: přifouknout BC v${NBSP}20${NBSP}m`,
        `Krok 6 z 10: výstup do${NBSP}10${NBSP}m`,
        `Krok 7 z 10: upustit BC v${NBSP}10${NBSP}m`,
        `Krok 8 z 10: výstup do${NBSP}5${NBSP}m`,
        `Krok 9 z 10: upustit BC v${NBSP}5${NBSP}m`,
        'Krok 10 z 10: výstup na hladinu',
    ]);
    const moved = { ...stepState(2), depth: 15 };
    assert.equal(onScenario(moved), false);
    assert.equal(stepLabel(moved), 'Krok 3 z 10 (upraveno)');
});

test('tlačítka BC: 1 l v současné hloubce (ve 20 m 3 bar · l), upustit nikdy pod nulu', () => {
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

test('místo nad hladinou: plné v modelu, malé v nízkém náhledu', () => {
    assert.equal(buoyancyHeadroom(false, 150), A1_HEADROOM_EM);
    assert.equal(buoyancyHeadroom(true, 150), 1);
    assert.equal(buoyancyHeadroom(true, 400), A1_HEADROOM_EM);
});
