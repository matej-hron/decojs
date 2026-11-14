// Kurz P1 – kapitola Přenos tepla (slidy 57–60): opravená čísla slidu 57 (rozhodnutí 1), neopren s hloubkou na slidu 59
// (rozhodnutí 2), vlastní řezy neoprenem (rozhodnutí 6), Procvič si podle ID, konec přednášky s fotkou z Commons (rozhodnutí 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { P1_CHAPTERS, chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';
import { endOfChaptersLabel } from '../js/course/chapter.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const html = read('p1/teplo.html');
const doc = new JSDOM(html).window.document;
const slides = [...doc.querySelectorAll('main > section > .course-slide')];
const slide = (n) => doc.querySelector(`.course-slide[data-slide-number="${n}"]`);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const more = (n) => text(slide(n).closest('section').querySelector('details.course-more'));
const doc59 = [...doc.querySelectorAll('.course-slide[data-slide-number="59"]')];
const quiz = (file) => JSON.parse(read(`data/${file}`)).questions;

// Fyzikální konstanty kolem 20 °C (tabulky): měrná tepelná kapacita [J/(kg·K)], hustota [kg/m³], tepelná vodivost [W/(m·K)].
const WATER = { c: 4186, rho: 1000, k: 0.598 };
const AIR = { c: 1005, k: 0.0257 };
/** Hustota suchého vzduchu při 1 013,25 hPa a teplotě ve °C (stavová rovnice). */
const airDensity = (celsius) => 101325 / (287.05 * (celsius + 273.15));
/** Kolikrát víc tepla potřebuje 1 litr vody než 1 litr vzduchu na ohřátí o 1 °C. */
const perLitre = (celsius) => (WATER.c * WATER.rho) / (AIR.c * airDensity(celsius));

test('Teplo: kapitola je hotová, slidy 57–60, P★★, poslední kapitola kurzu', () => {
    const c = chapterBySlug('teplo');
    assert.equal(c.status, 'ready');
    assert.equal(c.slides, '57–60');
    assert.equal(c.level, 'P★★');
    assert.equal(doc.body.dataset.courseChapter, 'teplo');
    assert.deepEqual([chapterNeighbours('teplo').prev?.slug, chapterNeighbours('teplo').next], ['slyseni', null]);
});

test('Teplo: zastávky 57, 58, 59 (rozdělený na dvě, nevešel se), dvě Procvič si a nakonec slide 60 s kotvou #procvic', () => {
    assert.deepEqual(slides.map(s => [s.dataset.slideNumber ?? null, s.dataset.slideType]), [
        ['57', 'content'], ['58', 'content'], ['59', 'figure'], ['59', 'figure'], [null, 'practice'], [null, 'practice'], ['60', 'figure'],
    ]);
    assert.equal(slides[0].querySelector('h1')?.textContent, 'Přenos tepla');
    assert.equal(slides.at(-1).closest('section').id, 'procvic');
    assert.equal(text(slide(60).querySelector('h2')), 'Konec …');
    for (const s of slides.filter(x => x.dataset.slideNumber)) {
        assert.equal(s.closest('section').querySelectorAll(':scope > details.course-more').length, 1, `Více pod slidem ${s.dataset.slideNumber}`);
    }
    // Sousední slidy „Přenos tepla“ mají stejné písmo (T22).
    assert.deepEqual(slides.slice(0, 4).map(s => s.dataset.slideFit), ['compact', 'compact', 'compact', 'compact']);
    assert.deepEqual(doc59.map(s => s.closest('section').id), ['neopren', 'neopren-hloubka']);
    assert.equal(doc.querySelector('dialog, .course-thumb'), null, 'bez modelu (rozhodnutí 9)');
});

