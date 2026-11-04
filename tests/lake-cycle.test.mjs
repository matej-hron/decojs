import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import {
    LAKE_BANDS, LAKE_DEPTHS, LAKE_MAX_DEPTH, LAKE_STEPS, airOf, exchangeLayerCount, firstStepOfMonth, formatAirTemperature,
    lakeFrame, lakeTemperatureColor, lakeTextColor, modelKeyStep, stepFromParams, stepIndex, treeOf,
} from '../js/physics/lakeCycle.js';
import { waterDensity } from '../js/physics/waterDensity.js';
import { LAKE_PARAMS, lakeReadout } from '../js/course/hustotaPage.js';
import { readParams, writeParams } from '../js/course/modelParams.js';

const NB = ' ';
const luminance = (hex) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

const TABLE = [
    ['leden', -1, [0, 2, 3, 4, 4], true, 'klid', 'led na hladině'],
    ['únor', 0, [0, 2, 3, 4, 4], true, 'klid', 'led na hladině'],
    ['březen', 3, [2, 2, 3, 4, 4], false, 'ohřev', 'led roztál, hladina se ohřívá'],
    ['březen', 3, [4, 3, 3, 4, 4], false, 'těžší', `hladina má 4${NB}°C, je těžší než voda pod ní`],
    ['březen', 3, [4, 4, 4, 4, 4], false, 'výměna', 'vrstvy se mění: jarní promíchání'],
    ['duben', 9, [8, 6, 5, 4, 4], false, 'ohřev', 'hladina se ohřívá, lehčí voda zůstává nahoře'],
    ['květen', 13, [14, 11, 6, 5, 4], false, 'ohřev', 'hladina se ohřívá, lehčí voda zůstává nahoře'],
    ['červen', 17, [20, 17, 8, 5, 4], false, 'klid', 'letní vrstvení'],
    ['červenec', 18, [23, 21, 9, 5, 4], false, 'klid', 'letní vrstvení'],
    ['srpen', 18, [23, 22, 10, 5, 4], false, 'klid', 'letní vrstvení'],
    ['září', 13, [22, 22, 10, 5, 4], false, 'chlazení', 'hladina chladne'],
    ['září', 13, [21, 22, 10, 5, 4], false, 'těžší', 'hladina je chladnější než vrstva pod ní, a proto těžší'],
    ['září', 13, [21, 21, 11, 5, 4], false, 'výměna', 'vrstvy se mění: těžší voda klesá, teplejší stoupá'],
    ['září', 13, [18, 18, 11, 5, 4], false, 'chlazení', 'hladina chladne'],
    ['říjen', 8, [12, 12, 11, 5, 4], false, 'chlazení', 'hladina chladne'],
    ['listopad', 4, [7, 7, 7, 5, 4], false, 'chlazení', 'hladina chladne'],
    ['prosinec', 0, [4, 7, 7, 5, 4], false, 'těžší', 'hladina je chladnější než vrstva pod ní, a proto těžší'],
    ['prosinec', 0, [5, 5, 5, 5, 4], false, 'výměna', 'vrstvy se mění: těžší voda klesá, teplejší stoupá'],
    ['prosinec', 0, [4, 5, 5, 5, 4], false, 'těžší', 'hladina je chladnější než vrstva pod ní, a proto těžší'],
    ['prosinec', 0, [4, 4, 4, 4, 4], false, 'výměna', 'vrstvy se mění až ke dnu: podzimní promíchání'],
    ['prosinec', 0, [3, 4, 4, 4, 4], false, 'lehčí', `hladina je chladnější, ale pod 4${NB}°C je lehčí, a proto zůstává nahoře`],
    ['leden', -1, [1, 3, 4, 4, 4], false, 'lehčí', 'hladina dál chladne a zůstává nahoře'],
];

test('22 kroků přesně podle tabulky: měsíc, vzduch, teploty, led, druh, popisek', () => {
    assert.deepEqual(LAKE_STEPS.map(s => [s.month, airOf(s.month), s.temps, s.ice, s.kind, s.label]), TABLE);
});

test('5 hloubek v každém kroku, u dna vždy 4 °C', () => {
    assert.equal(LAKE_STEPS.length, 22);
    for (const [i, s] of LAKE_STEPS.entries()) {
        assert.equal(s.temps.length, LAKE_DEPTHS.length, `krok ${i + 1}`);
        assert.equal(s.temps.at(-1), 4, `krok ${i + 1}`);
    }
});

