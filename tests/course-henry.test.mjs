// Kurz P1 – kapitola Rozpouštění plynů v kapalinách (Henry, slidy 42–47): obsah slidů, opravy z rozhodnutí 7,
// nulový čas podle rozhodnutí 6, názvy podle rozhodnutí 8, pojmy, procvičování, portrét.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { P1_QUESTIONS, chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const html = read('p1/henry.html');
const doc = new JSDOM(html).window.document;
const slides = [...doc.querySelectorAll('main > section > .course-slide')];
const slide = (n) => doc.querySelector(`.course-slide[data-slide-number="${n}"]`);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const more = (n) => text(slide(n).closest('section').querySelector('details.course-more'));
const concept = (id) => read(`concepts/cs/${id}.html`).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

test('Henry: kapitola je hotová, slidy 42–47, za Daltonem', () => {
    const c = chapterBySlug('henry');
    assert.equal(c.status, 'ready');
    assert.equal(c.slides, '42–47');
    assert.equal(doc.body.dataset.courseChapter, 'henry');
    assert.equal(chapterNeighbours('dalton').next?.slug, 'henry');
    assert.equal(chapterNeighbours('henry').prev?.slug, 'dalton');
    const answered = (q) => P1_QUESTIONS.find(x => x.question === q).answeredIn;
    assert.ok(answered('Jak dlouho tam můžu být?').includes('henry'));
    assert.ok(answered('Jak předcházet nehodám?').includes('henry'), 'rozhodnutí 9');
});

test('Henry: zastávky jsou slidy 42–47, pak dvě Procvič si', () => {
    assert.deepEqual(slides.map(s => s.dataset.slideNumber ?? null), ['42', '43', '44', '45', '46', '47', null, null]);
    assert.equal(slides[0].querySelector('h1')?.textContent, 'Henryho zákon');
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(slides.at(-1).closest('section').id, 'procvic');
    for (let n = 42; n <= 47; n++) {
        assert.equal(slide(n).closest('section').querySelectorAll(':scope > details.course-more').length, 1, `Více pod slidem ${n}`);
    }
    const got = Object.fromEntries([42, 43, 44, 45, 46, 47].map(n => [n, text(slide(n).querySelector('h1, h2'))]));
    assert.deepEqual(got, {
        42: 'Henryho zákon', 43: 'Henryho zákon', 44: 'Henryho zákon', 45: 'Henryho zákon – sycení',
        46: 'Saturace v čase', 47: 'Rozpouštění plynu v kapalině',
    }, 'rozhodnutí 8d: nadpis 46 jako v přednášce');
});

test('Henry: opravy z rozhodnutí 7 a překlepy', () => {
    const core = [...doc.querySelectorAll('main .course-slide')].map(text).join(' ');
    for (const wrong of [/dekomrese/, /gasing\b/, /(on|off) gassing/, /stupńů|celsia/, /\d\.\d/, /98\.4|6 x T/, /\bsat\b/, /\d(min|bar|ml|%)\b/]) {
        assert.doesNotMatch(core, wrong, String(wrong));
    }
    assert.match(text(slide(42)), /přímo úměrné parciálnímu tlaku plynu nad kapalinou/);
    assert.match(slide(46).innerHTML, /<var>t<\/var><sub>1\/2<\/sub> = 4&nbsp;min – 600&nbsp;min/);
    assert.match(text(slide(46)), /Po 6 poločasech je tkáň nasycená z 98,4 %/);
    assert.match(text(slide(46).querySelector('.course-illustration svg')), /čas \[poločasy\]/);
    const t47 = slide(47).querySelector('table');
    assert.match(text(t47.querySelector('caption')), /^Rozpustnost \[ml\/l\] při tlaku plynu 1 bar a 37 °C/);
    assert.deepEqual([...t47.querySelectorAll('td')].map(text), ['12,3', '8,6', '23,9', '66,1', '15,7', '110,5']);
});

test('Henry: slide 44 má nulový čas v Matejově znění (rozhodnutí 6), bez „zajištěna“', () => {
    const s = text(slide(44));
    assert.doesNotMatch(s, /zajištěna/);
    assert.match(text(slide(44).querySelector('.course-warning .course-alert')),
        /^I při ponoru v nulovém čase probíhá dekomprese: je to výstup předepsanou rychlostí a bezpečnostní zastávka\.$/);
    assert.match(s, /Nulový čas jen znamená, že nejsou potřeba dekompresní zastávky\./);
    const m = more(44);
    for (const sentence of [
        'Ponorům v nulovém čase se někdy říká „bezdekompresní“. Ten název je zavádějící: dekomprese probíhá při každém ponoru, u ponoru v nulovém čase na ni stačí výstup předepsanou rychlostí (tabulky SPČR: 10 m/min, nebo podle počítače) a bezpečnostní zastávka (tabulky SPČR: 5 m, 3 min).',
        'Nulový čas je doba, po kterou smíš v dané hloubce zůstat a vynořit se bez dekompresních zastávek; určují ho tabulky nebo počítač.',
        'Dekompresní nemoc hrozí hlavně tehdy, když dekompresní postup nedodržíš, třeba stoupáš moc rychle. Výjimečně může přijít i při dodržení, riziko zvyšuje třeba námaha nebo prochlazení.',
        'U hladiny se tlak mění poměrně nejvíc (slide 26), proto poslední metry stoupej pomalu.',
    ]) assert.ok(m.includes(sentence), sentence.slice(0, 60));
    assert.ok(slide(44).closest('section').querySelector('a[href="stlacovani-plynu.html#male-hloubky"]'));
});

