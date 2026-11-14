// Kurz P1 – Hustota: fyzika modelů, předvolby v URL, sdílené bloky, „Procvič si“.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import {
    waterDensity, densityAt, ICE_DENSITY, MAX_DENSITY_TEMPERATURE, WATER_RANGE,
} from '../js/physics/waterDensity.js';

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

// --- všechny teploty profilu jsou v rozsahu, kde platí vzorec hustoty --------

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
const coursePages = ['p1/index.html', 'p1/hustota.html', 'p1/tlak.html', 'p1/stlacovani-plynu.html', 'p1/archimeduv-zakon.html', 'p1/dalton.html', 'p1/henry.html', 'p1/zdroje.html'];

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
    assert.ok(seen.has('js/components/LakeCycle.js') && seen.has('js/course/hustotaPage.js'), 'procházení importů funguje');
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

import { answersHtml, chapterDetailsHtml, chaptersHtml, questionsHtml } from '../js/course/hubPage.js';
import { P1_CHAPTERS, P1_QUESTIONS, chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';

test('rozcestník: hotové kapitoly jsou odkazy, ostatní jen tlumené', () => {
    const html = chaptersHtml();
    assert.match(html, /href="hustota\.html"/);
    assert.match(html, /href="tlak\.html"/);
    assert.match(html, /href="stlacovani-plynu\.html"/);
    assert.match(html, /href="archimeduv-zakon\.html"/);
    assert.match(html, /href="dalton\.html"/);
    assert.match(html, /href="henry\.html"/);
    assert.doesNotMatch(html, /href="videni\.html"/);
    assert.doesNotMatch(html, /připravujeme/);
    assert.equal((html.match(/is-planned/g) || []).length, P1_CHAPTERS.filter(c => c.status !== 'ready').length);
    for (const c of P1_CHAPTERS) {
        if (c.status === 'ready') assert.ok(existsSync(new URL(`p1/${c.slug}.html`, ROOT)), `chybí p1/${c.slug}.html`);
    }
});

test('rozcestník: každá otázka slidu 6 míří na existující kapitolu', () => {
    for (const q of P1_QUESTIONS) for (const s of q.answeredIn) assert.ok(chapterBySlug(s), s);
    assert.equal((questionsHtml().match(/<li>/g) || []).length, 6);
    assert.deepEqual(chapterNeighbours('hustota'), { prev: null, next: chapterBySlug('tlak') });
    assert.deepEqual(chapterNeighbours('tlak'), { prev: chapterBySlug('hustota'), next: chapterBySlug('stlacovani-plynu') });
    assert.deepEqual(chapterNeighbours('stlacovani-plynu'), { prev: chapterBySlug('tlak'), next: chapterBySlug('archimeduv-zakon') });
    assert.deepEqual(chapterNeighbours('archimeduv-zakon'), { prev: chapterBySlug('stlacovani-plynu'), next: chapterBySlug('dalton') });
    assert.deepEqual(chapterNeighbours('dalton'), { prev: chapterBySlug('archimeduv-zakon'), next: chapterBySlug('henry') });
    assert.deepEqual(chapterNeighbours('henry'), { prev: chapterBySlug('dalton'), next: null });
});

test('rozcestník: slide 6 a 7 ukazují jen text slidu, zbytek je ve „Více“', () => {
    assert.doesNotMatch(questionsHtml(), /Odpověď v kapitole/);
    assert.doesNotMatch(chaptersHtml(), /slidy|P★/);
    assert.equal((answersHtml().match(/Odpověď v kapitole/g) || []).length, P1_QUESTIONS.length);
    assert.doesNotMatch(answersHtml(), /Tlak \(připravujeme\)/);
    assert.match(answersHtml(), /href="tlak\.html"/);
    assert.match(chapterDetailsHtml(), /Hustota: P★, slidy 8–9/);
});

// --- šablona kapitoly: začíná rovnou prvním slidem --------------------------

for (const c of P1_CHAPTERS.filter(ch => ch.status === 'ready')) {
    test(`kapitola ${c.slug}: hned první je slide s jediným h1`, () => {
        const html = readFileSync(new URL(`p1/${c.slug}.html`, ROOT), 'utf8');
        const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
        assert.equal((main.match(/<h1[\s>]/g) || []).length, 1, 'jediné h1');
        assert.match(main, /^<main[^>]*>\s*(?:<!--.*?-->\s*)*<section id="[^"]+" class="course-section">\s*<div class="course-slide"[^>]*>\s*<h1>/,
            'první je slide, jeho nadpis je h1');
    });

    test(`kapitola ${c.slug}: úvod je na začátku prvního „Více“, mimo sdílený blok`, () => {
        const html = readFileSync(new URL(`p1/${c.slug}.html`, ROOT), 'utf8');
        const more = html.slice(html.indexOf('<details class="course-more">'));
        assert.match(more, /^<details class="course-more">\s*<summary>.*?<\/summary>\s*<div class="course-more-body">\s*<div class="course-chapter-intro">/s);
        if (more.includes('data-concept')) {
            assert.ok(more.indexOf('course-chapter-intro') < more.indexOf('data-concept'), 'úvod je před blokem pojmu');
        }
    });
}


