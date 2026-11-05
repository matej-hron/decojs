import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import {
    LAKE_BANDS, LAKE_DEPTHS, LAKE_MAX_DEPTH, LAKE_MONTH_NAMES, LAKE_STEPS, airOf, exchangeRange, firstStepOfMonth,
    formatAirTemperature, lakeFrame, lakeTemperatureColor, lakeTextColor, modelKeyStep, stepFromParams, stepIndex, swapLabel,
    treeOf, unstablePair,
} from '../js/physics/lakeCycle.js';
import { waterDensity } from '../js/physics/waterDensity.js';
import { LAKE_PARAMS, lakeReadout } from '../js/course/hustotaPage.js';
import { readParams, writeParams } from '../js/course/modelParams.js';

const NB = ' ';
const N = LAKE_STEPS.length;
const next = (i) => LAKE_STEPS[(i + 1) % N];
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
const iThaw = LAKE_STEPS.findIndex(s => s.kind === 'tání');
const iAutumnEnd = LAKE_STEPS.findIndex(s => s.temps[0] === 0);
const iSpringEnd = LAKE_STEPS.findIndex((s, i) => i > iThaw && s.temps.every(t => t === 4));

/** Co se změnilo mezi dvěma stavy. */
function diff(a, b) {
    const changed = a.flatMap((t, k) => (t !== b[k] ? [k] : []));
    if (changed.length === 0) return { type: 'stav' };
    if (changed.length === 1 && Math.abs(a[changed[0]] - b[changed[0]]) === 1) return { type: 'o 1 °C', at: changed[0] };
    if (changed.length === 2 && changed[1] === changed[0] + 1 && a[changed[0]] === b[changed[1]] && a[changed[1]] === b[changed[0]]) {
        return { type: 'prohození', at: changed[0] };
    }
    return { type: 'jiné', changed };
}

test('každý krok je změna o 1 °C, prohození sousedů, nebo stavový (led, únor, tání), i přes konec cyklu', () => {
    for (let i = 0; i < N; i++) {
        const d = diff(LAKE_STEPS[i].temps, next(i).temps);
        const label = `krok ${i + 1} → ${((i + 1) % N) + 1}: ${LAKE_STEPS[i].temps} → ${next(i).temps}`;
        assert.notEqual(d.type, 'jiné', label);
        if (d.type === 'stav') assert.ok(['led', 'klid', 'tání'].includes(next(i).kind), `${label}: stavový krok ${next(i).kind}`);
        if (d.type === 'prohození') {
            assert.equal(next(i).kind, 'výměna', label);
            assert.equal(next(i).swap, d.at, label);
            assert.equal(d.at, unstablePair(LAKE_STEPS[i].temps), `${label}: nejvýše položená nestabilní dvojice`);
        }
        if (next(i).kind === 'výměna') assert.equal(d.type, 'prohození', label);
    }
});

test('výchozí srpen, cyklus navazuje, počty podle zadání', () => {
    assert.deepEqual(LAKE_STEPS[0].temps, [23, 10, 6, 5, 4]);
    assert.equal(LAKE_STEPS[0].month, 'srpen');
    assert.deepEqual(LAKE_STEPS.at(-1).temps, [23, 9, 6, 5, 4], 'poslední krok navazuje na první o 1 °C');
    assert.equal(iAutumnEnd, 45, 'podzim: 45 kroků od výchozího srpna');
    assert.equal(LAKE_STEPS.slice(1, iAutumnEnd + 1).filter(s => s.kind === 'výměna').length, 13, 'podzim: 13 prohození');
    assert.equal(iSpringEnd - iThaw, 11, 'jaro: 11 kroků');
    assert.equal(N, 90, '45 podzim + 6 zima a stavové + 11 jaro + 28 léto');
});

