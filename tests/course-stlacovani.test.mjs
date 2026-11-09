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
    assert.match(text(slide(23)), /Boyle-Mariottův zákon: pV = konst\..*Součin tlaku a objemu plynu je stálý\./);
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
    // S7: dvě ilustrace ve stylu slidu 12 Tlaku, nadpis nad každou a výčet dutin v popisku pod ní
    const [auto, active] = [...s.querySelectorAll('.course-core > div:not(.course-core-row)')];
    assert.equal(text(auto.querySelector('.course-figure-title')), 'Automatické vyrovnání tlaku');
    assert.equal(text(auto.querySelector('figcaption')), 'plíce, trávicí systém, obličejové dutiny, dýchací cesty');
    assert.equal(text(active.querySelector('.course-figure-title')), 'Aktivní vyrovnání tlaku');
    assert.equal(text(active.querySelector('figcaption')), 'střední ucho (Eustachova trubice), prostor uvnitř masky');
    assert.doesNotMatch(text(s), /násiln/i);
    const [body, ear] = [auto, active].map(div => div.querySelector('figure.course-illustration svg'));
    for (const svg of [body, ear]) {
        assert.ok(svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label'));
        assert.equal(svg.getAttribute('viewBox'), '0 0 600 270');
        assert.ok([...svg.querySelectorAll('text')].every(el => el.classList.contains('fig-label-xl')), 'popisky fig-label-xl');
        assert.ok(![...svg.querySelectorAll('*')].some(el => el.hasAttribute('fill') || el.hasAttribute('stroke') || el.hasAttribute('style')), 'barvy jen ze tříd');
    }
    for (const label of ['maska', '(aktivně)', `dutiny s${N}plynem`, '(slide 21)']) assert.ok(body.textContent.includes(label), label);
    for (const label of ['zvukovod', 'bubínek', 'střední ucho', 'Eustachova', 'trubice']) assert.ok(ear.textContent.includes(label), label);
    assert.ok(ear.querySelector('.fig-force'), 'voda tlačí zvukovodem na bubínek');
    const row = s.querySelector('.course-core-row');
    assert.match(text(row), /Sestup: tlak roste\./);
    assert.ok(row.querySelector('svg[role="img"][aria-label] .fig-force'), 'šipka sestupu');
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

test('Stlačování plynů: slide 23 má české SVG válců s písty a grafu p–V (1 bar 4 l, 2 bar 2 l, 4 bar 1 l)', () => {
    // S7: dvě ilustrace ve stylu slidu 12 Tlaku (viewBox 600 × 270, popisky fig-label-xl, barvy jen ze tříd)
    const svgs = [...slide(23).querySelectorAll('figure.course-illustration svg')];
    assert.equal(svgs.length, 2);
    for (const svg of svgs) {
        assert.ok(svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label'));
        assert.equal(svg.getAttribute('viewBox'), '0 0 600 270');
        assert.ok([...svg.querySelectorAll('text')].every(el => el.classList.contains('fig-label-xl')));
        assert.ok(![...svg.querySelectorAll('*')].some(el => el.hasAttribute('fill') || el.hasAttribute('stroke') || el.hasAttribute('style')));
    }
    const [cylinders, graph] = svgs;
    const t = svgs.map(svg => svg.textContent).join(' ').replace(/\s+/g, ' ');
    for (const label of ['4 bar', '2 bar', '1 bar', '1 l', '2 l', '4 l', 'objem [l]', 'tlak [bar]']) {
        assert.ok(t.includes(label), label);
    }
    assert.doesNotMatch(t, /Druck|Volumen|Liter/);
    assert.equal(cylinders.querySelectorAll('.fig-weight').length, 4 + 2 + 1, 'závaží 4, 2 a 1');
    // T20: tlak roste zleva doprava jako věta pod obrázkem („Kolikrát se zvětší tlak…“): 1 bar 4 l, 2 bar 2 l, 4 bar 1 l
    const byX = (sel) => [...cylinders.querySelectorAll(sel)].sort((a, b) => Number(a.getAttribute('x')) - Number(b.getAttribute('x')));
    assert.deepEqual(byX('.fig-gas').map(r => Number(r.getAttribute('height'))), [128, 64, 32], 'objem plynu zleva 4 : 2 : 1');
    assert.deepEqual([...cylinders.querySelectorAll('.fig-gas')].map(r => Number(r.getAttribute('height'))), [128, 64, 32], 'i v pořadí dokumentu');
    const labels = [...cylinders.querySelectorAll('text')].map(el => [Number(el.getAttribute('x')), Number(el.getAttribute('y')), el.textContent.replace(/\s+/g, ' ')]);
    const row = (y) => labels.filter(l => l[1] === y).sort((a, b) => a[0] - b[0]).map(l => l[2]);
    assert.deepEqual(row(226), ['1 bar', '2 bar', '4 bar']);
    assert.deepEqual(row(262), ['4 l', '2 l', '1 l']);
    // závaží leží na pístu svého válce: zleva 1, 2, 4
    const pistons = byX('.fig-plastic');
    assert.deepEqual(pistons.map(pi => [...cylinders.querySelectorAll('.fig-weight')].filter(w => {
        const x = Number(w.getAttribute('x'));
        return x >= Number(pi.getAttribute('x')) && x < Number(pi.getAttribute('x')) + Number(pi.getAttribute('width'))
            && Number(w.getAttribute('y')) + Number(w.getAttribute('height')) === Number(pi.getAttribute('y'));
    }).length), [1, 2, 4]);
    // molekuly v plynu svého válce
    for (const m of cylinders.querySelectorAll('.fig-molecule')) {
        const cx = Number(m.getAttribute('cx')), cy = Number(m.getAttribute('cy'));
        assert.ok(byX('.fig-gas').some(g => cx > Number(g.getAttribute('x')) && cx < Number(g.getAttribute('x')) + 112
            && cy > Number(g.getAttribute('y')) && cy < Number(g.getAttribute('y')) + Number(g.getAttribute('height'))), `${cx},${cy}`);
    }
    assert.match(cylinders.getAttribute('aria-label'), /zleva doprava roste tlak: s jedním závažím je tlak 1\sbar a objem 4\sl, se dvěma 2\sbar a 2\sl, se čtyřmi 4\sbar a 1\sl/);
    assert.equal(cylinders.querySelectorAll('.fig-molecule').length, 3 * 8, 've všech válcích stejně částic');
    assert.equal(graph.querySelectorAll('.fig-dot').length, 3);
    // body grafu leží na p · V = 4 bar · l (x = 120 + 100 · V, y = 190 − 38 · p)
    for (const dot of graph.querySelectorAll('.fig-dot')) {
        const V = (Number(dot.getAttribute('cx')) - 120) / 100;
        const p = (190 - Number(dot.getAttribute('cy'))) / 38;
        assert.equal(p * V, 4);
    }
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
    assert.match(gas, /asi 3&nbsp;000&nbsp;l vzduchu přepočteného na hladinu \(počítáno jako ideální plyn, jako v&nbsp;testech SPČR\)/);
    assert.match(more(24), /Tlak počítáme v hloubce spodního okraje zvonu\./);
    assert.doesNotMatch(answer(28), /hladinová spotřeba · p =/);
    assert.match(answer(28), /spotřeba v hloubce = hladinová spotřeba krát tlak v barech: 30\sl\/min · 3,5 = 105\sl\/min/, 'R6-01');
    assert.match(slide(27).querySelector('figure svg').textContent, /dutiny s\splynem\s*\(slide 21\)/, 'R6-02');
    assert.match(read('docs/course/slides.md'), /slide 26 \(typ `models`\)/);
});

test('T16: střední ucho a Eustachova trubice na slidu 27 mají tvar jako na slidu 21 (Tlak)', () => {
    const ear = [...slide(27).querySelectorAll('figure.course-illustration svg')][1];
    const cavity = ear.querySelector('rect.fig-cavity-light');
    const [w, h, rx, y] = ['width', 'height', 'rx', 'y'].map(a => +cavity.getAttribute(a));
    assert.ok(w > h, 'dutina středního ucha je širší než vysoká, jako na slidu 21');
    assert.ok(rx / h > 0.3 && rx / h < 0.45, 'stejně zaoblené rohy');
    // trubice vychází ze spodku dutiny a vede šikmo dolů dopředu v mírném oblouku (Q), stěna i průsvit stejnou cestou
    const tubes = [...ear.querySelectorAll('path.fig-tube-wall, path.fig-tube')].map(p => p.getAttribute('d'));
    assert.equal(tubes.length, 2);
    assert.equal(tubes[0], tubes[1]);
    const m = tubes[0].match(/^M(\d+) (\d+)Q(\d+) (\d+) (\d+) (\d+)$/);
    assert.ok(m, tubes[0]);
    const [x0, y0, , , x1, y1] = m.slice(1).map(Number);
    assert.ok(Math.abs(y0 - (y + h)) <= 4, 'začíná na spodku dutiny');
    assert.ok(x1 - x0 >= 20 && y1 > y0, 'šikmo dolů dopředu');
});

test('T17: slide 27 vlevo má stejnou postavu jako slide 21 (sdílený symbol), ne starou postavu zepředu', () => {
    const body = slide(27).querySelector('figure.course-illustration svg');
    assert.equal(body.querySelector('use')?.getAttribute('href'), '../images/course/p1/telo-profil.svg#telo');
    assert.equal(body.querySelectorAll('.fig-silhouette, .fig-cavity').length, 0, 'žádné dutiny jako oči');
    assert.ok(body.querySelector('.fig-glass'), 'maska');
    assert.equal(body.querySelectorAll('.fig-leader-dot').length, body.querySelectorAll('path.fig-leader').length);
});

// ---------------------------------------------------------------- T21: postup přes p · V = konst.

test('T21: postup ve „Více“ slidů 24 a 25 jde přes p · V = konst., jeden řádek na hloubku', () => {
    const rows = (id) => [...doc.querySelectorAll(`#${id} li`)].map(li => text(li));
    assert.match(text(doc.querySelector('#postup-zvon')), /Množství vzduchu ve zvonu se nemění, proto součin tlaku a objemu zůstává stejný \(Boyle-Mariottův zákon\)/);
    assert.deepEqual(rows('postup-zvon'), [
        '0 m: 1 · 1 000 = 1 000,',
        '10 m: 2 · V2 = 1 000 → V2 = 500 l,',
        '20 m: 3 · V3 = 1 000 → V3 ≈ 333 l.',
    ]);
    assert.match(text(doc.querySelector('#postup-balonek')), /Množství vzduchu v balónku se nemění, proto součin tlaku a objemu zůstává stejný \(Boyle-Mariottův zákon\)/);
    assert.deepEqual(rows('postup-balonek'), [
        '40 m: 5 · 6 = 30,',
        '30 m: 4 · V = 30 → V = 7,5 l,',
        '20 m: 3 · V = 30 → V = 10 l,',
        '10 m: 2 · V = 30 → V = 15 l,',
        'hladina: 1 · V = 30 → V = 30 l.',
    ]);
    for (const id of ['postup-zvon', 'postup-balonek']) {
        const bare = doc.querySelector(`#${id}`).cloneNode(true);
        bare.querySelectorAll('var').forEach(v => v.remove());
        assert.doesNotMatch(bare.textContent, /(^|[\s·=(])[Vp]($|[\s·=),])/, `${id}: veličiny kurzívou`);
    }
    // Tabulky na slidech zůstávají beze sloupce p · V (Matej, úprava T21).
    for (const n of [24, 25]) {
        assert.deepEqual([...slide(n).querySelectorAll('thead th')].map(th => text(th)), ['Hloubka [m]', 'Tlak [bar]', 'Objem [l]']);
    }
    // Slide 26 už neodkazuje na odečet změny proti předchozímu řádku, model ho nemá.
    assert.doesNotMatch(text(slide(26).closest('section')), /odečet změny/);
});

