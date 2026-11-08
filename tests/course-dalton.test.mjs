// Kurz P1 – kapitola Složení vzduchu a Daltonův zákon (slidy 38–41): obsah slidů, opravy z rozhodnutí 7,
// meze a výsledky slidu 41 (rozhodnutí 4 a 5), slide 40 s obarvenými částicemi (rozhodnutí 3), pojmy, procvičování.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { pressureAt } from '../js/physics/pressure.js';
import { createParticles, stepParticles, PARTICLE_DEFAULTS } from '../js/course/gasParticles.js';
import { P1_QUESTIONS, chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const html = read('p1/dalton.html');
const doc = new JSDOM(html).window.document;
const slides = [...doc.querySelectorAll('main > section > .course-slide')];
const slide = (n) => doc.querySelector(`.course-slide[data-slide-number="${n}"]`);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const more = (n) => text(slide(n).closest('section').querySelector('details.course-more'));
const answer = (n) => text(slide(n).querySelector('details.course-answer'));
const concept = (id) => read(`concepts/cs/${id}.html`).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

/** Hloubka, ve které parciální tlak plynu dosáhne meze (školní režim p = 1 + h/10), zaokrouhleno dolů. */
const maxDepth = (limit, fraction) => {
    const p = limit / fraction;
    let h = 0;
    while (pressureAt(h + 1).total <= p + 1e-9) h++;
    return { p, exact: (p - 1) * 10, floor: h };
};

test('Dalton: kapitola je hotová, slidy 38–41, za Archimédem', () => {
    const c = chapterBySlug('dalton');
    assert.equal(c.status, 'ready');
    assert.equal(c.slides, '38–41');
    assert.equal(doc.body.dataset.courseChapter, 'dalton');
    assert.equal(chapterNeighbours('archimeduv-zakon').next?.slug, 'dalton');
    assert.equal(chapterNeighbours('dalton').prev?.slug, 'archimeduv-zakon');
    const answered = (q) => P1_QUESTIONS.find(x => x.question === q).answeredIn;
    assert.ok(answered('Jak hluboko můžu?').includes('dalton'));
    assert.ok(answered('Co mám dělat, když chci hloub?').includes('dalton'), 'rozhodnutí 9a');
});

test('Dalton: zastávky jsou slidy 38–41 včetně 40, pak dvě Procvič si', () => {
    assert.deepEqual(slides.map(s => s.dataset.slideNumber ?? null), ['38', '39', '40', '41', null, null]);
    assert.equal(slides[0].querySelector('h1')?.textContent, 'Složení vzduchu');
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.deepEqual(slides.slice(-2).map(s => s.dataset.slideType), ['practice', 'practice']);
    assert.equal(slides.at(-1).closest('section').id, 'procvic', 'krok zpět z další kapitoly míří na #procvic');
    for (let n = 38; n <= 41; n++) {
        assert.equal(slide(n).closest('section').querySelectorAll(':scope > details.course-more').length, 1, `Více pod slidem ${n}`);
    }
    const got = Object.fromEntries([38, 39, 40, 41].map(n => [n, [text(slide(n).querySelector('h1, h2')), slide(n).dataset.slideType]]));
    assert.deepEqual(got, {
        38: ['Složení vzduchu', 'figure'], 39: ['Daltonův zákon', 'content'],
        40: ['Tlak v plynu', 'figure'], 41: ['Daltonův zákon, použití', 'calc'],
    });
});

test('Dalton: opravy z rozhodnutí 7 a překlepy', () => {
    const core = [...doc.querySelectorAll('main .course-slide')].map(text).join(' ');
    for (const wrong of [/Říká že/, /p02|pO2|ppO2/i, /0\.16|1\.6|1\.4/, /Mezní limity/, /Tlaku v plynu/, /\bpc\b/, /\d(bar|kPa|m)\b/, / x /]) {
        assert.doesNotMatch(core, wrong, String(wrong));
    }
    // slide 39: zákon jako tvrzení, p (celkový tlak) místo pc, f s indexy, bez n
    assert.match(text(slide(39)), /Celkový tlak směsi plynů je roven součtu parciálních \(dílčích\) tlaků jednotlivých plynů/);
    const s39 = slide(39).innerHTML;
    assert.match(s39, /<var>p<\/var> = <var>p<\/var><sub>N₂<\/sub> \+ <var>p<\/var><sub>O₂<\/sub>/);
    assert.match(s39, /<var>p<\/var><sub>N₂<\/sub> = <var>p<\/var> · <var>f<\/var><sub>N₂<\/sub>/);
    assert.match(s39, /<var>p<\/var><sub>O₂<\/sub> = <var>p<\/var> · <var>f<\/var><sub>O₂<\/sub>/);
    assert.doesNotMatch(text(slide(39)).split('John Dalton')[0], /\bn\b/);
    assert.match(text(slide(39)), /kyslík 0,21, dusík 0,79/);
    // slide 38: koláč s poctivými poměry 78 / 21 / 1 %
    assert.match(text(slide(38)), /Dusík 78 %.*Kyslík 21 %.*Ostatní 1 %/);
    assert.match(slide(38).querySelector('svg').getAttribute('aria-label'), /dusík 78 %, kyslík 21 %, ostatní plyny 1 %/);
});

test('Dalton: slide 41 má meze podle rozhodnutí 4 a 5, výsledky 56 m a 40 m zaokrouhlené dolů', () => {
    const s = text(slide(41));
    assert.match(s, /Mezní hodnoty parciálního tlaku v dýchané směsi: kyslík: nejméně 0,16 bar \(16 kPa\), nejvýš 1,4 bar \(140 kPa\)/);
    assert.match(s, /a\) Vypočítejte maximální hloubku pro ponor se vzduchem, aby nedošlo k překročení mezního parciálního tlaku kyslíku\. b\) Maximální hloubku, aby nedošlo k překročení hranice parciálního tlaku dusíku\./);
    assert.match(s, /dusík: nejvýš 4 bar \(400 kPa\)/);
    assert.doesNotMatch(s, /1,6|66 m|160 kPa/, '1,6 bar jako mez se nepoužívá (2026-11-08)');

    const o2 = maxDepth(1.4, 0.21);
    const n2 = maxDepth(4, 0.79);
    assert.equal(o2.floor, 56);
    assert.equal(n2.floor, 40);
    const a = answer(41);
    assert.match(a, new RegExp(`1,4 / 0,21 = ${o2.p.toFixed(2).replace('.', ',')} bar`));
    assert.match(a, new RegExp(`= ${o2.exact.toFixed(1).replace('.', ',')} m`));
    assert.match(a, new RegExp(`4 / 0,79 = ${n2.p.toFixed(2).replace('.', ',')} bar`));
    assert.match(a, new RegExp(`= ${n2.exact.toFixed(1).replace('.', ',')} m`));
    assert.match(a, /zaokrouhleno dolů/);
    assert.match(text(slide(41).querySelector('.course-calc-result > span')), /^a\) 56 m, b\) 40 m$/);
    // s „pětinou“ (0,2) by vyšlo hlouběji: proto 0,21 (rozhodnutí 4)
    assert.equal(maxDepth(1.4, 0.2).floor, 60);
});

