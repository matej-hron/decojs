import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import {
    LAKE_BANDS, LAKE_DEPTHS, LAKE_MAX_DEPTH, LAKE_MONTHS, formatAirTemperature, isSinkingTransition, lakeFrame,
    lakeTemperatureColor, lakeTextColor, monthKeyStep, stepMonth,
} from '../js/physics/lakeCycle.js';
import { LAKE_PARAMS } from '../js/course/hustotaPage.js';
import { readParams } from '../js/course/modelParams.js';

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

test('12 měsíců přesně podle tabulky: vzduch, 5 hloubek, led, vítr, popisek', () => {
    assert.deepEqual(LAKE_MONTHS.map(m => [m.name, m.air, m.temps, m.ice, m.wind, m.label]), [
        ['leden', -1, [0, 2, 3, 4, 4], true, 'cold', 'led na hladině'],
        ['únor', 0, [0, 2, 3, 4, 4], true, 'cold', 'led na hladině'],
        ['březen', 3, [4, 4, 4, 4, 4], false, 'warm', 'jarní promíchání'],
        ['duben', 9, [8, 6, 5, 4, 4], false, 'warm', 'hladina se ohřívá'],
        ['květen', 13, [14, 11, 6, 5, 4], false, 'warm', 'hladina se ohřívá'],
        ['červen', 17, [20, 17, 8, 5, 4], false, 'warm', 'letní vrstvení'],
        ['červenec', 18, [23, 21, 9, 5, 4], false, 'warm', 'letní vrstvení'],
        ['srpen', 18, [23, 22, 10, 5, 4], false, 'warm', 'letní vrstvení'],
        ['září', 13, [18, 18, 11, 5, 4], false, 'cold', 'hladina chladne'],
        ['říjen', 8, [12, 12, 11, 5, 4], false, 'cold', 'hladina chladne'],
        ['listopad', 4, [7, 7, 7, 5, 4], false, 'cold', 'hladina chladne'],
        ['prosinec', 0, [4, 4, 4, 4, 4], false, 'cold', 'podzimní promíchání'],
    ]);
});

test('fyzika dat: u dna vždy 4 °C, pod ledem nejstudenější nahoře, jinak nahoře nejtepleji', () => {
    for (const m of LAKE_MONTHS) {
        assert.equal(m.temps.length, LAKE_DEPTHS.length, m.name);
        assert.equal(m.temps.at(-1), 4, m.name);
        for (let i = 1; i < m.temps.length; i++) {
            if (m.ice) assert.ok(m.temps[i] >= m.temps[i - 1], `${m.name}: pod ledem s hloubkou tepleji`);
            else assert.ok(m.temps[i] <= m.temps[i - 1], `${m.name}: bez ledu s hloubkou chladněji`);
        }
        if (m.ice) assert.equal(m.temps[0], 0, m.name);
    }
});

test('hloubky a pásy v měřítku 0–30 m', () => {
    assert.equal(LAKE_MAX_DEPTH, 30);
    assert.deepEqual(LAKE_DEPTHS, [0, 5, 10, 20, 30]);
    assert.deepEqual(LAKE_BANDS, [[0, 2.5], [2.5, 7.5], [7.5, 15], [15, 25], [25, 30]]);
    LAKE_BANDS.forEach(([from, to], i) => {
        assert.ok(from <= LAKE_DEPTHS[i] && LAKE_DEPTHS[i] <= to, `hloubka ${LAKE_DEPTHS[i]} leží v pásu`);
        if (i) assert.equal(from, LAKE_BANDS[i - 1][1], 'pásy na sebe navazují');
    });
});

test('strom podle ročního období', () => {
    assert.deepEqual(LAKE_MONTHS.map(m => m.tree), ['snow', 'snow', 'bare', 'buds', 'leaves', 'leaves', 'leaves', 'leaves',
        'falling', 'falling', 'bare', 'bare']);
});

test('celý měsíc: snímek odpovídá tabulce a nic neklesá', () => {
    LAKE_MONTHS.forEach((m, i) => {
        const f = lakeFrame(i);
        assert.deepEqual(f.temps, m.temps);
        assert.equal(f.air, m.air);
        assert.equal(f.month, i);
        assert.equal(f.ice, m.ice ? 1 : 0);
        assert.equal(f.warm, m.wind === 'warm' ? 1 : 0);
        assert.equal(f.sinking, 0);
    });
});