test('Teplo: slide 57 má opravená čísla: 3 000× na litr, 25× vedení', () => {
    const s = text(slide(57));
    assert.ok(s.includes('Proč je nám ve vodě zima?'));
    assert.ok(s.includes('k ohřátí 1 litru vody o 1 °C je potřeba asi 3 000× víc tepla než pro 1 litr vzduchu'));
    assert.ok(s.includes('Voda velmi dobře vede teplo (asi 25× lépe než vzduch).'));
    assert.doesNotMatch(s, /1 kg|30x|30×|větžího|stupeň Celsia/);
    // Fyzika: na kilogram asi 4×, na litr asi 3 500× (od −10 do 30 °C vždy přes 3 000×), vedení 23–25×.
    assert.ok(Math.abs(WATER.c / AIR.c - 4.2) < 0.1);
    assert.ok(Math.abs(perLitre(20) - 3500) < 100, perLitre(20));
    for (let t = -10; t <= 30; t += 5) assert.ok(perLitre(t) > 3000, `${t} °C`);
    const k = WATER.k / AIR.k;
    assert.ok(k > 22 && k < 26, k);
    const m = more(57);
    assert.match(m, /Na kilogram je rozdíl jen asi 4×/);
    assert.match(m, /asi 3 500×, podle teploty vzduchu vždy přes 3 000×/);
    assert.ok(Math.abs(WATER.rho / airDensity(20) - 830) < 10, 'litr vody váží asi 800× víc');
    assert.match(m, /v 15 m je kolem 6 °C a u dna 4 °C/);
    assert.ok(slide(57).closest('section').querySelector('a[href="hustota.html?mesic=8#model-lom"]'));
});

test('Teplo: slide 58 drží text přednášky, výklad upřesní vyzařování pod vodou', () => {
    const s = text(slide(58));
    for (const line of ['Základní způsoby přenosu tepla:', 'Vyzařováním', 'Pro potápění je bezvýznamné.', 'Vedením',
        'Uplatňuje se hlavně v tuhých tělesech, např. prostup tepla izolačním oblekem.', 'Prouděním',
        'Velmi účinné. Proudění vody kolem těla plavce by měl zabránit izolační oblek.']) {
        assert.ok(s.includes(line), line);
    }
    assert.match(more(58), /Vyzařování je bezvýznamné pod vodou/);
    assert.match(more(58), /odpařování/);
});

test('Teplo: slide 59 říká, že izolace s hloubkou klesá (rozhodnutí 2), zdroje a bezpečnost ve Více', () => {
    const s = doc59.map(text).join(' ');
    assert.ok(s.includes('Prostup tepla mokrým neoprenovým oblekem'));
    assert.ok(s.includes('Teplo je vedeno jednak plynem v bublinkách, jednak materiálem.'));
    assert.ok(s.includes('Při stlačení se bublinky zmenší a oblek ztenčí. V 10 m je asi o polovinu tenčí, izoluje hůř a méně nadnáší. '
        + 'Dráha teplu pryží se ale nezkrátí, proto izolace klesá pomaleji než tloušťka.'));
    assert.doesNotMatch(s, /se významně nezmění|neoprénu/);
    assert.ok(s.includes('Nemá cenu vylézat z vody na malou chvíli, dojde ke zbytečné výměně ohřáté vody za studenou.'));
    assert.ok(s.includes('Je dobré před ponorem zalít oblek teplou vodou.'));
    const m = text(doc.querySelector('#neopren-hloubka details.course-more'));
    assert.match(m, /izolační schopnost neoprenového obleku se s rostoucí hloubkou snižuje/);
    assert.match(m, /Bezpečnost: v hloubce ti bude v mokrém obleku zima dřív než u hladiny/);
    assert.match(m, /ve 20 m je neopren asi o 64 % tenčí, izolace podle odhadu klesne asi o 41 %/);
    const links = [...doc.querySelectorAll('#neopren-hloubka details a')].map(a => a.getAttribute('href'));
    for (const href of ['stlacovani-plynu.html#boyle', 'archimeduv-zakon.html?krok=2#model-vztlak',
        'https://pmc.ncbi.nlm.nih.gov/articles/PMC12608526/']) {
        assert.ok(links.includes(href), href);
    }
    assert.ok(links.some(h => h.startsWith('../quiz-accidents.html?kategorie=')));
    // Kategorie podchlazení v testu na nehody existuje (předvolba kvízu).
    const slug = decodeURIComponent(links.find(h => h.startsWith('../quiz-accidents.html')).split('=')[1]);
    assert.ok(quiz('quiz-accidents.json').some(q => q.category === slug), slug);
});