test('Henry: názvy podle rozhodnutí 8', () => {
    const all = text(doc.querySelector('main'));
    const first = all.indexOf('dekompresní nemoc');
    assert.ok(first >= 0);
    assert.match(all, /dekompresní nemoci \(dříve kesonové nemoci\)/, 'první výskyt s dřívějším jménem');
    assert.match(more(44), /Dřív se jí říkalo kesonová nemoc\. Jméno má podle kesonů/);
    assert.match(text(slide(45)), /Sycení \(on-gassing\)/);
    assert.match(text(slide(45)), /Vysycování \(off-gassing\)/);
    assert.match(read('docs/notation/glossary.md'), /\| NDL \| nulový čas \(termín testů SPČR a kurzu P1\)/);
});

test('Henry: poločas jen jako představa, limity určují tabulky a počítač', () => {
    assert.match(more(46), /Kolik smíš, neurčuješ odhadem ani výpočtem z poločasů, ale tabulkami nebo počítačem\./);
    assert.match(more(46), /otázky testu SPČR č\. 95–99\) jsou látka P★★/);
    assert.match(more(42), /Osnova výcviku SPČR řadí Henryho zákon a sycení tkání až do kurzu P★★/);
    // body grafu: 1 − 2^−n
    for (const [n, pct] of [[1, '50 %'], [2, '75 %'], [6, '98,4 %']]) {
        assert.equal((1 - 2 ** -n) * 100 >= Number(pct.replace(' %', '').replace(',', '.')) - 0.05, true);
        assert.match(text(slide(46).querySelector('.course-illustration svg')), new RegExp(pct));
    }
});