test('po skončení prohazování je sloupec stabilní podle hustoty', () => {
    for (let i = 0; i < N; i++) {
        const unstable = unstablePair(LAKE_STEPS[i].temps) >= 0;
        if (unstable) assert.equal(next(i).kind, 'výměna', `krok ${i + 1} ${LAKE_STEPS[i].temps}: nestabilní, musí následovat prohození`);
    }
});

test('celý lom má 4 °C na jaře i na podzimu, u dna vždy 4 °C', () => {
    const fours = LAKE_STEPS.filter(s => s.temps.every(t => t === 4));
    assert.deepEqual(fours.map(s => s.month), ['prosinec', 'duben']);
    assert.deepEqual(fours.map(s => s.label), [`Celý lom má 4${NB}°C: podzimní promíchání`, `Celý lom má 4${NB}°C: jarní promíchání`]);
    for (const s of LAKE_STEPS) assert.equal(s.temps.at(-1), 4);
    for (const s of LAKE_STEPS) assert.equal(s.temps.length, 5);
});

test('led jen od 0 °C na hladině, zima podle zadání', () => {
    const frozen = LAKE_STEPS.filter(s => s.ice);
    for (const s of frozen) assert.equal(s.temps[0], 0);
    assert.deepEqual(frozen.map(s => s.temps.join()), ['0,4,4,4,4', '0,3,4,4,4', '0,2,4,4,4', '0,2,3,4,4', '0,2,3,4,4']);
    assert.deepEqual(frozen.map(s => [s.month, s.label]), [
        ['leden', 'Hladina zamrzla'],
        ['leden', 'Pod ledem voda pomalu chladne'],
        ['leden', 'Pod ledem voda pomalu chladne'],
        ['leden', 'Pod ledem voda pomalu chladne'],
        ['únor', 'Led na hladině'],
    ]);
    assert.equal(LAKE_STEPS[iThaw].label, 'Led roztál');
    assert.equal(LAKE_STEPS[iThaw].ice, false);
});

test('léto: cíle měsíců, po 1 °C shora dolů, pravidlo prohození se nespustí', () => {
    const summer = LAKE_STEPS.slice(iSpringEnd + 1);
    assert.equal(summer.length, 27, '28 kroků, poslední je znovu výchozí srpen');
    for (const s of summer) {
        assert.equal(unstablePair(s.temps), -1, `${s.temps}`);
        assert.notEqual(s.kind, 'výměna');
    }
    const lastOf = (month) => LAKE_STEPS.filter(s => s.month === month).at(-1).temps;
    assert.deepEqual(lastOf('duben'), [8, 5, 4, 4, 4]);
    assert.deepEqual(lastOf('březen'), [3, 3, 3, 4, 4]);
    assert.deepEqual(lastOf('květen'), [13, 6, 5, 4, 4]);
    assert.deepEqual(lastOf('červen'), [19, 8, 5, 5, 4]);
    assert.deepEqual(lastOf('červenec'), [22, 9, 6, 5, 4]);
    // v rámci měsíce nejdřív hladina
    assert.deepEqual(LAKE_STEPS[iSpringEnd + 1].temps, [5, 4, 4, 4, 4]);
    assert.deepEqual(LAKE_STEPS[iSpringEnd + 4].temps, [8, 4, 4, 4, 4]);
    assert.deepEqual(LAKE_STEPS[iSpringEnd + 5].temps, [8, 5, 4, 4, 4]);
});

test('měsíce jdou monotónně po cyklu, podzimní hranice podle nejnižší hladiny, prohození měsíc nevrátí', () => {
    const order = ['srpen', 'září', 'říjen', 'listopad', 'prosinec', 'leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen'];
    let at = 0;
    for (const s of LAKE_STEPS) {
        const here = order.indexOf(s.month, at);
        assert.ok(here === at || here === at + 1, `${s.month} po ${order[at]}`);
        at = here;
    }
    let lowest = 23;
    for (const s of LAKE_STEPS.slice(1, iAutumnEnd + 1)) {
        lowest = Math.min(lowest, s.temps[0]);
        const expected = lowest >= 16 ? 'září' : lowest >= 10 ? 'říjen' : lowest >= 6 ? 'listopad' : 'prosinec';
        assert.equal(s.month, expected, `${s.temps}`);
    }
    assert.deepEqual(LAKE_MONTH_NAMES.map(airOf), [-1, 0, 3, 9, 13, 17, 18, 18, 13, 8, 4, 0]);
});