test('přechod je plynulý: teploty, vzduch i led se mění postupně', () => {
    const f = lakeFrame(1.5); // únor → březen
    assert.deepEqual(f.temps, [2, 3, 3.5, 4, 4]);
    assert.equal(f.air, 1.5);
    assert.equal(f.ice, 0.5, 'led taje');
    assert.equal(lakeFrame(11.5).ice, 0.5, 'prosinec → leden: led přirůstá');
    assert.equal(lakeFrame(0.25).month, 0);
    assert.equal(lakeFrame(0.75).month, 1);
});

test('po prosinci leden a naopak: krok dokola', () => {
    assert.equal(stepMonth(11, 1), 0);
    assert.equal(stepMonth(0, -1), 11);
    assert.equal(stepMonth(5, 1), 6);
    assert.equal(stepMonth(5, -1), 4);
    assert.deepEqual(lakeFrame(12).temps, LAKE_MONTHS[0].temps);
    assert.deepEqual(lakeFrame(-1).temps, LAKE_MONTHS[11].temps);
});

test('klesání jen při srpen→září, září→říjen, říjen→listopad, listopad→prosinec, únor→březen', () => {
    assert.deepEqual(LAKE_MONTHS.map((_, i) => isSinkingTransition(i)),
        [false, true, false, false, false, false, false, true, true, true, true, false]);
    assert.ok(lakeFrame(7.5).sinking > 0.9);
    assert.equal(lakeFrame(3.5).sinking, 0);
});

test('teplota vzduchu: skutečné minus a nedělitelná mezera', () => {
    assert.equal(formatAirTemperature(18), 'vzduch 18 °C');
    assert.equal(formatAirTemperature(-1), 'vzduch −1 °C');
    assert.equal(formatAirTemperature(0), 'vzduch 0 °C');
    assert.equal(formatAirTemperature(-0.3), 'vzduch 0 °C', 'bez záporné nuly');
});

test('předvolba ?mesic=: leden bez předvolby, ořez na 1–12', () => {
    assert.equal(readParams('', LAKE_PARAMS).mesic, 1);
    assert.equal(readParams('?mesic=8', LAKE_PARAMS).mesic, 8);
    assert.equal(readParams('?mesic=99', LAKE_PARAMS).mesic, 12);
    assert.equal(readParams('?mesic=abc', LAKE_PARAMS).mesic, 1);
    assert.equal('faze' in LAKE_PARAMS, false);
});

test('klávesy posouvají měsíc jen v otevřeném simulátoru, posuvníku je přebírají', () => {
    const dom = new JSDOM('<input id="range" type="range"><button id="b"></button>');
    const key = (k, extra = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
        target: dom.window.document.getElementById('b'), ...extra });
    assert.equal(monthKeyStep(key('ArrowRight'), { simOpen: true }), 1);
    assert.equal(monthKeyStep(key('ArrowLeft'), { simOpen: true }), -1);
    assert.equal(monthKeyStep(key('ArrowRight'), { simOpen: false }), 0, 'zavřený simulátor: šipky přepínají slidy');
    assert.equal(monthKeyStep(key('ArrowUp'), { simOpen: true }), 0);
    assert.equal(monthKeyStep(key('ArrowLeft', { altKey: true }), { simOpen: true }), 0, 'Alt+← je zpět v prohlížeči');
    assert.equal(monthKeyStep(key('ArrowRight', { target: dom.window.document.getElementById('range') }), { simOpen: true }), 1,
        'i s fokusem na posuvníku, aby šel krok dokola');
});

test('stránka: bez přehrávání a bez ?faze=, poznámka podle zadání', () => {
    const html = readFileSync(new URL('../p1/hustota.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /jezero-play|course-play|faze/);
    assert.match(html, /Modelový lom hluboký 30&nbsp;m, typický rok\. Odhad podle hlášení potápěčů, ne měření\./);
    assert.match(html, /předchozí měsíc/);
    assert.match(html, /další měsíc/);
    assert.match(html, /\?mesic=1#model-lom/);
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
    assert.ok(luminance(lakeTemperatureColor(23)) < luminance(lakeTemperatureColor(14)), 'čím tepleji, tím sytější');
    assert.ok(luminance(lakeTemperatureColor(0)) < luminance(lakeTemperatureColor(3)), 'čím chladněji, tím sytější');
});

test('text ve vrstvě má kontrast aspoň 4,5:1 v každé teplotě přechodu', () => {
    for (let t = 0; t <= 23; t += 0.25) {
        const bg = lakeTemperatureColor(t);
        const fg = lakeTextColor(bg);
        assert.ok(contrast(fg, bg) >= 4.5, `${t} °C: ${fg} na ${bg} = ${contrast(fg, bg).toFixed(2)}`);
    }
});