test('Henry: pojmy, portrét, procvičování a odkazy', () => {
    const concepts = [...doc.querySelectorAll('[data-concept]')].map(el => el.dataset.concept);
    assert.deepEqual(concepts, ['gas-dissolution', 'tissue-saturation']);
    assert.match(concept('gas-dissolution'), /přímo úměrné parciálnímu tlaku toho plynu nad kapalinou/);
    assert.match(concept('tissue-saturation'), /To je dekompresní nemoc\./);
    const blocks = [...doc.querySelectorAll('.course-practice')].map(el => [el.dataset.quizSource, el.dataset.questionIds]);
    assert.deepEqual(blocks, [['data/quiz-physics.json', '100,94'], ['data/quiz-accidents.json', '81']], 'rozhodnutí 10');
    assert.ok(existsSync(new URL('images/course/p1/henry.jpg', ROOT)));
    assert.match(read('images/course/p1/SOURCES.md'), /images\/course\/p1\/henry\.jpg.*PD-old-100-expired/);
    for (const href of ['../tissue-loading.html#gas-exchange', '../sandbox/tissue-saturation.html', '../sandbox/deco-table.html', 'stlacovani-plynu.html#zvon']) {
        assert.ok(doc.querySelector(`a[href="${href}"]`), href);
    }
    assert.match(read('tissue-loading.html'), /id="gas-exchange"/);
    assert.match(read('tissue-loading.html'), /id="half-time-concept"/);
    // SVG id jsou na stránce jen jednou (dvě lahve, šipky)
    const ids = [...doc.querySelectorAll('[id]')].map(e => e.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('Henry: simulátor sycení tkání v překryvu slidu 46, jedna definice s Pískovištěm (DH10)', async () => {
    // náhled na slidu 46 s předvolbou 30 m a dialog se simulátorem
    const thumb = slide(46).querySelector('button.course-thumb[data-open-model="model-syceni"]');
    assert.ok(thumb);
    assert.equal(thumb.dataset.modelParams, 'hloubka=30');
    const dialog = doc.querySelector('dialog.course-sim #model-syceni');
    assert.ok(dialog?.querySelector('#syceni-sim'));
    assert.match(text(dialog.querySelector('.course-simplification')), /neplánuje ponor: kolik smíš, určují tabulky nebo počítač/);
    assert.ok(doc.querySelector('a[href="?hloubka=30#model-syceni"][data-preset-link]'));
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js" defer><\/script>/);

    // jedna definice: Pískoviště i kurz kreslí ovládání stejnou funkcí z komponenty Deco Theory
    const sandbox = read('sandbox/tissue-saturation.html');
    assert.match(sandbox, /renderTissueSimMarkup\(root\);\s*new TissueSaturationSim\(root\);/);
    assert.doesNotMatch(sandbox, /tsim-depth-slider/, 'ovládání už není natvrdo ve stránce');
    const page = read('js/course/henryPage.js');
    assert.match(page, /from '\.\.\/components\/TissueSaturationSim\.js'/);
    assert.match(page, /renderTissueSimMarkup\(host, \{ t, i18n: false \}\)/);
    assert.match(page, /keyboardActive: \(\) => dialog\.open/);
    const { SATURATION_PARAMS } = await import('../js/course/henryPage.js');
    assert.deepEqual(SATURATION_PARAMS.hloubka, { min: 0, max: 40, step: 1, default: 0 });

    // markup: s webem se překládá (data-i18n), v kurzu pevně česky bez data-i18n
    const { renderTissueSimMarkup } = await import('../js/components/TissueSaturationSim.js');
    const make = () => new JSDOM('<section></section>').window.document.querySelector('section');
    const site = make();
    renderTissueSimMarkup(site, { t: (k, f) => f });
    assert.ok(site.classList.contains('tsim-root') && site.classList.contains('tsim-layout'));
    assert.equal(site.querySelectorAll('.tsim-tile').length, 10);
    assert.equal(site.querySelectorAll('.tsim-gas-select option').length, 6);
    assert.ok(site.querySelector('[data-i18n="sandbox.tissue.depth"]'));
    for (const sel of ['.tsim-depth-slider', '.tsim-depth-input', '.tsim-play-btn', '.tsim-step-back-btn', '.tsim-step-fwd-btn',
        '.tsim-reset-btn', '.tsim-alerts', '.tsim-chart canvas', '[data-tsim-readout="pFast"]', '[data-tsim-readout="time"]']) {
        assert.ok(site.querySelector(sel), sel);
    }
    const course = make();
    const cs = JSON.parse(read('locales/cs.json'));
    const t = (k, f) => k.split('.').reduce((o, p) => o?.[p], cs) ?? f;
    renderTissueSimMarkup(course, { t, i18n: false });
    assert.equal(course.querySelectorAll('[data-i18n]').length, 0);
    assert.equal(course.querySelector('.tsim-label').textContent, 'Hloubka');

    // malé p v dlaždicích: popisek je velkými písmeny, značka a index ne
    assert.match(read('css/styles.css'), /\.tsim-tile-label var,\s*\.tsim-tile-label sub \{ text-transform: none; \}/);
});

test('Henry: animace výměny plynů v překryvu slidu 45, jedna definice s tissue-loading (DH11)', async () => {
    const thumb = slide(45).querySelector('button.course-thumb[data-open-model="model-vymena"]');
    assert.ok(thumb);
    const dialog = doc.querySelector('dialog.course-sim #model-vymena');
    assert.ok(dialog?.querySelector('#vymena-host'));
    assert.ok(doc.querySelector('a[href="#model-vymena"][data-preset-link]'));
    assert.ok(slide(45).closest('section').querySelector('a[href="../tissue-loading.html#gas-exchange"]'));

    // jedna definice: stránka Deco Theory i kurz kreslí schéma stejnou komponentou
    const tissue = read('tissue-loading.html');
    assert.match(tissue, /<div class="gas-pathway-container"><\/div>/);
    assert.doesNotMatch(tissue, /pathway-descent-btn|gas-pathway-svg/, 'schéma už není natvrdo ve stránce');
    const edu = read('js/tissueEducation.js');
    assert.match(edu, /import \{ GasPathway, renderGasPathway \} from '\.\/components\/GasPathway\.js';/);
    assert.match(edu, /pathway\?\.refresh\(\);/);
    assert.doesNotMatch(edu, /function updatePhase|function animateTissueBars/);
    const page = read('js/course/henryPage.js');
    assert.match(page, /renderGasPathway\(host, \{ t, i18n: false \}\)/);
    assert.match(page, /new GasPathway\(host, \{ t, lang: 'cs' \}\)/);
    assert.match(read('sw.js'), /'\.\/js\/components\/GasPathway\.js'/);

    const { renderGasPathway } = await import('../js/components/GasPathway.js');
    const make = () => new JSDOM('<div></div>').window.document.querySelector('div');
    const site = make();
    renderGasPathway(site, { t: (k, f) => f });
    assert.ok(site.classList.contains('gas-pathway-container'));
    assert.equal(site.querySelectorAll('.pressure-step').length, 4);
    assert.ok(site.querySelector('#pathway-descent-btn span[data-i18n="tissueLoading.gasExchange.descentBtn"]'));
    assert.equal(site.querySelectorAll('[data-i18n]').length, 14, 'stejně jako dřív ve stránce');
    const course = make();
    const cs = JSON.parse(read('locales/cs.json'));
    renderGasPathway(course, { t: (k, f) => k.split('.').reduce((o, p) => o?.[p], cs) ?? f, i18n: false });
    assert.equal(course.querySelectorAll('[data-i18n]').length, 0);
    assert.equal(course.querySelector('#pathway-ascent-btn').textContent.trim(), '⬆️ Výstup (vysycování)');
});