// --- pevná scéna: stejná šablona na rozcestníku i v kapitolách ---------------

for (const page of ['p1/index.html', ...P1_CHAPTERS.filter(c => c.status === 'ready').map(c => `p1/${c.slug}.html`)]) {
    test(`${page}: bez lišty kurzu, každá zastávka je slide v sekci`, () => {
        const html = readFileSync(new URL(page, ROOT), 'utf8');
        const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
        assert.doesNotMatch(main, /course-bar|course-toc|course-breadcrumb|course-slide-ref/);
        assert.match(main, /^<main[^>]*>\s*(?:<!--.*?-->\s*)*<section[^>]*class="course-section">\s*<div class="course-slide"/);
        assert.equal((main.match(/<h1[\s>]/g) || []).length, 1, 'jediné h1');
        assert.doesNotMatch(main, /data-slide-stop|course-title/);
        // Každá zastávka je jeden z typů šablony (docs/course/slides.md), vlastní třídy těla nemá.
        const stops = [...main.matchAll(/<section[^>]*class="course-section">\s*<div class="course-slide"([^>]*)>/g)].map(m => m[1]);
        assert.ok(stops.length > 0);
        for (const attrs of stops) {
            assert.match(attrs, /data-slide-type="(title|content|quote|models|figure|calc|practice)"/, attrs);
            assert.doesNotMatch(attrs, /\bclass=|style=/, attrs);
            const fit = attrs.match(/data-slide-fit="([^"]*)"/);
            if (fit) assert.equal(fit[1], 'compact');
        }
        assert.doesNotMatch(main, /course-core-(outline|rows|practice)|course-slide-cover/, 'typ místo třídy pro jeden slide');
        // Titulní typ: nejvýš jeden a jen jako první zastávka (rozcestník; kapitola, pokud ho přednáška má).
        const titles = stops.filter(a => a.includes('data-slide-type="title"')).length;
        assert.ok(titles <= 1, `${page}: ${titles} titulních slidů`);
        if (titles === 1) assert.ok(stops[0].includes('data-slide-type="title"'), 'titulní slide je první');
        if (page === 'p1/index.html') assert.equal(titles, 1);
        // každý slide má hlavičku jako první potomek, tělo až za ní
        for (const m of main.matchAll(/class="course-(?:model course-)?slide(?: [^"]*)?"[^>]*>\s*(<\w+[^>]*>)/g)) {
            assert.match(m[1], /^<(h1|h2|div class="chart-header")/, m[1]);
        }
    });
}

// --- model se otevírá z náhledu na svém slidu ---------------------------------