test('Dalton: bezpečnostní věty ve Více slidu 41 v Matejově znění (rozhodnutí 4, 5, 9)', () => {
    const m = more(41);
    for (const sentence of [
        'Kyslík: plánuje se na 1,4 bar, se vzduchem to vychází na 56 m. Dusík: mez je 4 bar, se vzduchem to vychází na 40 m. Mez není cíl. Potápěč P★ smí do 20 m, Bezpečnostní směrnice SPČR omezují ponory na 40 m a systém výcviku může hloubku se vzduchem omezit víc (třeba na 30 m). Dusíková narkóza přichází postupně a u každého jinak, může přijít i dřív než ve 40 m. Zhoršuje ji únava, chlad, stres a oxid uhličitý.',
        'Pod 0,16 bar kyslíku hrozí jeho nedostatek (hypoxie), pod asi 0,10 bar bezvědomí. Se vzduchem v hloubce to nehrozí, týká se to směsí s malým podílem kyslíku.',
        'V testech SPČR najdeš i 1,6 bar (160 kPa). To je hranice, kde hrozí otrava kyslíkem, ne hodnota, se kterou se plánuje. Plánuje se s 1,4 bar.',
        'Hlouběji než 20 m smíš až po dalším výcviku (P★★ a výš), a i pak jen do hloubky, kterou ti tvoje kvalifikace dovoluje.',
    ]) assert.ok(m.includes(sentence), sentence.slice(0, 60));
    assert.match(m, /argon a ostatní vzácné plyny se počítají k dusíku/);
    assert.match(m, /zaokrouhlujeme dolů, na mělčí/);
    assert.match(m, /\(0,2\) by mez vyšla 60 m/);
});