test('popisky podle druhu kroku', () => {
    const labelOf = (temps) => LAKE_STEPS.find(s => s.temps.join() === temps.join()).label;
    assert.equal(LAKE_STEPS[1].label, 'Hladina chladne');
    assert.equal(labelOf([9, 10, 6, 5, 4]), 'Hladina je chladnější než vrstva pod ní, a proto těžší');
    assert.equal(labelOf([10, 9, 6, 5, 4]), 'Vrstvy se prohodí: těžší voda klesá, teplejší stoupá');
    assert.equal(labelOf([3, 4, 4, 4, 4]), `Hladina chladne, pod 4${NB}°C je lehčí a zůstává nahoře`);
    const spring = LAKE_STEPS.slice(iThaw + 1, iSpringEnd + 1);
    assert.equal(spring[0].label, 'Hladina se ohřívá');
    assert.equal(spring.find(s => s.temps.join() === '3,2,3,4,4').label, `Hladina má teplotu blíž 4${NB}°C, a proto je těžší než voda pod ní`);
    assert.equal(LAKE_STEPS[0].label, 'Letní vrstvení: teplejší a lehčí voda zůstává nahoře');
    assert.equal(LAKE_STEPS.at(-1).label, 'Slunce ohřívá hladinu, lehčí voda zůstává nahoře');
    assert.equal(labelOf([8, 5, 4, 4, 4]), 'Teplo pomalu proniká hlouběji');
});

test('jaro: březen končí 3, 3, 3, 4, 4, první krok nad vzduchem března je duben a měsíc se nevrací', () => {
    const iApril = firstStepOfMonth(LAKE_MONTH_NAMES.indexOf('duben') + 1);
    assert.deepEqual(LAKE_STEPS[iApril - 1].temps, [3, 3, 3, 4, 4]);
    assert.equal(LAKE_STEPS[iApril - 1].month, 'březen');
    assert.deepEqual(LAKE_STEPS[iApril].temps, [4, 3, 3, 4, 4]);
    assert.equal(LAKE_STEPS[iSpringEnd].label, `Celý lom má 4${NB}°C: jarní promíchání`);
    assert.equal(LAKE_STEPS[iSpringEnd].month, 'duben');
});

test('hladina proti vzduchu: chladne jen ke vzduchu, ohřívá se na jaře jen ke vzduchu', () => {
    for (let i = 0; i < N; i++) {
        const [was, s] = [LAKE_STEPS[i].temps[0], next(i)];
        const label = `krok ${i + 1} → ${((i + 1) % N) + 1}: ${was} → ${s.temps[0]}, ${s.month} vzduch ${airOf(s.month)}`;
        // Prohození je výměna vod, ne chlazení vzduchem: jarní prohození hladinu dočasně sníží.
        if (s.temps[0] < was && s.kind !== 'výměna') assert.ok(s.temps[0] >= Math.max(airOf(s.month), 0), label);
        if (s.temps[0] > was && ['březen', 'duben', 'květen'].includes(s.month)) assert.ok(s.temps[0] <= airOf(s.month), label);
    }
});

test('led jen v měsíci se vzduchem nejvýš 0 °C, první krok ledna má led', () => {
    for (const s of LAKE_STEPS) if (s.ice) assert.ok(airOf(s.month) <= 0, s.month);
    assert.equal(LAKE_STEPS[firstStepOfMonth(1)].ice, true);
    assert.equal(LAKE_STEPS[firstStepOfMonth(1)].label, 'Hladina zamrzla');
    const before = LAKE_STEPS[firstStepOfMonth(1) - 1];
    assert.deepEqual([before.month, before.temps[0], before.ice], ['prosinec', 0, false], 'hladina 0 °C bez ledu patří do prosince');
});

