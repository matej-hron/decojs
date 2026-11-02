// Kurz P1 – Hustota: fyzika modelů, předvolby v URL, sdílené bloky, „Procvič si“.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
    waterDensity, densityAt, ICE_DENSITY, MAX_DENSITY_TEMPERATURE, WATER_RANGE,
} from '../js/physics/waterDensity.js';
import { lakeTemperature, lakePhase, lakeHasIce, LAKE_MONTHS } from '../js/physics/lakeProfiles.js';

const near = (actual, expected, tol, msg) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ±${tol}, got ${actual}`);

// --- hustota vody ---------------------------------------------------------

test('hustota vody odpovídá tabulkovým hodnotám (Tanaka 2001)', () => {
    near(waterDensity(0), 999.843, 0.002, '0 °C');
    near(waterDensity(4), 999.975, 0.002, '4 °C');
    near(waterDensity(10), 999.703, 0.002, '10 °C');
    near(waterDensity(20), 998.207, 0.002, '20 °C');
    near(waterDensity(25), 997.047, 0.002, '25 °C');
});

test('maximum hustoty vody je u 4 °C (přesně 3,98 °C)', () => {
    near(MAX_DENSITY_TEMPERATURE, 3.98, 0.01);
    for (const t of [0, 2, 3, 5, 6, 10, 30]) {
        assert.ok(waterDensity(t) < waterDensity(MAX_DENSITY_TEMPERATURE), `${t} °C`);
    }
});

test('hustota mimo platnost vzorce hlásí chybu', () => {
    assert.throws(() => waterDensity(-1), RangeError);
    assert.throws(() => waterDensity(41), RangeError);
    assert.deepEqual(WATER_RANGE, [0, 40]);
});

test('pod 0 °C je led, lehčí než voda o ~8 %', () => {
    assert.deepEqual(densityAt(-2), { phase: 'ice', rho: ICE_DENSITY });
    assert.equal(ICE_DENSITY, 917);
    assert.equal(densityAt(4).phase, 'water');
    assert.equal(densityAt(0).phase, 'water');
    const drop = 1 - ICE_DENSITY / waterDensity(0);
    near(drop, 0.083, 0.003, 'pokles hustoty při zamrznutí');
});

// --- jezero / lom během roku ---------------------------------------------

const DEPTH = 40;
const profile = (m) => Array.from({ length: DEPTH + 1 }, (_, h) => lakeTemperature(m, h, DEPTH));

test('12 měsíců s fází roku', () => {
    assert.equal(LAKE_MONTHS.length, 12);
    const phases = new Set(LAKE_MONTHS.map((_, i) => lakePhase(i + 1)));
    assert.deepEqual([...phases].sort(), ['jarni-promichani', 'leto', 'podzimni-promichani', 'zima']);
    assert.throws(() => lakePhase(13), RangeError);
});

test('u dna hlubokého lomu je celý rok kolem 4 °C', () => {
    for (let m = 1; m <= 12; m++) {
        const bottom = lakeTemperature(m, DEPTH, DEPTH);
        assert.ok(bottom >= 3.9 && bottom <= 5.1, `měsíc ${m}: ${bottom}`);
    }
});

test('v zimě pod ledem: 0 °C u ledu, s hloubkou tepleji (inverzní vrstvení)', () => {
    for (const m of [1, 2]) {
        assert.equal(lakeHasIce(m), true);
        near(lakeTemperature(m, 0, DEPTH), 0, 0.05, `měsíc ${m} u ledu`);
        const p = profile(m);
        for (let h = 1; h < p.length; h++) assert.ok(p[h] >= p[h - 1] - 1e-9, `měsíc ${m}, ${h} m`);
        near(p[15], 4, 0.2, `měsíc ${m}, 15 m`);
    }
    assert.equal(lakeHasIce(8), false);
});

test('v létě teplá voda nahoře, s hloubkou monotónně chladněji (termoklina)', () => {
    const p = profile(8);
    assert.ok(p[0] > 20, `srpen hladina ${p[0]}`);
    for (let h = 1; h < p.length; h++) assert.ok(p[h] <= p[h - 1] + 1e-9, `srpen ${h} m`);
    // termoklina: největší pokles teploty na metr je pod hladinou, ne u ní
    const drops = p.slice(1).map((v, i) => p[i] - v);
    const steepest = drops.indexOf(Math.max(...drops));
    assert.ok(steepest >= 3 && steepest <= 15, `nejstrmější pokles v ${steepest} m`);
});

test('při jarním a podzimním promíchání má celý sloupec stejnou teplotu', () => {
    for (let m = 1; m <= 12; m++) {
        if (!lakePhase(m).endsWith('promichani')) continue;
        const p = profile(m);
        assert.equal(Math.max(...p) - Math.min(...p), 0, `měsíc ${m}: ${Math.min(...p)}–${Math.max(...p)}`);
    }
});

test('mělčí lom: profil se přizpůsobí hloubce, dno stále studené', () => {
    const shallow = 15;
    near(lakeTemperature(8, shallow, shallow), 5, 1.5, 'dno 15m lomu v srpnu');
    assert.throws(() => lakeTemperature(8, 20, 15), RangeError);
});

// --- všechny teploty profilu jsou v rozsahu, kde platí vzorec hustoty --------

test('profily leží v rozsahu vzorce hustoty', () => {
    for (let m = 1; m <= 12; m++) {
        for (const t of profile(m)) assert.ok(t >= 0 && t <= 30, `měsíc ${m}: ${t}`);
    }
});

test('pásma profilu navazují a pokrývají celý sloupec', async () => {
    const { lakeBands } = await import('../js/physics/lakeProfiles.js');
    for (let m = 1; m <= 12; m++) {
        const b = lakeBands(m, DEPTH);
        assert.equal(b[0].from, 0);
        assert.equal(b.at(-1).to, DEPTH);
        for (let i = 1; i < b.length; i++) assert.equal(b[i].from, b[i - 1].to);
    }
    assert.deepEqual(lakeBands(8, DEPTH).map(b => b.label), ['teplá vrstva', 'termoklina', 'studená voda u dna']);
});

// --- předvolby v URL ------------------------------------------------------

import { readParams, writeParams, normalizeParam } from '../js/course/modelParams.js';

const SCHEMA = {
    teplota: { min: -5, max: 30, step: 0.5, default: 4 },
    mesic: { min: 1, max: 12, step: 1, default: 8 },
};

test('předvolby: čtení, výchozí hodnoty, ořez a krok', () => {
    assert.deepEqual(readParams('', SCHEMA), { teplota: 4, mesic: 8 });
    assert.deepEqual(readParams('?teplota=12.3&mesic=1', SCHEMA), { teplota: 12.5, mesic: 1 });
    assert.deepEqual(readParams('?teplota=2,5', SCHEMA).teplota, 2.5, 'desetinná čárka z ručně psaného odkazu');
    assert.deepEqual(readParams('?teplota=-40&mesic=99', SCHEMA), { teplota: -5, mesic: 12 });
    assert.deepEqual(readParams('?teplota=abc&mesic=', SCHEMA), { teplota: 4, mesic: 8 });
    assert.equal(normalizeParam(0.1 + 0.2, { min: 0, max: 1, step: 0.1, default: 0 }), 0.3);
});

test('předvolby: zápis zachová cizí parametry', () => {
    assert.equal(writeParams('?mesic=3&x=1', { teplota: 7 }), '?mesic=3&x=1&teplota=7');
    assert.equal(writeParams('?teplota=7', { teplota: null }), '');
});

// --- sdílené bloky pojmů ----------------------------------------------------

import { conceptPath, isValidConceptId, loadConcepts } from '../js/course/concepts.js';

test('bloky pojmů: bezpečná id a cesta', () => {
    assert.equal(conceptPath('water-anomaly'), 'concepts/cs/water-anomaly.html');
    for (const bad of ['../x', 'A', 'a_b', '', 'a--b', '-a']) assert.equal(isValidConceptId(bad), false, bad);
    assert.throws(() => conceptPath('../etc/passwd'));
});

function fakeRoot(ids) {
    const slots = ids.map(id => ({ dataset: { concept: id }, innerHTML: '' }));
    return { slots, querySelectorAll: () => slots };
}

test('bloky pojmů: vloží obsah, stejný blok stáhne jen jednou, chybu ukáže', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        if (url.endsWith('missing.html')) return { ok: false, status: 404 };
        return { ok: true, text: async () => `<p>${url.split('/').pop()}</p>` };
    };
    const root = fakeRoot(['density', 'density', 'missing']);
    const n = await loadConcepts(root, { fetchImpl, base: 'https://example.test/' });
    assert.equal(n, 2);
    assert.equal(calls.length, 2);
    assert.equal(root.slots[0].innerHTML, '<p>density.html</p>');
    assert.equal(root.slots[2].dataset.conceptState, 'error');
});

// --- „Procvič si“ -------------------------------------------------------------

import { parseQuestionIds, pickQuestions } from '../js/course/practice.js';

test('Procvič si: ID z atributu a výběr otázek v pořadí', () => {
    assert.deepEqual(parseQuestionIds(' 8, 6,7 '), [8, 6, 7]);
    assert.throws(() => parseQuestionIds('6,x'));
    const data = { questions: [{ id: 6 }, { id: 7 }, { id: 8 }] };
    assert.deepEqual(pickQuestions(data, [8, 6]).map(q => q.id), [8, 6]);
    assert.throws(() => pickQuestions(data, [99]), /99/);
});

// --- stránky kurzu: odkazy na bloky, otázky a offline ----------------------

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const coursePages = ['p1/index.html', 'p1/hustota.html'];

test('stránky kurzu: vložené bloky pojmů existují a jsou v sw.js', () => {
    const sw = read('sw.js');
    for (const page of coursePages) {
        for (const [, id] of read(page).matchAll(/data-concept="([^"]+)"/g)) {
            const path = conceptPath(id);
            assert.ok(existsSync(new URL(path, ROOT)), `${page}: chybí ${path}`);
            assert.ok(sw.includes(`'./${path}'`), `sw.js STATIC_ASSETS: chybí ./${path}`);
        }
    }
});

test('stránky kurzu: otázky „Procvič si“ existují v kvízových datech', () => {
    for (const page of coursePages) {
        for (const m of read(page).matchAll(/data-quiz-source="([^"]+)"\s+data-question-ids="([^"]+)"/g)) {
            const data = JSON.parse(read(m[1]));
            assert.doesNotThrow(() => pickQuestions(data, parseQuestionIds(m[2])), `${page}: ${m[2]}`);
        }
    }
});

test('stránky kurzu a vše, co (i nepřímo) načítají, je v sw.js (offline na přednášce)', () => {
    const sw = read('sw.js');
    const seen = new Set();
    const visit = (rel) => {
        if (seen.has(rel)) return;
        seen.add(rel);
        const src = read(rel);
        const refs = rel.endsWith('.html')
            ? [...src.matchAll(/\b(?:src|href)="([^"#?:]+\.(?:js|css))"/g)].map(m => m[1])
            : [...src.matchAll(/\bfrom\s+'(\.{1,2}\/[^']+)'|\bimport\(\s*'(\.{1,2}\/[^']+)'\s*\)/g)].map(m => m[1] || m[2]);
        for (const r of refs) {
            const abs = new URL(r, new URL(rel, ROOT)).pathname.slice(new URL(ROOT).pathname.length);
            visit(abs);
        }
    };
    for (const page of coursePages) visit(page);
    const missing = [...seen].filter(f => !sw.includes(`'./${f}'`));
    assert.deepEqual(missing, [], 'sw.js STATIC_ASSETS');
    assert.ok(seen.has('js/components/WaterColumn.js') && seen.has('js/course/hustotaPage.js'), 'procházení importů funguje');
});

// --- graf hustoty ----------------------------------------------------------

import { niceTicks, densityAxis } from '../js/components/DensityCurve.js';

test('graf hustoty: osa obsáhne křivku s okrajem, dílky jsou hezké', () => {
    for (const range of [[0, 10], [0, 30]]) {
        const a = densityAxis(range);
        assert.ok(a.min < waterDensity(range[1]) && a.max > waterDensity(MAX_DENSITY_TEMPERATURE), String(range));
        assert.ok(a.ticks.length >= 3 && a.ticks.length <= 8, `${range}: ${a.ticks.length} dílků`);
    }
    assert.deepEqual(niceTicks(0, 30, 6).ticks, [0, 5, 10, 15, 20, 25, 30]);
});

// --- rozcestník --------------------------------------------------------------

import { chaptersHtml, questionsHtml } from '../js/course/hubPage.js';
import { P1_CHAPTERS, P1_QUESTIONS, chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';

test('rozcestník: hotové kapitoly jsou odkazy, ostatní „připravujeme“', () => {
    const html = chaptersHtml();
    assert.match(html, /href="hustota\.html"/);
    assert.doesNotMatch(html, /href="tlak\.html"/);
    assert.equal((html.match(/připravujeme/g) || []).length, P1_CHAPTERS.filter(c => c.status !== 'ready').length);
    for (const c of P1_CHAPTERS) {
        if (c.status === 'ready') assert.ok(existsSync(new URL(`p1/${c.slug}.html`, ROOT)), `chybí p1/${c.slug}.html`);
    }
});

test('rozcestník: každá otázka slidu 6 míří na existující kapitolu', () => {
    for (const q of P1_QUESTIONS) for (const s of q.answeredIn) assert.ok(chapterBySlug(s), s);
    assert.equal((questionsHtml().match(/<li>/g) || []).length, 6);
    assert.deepEqual(chapterNeighbours('hustota'), { prev: null, next: null });
});