test('„těžší“: hladina je opravdu hustší než vrstva pod ní; nad 4 °C tedy i chladnější', () => {
    const steps = LAKE_STEPS.filter(s => s.kind === 'těžší');
    assert.equal(steps.length, 4);
    for (const s of steps) {
        assert.ok(waterDensity(s.temps[0]) > waterDensity(s.temps[1]), `${s.temps}: hustota`);
        if (s.temps[0] > 4) assert.ok(s.temps[0] < s.temps[1], `${s.temps}: nad 4 °C chladnější`);
    }
});

test('před každou výměnou je hladina těžší než vrstva pod ní; nad 4 °C tedy chladnější', () => {
    const exchanges = LAKE_STEPS.flatMap((s, i) => (s.kind === 'výměna' ? [i] : []));
    assert.deepEqual(exchanges, [4, 12, 17, 19]);
    for (const i of exchanges) {
        const [surface, below] = LAKE_STEPS[i - 1].temps;
        assert.ok(waterDensity(surface) > waterDensity(below), `před krokem ${i + 1}: ${surface} °C je hustší než ${below} °C`);
        if (below > 4) assert.ok(surface < below, `před krokem ${i + 1}: ${surface} °C < ${below} °C`);
        assert.equal(LAKE_STEPS[i].temps[0], LAKE_STEPS[i].temps[1], `krok ${i + 1}: po výměně vyrovnáno`);
    }
});

test('„lehčí“: pod 4 °C je chladnější voda méně hustá, zůstává nahoře', () => {
    const steps = LAKE_STEPS.filter(s => s.kind === 'lehčí');
    assert.equal(steps.length, 2);
    for (const s of steps) {
        assert.ok(s.temps[0] < 4 && s.temps[0] < s.temps[1], `${s.temps}`);
        assert.ok(waterDensity(s.temps[0]) < waterDensity(s.temps[1]), `${s.temps}: hustota`);
    }
});

test('výměna zasahuje jen vrstvy, které se mění; krok 20 až ke dnu', () => {
    assert.equal(exchangeLayerCount(4), 3);
    assert.equal(exchangeLayerCount(12), 3);
    assert.equal(exchangeLayerCount(17), 3);
    assert.equal(exchangeLayerCount(19), 4);
});

test('hloubky a pásy v měřítku 0–30 m', () => {
    assert.equal(LAKE_MAX_DEPTH, 30);
    assert.deepEqual(LAKE_DEPTHS, [0, 5, 10, 20, 30]);
    assert.deepEqual(LAKE_BANDS, [[0, 2.5], [2.5, 7.5], [7.5, 15], [15, 25], [25, 30]]);
});

test('strom a vítr podle měsíce kroku', () => {
    assert.deepEqual(['leden', 'březen', 'duben', 'srpen', 'září', 'listopad'].map(m => treeOf(m)),
        ['snow', 'bare', 'buds', 'leaves', 'falling', 'bare']);
    assert.equal(lakeFrame(9).warm, 1, 'srpen teplý vítr');
    assert.equal(lakeFrame(10).warm, 0, 'září studený vítr');
});

test('celý krok: snímek odpovídá tabulce', () => {
    LAKE_STEPS.forEach((s, i) => {
        const f = lakeFrame(i);
        assert.deepEqual(f.temps, s.temps);
        assert.equal(f.air, airOf(s.month));
        assert.equal(f.step, i);
        assert.equal(f.ice, s.ice ? 1 : 0);
    });
});

test('přechod je plynulý: teploty, vzduch i led se mění postupně', () => {
    const f = lakeFrame(1.5); // krok 2 → 3
    assert.deepEqual(f.temps, [1, 2, 3, 4, 4]);
    assert.equal(f.air, 1.5);
    assert.equal(f.ice, 0.5, 'led taje');
    assert.equal(lakeFrame(21.5).ice, 0.5, 'krok 22 → 1: led přirůstá');
    assert.equal(lakeFrame(0.25).step, 0);
    assert.equal(lakeFrame(0.75).step, 1);
});

test('po kroku 22 krok 1 a naopak: dokola', () => {
    assert.equal(stepIndex(21, 1), 0);
    assert.equal(stepIndex(0, -1), 21);
    assert.equal(stepIndex(5, 1), 6);
    assert.deepEqual(lakeFrame(22).temps, LAKE_STEPS[0].temps);
    assert.deepEqual(lakeFrame(-1).temps, LAKE_STEPS[21].temps);
});