test('od března do srpna je hladina nad vzduchem jen v létě, bez prohození a se sluncem v popisku', () => {
    // Podzim a zima sem nepatří: na podzim je hladina nad vzduchem záměrně, voda chladne pomalu.
    for (let i = iThaw; i < N; i++) {
        const s = LAKE_STEPS[i];
        if (s.temps[0] <= airOf(s.month)) continue;
        const label = `krok ${i + 1}: hladina ${s.temps[0]}, ${s.month} vzduch ${airOf(s.month)}`;
        assert.ok(['červen', 'červenec', 'srpen'].includes(s.month), label);
        assert.notEqual(s.kind, 'výměna', label);
        // Změna hlubší vrstvy nese popisek o pronikání tepla, slunce jmenuje krok, který ohřál hladinu.
        const surfaceChanged = s.temps[0] !== LAKE_STEPS[i - 1].temps[0];
        if (surfaceChanged) assert.match(s.label, /Slunce/, label);
        else assert.equal(s.label, 'Teplo pomalu proniká hlouběji', label);
    }
    assert.ok(LAKE_STEPS[0].temps[0] > airOf(LAKE_STEPS[0].month), 'krok 1 je výjimka s popiskem letního vrstvení');
});

test('prohození: stoupá lehčí voda; „teplejší“ jen tam, kde stoupá opravdu teplejší', () => {
    assert.equal(swapLabel(10, 9), 'Vrstvy se prohodí: těžší voda klesá, teplejší stoupá');
    assert.equal(swapLabel(2, 3), 'Vrstvy se prohodí: těžší voda klesá, lehčí stoupá');
    for (let i = 0; i < N; i++) {
        const s = LAKE_STEPS[i];
        if (s.kind !== 'výměna') continue;
        const [rising, sinking] = [s.temps[s.swap], s.temps[s.swap + 1]];
        assert.ok(waterDensity(rising) < waterDensity(sinking), `krok ${i + 1}: stoupá lehčí`);
        assert.equal(s.label.includes('teplejší'), rising > sinking, `krok ${i + 1}: ${s.label}`);
    }
});

test('šipky prohození jen u dotčené dvojice vrstev', () => {
    const first = LAKE_STEPS.findIndex(s => s.kind === 'výměna');
    assert.deepEqual(LAKE_STEPS[first].temps.slice(0, 2), [10, 9]);
    assert.deepEqual(exchangeRange(first), [0, 12]);
    const deep = LAKE_STEPS.findIndex(s => s.kind === 'výměna' && s.swap === 2);
    assert.deepEqual(exchangeRange(deep), [12, 24]);
});

test('pět stejných vrstev v měřítku 0–30 m', () => {
    assert.equal(LAKE_MAX_DEPTH, 30);
    assert.deepEqual(LAKE_BANDS, [[0, 6], [6, 12], [12, 18], [18, 24], [24, 30]]);
    assert.deepEqual(LAKE_DEPTHS, [0, 6, 12, 18, 24, 30]);
});

test('strom a vítr podle měsíce kroku', () => {
    assert.deepEqual(['leden', 'březen', 'duben', 'srpen', 'září', 'listopad'].map(treeOf),
        ['snow', 'bare', 'buds', 'leaves', 'falling', 'bare']);
    assert.equal(lakeFrame(0).warm, 1, 'srpen teplý vítr');
    assert.equal(lakeFrame(1).warm, 0, 'září studený vítr');
});

