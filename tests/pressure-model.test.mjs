import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBar, pressureReadout, pressureScaleMax, layerPressure } from '../js/components/waterColumn/pressureLayer.js';
import {
    SLIDE20_DEPTHS, PRESSURE_PARAMS, MODEL_MAX_DEPTH, stepTableDepth, surfaceScenario, tableDepths, modelArrowDir,
    initialStateFromParams, paramsFromState,
} from '../js/course/pressureModel.js';
import { readParams } from '../js/course/modelParams.js';

const NBSP = ' ';

// ---------------------------------------------------------------- formát čísel

test('formatBar: školní čísla bez zbytečných nul, s desetinnou čárkou', () => {
    assert.equal(formatBar(2, 'school'), '2');
    assert.equal(formatBar(3.2, 'school'), '3,2');
    assert.equal(formatBar(5.05, 'school'), '5,05');
    assert.equal(formatBar(4.050000000000001, 'school'), '4,05', 'bez binárního šumu');
    assert.equal(formatBar(0.5, 'school'), '0,5');
});

test('formatBar: přesná čísla vždy na dvě desetinná místa', () => {
    assert.equal(formatBar(2.0187, 'exact'), '2,02');
    assert.equal(formatBar(1.01325, 'exact'), '1,01');
});

// ---------------------------------------------------------------- odečet

test('odečet: rovnice jako na slidu, značky podle slovníčku, nbsp před bar', () => {
    const html = pressureReadout({ depth: 10, altitude: 0, water: 'salt', pressureMode: 'school' });
    assert.match(html, /<var>p<\/var> = /);
    assert.match(html, /<var>p<\/var><sub>atm<\/sub>/);
    assert.match(html, /<var>p<\/var><sub>h<\/sub>/);
    assert.match(html, /= 1 \+ 1 = 2&nbsp;bar/);
});

test('odečet: horské jezero 5 500 m v 20 m', () => {
    const html = pressureReadout({ depth: 20, altitude: 5500, water: 'fresh', pressureMode: 'school' });
    assert.match(html, /= 0,5 \+ 2 = 2,5&nbsp;bar/);
});

test('odečet: přesný režim v moři v 10 m', () => {
    const html = pressureReadout({ depth: 10, altitude: 0, water: 'salt', pressureMode: 'exact' });
    assert.match(html, /= 1,01 \+ 1,01 = 2,02&nbsp;bar/);
});

test('layerPressure: chybějící klíče = školní moře u hladiny moře', () => {
    assert.deepEqual(layerPressure({ depth: 10 }), { atm: 1, hydro: 1, total: 2 });
});

// ---------------------------------------------------------------- osa

test('osa tlaku: pevná pro obě hladiny i režimy, celé bary nad maximem', () => {
    assert.equal(pressureScaleMax(MODEL_MAX_DEPTH), 9); // přesně v moři v 70 m je 8,05 bar
    assert.ok(pressureScaleMax(40) >= 5.03);
    assert.ok(Number.isInteger(pressureScaleMax(40)));
});

// ---------------------------------------------------------------- tabulka slidu 20

test('hloubky tabulek ze slidu 20', () => {
    assert.deepEqual(SLIDE20_DEPTHS.sea, [0, 10, 20, 22, 28, 30, 33, 40.5, 66]);
    assert.deepEqual(SLIDE20_DEPTHS.lake, [0, 10, 20, 30, 40, 45, 51, 55.5]);
    assert.ok(MODEL_MAX_DEPTH >= 66);
    assert.equal(tableDepths(0), SLIDE20_DEPTHS.sea);
    assert.equal(tableDepths(5500), SLIDE20_DEPTHS.lake);
});

test('krokování po tabulce: další a předchozí hloubka, na koncích stojí', () => {
    const d = SLIDE20_DEPTHS.sea;
    assert.equal(stepTableDepth(0, d, 1), 10);
    assert.equal(stepTableDepth(22, d, 1), 28);
    assert.equal(stepTableDepth(28, d, -1), 22);
    assert.equal(stepTableDepth(66, d, 1), 66);
    assert.equal(stepTableDepth(0, d, -1), 0);
});

