// Kurz P1 – kapitola Stlačování plynů (slidy 23–30): obsah slidů, opravy z rozhodnutí 4 a 5, tabulky slidů 24 a 25,
// příklady spotřeby 28–30, model B1, pojmy, navigace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { volumeAtDepth, gasUsed, timeToReserve, sacFromPressureDrop } from '../js/physics/boyle.js';
import { pressureAt } from '../js/physics/pressure.js';
import { formatBar } from '../js/components/waterColumn/pressureLayer.js';
import { formatLitres } from '../js/components/waterColumn/gasVolumeLayer.js';
import { chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const html = read('p1/stlacovani-plynu.html');
const doc = new JSDOM(html).window.document;
const slides = [...doc.querySelectorAll('main > section > .course-slide')];
const slide = (n) => doc.querySelector(`.course-slide[data-slide-number="${n}"]`);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const more = (n) => text(slide(n).closest('section').querySelector('details.course-more'));
const N = ' ';

test('Stlačování plynů: kapitola je hotová, slidy 23–30, mezi Tlakem a dalšími kapitolami', () => {
    const c = chapterBySlug('stlacovani-plynu');
    assert.equal(c.status, 'ready');
    assert.equal(c.slides, '23–30');
    assert.equal(doc.body.dataset.courseChapter, 'stlacovani-plynu');
    assert.equal(chapterNeighbours('tlak').next?.slug, 'stlacovani-plynu');
    assert.equal(chapterNeighbours('stlacovani-plynu').prev?.slug, 'tlak');
});

test('Stlačování plynů: zastávky jsou slidy 23–30 bez titulního slidu, pak dvě Procvič si', () => {
    const numbers = slides.map(s => s.dataset.slideNumber ?? null);
    assert.deepEqual(numbers, ['23', '24', '25', '26', '27', '28', '29', '30', null, null]);
    assert.ok(!slides.some(s => s.dataset.slideType === 'title'), 'přednáška nemá titulní slide kapitoly');
    assert.equal(slides[0].querySelector('h1')?.textContent, 'Stlačování plynů');
    assert.deepEqual(slides.slice(-2).map(s => s.dataset.slideType), ['practice', 'practice']);
    assert.equal(slides.at(-1).closest('section').id, 'procvic', 'krok zpět z další kapitoly míří na #procvic');
});

test('Stlačování plynů: každý slide 23–30 má pod sebou „Více“', () => {
    for (let n = 23; n <= 30; n++) {
        assert.equal(slide(n).closest('section').querySelectorAll(':scope > details.course-more').length, 1, `slide ${n}`);
    }
});

test('Stlačování plynů: nadpisy slidů podle přednášky', () => {
    const titles = Object.fromEntries([...Array(8)].map((_, i) => [i + 23, text(slide(i + 23).querySelector('h1, h2'))]));
    assert.deepEqual(titles, {
        23: 'Stlačování plynů', 24: 'Stlačování plynů', 25: 'Stlačování plynů', 26: 'Stlačování plynů',
        27: 'Stlačování plynů, tělní dutiny', 28: 'Stlačování plynů, výpočet spotřeby',
        29: 'Stlačování plynů, výpočet spotřeby', 30: 'Stlačování plynů, výpočet spotřeby',
    });
});

test('Stlačování plynů: opravy z rozhodnutí 4 a překlepy', () => {
    const core = [...doc.querySelectorAll('main .course-core')].map(text).join(' ');
    assert.match(text(slide(23)), /Boyle-Mariottův zákon říká, že součin tlaku a objemu plynu je stálý/);
    assert.match(slide(23).innerHTML, /<var>p<\/var><var>V<\/var> = konst\./, 'v jádru pV = konst. jako na slidu');
    assert.match(text(slide(23)), /izotermický děj/);
    assert.match(text(slide(24)), /po spuštění zvonu do 10 a do 20\sm/);
    for (const wrong of [/keson/i, /333,33/, /Marriot/, /oběm/, /(^|\s)rotože/, /isotermick/, /Tlak \[Bar\]/, /\d+m\b/, /\d\.\d/, /láhev/]) {
        assert.doesNotMatch(core, wrong, String(wrong));
    }
    // p₁ · V₁ = p₂ · V₂ jen ve „Více“: v pojmu boyle-mariotte, který „Více“ slidu 23 vkládá
    assert.match(read('concepts/cs/boyle-mariotte.html'), /<var>p<\/var><sub>1<\/sub> · <var>V<\/var><sub>1<\/sub>\s*= <var>p<\/var><sub>2<\/sub> · <var>V<\/var><sub>2<\/sub>/);
    assert.doesNotMatch(text(slide(23)), /V1|V₁/, 'v jádru jen pV = konst.');
});

/** Řádky tabulky: [hloubka, tlak, objem], u odkrývaných buněk text odpovědi. */
function tableRows(table) {
    const cell = (td) => {
        const d = td.querySelector('details.course-cell');
        if (!d) return text(td);
        return [...d.childNodes].filter(n => n.nodeName !== 'SUMMARY').map(n => n.textContent).join('').trim();
    };
    return [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(cell));
}

test('Stlačování plynů: slide 24, zvon, odkryté hodnoty spočítané z boyle.js', () => {
    const s = slide(24);
    assert.equal(s.dataset.slideType, 'calc');
    const rows = tableRows(s.querySelector('table.course-table'));
    assert.deepEqual(rows.map(r => r[0]), ['0', '10', '20']);
    for (const [h, p, v] of rows) {
        const depth = Number(h);
        assert.equal(p, formatBar(pressureAt(depth).total, 'school'), `tlak ${h} m`);
        assert.equal(v, formatLitres(volumeAtDepth(depth, { volume: 1000, depth: 0 })).replaceAll(N, ' '), `objem ${h} m`);
    }
    assert.equal(rows[2][2], '333', 'rozhodnutí 4: 333 l místo 333,33 l');
    assert.equal(s.querySelectorAll('details.course-cell').length, 5, 'na hladině je objem 1 000 l zadaný');
    const th = [...s.querySelectorAll('thead th')].map(text);
    assert.deepEqual(th, ['Hloubka [m]', 'Tlak [bar]', 'Objem [l]']);
});

test('Stlačování plynů: slide 25, balónek, odkryté hodnoty spočítané z boyle.js', () => {
    const s = slide(25);
    const rows = tableRows(s.querySelector('table.course-table'));
    assert.deepEqual(rows.map(r => r[0]), ['0', '10', '20', '30', '40']);
    for (const [h, p, v] of rows) {
        const depth = Number(h);
        assert.equal(p, formatBar(pressureAt(depth).total, 'school'), `tlak ${h} m`);
        assert.equal(v, formatLitres(volumeAtDepth(depth, { volume: 6, depth: 40 })), `objem ${h} m`);
    }
    assert.deepEqual(rows.map(r => r[2]), ['30', '15', '10', '7,5', '6']);
    assert.equal(s.querySelectorAll('details.course-cell').length, 9, '6 l ve 40 m je zadaných');
});

test('Stlačování plynů: slide 26, změny 1,5 l a 2×, varování červeně se značkou', () => {
    const s = slide(26);
    assert.match(text(s), /ze 40 do 30\sm se balónek zvětšil pouze o 1,5\sl, protože poměr tlaků je pouze 5\/4/);
    assert.match(text(s), /z 10\sm na hladinu.*se ale jeho objem zvýšil 2× \(odpovídá poměru snížení tlaku 2\/1\)/);
    assert.equal(text(s.querySelector('.course-alert')), '2×');
    const warning = s.querySelector('.course-warning');
    assert.ok(warning.querySelector('svg[role="img"][aria-label]'));
    assert.equal(text(warning.querySelector('p.course-alert')), 'Nikdy nezadržujte dech!Dýchejte normálně!');
    const v = (h) => volumeAtDepth(h, { volume: 6, depth: 40 });
    assert.equal(v(30) - v(40), 1.5);
    assert.equal(v(0) / v(10), 2);
});

test('Stlačování plynů: slide 27 podle rozhodnutí 5 (automaticky / aktivně, maska aktivně)', () => {
    const s = slide(27);
    assert.equal(s.dataset.slideType, 'figure');
    const t = text(s.querySelector('.course-core > div'));
    assert.match(t, /Automatické vyrovnání tlaku: plíce, trávicí systém, obličejové dutiny, dýchací cesty\./);
    assert.match(t, /Aktivní vyrovnání tlaku: střední ucho \(Eustachova trubice\), prostor uvnitř masky\./);
    assert.doesNotMatch(text(s), /násiln/i);
    const svg = s.querySelector('figure svg');
    assert.ok(svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label'));
    // R5-04: ucho je velké a popsané (popisky fig-label-lg jako jehla na slidu 12 Tlaku), tělo je malé, dutiny jmenuje text
    for (const label of ['zvukovod', 'bubínek', 'střední ucho', 'Eustachova', 'trubice', 'automaticky', '(maska', 'aktivně)', 'sestup']) {
        assert.ok(svg.textContent.includes(label), label);
    }
    assert.ok([...svg.querySelectorAll('text')].every(el => el.classList.contains('fig-label-lg')), 'všechny popisky velké');
    assert.ok(s.querySelector('a[href="https://www.stranypotapecske.cz/teorie/eustach.asp?str=200408241518290"]'));
});

/** Odkrytý výsledek příkladu a jeho postup. */
const answer = (n) => text(slide(n).querySelector('details.course-answer'));

test('Stlačování plynů: slidy 28–30 mají zadání vidět a postup v jednom odkrytí, výsledky z boyle.js', () => {
    for (const n of [28, 29, 30]) {
        assert.equal(slide(n).dataset.slideType, 'calc', `slide ${n}`);
        assert.equal(slide(n).querySelectorAll('details.course-answer').length, 1, `slide ${n}`);
    }
    assert.equal(gasUsed({ sac: 30, depth: 25, time: 20 }), 2100);
    assert.match(answer(28), /2\s100\sl vzduchu \(přepočteno na hladinu\)/, 'rozhodnutí 4 (3)');
    const tank = { cylinder: 15, start: 200, reserve: 50, sac: 30 };
    assert.equal(timeToReserve({ ...tank, depth: 10 }), 37.5);
    assert.equal(timeToReserve({ ...tank, depth: 30 }), 18.75);
    assert.match(answer(29), /37,5\smin/);
    assert.match(answer(29), /18,75\smin/);
    assert.match(answer(29), /a\) asi 37\smin, b\) asi 18\smin \(zaokrouhleno dolů\)/);
    assert.equal(Math.round(sacFromPressureDrop({ cylinder: 10, drop: 100, time: 20, depth: 20 }) * 10) / 10, 16.7);
    assert.match(answer(30), /asi 16,7\sl\/min/);
    assert.match(text(slide(29)), /15litrová lahev/);
    assert.match(text(slide(30)), /z 10litrového přístroje/);
});

