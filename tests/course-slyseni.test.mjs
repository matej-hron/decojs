// Kurz P1 – kapitola Slyšení pod vodou (slidy 55–56): zastávky, čísla ze slidu 55 (rozhodnutí 3), věta o lodi (rozhodnutí 7),
// bez Procvič si (rozhodnutí 8) a bez modelu (rozhodnutí 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const html = read('p1/slyseni.html');
const doc = new JSDOM(html).window.document;
const slides = [...doc.querySelectorAll('main > section > .course-slide')];
const slide = (n) => doc.querySelector(`.course-slide[data-slide-number="${n}"]`);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const more = (n) => text(slide(n).closest('section').querySelector('details.course-more'));
/** Více pod titulním slidem kapitoly: úvod kapitoly (T29). */
const intro = () => text(slides[0].closest('section').querySelector('details.course-more'));

/** Rychlost zvuku ve vzduchu podle teploty ve °C (běžná lineární aproximace). */
const soundInAir = (celsius) => 331.3 + 0.606 * celsius;

test('Slyšení: kapitola je hotová, slidy 55–56, P★★, za Viděním a před Teplem', () => {
    const c = chapterBySlug('slyseni');
    assert.equal(c.status, 'ready');
    assert.equal(c.slides, '55–56');
    assert.equal(c.level, 'P★★');
    assert.equal(doc.body.dataset.courseChapter, 'slyseni');
    assert.equal(chapterNeighbours('slyseni').prev?.slug, 'videni');
    assert.equal(chapterNeighbours('slyseni').next?.slug, 'teplo');
});

test('Slyšení: titulní slide a dvě zastávky, bez Procvič si a bez modelu; poslední nese kotvu #procvic', () => {
    assert.deepEqual(slides.map(s => [s.dataset.slideNumber, s.dataset.slideType]), [[undefined, 'title'], ['55', 'figure'], ['56', 'content']]);
    assert.equal(text(slides[0].querySelector('h1')), 'Slyšení pod vodou');
    assert.equal(text(slide(55).querySelector('h2')), 'Slyšení pod vodou');
    assert.equal(text(slide(56).querySelector('h2')), 'Slyšení pod vodou');
    assert.equal(slides.at(-1).closest('section').id, 'procvic', 'krok zpět z Tepla míří na #procvic');
    assert.equal(doc.querySelector('.course-practice'), null);
    assert.equal(doc.querySelector('dialog, .course-thumb'), null);
    assert.equal(slide(55).dataset.slideFit, slide(56).dataset.slideFit, 'stejný nadpis, stejné písmo (T22)');
    for (const n of [55, 56]) {
        assert.equal(slide(n).closest('section').querySelectorAll(':scope > details.course-more').length, 1, `Více pod slidem ${n}`);
    }
});

test('Slyšení: slide 55 má rychlosti ze slidu v opravené notaci a vlastní SVG', () => {
    const s = slide(55).innerHTML;
    assert.match(s, /330&nbsp;m\/s/);
    assert.match(s, /1&nbsp;500&nbsp;m\/s/);
    assert.doesNotMatch(s, /1\.500/, 'tisíce mezerou, ne tečkou');
    const svg = slide(55).querySelector('figure.course-illustration svg');
    assert.equal(svg.getAttribute('viewBox').split(' ')[2], '600');
    assert.equal(svg.getAttribute('role'), 'img');
    assert.match(svg.getAttribute('aria-label'), /330\u00a0m\/s.*1\u00a0500\u00a0m\/s/);
    assert.equal(slide(55).querySelectorAll('img').length, 0, 'žádný převzatý obrázek');
    assert.equal(svg.querySelectorAll('.fig-force').length, 7, 'vzduch jedna šipka, voda šest ze všech stran');
});

test('Slyšení: slide 56 a výklad (330 m/s kolem 0 °C, 343 m/s při 20 °C, věta o lodi)', () => {
    assert.equal(text(slide(56).querySelector('.course-core')), 'Rychlejší Není jasné, odkud zvuk přichází.');
    assert.equal(Math.round(soundInAir(0)), 331);
    assert.equal(Math.round(soundInAir(20)), 343);
    assert.ok(Math.abs(1500 / 330 - 4.5) < 0.1);
    const m55 = more(55);
    assert.match(m55, /330 m\/s platí pro vzduch kolem 0 °C, při 20 °C je to 343 m\/s/);
    assert.match(m55, /asi 4,5× rychleji/);
    assert.match(intro(), /do kurzu P★★/);
    const m56 = more(56);
    assert.ok(m56.includes('Slyšíš-li loď, nevíš, odkud jede: před výstupem se rozhlédni.'));
    assert.match(m56, /přímo do kostí lebky/);
});