test('krokování z hloubky mimo tabulku jde na nejbližší v daném směru', () => {
    const d = SLIDE20_DEPTHS.sea;
    assert.equal(stepTableDepth(25, d, 1), 28);
    assert.equal(stepTableDepth(25, d, -1), 22);
    assert.equal(stepTableDepth(70, d, 1), 70, 'za koncem tabulky zůstane');
    assert.equal(stepTableDepth(70, d, -1), 66);
});

// ---------------------------------------------------------------- hladina a URL

test('hladina: moře = slaná voda u 0 m, jezero = sladká voda v 5 500 m', () => {
    assert.deepEqual(surfaceScenario(0), { altitude: 0, water: 'salt' });
    assert.deepEqual(surfaceScenario(5500), { altitude: 5500, water: 'fresh' });
});

test('předvolby v URL: ?hloubka=&hladina=&presne=', () => {
    const p = readParams('?hloubka=40,5&hladina=5500&presne=1', PRESSURE_PARAMS);
    assert.deepEqual(initialStateFromParams(p), { depth: 40.5, altitude: 5500, water: 'fresh', pressureMode: 'exact' });
    const none = readParams('', PRESSURE_PARAMS);
    assert.deepEqual(initialStateFromParams(none), { depth: 0, altitude: 0, water: 'salt', pressureMode: 'school' });
    const junk = readParams('?hloubka=999&hladina=1234&presne=7', PRESSURE_PARAMS);
    assert.equal(initialStateFromParams(junk).depth, MODEL_MAX_DEPTH);
    assert.ok([0, 5500].includes(initialStateFromParams(junk).altitude));
});

test('do URL se píše jen to, co se liší od výchozího', () => {
    assert.deepEqual(paramsFromState({ depth: 0, altitude: 0, pressureMode: 'school' }), { hloubka: null, hladina: null, presne: null });
    assert.deepEqual(paramsFromState({ depth: 22, altitude: 5500, pressureMode: 'exact' }), { hloubka: 22, hladina: 5500, presne: 1 });
});

// ---------------------------------------------------------------- šipky

test('šipky krokují jen v otevřeném modelu, bez modifikátorů a mimo posuvník a pole', () => {
    const key = (k, extra = {}) => ({ key: k, target: { tagName: 'BUTTON', type: 'button' }, ...extra });
    assert.equal(modelArrowDir(key('ArrowRight'), { simOpen: true }), 1);
    assert.equal(modelArrowDir(key('ArrowLeft'), { simOpen: true }), -1);
    assert.equal(modelArrowDir(key('PageDown'), { simOpen: true }), 1, 'klikr');
    assert.equal(modelArrowDir(key('PageUp'), { simOpen: true }), -1, 'klikr');
    assert.equal(modelArrowDir(key('ArrowRight'), { simOpen: false }), 0);
    assert.equal(modelArrowDir(key('ArrowRight', { shiftKey: true }), { simOpen: true }), 0);
    assert.equal(modelArrowDir(key('ArrowRight', { target: { tagName: 'INPUT', type: 'range' } }), { simOpen: true }), 0,
        'posuvník hloubky má vlastní šipky po 0,5 m');
    assert.equal(modelArrowDir(key('ArrowUp'), { simOpen: true }), 0);
});

test('výstup nepoužívá tečku jako desetinný oddělovač ani běžnou mezeru před jednotkou', () => {
    for (const depth of SLIDE20_DEPTHS.sea) {
        const html = pressureReadout({ depth, altitude: 0, water: 'salt', pressureMode: 'school' });
        assert.doesNotMatch(html, /\d\.\d/);
        assert.doesNotMatch(html, / bar/);
        assert.doesNotMatch(html, new RegExp(`${NBSP}bar`), 'v HTML entita, ne znak');
        assert.match(html, /&nbsp;bar$/);
    }
});