test('?krok= a ?mesic=: měsíc otevře svůj první krok, krok má přednost, bez předvolby null', () => {
    assert.equal(firstStepOfMonth(1), 0);
    assert.equal(firstStepOfMonth(3), 2);
    assert.equal(firstStepOfMonth(9), 10);
    assert.equal(firstStepOfMonth(12), 16);
    const parse = (q) => stepFromParams(readParams(q, LAKE_PARAMS));
    assert.equal(parse(''), null);
    assert.equal(parse('?krok=13'), 12);
    assert.equal(parse('?krok=99'), 21, 'ořez');
    assert.equal(parse('?krok=22'), 21);
    assert.equal(parse('?mesic=9'), 10);
    assert.equal(parse('?mesic=9&krok=2'), 1);
    assert.equal(parse('?mesic=abc'), null);
});

test('po zavření simulátoru předvolby zmizí z adresy, cizí parametry zůstanou', () => {
    assert.equal(writeParams('?krok=3&mesic=5', { krok: null, mesic: null }), '');
    assert.equal(writeParams('?krok=3&x=1', { krok: null, mesic: null }), '?x=1');
});

test('odečet: měsíc, pořadí kroku a popisek', () => {
    assert.deepEqual(lakeReadout(12), {
        main: 'Září', sub: 'krok 13 z 22', label: 'vrstvy se mění: těžší voda klesá, teplejší stoupá',
    });
});

test('teplota vzduchu: skutečné minus a nedělitelná mezera', () => {
    assert.equal(formatAirTemperature(18), `vzduch 18${NB}°C`);
    assert.equal(formatAirTemperature(-1), `vzduch −1${NB}°C`);
    assert.equal(formatAirTemperature(-0.3), `vzduch 0${NB}°C`, 'bez záporné nuly');
});

test('klávesy posouvají krok jen v otevřeném simulátoru, i s fokusem na posuvníku', () => {
    const dom = new JSDOM('<input id="range" type="range"><button id="b"></button>');
    const key = (k, extra = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
        target: dom.window.document.getElementById('b'), ...extra });
    assert.equal(modelKeyStep(key('ArrowRight'), { simOpen: true }), 1);
    assert.equal(modelKeyStep(key('ArrowLeft'), { simOpen: true }), -1);
    assert.equal(modelKeyStep(key('ArrowRight'), { simOpen: false }), 0, 'zavřený simulátor: šipky přepínají slidy');
    assert.equal(modelKeyStep(key('ArrowUp'), { simOpen: true }), 0);
    assert.equal(modelKeyStep(key('ArrowLeft', { altKey: true }), { simOpen: true }), 0);
    assert.equal(modelKeyStep(key('ArrowRight', { target: dom.window.document.getElementById('range') }), { simOpen: true }), 1);
});

test('stránka: ovládání po krocích, výklad s odstavcem o vzduchu', () => {
    const html = readFileSync(new URL('../p1/hustota.html', import.meta.url), 'utf8');
    assert.match(html, /předchozí krok/);
    assert.match(html, /další krok/);
    assert.doesNotMatch(html, /předchozí měsíc|další měsíc/);
    assert.match(html, /id="krok-slider" min="1" max="22"/);
    assert.match(html, /Modelový lom hluboký 30&nbsp;m, typický rok\. Odhad podle hlášení potápěčů, ne měření\./);
    const concept = readFileSync(new URL('../concepts/cs/lake-stratification.html', import.meta.url), 'utf8');
    assert.match(concept, /Proč hladina nevychladne na teplotu vzduchu\?/);
});

test('barvy: teplé červené, 4 °C světlá, pod 4 °C modré', () => {
    const [r4, g4, b4] = rgb(lakeTemperatureColor(4));
    assert.ok(Math.min(r4, g4, b4) > 180, '4 °C je světlá');
    for (const t of [6, 8, 10, 14, 18, 23]) {
        const [r, , b] = rgb(lakeTemperatureColor(t));
        assert.ok(r > b + 30, `${t} °C je červená`);
    }
    for (const t of [0, 1, 2, 3]) {
        const [r, , b] = rgb(lakeTemperatureColor(t));
        assert.ok(b > r + 30, `${t} °C je modrá`);
    }
});

test('text ve vrstvě má kontrast aspoň 4,5:1 v každé teplotě přechodu', () => {
    for (let t = 0; t <= 23; t += 0.25) {
        const bg = lakeTemperatureColor(t);
        const fg = lakeTextColor(bg);
        assert.ok(contrast(fg, bg) >= 4.5, `${t} °C: ${fg} na ${bg} = ${contrast(fg, bg).toFixed(2)}`);
    }
});