test('celý krok: snímek odpovídá kroku, přechod je plynulý', () => {
    LAKE_STEPS.forEach((s, i) => {
        const f = lakeFrame(i);
        assert.deepEqual(f.temps, s.temps);
        assert.equal(f.air, airOf(s.month));
        assert.equal(f.step, i);
        assert.equal(f.ice, s.ice ? 1 : 0);
    });
    const f = lakeFrame(0.5);
    assert.equal(f.temps[0], 22.5);
    assert.equal(f.air, 15.5);
    const iIce = LAKE_STEPS.findIndex(s => s.ice);
    assert.equal(lakeFrame(iIce - 0.5).ice, 0.5, 'led přirůstá');
    assert.equal(lakeFrame(iThaw - 0.5).ice, 0.5, 'led mizí');
});

test('krok dokola', () => {
    assert.equal(stepIndex(N - 1, 1), 0);
    assert.equal(stepIndex(0, -1), N - 1);
    assert.equal(stepIndex(5, 1), 6);
    assert.deepEqual(lakeFrame(N).temps, LAKE_STEPS[0].temps);
    assert.deepEqual(lakeFrame(-1).temps, LAKE_STEPS[N - 1].temps);
});

test('tlačítka měsíců a ?mesic=: první krok měsíce; ?krok= má přednost; bez předvolby srpen', () => {
    assert.equal(LAKE_MONTH_NAMES.length, 12);
    assert.equal(LAKE_MONTH_NAMES.map(n => n[0].toUpperCase()).join(''), 'LÚBDKČČSZŘLP');
    LAKE_MONTH_NAMES.forEach((name, m) => {
        const first = firstStepOfMonth(m + 1);
        assert.equal(LAKE_STEPS[first].month, name);
        assert.ok(LAKE_STEPS.slice(0, first).every(s => s.month !== name), `${name}: nic dřív`);
    });
    assert.equal(firstStepOfMonth(8), 0, 'srpen začíná výchozím stavem');
    assert.equal(LAKE_STEPS[firstStepOfMonth(2)].label, 'Led na hladině', 'odkaz „zima“ z řešeného příkladu vede na únor');
    const parse = (q) => stepFromParams(readParams(q, LAKE_PARAMS));
    assert.equal(parse(''), null);
    assert.equal(parse('?krok=14'), 13);
    assert.equal(parse('?krok=999'), N - 1, 'ořez podle počtu kroků');
    assert.equal(parse('?mesic=9'), firstStepOfMonth(9));
    assert.equal(parse('?mesic=9&krok=2'), 1);
    assert.equal(parse('?mesic=abc'), null);
});

test('po zavření simulátoru předvolby zmizí z adresy, cizí parametry zůstanou', () => {
    assert.equal(writeParams('?krok=3&mesic=5', { krok: null, mesic: null }), '');
    assert.equal(writeParams('?krok=3&x=1', { krok: null, mesic: null }), '?x=1');
});

test('odečet: měsíc, pořadí kroku a popisek', () => {
    assert.deepEqual(lakeReadout(0), { main: 'Srpen', sub: `krok 1 z ${N}`, label: 'Letní vrstvení: teplejší a lehčí voda zůstává nahoře' });
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

test('stránka a výklad: ovládání po krocích, poznámka a srpen podle nového stavu', () => {
    const html = readFileSync(new URL('../p1/hustota.html', import.meta.url), 'utf8');
    assert.match(html, /předchozí krok/);
    assert.match(html, /další krok/);
    assert.match(html, new RegExp(`id="krok-slider" min="1" max="${N}"`));
    assert.match(html, /id="lom-mesice"/);
    assert.match(html, /Modelový lom hluboký 30&nbsp;m, zjednodušeno na 5 stejných vrstev\. Odhad podle hlášení potápěčů, ne měření\./);
    const concept = readFileSync(new URL('../concepts/cs/lake-stratification.html', import.meta.url), 'utf8');
    assert.match(concept, /Proč hladina nevychladne na teplotu vzduchu\?/);
    assert.match(concept, /horní vrstva kolem 23&nbsp;°C, vrstva v hloubce 6 až 12&nbsp;m kolem 10&nbsp;°C a u dna jsou 4&nbsp;°C/);
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
