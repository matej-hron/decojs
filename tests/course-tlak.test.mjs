// Kurz P1 – kapitola Tlak (slidy 10–22): obsah slidů, opravy přednášky, tabulky slidu 20, modely, navigace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { pressureAt } from '../js/physics/pressure.js';
import { formatBar } from '../js/components/waterColumn/pressureLayer.js';
import { chapterBySlug } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const html = read('p1/tlak.html');
const doc = new JSDOM(html).window.document;
const slides = [...doc.querySelectorAll('main > section > .course-slide')];
const slide = (n) => doc.querySelector(`.course-slide[data-slide-number="${n}"]`);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

test('Tlak: kapitola je hotová, slidy 10–22', () => {
    const c = chapterBySlug('tlak');
    assert.equal(c.status, 'ready');
    assert.equal(c.slides, '10–22');
    assert.equal(doc.body.dataset.courseChapter, 'tlak');
});

test('Tlak: zastávky jsou slidy 10–22 v pořadí přednášky, pak Procvič si', () => {
    const numbers = slides.map(s => s.dataset.slideNumber ?? null);
    assert.deepEqual(numbers, ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', null]);
    assert.equal(slides[0].dataset.slideType, 'title');
    assert.equal(text(slides[0].querySelector('h1')), 'Tlak');
    assert.equal(slides.at(-1).dataset.slideType, 'practice');
});

test('Tlak: každý slide 10–22 má pod sebou „Více“', () => {
    for (let n = 10; n <= 22; n++) {
        const section = slide(n).closest('section');
        assert.equal(section.querySelectorAll(':scope > details.course-more').length, 1, `slide ${n}`);
    }
});

test('Tlak: nadpisy slidů podle přednášky (s opravenými překlepy)', () => {
    const titles = Object.fromEntries([...Array(13)].map((_, i) => [i + 10, text(slide(i + 10).querySelector('h1, h2'))]));
    assert.deepEqual(titles, {
        10: 'Tlak', 11: 'Tlak', 12: 'Tlak – jednotky, příklady', 13: 'Tlak a skupenství', 14: 'Tlak a skupenství',
        15: 'Tlak působící na potápěče', 16: 'Atmosférický tlak', 17: 'Atmosférický tlak', 18: 'Hydrostatický tlak',
        19: 'Celkový tlak', 20: 'Celkový tlak', 21: 'Důsledky zvýšeného tlaku', 22: 'Tlak v plynu',
    });
});

test('Tlak: věcné opravy z rozhodnutí 5 a překlepy', () => {
    const core = [...doc.querySelectorAll('.course-core')].map(text).join(' ');
    assert.match(text(slide(11)), /Tlak \(a tlaková síla, kterou vyvolává\) je nejzávažnější/);
    assert.match(text(slide(18)), /tíhovém zrychlení/);
    assert.match(text(slide(16)), /tíhou vzdušného obalu Země/);
    assert.match(text(slide(13)), /prakticky nestlačitelné/);
    for (const wrong of [/zkráceně tlak/, /gravitační konstant/i, /púsob/, /Ruen/, /Cannary/, /Tlaku v plynu/, /KPa/,
        /vyvolán tlakem/, /ne výšce/, /Sassolo/, /\d\.\d/]) {
        assert.doesNotMatch(core, wrong, String(wrong));
    }
});

test('Tlak: značky podle slovníčku (p_atm, p_h, celkový p), ne p_a a p_c', () => {
    assert.doesNotMatch(html, /<sub>a<\/sub>|<sub>c<\/sub>/);
    assert.match(text(slide(15)), /p = patm \+ ph/);
    assert.match(slide(18).innerHTML, /<var>p<\/var><sub>h<\/sub> = <var>h<\/var>\s*·\s*<var>ρ<\/var>\s*·\s*<var>g<\/var>/);
    assert.match(slide(11).innerHTML, /<var>p<\/var> = <var>F<\/var>\/<var>S<\/var> <span class="course-unit">\[Pa\]<\/span>/);
});

test('Tlak: slide 19 má zadání vidět a postup v jednom odkrytí', () => {
    const s = slide(19);
    assert.equal(s.dataset.slideType, 'calc');
    assert.match(text(s), /Jaký je tlak v moři v hloubce 10\s*m\?/);
    const answers = s.querySelectorAll('details.course-answer');
    assert.equal(answers.length, 1);
    assert.match(text(answers[0]), /100\s*000\s*Pa = 1\s*bar/);
    assert.match(text(answers[0]), /p = h\/10 \+ 1/);
});

/** Odpovědi tabulky slidu 20: [hloubka, odkrytý text] po řádcích. */
function tableAnswers(table) {
    return [...table.querySelectorAll('tbody tr')].map((tr) => {
        const [h, p] = tr.querySelectorAll('td');
        const details = p.querySelector('details.course-cell');
        assert.ok(details, `řádek ${text(h)}: buňka se odkrývá`);
        const answer = [...details.childNodes].filter(n => n.nodeName !== 'SUMMARY').map(n => n.textContent).join('').trim();
        return [Number(text(h).replace(',', '.')), answer];
    });
}

test('Tlak: slide 20, obě tabulky odkryjí školní odpovědi spočítané z pressure.js', () => {
    const s = slide(20);
    assert.equal(s.dataset.slideType, 'calc');
    const [sea, lake] = s.querySelectorAll('table.course-table');
    assert.ok(sea && lake);
    const seaRows = tableAnswers(sea);
    assert.deepEqual(seaRows.map(r => r[0]), [0, 10, 20, 22, 28, 30, 33, 40.5, 66]);
    for (const [h, answer] of seaRows) assert.equal(answer, formatBar(pressureAt(h).total, 'school'), `moře ${h} m`);
    const lakeRows = tableAnswers(lake);
    assert.deepEqual(lakeRows.map(r => r[0]), [0, 10, 20, 30, 40, 45, 51, 55.5]);
    for (const [h, answer] of lakeRows) {
        assert.equal(answer, formatBar(pressureAt(h, { altitude: 5500 }).total, 'school'), `jezero ${h} m`);
    }
    assert.match(text(s), /horské jezero ve výšce 5\s*500\s*m n\. m\. \(jako v testu SPČR\)/);
    assert.match(text(s), /Los Gigantes, Kanárské ostrovy|Los Gigantes, Canary Islands/);
});

test('Tlak: slide 20, 66 m je červeně jako na slidu', () => {
    const rows = [...slide(20).querySelectorAll('table.course-table')[0].querySelectorAll('tbody tr')];
    const last = rows.at(-1);
    assert.equal(text(last.querySelector('td')), '66');
    assert.ok(last.classList.contains('course-alert'), '66 m má course-alert');
    assert.equal(rows.filter(r => r.classList.contains('course-alert')).length, 1);
});

test('Tlak: slide 22 má GIF částic se zdrojem a licencí', () => {
    const img = slide(22).querySelector('figure img');
    assert.match(img.getAttribute('src'), /\.\.\/images\/gas-particles\.gif$/);
    assert.ok(img.getAttribute('alt').length > 10);
    const cap = text(slide(22).querySelector('figure figcaption'));
    assert.match(cap, /A\. Greg/);
    assert.match(cap, /Wikimedia Commons/);
    assert.match(cap, /volné dílo|public domain/i);
    assert.match(slide(22).innerHTML, /<var>p<\/var><var>V<\/var> = <var>n<\/var><var>R<\/var><var>T<\/var>/);
});

test('Tlak: schémata jsou česká SVG (síla na plochu, píst, sloupec vzduchu, tři nádoby)', () => {
    for (const n of [11, 14, 16, 18]) {
        const s = slide(n);
        assert.equal(s.dataset.slideType, 'figure', `slide ${n}`);
        const svg = s.querySelector('figure svg');
        assert.ok(svg, `slide ${n}: SVG`);
        assert.ok(svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label'), `slide ${n}: popis SVG`);
        assert.doesNotMatch(svg.textContent, /Atmosphere|Pressure|\bLow\b|\bHigh\b/, `slide ${n}: česky (Mount Everest je jméno)`);
    }
});

test('Tlak: M1 se otevírá z náhledu na slidu 15 i 20, simulátor je jeden', () => {
    for (const n of [15, 20]) {
        assert.ok(slide(n).querySelector('button.course-thumb[data-open-model="model-tlak"]'), `náhled na slidu ${n}`);
    }
    assert.equal(doc.querySelectorAll('dialog.course-sim #model-tlak').length, 1);
    assert.equal(doc.querySelectorAll('[id^="nahled-tlak"]').length, 2);
});

test('Tlak: Procvič si má otázky z analýzy a odkaz na kategorii tlak-jednotky', () => {
    const practice = doc.querySelector('#procvic .course-practice');
    assert.equal(practice.dataset.questionIds, '29,1,53,2,59,54');
    assert.ok(doc.querySelector('#procvic a[href="../quiz-physics.html?kategorie=tlak-jednotky"]'));
});

test('Tlak: stránka, její modul a GIF jsou offline (sw.js)', () => {
    const sw = read('sw.js');
    for (const f of ['./p1/tlak.html', './js/course/tlakPage.js', './images/gas-particles.gif']) assert.ok(sw.includes(`'${f}'`), f);
    assert.match(html, /<script type="module" src="\.\.\/js\/course\/tlakPage\.js"><\/script>/);
});

test('slovníček: jednotka atm je ve slovníčku i ve style-guide', () => {
    assert.match(read('docs/notation/glossary.md'), /\| atm \| fyzikální atmosféra/);
    assert.match(read('docs/notation/style-guide.md'), /\| atm \| ATM/);
});