for (const c of P1_CHAPTERS.filter(ch => ch.status === 'ready')) {
    test(`kapitola ${c.slug}: každý model je v překryvu a má náhled na slidu`, () => {
        const html = readFileSync(new URL(`p1/${c.slug}.html`, ROOT), 'utf8');
        const models = [...html.matchAll(/class="course-model course-slide[^"]*" id="([^"]+)"/g)].map(m => m[1]);
        // Kapitola bez modelu (Dalton, rozhodnutí 2) nesmí mít ani náhled, který by nic neotevřel.
        const thumbs = [...html.matchAll(/data-open-model="([^"]+)"/g)].map(m => m[1]);
        for (const id of thumbs) assert.ok(models.includes(id), `náhled ${id} bez modelu`);
        for (const id of models) {
            assert.match(html, new RegExp(`<dialog class="course-sim"[^>]*>\\s*<div class="course-model course-slide[^"]*" id="${id}"`), `${id} v dialogu`);
            assert.match(html, new RegExp(`<button[^>]*class="course-thumb"[^>]*data-open-model="${id}"`), `náhled ${id}`);
        }
    });
}

test('Hustota: slide 9 má jedno „Více“ a v něm oba výklady i řešený příklad', () => {
    const html = readFileSync(new URL('p1/hustota.html', ROOT), 'utf8');
    const section = html.slice(html.indexOf('<section id="teplota"'), html.indexOf('<section id="procvic"'));
    assert.equal((section.match(/<details class="course-more">/g) || []).length, 1);
    const more = section.slice(section.indexOf('<details class="course-more">'), section.indexOf('<dialog'));
    for (const part of ['data-concept="water-anomaly"', 'data-concept="lake-stratification"', 'id="priklad-lom"']) {
        assert.ok(more.includes(part), part);
    }
    assert.doesNotMatch(html, /id="jezero"/);
});

test('slidy mají jediný styl Hladina, žádný přepínač', () => {
    const css = readFileSync(new URL('css/course.css', ROOT), 'utf8');
    assert.doesNotMatch(css, /data-slide=|svetly/);
    for (const page of coursePages) {
        assert.doesNotMatch(readFileSync(new URL(page, ROOT), 'utf8'), /svetly|dataset\.slide/);
    }
});

test('kurz P1 píše jednotku v hranatých závorkách, jako přednáška (style-guide, rozhodnutí 5)', () => {
    const html = readFileSync(new URL('p1/hustota.html', ROOT), 'utf8');
    assert.match(html, /<th scope="col">Hustota \[kg\/m³\]<\/th>/);
    assert.match(html, /<var>ρ<\/var> = <var>m<\/var>\/<var>V<\/var> <span class="course-unit">\[kg\/m³\]<\/span>/);
    assert.doesNotMatch(html, /Jednotka hustoty/);
    for (const file of ['p1/hustota.html', 'p1/index.html', 'p1/tlak.html', 'js/components/waterColumn/pressureLayer.js', 'js/course/tlakPage.js', 'p1/stlacovani-plynu.html', 'js/components/waterColumn/gasVolumeLayer.js', 'js/course/stlacovaniPage.js', 'js/course/boyleModel.js', 'js/components/DensityCurve.js', 'js/components/LakeCycle.js', 'js/components/WaterColumn.js', 'js/course/hustotaPage.js', 'p1/archimeduv-zakon.html', 'js/course/archimedesPage.js', 'js/course/buoyancyModel.js', 'js/components/waterColumn/buoyancyLayer.js', 'p1/dalton.html', 'js/course/daltonPage.js', 'js/course/gasParticles.js', 'p1/henry.html', 'js/course/henryPage.js']) {
        const src = readFileSync(new URL(file, ROOT), 'utf8');
        assert.doesNotMatch(src, /(hustota|teplota|hloubka|Hustota)[^\n'"]{0,12} \/ (\(|m\b|°C|kg)/, file);
    }
    assert.match(readFileSync(new URL('js/components/DensityCurve.js', ROOT), 'utf8'), /'teplota \[°C\]'[\s\S]*'hustota \[kg\/m³\]'/);
    assert.match(readFileSync(new URL('js/components/LakeCycle.js', ROOT), 'utf8'), /'hloubka \[m\]'/);
});

// --- úvodní slidy 2 až 5: text přesně ze slidů -------------------------------

test('rozcestník: slidy 2 až 5 mají text ze slidů a žádné „Více“', () => {
    const dom = new JSDOM(readFileSync(new URL('p1/index.html', ROOT), 'utf8')).window.document;
    const items = (id) => [...dom.querySelectorAll(`#${id} li`)]
        .map(li => [...li.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim());
    const title = (id) => dom.querySelector(`#${id} h2`).textContent.trim();
    assert.equal(title('plan'), 'Fyzika – plán');
    assert.deepEqual(items('plan'), ['Fyzika, teorie (dnes)', 'Fyziologie', 'Plánování ponorů, dekompresní postupy']);
    assert.equal(title('osnova-p1'), 'Fyzika – osnova výcviku');
    assert.equal(dom.querySelector('#osnova-p1 .course-quote-head').textContent.replace(/\s+/g, ' ').trim(), 'P★: T4 Základy potápěčské fyziky (2 × 45 min)');
    assert.deepEqual(items('osnova-p1'), [
        'Základní fyzikální pojmy spojené s potápěním (veličiny a jednotky, vysvětlení pojmů).',
        'Atmosférický, hydrostatický a celkový tlak, přetlak, podtlak (vysvětlení pojmů, vzájemná souvislost, výpočet celkového tlaku v určité hloubce).',
        'Vliv tlaku na plyny, kapaliny a tuhé látky.',
        'Složení vzduchu, hustota vzduchu.',
        'Boyleův-Mariotteův zákon (izotermický děj) ve vztahu k potápěčské praxi (praktické příklady a výpočty).',
        'Tělesné a přídavné dutiny, nebezpečí jejich poškození, nutnost vydechování při výstupu.',
        'Kompenzace tlaku ve středouší a v masce.',
        'Nebezpečí malých hloubek.',
        'Archimedův zákon, vyvážení potápěče, změny vyvážení během ponoru.',
    ]);
    assert.equal(dom.querySelector('#osnova-p2 .course-quote-head').textContent.replace(/\s+/g, ' ').trim(), 'P★★: T1 Potápěčská fyzika (2 × 45 min)');
    assert.deepEqual(items('osnova-p2'), [
        'opakování Boyleův – Mariottův zákon, rozšíření na stavovou rovnici ideálního plynu, důsledky jednotlivých dějů (isotermický, isochorický, isobarický) na potápěčskou praxi (výpočty jednoduchých příkladů s využitím stavové rovnice ideálního plynu, přepouštění plynů)',
        'parciální tlak plynu (vysvětlení pojmu), výpočet parciálního tlaku',
        'šíření světla a zvuku ve vzduchu a pod vodou, přechod z jednoho prostředí do druhého',
        'vidění na vzduchu, pod vodou, s potápěčskou maskou',
        'změna intenzity a barvy světla ve vodním prostředí',
        'slyšení na vzduchu a pod vodou',
        'teplo, teplota, vedení a sdílení tepla, tepelné ztráty při potápění',
        'rozpouštění a vylučování inertních plynů z roztoku',
        'Henryho zákon',
        'dynamika procesu',
        'přesycení, kritické přesycení',
        'souvislost s dekompresními procesy',
    ]);
    assert.equal(title('literatura'), 'Fyzika – literatura');
    assert.deepEqual(items('literatura'), ['Fyzika (Jahns)',
        'Potápění s přístrojem (Vrbovský, Jahns, Štětina, Růžička, Nachtigal, Hrdina)', 'Přístrojové potápění', 'Deco for Divers (Powell)']);
    for (const id of ['plan', 'osnova-p1', 'osnova-p2', 'literatura']) {
        assert.equal(dom.querySelector(`#${id} details`), null, `${id} bez „Více“`);
    }
});


// --- šablona slidů: každý typ, který stránky a vzorník používají, je popsaný v docs/course/slides.md ---

test('typy slidů jsou zdokumentované a vzorník ukazuje každý z nich', () => {
    const doc = readFileSync(new URL('docs/course/slides.md', ROOT), 'utf8');
    const sample = readFileSync(new URL('docs/course/vzornik-slidu.html', ROOT), 'utf8');
    const typesIn = (html) => new Set([...html.matchAll(/data-slide-type="([^"]+)"/g)].map(m => m[1]));
    const used = new Set(coursePages.flatMap(p => [...typesIn(readFileSync(new URL(p, ROOT), 'utf8'))]));
    for (const type of used) {
        assert.match(doc, new RegExp(`^### \`${type}\``, 'm'), `${type} v slides.md`);
        assert.ok(typesIn(sample).has(type), `${type} ve vzorníku`);
    }
    assert.deepEqual([...typesIn(sample)].filter(t => !used.has(t)), [], 'vzorník nemá typ, který stránky nepoužívají');
});

// --- T22: sousední slidy se stejným nadpisem mají stejnou velikost písma -------------

test('T22: sousední slidy se stejným nadpisem (pokračování) mají stejné data-slide-fit', () => {
    const pages = readdirSync(new URL('p1/', ROOT)).filter(f => f.endsWith('.html')).map(f => `p1/${f}`);
    const mismatched = [];
    for (const page of pages) {
        const doc = new JSDOM(read(page)).window.document;
        const slides = [...doc.querySelectorAll('main > section.course-section > .course-slide')].map(el => ({
            n: el.dataset.slideNumber,
            title: el.querySelector('h1, h2')?.textContent.replace(/\s+/g, ' ').trim(),
            fit: el.dataset.slideFit ?? '',
            type: el.dataset.slideType,
        }));
        for (let i = 1; i < slides.length; i++) {
            const [a, b] = [slides[i - 1], slides[i]];
            // Titulní slide má vlastní velikosti písma (compact na něj nepůsobí), s kapitolou může sdílet nadpis.
            if (a.type === 'title' || b.type === 'title') continue;
            if (a.title === b.title && a.fit !== b.fit) mismatched.push(`${page}: ${a.n} (${a.fit || '-'}) a ${b.n} (${b.fit || '-'}) „${a.title}“`);
        }
    }
    assert.deepEqual(mismatched, []);
});