test('Stlačování plynů: slide 23 má české SVG válců s písty a grafu p–V (4 bar 1 l, 2 bar 2 l, 1 bar 4 l)', () => {
    const svg = slide(23).querySelector('figure svg');
    assert.ok(svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label'));
    const t = svg.textContent.replace(/\s+/g, ' ');
    for (const label of ['4 bar', '2 bar', '1 bar', '1 l', '2 l', '4 l', 'objem [l]', 'tlak [bar]']) {
        assert.ok(t.includes(label), label);
    }
    assert.doesNotMatch(t, /Druck|Volumen|Liter/);
    assert.equal(svg.querySelectorAll('.fig-weight').length, 4 + 2 + 1, 'závaží 4, 2 a 1');
    assert.equal(svg.querySelectorAll('.fig-point').length, 3);
    const particles = svg.querySelectorAll('.fig-particle').length;
    assert.equal(particles % 3, 0, 've všech válcích stejně částic');
});

test('Stlačování plynů: B1 se otevírá z náhledů na slidech 24, 25 a 26 se svou předvolbou', () => {
    const presets = Object.fromEntries([24, 25, 26].map(n => {
        const btn = slide(n).querySelector('button.course-thumb[data-open-model="model-boyle"]');
        assert.ok(btn, `náhled na slidu ${n}`);
        return [n, btn.dataset.modelParams];
    }));
    assert.deepEqual(presets, { 24: 'zvon=1', 25: 'zvon=0', 26: 'zvon=0&hloubka=0' });
    assert.equal(doc.querySelectorAll('dialog.course-sim #model-boyle').length, 1);
    assert.match(text(doc.querySelector('#model-boyle .course-simplification')), /nejsou v měřítku/);
});

test('Stlačování plynů: Procvič si má otázky z analýzy a odkazy na kategorie', () => {
    // Na slide Procvič si patří tři otázky (slides.md §4): 23, 39, 33 a 61, 62, 66; otázka 35 (bublina) je pod slidem 25.
    const ids = [...doc.querySelectorAll('main > section > .course-slide .course-practice')].map(p => p.dataset.questionIds);
    assert.deepEqual(ids, ['23,39,33', '61,62,66']);
    assert.equal(slide(25).closest('section').querySelector('details.course-more .course-practice')?.dataset.questionIds, '35');
    assert.ok(doc.querySelector('a[href="../quiz-physics.html?kategorie=fyzika-plynu"]'));
    assert.ok(doc.querySelector('a[href="../quiz-physics.html?kategorie=spotreba-planovani"]'));
    const quiz = new Set(JSON.parse(read('data/quiz-physics.json')).questions.map(q => q.id));
    for (const id of [23, 39, 35, 33, 61, 62, 66]) assert.ok(quiz.has(id), `otázka ${id}`);
});

test('Stlačování plynů: „Více“ má pojmy a texty, odkazy na model míří na existující předvolby', () => {
    const concepts = (n) => [...slide(n).closest('section').querySelectorAll('details.course-more [data-concept]')].map(e => e.dataset.concept);
    assert.deepEqual(concepts(23), ['boyle-mariotte']);
    assert.deepEqual(concepts(27), ['body-air-spaces']);
    assert.deepEqual(concepts(28), ['gas-consumption']);
    assert.match(more(24), /otázka testu SPČR č\. 39/);
    assert.match(more(25), /29,8\sl místo 30\sl/);
    assert.match(more(26), /neurčuje rozdíl hloubek, ale poměr tlaků/);
    for (const a of doc.querySelectorAll('a[data-preset-link]')) assert.match(a.getAttribute('href'), /#model-boyle$/);
    assert.doesNotMatch(html, /Připravujeme/);
});

test('pojmy Stlačování plynů: první odstavec obstojí sám, bez hranatých závorek', () => {
    const first = (id) => text(new JSDOM(read(`concepts/cs/${id}.html`)).window.document.querySelector('p'));
    assert.match(first('boyle-mariotte'), /Boyle-Mariottův zákon: .*p · V = konst\..*p1 · V1 = p2 · V2/);
    assert.match(first('body-air-spaces'), /Dutiny s plynem .* stlačují .* vyrovnávat s tlakem okolí/);
    assert.match(first('gas-consumption'), /Hladinová spotřeba \(SAC\) .* v litrech za minutu.*spotřeba v hloubce = hladinová spotřeba · p/);
    for (const id of ['boyle-mariotte', 'body-air-spaces', 'gas-consumption']) {
        assert.doesNotMatch(read(`concepts/cs/${id}.html`), /\[(bar|Pa|m|l|kPa|l\/min)\]/, `${id}: bez hranatých závorek`);
    }
});

test('slovníček: hladinová spotřeba (SAC, l/min)', () => {
    assert.match(read('docs/notation/glossary.md'), /\| SAC \| hladinová spotřeba .*l\/min/);
});

test('Stlačování plynů: stránka, modul, model a pojmy jsou offline (sw.js)', () => {
    const sw = read('sw.js');
    for (const f of ['./p1/stlacovani-plynu.html', './js/course/stlacovaniPage.js', './js/course/boyleModel.js',
        './js/components/waterColumn/gasVolumeLayer.js', './js/physics/boyle.js',
        './concepts/cs/boyle-mariotte.html', './concepts/cs/body-air-spaces.html', './concepts/cs/gas-consumption.html']) {
        assert.ok(sw.includes(`'${f}'`), f);
    }
    assert.match(html, /<script type="module" src="\.\.\/js\/course\/stlacovaniPage\.js"><\/script>/);
});

test('jméno zákona: v kapitole Tlak „Boyle-Mariottův zákon“ (rozhodnutí 4), citace osnovy na rozcestníku doslova', () => {
    assert.doesNotMatch(read('p1/tlak.html'), /Boyleův/);
    assert.equal((read('p1/tlak.html').match(/Boyle-Mariottův zákon/g) || []).length, 3);
    for (const id of ['pressure', 'pascal-law', 'atmospheric-pressure', 'hydrostatic-pressure', 'total-pressure', 'gas-pressure']) {
        assert.doesNotMatch(read(`concepts/cs/${id}.html`), /Boyleův|Mariotteův/, id);
    }
    assert.match(read('p1/index.html'), /Boyleův-Mariotteův zákon \(izotermický děj\)/, 'citace osnovy beze změny');
});

test('R5-01, R5-02: bezpečnostní věty v pojmu dutin a pod slidem 26', () => {
    const t = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const spaces = t(read('concepts/cs/body-air-spaces.html'));
    assert.match(spaces, /Automaticky se tlak vyrovná v plicích a dýchacích cestách, dokud dýcháš normálně: při sestupu automatika dodává vzduch o tlaku okolí, při výstupu rozpínající se vzduch volně vydechneš\./);
    assert.match(spaces, /polknutím, pohybem čelistí, nebo jemným vydechnutím proti ucpanému nosu \(Valsalvův manévr\)/);
    assert.match(spaces, /Vyrovnávej od hladiny a často, dřív než ucho zabolí\. Když to nejde, vystoupej o kus výš a zkus to znovu, nikdy nepokračuj přes bolest\. S rýmou nebo ucpaným nosem se nepotápěj\./);
    assert.match(spaces, /František Novomeský, Pan Eustach, Strany potápěčské/);
    assert.match(more(26), /Zadržený dech při výstupu může plíce roztrhnout, a to i při výstupu z malé hloubky/);
    assert.match(more(26), /vydechuj plynule celou cestu nahoru/);
});

test('R5-05: spotřeba rozměrově, plná lahev jako ideální plyn, tlak u spodního okraje zvonu', () => {
    const gas = read('concepts/cs/gas-consumption.html');
    assert.match(gas, /hladinová spotřeba · <var>p<\/var> \/ \(1&nbsp;bar\)/);
    assert.match(gas, /asi 3&nbsp;000&nbsp;l vzduchu přepočteného na hladinu \(počítáno jako ideální plyn, jako v testech SPČR\)/);
    assert.match(more(24), /Tlak počítáme v hloubce spodního okraje zvonu\./);
    assert.doesNotMatch(answer(28), /hladinová spotřeba · p =/);
    assert.match(answer(28), /spotřeba v hloubce = hladinová spotřeba krát tlak v barech: 30\sl\/min · 3,5 = 105\sl\/min/, 'R6-01');
    assert.match(slide(27).querySelector('figure svg').textContent, /dutiny s plynem\s*\(slide 21\)/, 'R6-02');
    assert.match(read('docs/course/slides.md'), /slide 26 \(typ `models`\)/);
});