test('Teplo: řezy neoprenem jsou vlastní SVG a dráha teplu pryží je v hloubce stejně dlouhá jako u hladiny', () => {
    const svg = slide(59).querySelector('figure.course-illustration svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 600 300');
    assert.equal(slide(59).querySelectorAll('img').length, 0);
    assert.equal(text(slide(59).querySelector('figcaption.course-figure-pair')), 'U hladiny V hloubce: tenčí, bublinky splasklé');
    const rubber = [...svg.querySelectorAll('.fig-rubber')].map(r => Number(r.getAttribute('width')));
    assert.equal(rubber.length, 2);
    assert.ok(Math.abs(rubber[1] / rubber[0] - 0.5) < 0.05, 'v hloubce asi poloviční tloušťka');
    // Délka dráhy v pryži: úseky mezi vstupem do neoprenu a výstupem z něj (bez úseku v kůži a ve vodě venku).
    const lengths = [...svg.querySelectorAll('path.fig-heat')].map((p) => {
        const pts = p.getAttribute('d').slice(1).split('L').map(xy => xy.split(' ').map(Number));
        let sum = 0;
        for (let i = 1; i < pts.length - 2; i++) sum += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        return sum;
    });
    assert.equal(lengths.length, 2);
    assert.ok(Math.abs(lengths[0] - lengths[1]) / lengths[0] < 0.05, lengths.join(' vs '));
});

test('Teplo: Procvič si má existující otázky SPČR a odkazy na kategorie kvízů', () => {
    const groups = [...doc.querySelectorAll('.course-practice')].map(p => [p.dataset.quizSource, p.dataset.questionIds]);
    assert.deepEqual(groups, [['data/quiz-physics.json', '10,9'], ['data/quiz-equipment.json', '14,19']]);
    for (const [src, ids] of groups) {
        const qs = quiz(src.replace('data/', ''));
        for (const id of ids.split(',').map(Number)) assert.ok(qs.some(q => q.id === id), `${src} ${id}`);
    }
    // Otázka 14 testu výstroje odpovídá novému znění slidu 59.
    const q14 = quiz('quiz-equipment.json').find(q => q.id === 14);
    assert.equal(q14.options.find(o => o.key === q14.correct).text, 'se snižuje s narůstající hloubkou');
    assert.ok(quiz('quiz-physics.json').filter(q => q.category === 'prenos-tepla').length >= 2);
    assert.ok(quiz('quiz-equipment.json').some(q => q.category === 'obleky'));
    assert.ok(doc.querySelector('a[href="../quiz-physics.html?kategorie=prenos-tepla"]'));
    assert.ok(doc.querySelector('a[href="../quiz-equipment.html?kategorie=obleky"]'));
});

test('Teplo: slide 60 je konec přednášky s fotkou z Commons a odkazem „zdroj“', () => {
    assert.equal(text(slide(60).querySelector('.course-core > div')), 'A hurá do vody …');
    const img = slide(60).querySelector('figure img');
    assert.equal(img.getAttribute('src'), '../images/course/p1/silfra.jpg');
    assert.ok(img.getAttribute('alt').length > 20);
    assert.equal(slide(60).querySelector('figcaption a.course-source').getAttribute('href'), 'zdroje.html#silfra');
});

test('Teplo: za poslední kapitolou „připravujeme“ jen dokud některá kapitola chybí', () => {
    const ready = P1_CHAPTERS.map(c => ({ ...c, status: 'ready' }));
    assert.equal(endOfChaptersLabel(ready), 'Konec kurzu — zpět na přehled kurzu →');
    assert.match(endOfChaptersLabel([...ready, { slug: 'x', status: 'planned' }]), /^Další kapitoly připravujeme/);
    assert.equal(endOfChaptersLabel(), P1_CHAPTERS.every(c => c.status === 'ready')
        ? 'Konec kurzu — zpět na přehled kurzu →' : 'Další kapitoly připravujeme — zpět na přehled kurzu →');
});

test('Teplo a Slyšení: texty neodkazují čísly slidů, ale názvem s proklikem (D16)', () => {
    for (const page of ['p1/teplo.html', 'p1/slyseni.html']) {
        const d = new JSDOM(read(page)).window.document;
        const prose = [...d.querySelectorAll('main details, main figcaption, main .course-core')].map(text).join(' ');
        assert.doesNotMatch(prose, /\bslid(e|u|em|y)\s+\d/i, page);
    }
    assert.ok(doc.querySelector('details a[href="#neopren"]'));
    assert.ok(doc.querySelector('details a[href="#neopren-hloubka"]'));
});
