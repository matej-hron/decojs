// Kurz P1 – kapitola Archimédův zákon a kontrola vztlaku (slidy 31–37): obsah slidů, opravy z rozhodnutí 5–8,
// příklady 33, 34 a 37, obrázky 31, 32 a 35, model A1, bezpečnostní věty 6, 7 a 7b, pojmy, procvičování, navigace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import {
    SLIDE_33_SUIT, weightsForSuit, airMass, apparentMass, schoolPressure, diverState,
} from '../js/physics/buoyancy.js';
import { A1_SCENARIO, BUOYANCY_PARAMS } from '../js/course/buoyancyModel.js';
import { formatKg } from '../js/components/waterColumn/buoyancyLayer.js';
import { THUMB_STEP } from '../js/course/archimedesPage.js';
import { P1_QUESTIONS, chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const html = read('p1/archimeduv-zakon.html');
const doc = new JSDOM(html).window.document;
const slides = [...doc.querySelectorAll('main > section > .course-slide')];
const slide = (n) => doc.querySelector(`.course-slide[data-slide-number="${n}"]`);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const more = (n) => text(slide(n).closest('section').querySelector('details.course-more'));
const answer = (n) => text(slide(n).querySelector('details.course-answer'));
const comma = (x) => String(x).replace('.', ',');

test('Archimédův zákon: kapitola je hotová, slidy 31–37, za Stlačováním plynů', () => {
    const c = chapterBySlug('archimeduv-zakon');
    assert.equal(c.status, 'ready');
    assert.equal(c.slides, '31–37');
    assert.equal(c.title, 'Archimédův zákon a kontrola vztlaku', 'rozhodnutí 8 (5)');
    assert.equal(doc.body.dataset.courseChapter, 'archimeduv-zakon');
    assert.equal(chapterNeighbours('stlacovani-plynu').next?.slug, 'archimeduv-zakon');
    assert.equal(chapterNeighbours('archimeduv-zakon').prev?.slug, 'stlacovani-plynu');
    assert.ok(P1_QUESTIONS.find(q => q.question === 'Jak předcházet nehodám?').answeredIn.includes('archimeduv-zakon'), 'rozhodnutí 9a');
});

test('Archimédův zákon: zastávky jsou slidy 31–37 bez titulního slidu, pak dvě Procvič si', () => {
    assert.deepEqual(slides.map(s => s.dataset.slideNumber ?? null), ['31', '32', '33', '34', '35', '36', '37', null, null]);
    assert.ok(!slides.some(s => s.dataset.slideType === 'title'));
    assert.equal(slides[0].querySelector('h1')?.textContent, 'Archimédův zákon');
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.deepEqual(slides.slice(-2).map(s => s.dataset.slideType), ['practice', 'practice']);
    assert.equal(slides.at(-1).closest('section').id, 'procvic', 'krok zpět z další kapitoly míří na #procvic');
    for (let n = 31; n <= 37; n++) {
        assert.equal(slide(n).closest('section').querySelectorAll(':scope > details.course-more').length, 1, `Více pod slidem ${n}`);
    }
});

test('Archimédův zákon: nadpisy a typy slidů podle přednášky a rozhodnutí 1', () => {
    const got = Object.fromEntries([31, 32, 33, 34, 35, 36, 37].map(n => [n, [text(slide(n).querySelector('h1, h2')), slide(n).dataset.slideType]]));
    assert.deepEqual(got, {
        31: ['Archimédův zákon', 'figure'], 32: ['Archimédův zákon', 'figure'], 33: ['Archimédův zákon', 'calc'],
        34: ['Archimédův zákon', 'calc'], 35: ['Kontrola vztlaku', 'figure'], 36: ['Změna vztlaku během ponoru', 'models'],
        37: ['Změna vztlaku během ponoru', 'calc'],
    });
});

test('Archimédův zákon: opravy z rozhodnutí 8 a překlepy', () => {
    const core = [...doc.querySelectorAll('main .course-slide')].map(text).join(' ');
    for (const wrong of [/Archimedův/, /hustotoa/, /tíha těles\b/, /abchom/, /provézt/, /neopré/i, /\d(kg|l|m)\b/, /\s!/, /\*/, /\bBC\b/, /=>/]) {
        assert.doesNotMatch(core, wrong, String(wrong));
    }
    // slide 32: F_G podle slovníčku, indexy t a v stojatě, opravená závorka
    const s32 = slide(32).innerHTML;
    assert.match(s32, /<var>F<\/var><sub>G<\/sub> = <var>m<\/var><sub>t<\/sub> · <var>g<\/var> = <var>V<\/var> · <var>ρ<\/var><sub>t<\/sub> · <var>g<\/var>/);
    assert.doesNotMatch(s32, /<sub>g<\/sub>|<sub><var>/);
    assert.match(s32, /\(<var>h<\/var><sub>2<\/sub> − <var>h<\/var><sub>1<\/sub>\) · <var>ρ<\/var><sub>v<\/sub>/);
    assert.match(s32, /<var>F<\/var><sub>vz<\/sub> = <var>V<\/var> · <var>ρ<\/var><sub>v<\/sub> · <var>g<\/var> = <var>m<\/var><sub>v<\/sub> · <var>g<\/var>/);
    assert.doesNotMatch(text(slide(32)), /S · h|= h\b/, 'h = h2 − h1 a V = S · h jen ve Více');
    assert.match(more(32), /S · h = V/);
    // rozhodnutí 8 (6): „kompenzátor vztlaku (BCD)“ při prvním výskytu, dál BCD
    const first = core.indexOf('BCD');
    assert.equal(core.slice(first - 'kompenzátoru vztlaku ('.length, first), 'kompenzátoru vztlaku (');
    // rozhodnutí 8 (4): hustota vzduchu při 10 °C, objem slovy
    assert.match(text(slide(37)), /1,25\skg\/m³ při 10\s°C/);
    assert.match(answer(37), /objem vzduchu přepočtený na hladinu: 12\sl · 200 = 2\s400\sl = 2,4\sm³/);
    assert.doesNotMatch(text(slide(37)), /Vr|V<sub>r/);
});

test('Archimédův zákon: slide 35, vyvážení s vypuštěným BCD a téměř prázdnou lahví (rozhodnutí 5 a 6)', () => {
    const t = text(slide(35));
    assert.match(t, /Plně ustrojení vstoupíme do vody s vypuštěným BCD a téměř prázdnou lahví\. Seřídíme hmotnost zátěže tak, abychom při nádechu zůstali na hladině a při výdechu zvolna klesali\./);
    assert.doesNotMatch(t, /malým množstvím/);
    assert.match(t, /Pomocí BCD snadno měníme svůj objem, a tedy vztlak\./);
    assert.match(t, /Zátěžovým opaskem kompenzujeme vztlak neoprenu\./);
    assert.match(t, /Během ponoru odhazujeme zátěž jen v nejvyšší nouzi\./);
});

test('Archimédův zákon: bezpečnostní věty přesně ve znění rozhodnutí 6 (2), 7 a 7b', () => {
    assert.ok(more(35).includes('Kontrolu zátěže děláme s téměř prázdnou lahví, protože vzduch v lahvi něco váží a během ponoru ubývá: 12l lahev z 200 na 50 bar zlehčí asi o 2,3 kg (slide 37). Kdo kontroluje s plnou lahví, přidá zátěž za vzduch, který vydýchá. Jinak se na konci ponoru na bezpečnostní zastávce neudrží.'));
    assert.ok(more(35).includes('Odhozená zátěž pod vodou znamená prudký výstup, který potápěč neubrzdí, s rizikem přetlakového poranění plic a dekompresní nemoci. Proto jen v nejvyšší nouzi.'));
    assert.ok(more(36).includes('Přifukuj a upouštěj průběžně a po malých dávkách. Nejvíc se vztlak mění těsně pod hladinou, tam upouštěj nejčastěji.'));
    assert.ok(more(34).includes('Když se náklad na vlastním kompenzátoru utrhne nebo vyklouzne, potápěč s nafouknutým BCD vyletí nekontrolovaně k hladině. ‚Nic‘ znamená předměty: vynést partnera v nesnázích kompenzátorem je dovednost, kterou výcvik učí.'));
    assert.doesNotMatch(html, /Zvedací vak proto plníme/, '7b nahrazuje první odrážku rozhodnutí 7');
    assert.doesNotMatch(more(36), /m\/min/, 'bez rychlosti výstupu v číslech');
});

test('Archimédův zákon: příklady 33, 34 a 37 mají zadání vidět a postup v jednom odkrytí, výsledky z buoyancy.js', () => {
    for (const n of [33, 34, 37]) assert.equal(slide(n).querySelectorAll('details.course-answer').length, 1, `slide ${n}`);
    // slide 33: 8 kg (rozhodnutí 8 (2)), přesně s objemem olova asi 8,8 kg ve „Více“
    assert.equal(weightsForSuit(SLIDE_33_SUIT), 8);
    assert.match(text(slide(33)), /Neoprenový oblek o hmotnosti 4\skg má u hladiny objem 12\sl\. Kolik zátěže potřebujeme na kompenzaci vztlakové síly, kterou vyvolá\?/);
    assert.match(answer(33), /120\sN − 40\sN = 80\sN, to je tíha 8\skg/);
    assert.equal(text(slide(33).querySelector('.course-calc-result span')), '8 kg zátěže');
    const leadExact = 8 / (1 - 1 / 11.34);
    assert.equal(comma(leadExact.toFixed(1)), '8,8');
    assert.match(more(33), /asi 8,8\skg zátěže/);
    // slide 34: 15 l ve 20 m, 45 l na hladině (rozhodnutí 8 (3)); s objemem kotvy 13,1 l a 39 l
    const p20 = schoolPressure(20);
    assert.equal(p20, 3);
    assert.equal(15 * p20, 45);
    assert.equal(text(slide(34).querySelector('.course-calc-result span')), '15 l ve 20 m, tedy 45 l vzduchu přepočteno na hladinu');
    const anchor = apparentMass(15, 7.85);
    assert.equal(comma(anchor.toFixed(1)), '13,1');
    assert.equal(Math.round(anchor * p20), 39);
    assert.match(more(34), /13,1\sl ve 20\sm, tedy 39\sl/);
    assert.match(more(34), /ve 10\sm objem 22,5\sl a na hladině 45\sl/);
    assert.equal(45 / schoolPressure(10), 22.5);
    assert.match(more(34), /Práci se zvedacím vakem kurz P1 neučí/, 'rozhodnutí 8: vak jen ilustrace teorie');
    // slide 37: 3 kg, vydýchá se 2,25 kg (rozhodnutí 8 (4))
    assert.equal(airMass(12, 200), 3);
    assert.equal(airMass(12, 150), 2.25);
    assert.match(answer(37), /2,4\sm³ · 1,25\skg\/m³ = 3\skg/);
    assert.match(more(37), /12\sl · 150 = 1\s800\sl, tedy 2,25\skg, asi 2,3\skg/);
    assert.match(text(slide(37)), /Hmotnost vzduchu, který během ponoru vydýcháme, není zanedbatelná! Je důležité se vyvážit tak, aby na konci ponoru bylo možné provést/);
});

test('Archimédův zákon: varování na slidu 34 se značkou', () => {
    const w = slide(34).querySelector('.course-warning');
    assert.ok(w.querySelector('svg[role="img"][aria-label] .warn-sign'));
    assert.equal(text(w.querySelector('p.course-alert')), 'Nikdy nic nevynášíme vlastní silou ani na vlastním kompenzátoru vztlaku (BCD)!');
});

test('Archimédův zákon: slidy 31, 32 a 35 mají české SVG ve stylu ilustrací', () => {
    for (const n of [31, 32, 35]) {
        const svgs = [...slide(n).querySelectorAll('figure.course-illustration svg')];
        assert.equal(svgs.length, 1, `slide ${n}`);
        const svg = svgs[0];
        assert.ok(svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label'), `slide ${n}`);
        assert.equal(svg.getAttribute('viewBox'), '0 0 600 420');
        assert.ok([...svg.querySelectorAll('text')].every(el => el.classList.contains('fig-label-xl')), `slide ${n}: popisky fig-label-xl`);
        assert.ok(![...svg.querySelectorAll('*')].some(el => el.hasAttribute('fill') || el.hasAttribute('stroke') || el.hasAttribute('style')), `slide ${n}: barvy jen ze tříd`);
    }
    // 31: dvě stejná tělesa, stejný vztlak (stejný tvar šipky), tíha lehkého menší, těžkého větší
    const s31 = slide(31).querySelector('svg');
    const arrows = [...s31.querySelectorAll('.fig-force')].map(p => p.getAttribute('points').split(' ').map(xy => xy.split(',').map(Number)));
    const len = (pts) => Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
    assert.equal(arrows.length, 4);
    const [upLight, upHeavy, downLight, downHeavy] = arrows.map(len);
    assert.equal(upLight, upHeavy, 'stejný objem, stejný vztlak');
    assert.ok(downLight < upLight && downHeavy > upHeavy);
    assert.ok(s31.textContent.includes('plave') && s31.textContent.includes('klesá ke dnu'));
    assert.doesNotMatch(html, /plove/, 'plave jednotně jako Hustota a pojmy (krok A4)');
    // 32: síly F1, F2, F0 a hloubky h1, h2; F2 delší než F1
    const s32 = slide(32).querySelector('svg');
    const t32 = s32.textContent.replace(/\s+/g, '');
    for (const label of ['F1', 'F2', 'F0', 'h1', 'h2', 'V', 'S']) assert.ok(t32.includes(label), label);
    const [f1, f2] = [...s32.querySelectorAll('.fig-force')].slice(0, 2).map(p => len(p.getAttribute('points').split(' ').map(xy => xy.split(',').map(Number))));
    assert.ok(f2 > f1, 'zespodu tlačí voda víc');
    // 35: kompenzátor a opasek, bez značek výrobce
    const t35 = slide(35).querySelector('svg').textContent;
    assert.ok(t35.includes('kompenzátor') && t35.includes('(BCD)') && t35.includes('zátěžový opasek'));
    assert.equal(slide(35).querySelectorAll('svg .fig-weight').length, 3);
    assert.equal(doc.querySelectorAll('main img').length, 0, 'žádné převzaté fotky');
});

test('Archimédův zákon: A1 z náhledu slidu 36 (krok 2), odkazy na kroky, věty pod modelem', () => {
    const btn = slide(36).querySelector('button.course-thumb[data-open-model="model-vztlak"]');
    assert.equal(btn?.dataset.modelParams, `krok=${THUMB_STEP + 1}`);
    assert.equal(doc.querySelectorAll('dialog.course-sim #model-vztlak').length, 1);
    const note = text(doc.querySelector('#model-vztlak .course-simplification'));
    assert.match(note, /Zbytek potápěče \(tělo, výstroj, zátěž\) se nestlačuje a je vyvážený\./);
    assert.match(note, /Potápěč není v měřítku\./);
    assert.match(note, /Skutečný neopren se stlačuje o něco méně a po ponoru se úplně nevrací\./);
    assert.match(note, /Ve skutečnosti přifukuj a upouštěj průběžně a po malých dávkách\. Model dělá kroky po 10 m, aby byla změna vidět\./, 'R7-01');
    assert.match(more(36), /Po každém vyvážení mají oblek a vzduch v BCD dohromady 12 l, .*\(7,6 \+ 4,4 = 6,2 \+ 5,8 = 9,1 \+ 2,9 = 12 l\)/, 'R7-07');
    for (const i of [2, 4, 8]) {
        const st = diverState(A1_SCENARIO[i].depth, A1_SCENARIO[i].amount);
        assert.equal(Math.round((st.suit + st.bc) * 10) / 10, 12, `po vyvážení v kroku ${i + 1}`);
    }
    const { min, max } = BUOYANCY_PARAMS.krok;
    for (const a of doc.querySelectorAll('a[data-preset-link]')) {
        const url = new URL(a.getAttribute('href'), 'http://x/p1/archimeduv-zakon.html');
        assert.equal(url.hash, '#model-vztlak');
        const k = Number(url.searchParams.get('krok'));
        assert.ok(k >= min && k <= max, a.getAttribute('href'));
    }
    // čísla ve „Více“ slidu 36 jsou kroky 4, 6 a 10 scénáře
    const net = (i) => diverState(A1_SCENARIO[i].depth, A1_SCENARIO[i].amount).net;
    assert.equal(formatKg(net(3)), '2,9');
    assert.equal(formatKg(net(5)), '4,4');
    assert.equal(formatKg(net(9)), '4,4');
    assert.match(more(36), /z 10 do 20\sm chybí 2,9\skg vztlaku .* ze 20 do 10\sm ale přebývá 4,4\skg/);
    assert.equal(slide(36).querySelectorAll('.course-descent svg[role="img"] .fig-force').length, 2, 'šipky sestup a výstup');
});

test('Archimédův zákon: Procvič si podle rozhodnutí 9b, otázka 27 bezpečnostních směrnic pod slidem 34', () => {
    const ids = [...doc.querySelectorAll('main > section > .course-slide .course-practice')].map(p => p.dataset.questionIds);
    assert.deepEqual(ids, ['49,46,34', '47,37,45']);
    assert.deepEqual(slides.slice(-2).map(s => text(s.querySelector('h2'))), ['Procvič si: Archimédův zákon', 'Procvič si: kontrola vztlaku']);
    assert.equal(doc.querySelectorAll('a[href="../quiz-physics.html?kategorie=vztlak-vystroj"]').length, 2);
    const safety = slide(34).closest('section').querySelector('details.course-more .course-practice');
    assert.equal(safety.dataset.quizSource, 'data/quiz-safety.json');
    assert.equal(safety.dataset.questionIds, '27');
    const physics = new Map(JSON.parse(read('data/quiz-physics.json')).questions.map(q => [q.id, q]));
    for (const id of [49, 46, 34, 47, 37, 45]) assert.equal(physics.get(id)?.category, 'vztlak-vystroj', `otázka ${id}`);
    const q27 = JSON.parse(read('data/quiz-safety.json')).questions.find(q => q.id === 27);
    assert.match(q27.question, /Kompenzátorem vztlaku nelze/);
    const all = [...doc.querySelectorAll('.course-practice')].map(p => p.dataset.questionIds).join(',').split(',');
    assert.equal(new Set(all).size, all.length, 'žádná otázka dvakrát');
});

test('otázka 36: vysvětlení počítá čistý vztlak 2 100 l a 720 l na lahev ve 20 m', () => {
    const q = JSON.parse(read('data/quiz-physics.json')).questions.find(x => x.id === 36);
    const t = q.explanation.replace(/ /g, ' ');
    assert.equal(q.correct, 'b');
    assert.match(t, /2 400 − 300 = 2 100 kg/);
    assert.match(t, /2 160\/3 = 720 l/);
    assert.match(t, /2 100\/720 ≈ 2,9 → 3 lahve/);
    assert.doesNotMatch(t, /cca 2400/);
    assert.equal(Math.ceil(apparentMass(2400, 8) / ((12 * 180) / schoolPressure(20))), 3);
});

test('pojmy Archimédova zákona: první odstavec obstojí sám, bez hranatých závorek, vložené pod slidy 31 a 35', () => {
    const concepts = (n) => [...slide(n).closest('section').querySelectorAll('details.course-more [data-concept]')].map(e => e.dataset.concept);
    assert.deepEqual(concepts(31), ['buoyancy']);
    assert.deepEqual(concepts(35), ['buoyancy-control']);
    const first = (id) => text(new JSDOM(read(`concepts/cs/${id}.html`)).window.document.querySelector('p'));
    assert.match(first('buoyancy'), /^Archimédův zákon: těleso ponořené do kapaliny je nadlehčováno vztlakovou silou, která se rovná tíze kapaliny tělesem vytlačené: Fvz = V · ρv · g/);
    assert.match(first('buoyancy-control'), /^Kontrola vztlaku: .*vznášet se.*zátěž.*Kompenzátor vztlaku \(BCD\)/);
    const buoyancy = text(new JSDOM(read('concepts/cs/buoyancy.html')).window.document.body);
    for (const word of ['plave', 'vznáší se', 'klesá']) assert.ok(buoyancy.includes(word), word);
    for (const id of ['buoyancy', 'buoyancy-control']) {
        assert.doesNotMatch(read(`concepts/cs/${id}.html`), /\[[^\]]*\]/, `${id}: bez hranatých závorek`);
        assert.doesNotMatch(read(`concepts/cs/${id}.html`), /\bBC\b|neopré/, id);
    }
});

test('slovníček: BCD mezi zkratkami, indexy t a v', () => {
    const g = read('docs/notation/glossary.md');
    assert.match(g, /\| BCD \| kompenzátor vztlaku/);
    assert.match(g, /\| těleso .*\| t \|/);
    assert.match(g, /\| voda, kapalina .*\| v \|/);
});

test('Archimédův zákon: stránka, modul, model a pojmy jsou offline (sw.js)', () => {
    const sw = read('sw.js');
    for (const f of ['./p1/archimeduv-zakon.html', './js/course/archimedesPage.js', './js/course/buoyancyModel.js',
        './js/components/waterColumn/buoyancyLayer.js', './js/physics/buoyancy.js',
        './concepts/cs/buoyancy.html', './concepts/cs/buoyancy-control.html']) {
        assert.ok(sw.includes(`'${f}'`), f);
    }
    assert.match(html, /<script type="module" src="\.\.\/js\/course\/archimedesPage\.js"><\/script>/);
    assert.match(html, /<meta name="robots" content="noindex">/);
});