test('Dalton: slide 40 je animace s každou pátou částicí jako kyslík (rozhodnutí 3)', () => {
    const g = slide(40).querySelector('[data-gas-particles]');
    assert.ok(g);
    assert.equal(g.dataset.oxygenEvery, '5');
    assert.equal(text(slide(40).querySelector('figcaption')),
        'Asi pětina částic je kyslík. Dělá asi pětinu nárazů do stěn, a tedy asi pětinu tlaku.');
    assert.ok(!slide(40).querySelector('img'), 'žádný GIF: obarvit ho nejde');
    assert.match(more(40), /slide 22 v kapitole Tlak/);
});

test('Animace částic: pětina kyslíku, částice zůstávají v nádobě, kyslík dělá asi pětinu nárazů', () => {
    const box = { x: 23, y: 83, width: 554, height: 314 };
    const ps = createParticles(box, { oxygenEvery: 5 });
    assert.equal(ps.length, PARTICLE_DEFAULTS.count);
    assert.equal(ps.filter(p => p.kind === 'o2').length, PARTICLE_DEFAULTS.count / 5);
    assert.equal(createParticles(box).filter(p => p.kind === 'o2').length, 0, 'bez obarvení pro slide 22');
    const r = PARTICLE_DEFAULTS.radius;
    const energy = () => ps.reduce((e, p) => e + p.vx ** 2 + p.vy ** 2, 0);
    const e0 = energy();
    let o2 = 0;
    let all = 0;
    for (let i = 0; i < 6000; i++) {
        for (const hit of stepParticles(ps, box, r)) { all++; if (hit.kind === 'o2') o2++; }
    }
    for (const p of ps) {
        assert.ok(p.x >= box.x + r - 1e-9 && p.x <= box.x + box.width - r + 1e-9, 'x v nádobě');
        assert.ok(p.y >= box.y + r - 1e-9 && p.y <= box.y + box.height - r + 1e-9, 'y v nádobě');
    }
    assert.ok(Math.abs(energy() - e0) / e0 < 1e-9, 'pružné srážky zachovají energii');
    assert.ok(all > 1000);
    assert.ok(o2 / all > 0.14 && o2 / all < 0.26, `podíl nárazů kyslíku ${o2 / all}`);
});

test('Dalton: pojmy, portrét, procvičování a zdroje', () => {
    const concepts = [...doc.querySelectorAll('[data-concept]')].map(el => el.dataset.concept);
    assert.deepEqual(concepts, ['partial-pressure', 'breathing-gas-limits']);
    assert.match(concept('partial-pressure'), /Parciální \(dílčí\) tlak je tlak, který by jeden plyn ze směsi měl, kdyby sám zaplnil celý objem/);
    assert.match(concept('breathing-gas-limits'), /plánuje se proto nejvýš na 1,4 bar/);
    assert.match(concept('breathing-gas-limits'), /jeho mez je 4 bar/);
    assert.doesNotMatch(concept('breathing-gas-limits'), /1,6/);
    const blocks = [...doc.querySelectorAll('.course-practice')].map(el => [el.dataset.quizSource, el.dataset.questionIds]);
    assert.deepEqual(blocks, [['data/quiz-physics.json', '5,81'], ['data/quiz-accidents.json', '35,22']], 'rozhodnutí 10: bez 88 a 57');
    const img = slide(39).querySelector('.course-portrait img');
    assert.equal(img.getAttribute('src'), '../images/course/p1/dalton.jpg');
    assert.ok(existsSync(new URL('images/course/p1/dalton.jpg', ROOT)));
    assert.match(read('images/course/p1/SOURCES.md'), /images\/course\/p1\/dalton\.jpg.*PD-old-100-expired/);
    for (const href of ['../pressure.html#daltons-law', '../pressure.html#partial-pressure-limits', 'tlak.html#plyn', 'tlak.html#tabulka']) {
        assert.ok(doc.querySelector(`a[href="${href}"]`), href);
    }
    const pressure = read('pressure.html');
    assert.match(pressure, /id="daltons-law"/);
    assert.match(pressure, /id="partial-pressure-limits"/);
    const tlak = read('p1/tlak.html');
    assert.match(tlak, /<section id="plyn"/);
    assert.match(tlak, /<section id="tabulka"/);
});
