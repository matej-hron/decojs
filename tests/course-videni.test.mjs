// Kurz P1 – kapitola Vidění pod vodou (slidy 48–54, P★★): obsah slidů, opravy z analýzy optiky (otázky 1–7),
// fyzika ve schématech (lom, odraz, Snellovo okno), pojem, procvičování a zdroj fotky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { P1_QUESTIONS, chapterBySlug, chapterNeighbours } from '../js/course/p1Course.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const html = read('p1/videni.html');
const doc = new JSDOM(html).window.document;
const slides = [...doc.querySelectorAll('main > section > .course-slide')];
const slide = (n) => doc.querySelector(`.course-slide[data-slide-number="${n}"]`);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const more = (n) => text(slide(n).closest('section').querySelector('details.course-more'));
const concept = (id) => read(`concepts/cs/${id}.html`).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const N_WATER = 1.333;
const deg = (rad) => rad * 180 / Math.PI;
const rad = (d) => d * Math.PI / 180;
/** Úhel paprsku od svislice (kolmice k hladině) ze dvou bodů schématu, ve stupních. */
const angleFromVertical = ([x1, y1], [x2, y2]) => deg(Math.atan2(Math.abs(x2 - x1), Math.abs(y2 - y1)));
/** Podíl odraženého nepolarizovaného světla na rozhraní vzduch–voda (Fresnelovy vztahy). */
const reflectance = (incidenceDeg) => {
    const i = rad(incidenceDeg);
    const t = Math.asin(Math.sin(i) / N_WATER);
    const rs = ((Math.cos(i) - N_WATER * Math.cos(t)) / (Math.cos(i) + N_WATER * Math.cos(t))) ** 2;
    const rp = ((N_WATER * Math.cos(i) - Math.cos(t)) / (N_WATER * Math.cos(i) + Math.cos(t))) ** 2;
    return (rs + rp) / 2;
};
/** Body cesty „M x y L x y …“ jako dvojice čísel. */
const points = (d) => [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);

test('Vidění: kapitola je hotová, slidy 48–54, P★★, za Henrym', () => {
    const c = chapterBySlug('videni');
    assert.equal(c.status, 'ready');
    assert.equal(c.slides, '48–54');
    assert.equal(c.level, 'P★★');
    assert.equal(doc.body.dataset.courseChapter, 'videni');
    assert.equal(chapterNeighbours('henry').next?.slug, 'videni');
    assert.equal(chapterNeighbours('videni').prev?.slug, 'henry');
    // Vidění neodpovídá na žádnou otázku ze slidu 6 (analýza optiky §2).
    assert.ok(P1_QUESTIONS.every(q => !q.answeredIn.includes('videni')));
});

test('Vidění: titulní slide, pak slidy 48–54 a Procvič si, nadpisy a typy', () => {
    assert.deepEqual(slides.map(s => s.dataset.slideNumber ?? null), [null, '48', '49', '50', '51', '52', '53', '54', null]);
    assert.equal(slides[0].dataset.slideType, 'title');
    assert.equal(text(slides[0].querySelector('h1')), 'Vidění pod vodou');
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(slides.at(-1).dataset.slideType, 'practice');
    assert.equal(slides.at(-1).closest('section').id, 'procvic', 'krok zpět z další kapitoly míří na #procvic');
    const got = Object.fromEntries([48, 49, 50, 51, 52, 53, 54].map(n => [n, [text(slide(n).querySelector('h1, h2')), slide(n).dataset.slideType]]));
    assert.deepEqual(got, {
        48: ['Vidění pod vodou', 'figure'], 49: ['Vidění pod vodou', 'figure'],
        50: ['Kolik světla projde hladinou', 'figure'], 51: ['Snellovo okno', 'figure'],
        52: ['Tyč do vody ponořená…', 'figure'], 53: ['Vidění bez masky', 'figure'],
        54: ['Vidění pod vodou', 'figure'],
    });
    for (let n = 48; n <= 54; n++) {
        assert.equal(slide(n).closest('section').querySelectorAll(':scope > details.course-more').length, 1, `Více pod slidem ${n}`);
    }
    // Sousední slidy se stejným nadpisem mají stejnou variantu (T22).
    assert.equal(slide(48).dataset.slideFit, slide(49).dataset.slideFit);
    // Bez modelu (analýza optiky, otázka 7).
    assert.equal(doc.querySelectorAll('dialog, [data-open-model]').length, 0);
});

test('Vidění: text slidů podle přednášky s opravami', () => {
    const core = slides.map(text).join(' ');
    for (const wrong of [/řišího/, /1\.33|1\.38|1\.00/, /48,5/, /\d(m|%)\b/]) assert.doesNotMatch(core, wrong, String(wrong));
    assert.match(text(slide(48)), /Intenzita světla Paprsek dopadající na vodní hladinu se částečně odráží\. Světlo se při přechodu z prostředí opticky řidšího do hustšího láme ke kolmici\. Naopak při přechodu z vody na vzduch se světlo láme od kolmice\./);
    assert.match(text(slide(49)), /Pohlcování světla Nejdříve se ztrácejí teplé složky spektra\. Nejhlouběji proniká modrá\. Při nízké intenzitě světla ale oko vnímá černobíle\. Vyplatí se nosit si baterku i ve dne\./);
    assert.match(text(slide(50)), /Množství světla, které pronikne pod hladinu, je silně závislé na úhlu dopadu\./);
    assert.match(text(slide(51)), /Při pohledu zpod hladiny se do oka sbíhají paprsky přicházející jak ze vzduchu, tak i z vody\./);
    assert.match(text(slide(52)), /Zdá se býti nalomená\./);
    assert.match(text(slide(53)), /Ve vodě \(n = 1,33\) se paprsek \(téměř\) nezlomí a obraz se vytvoří za sítnicí\./);
    assert.match(text(slide(54)), /Předměty se jeví o 1\/3 větší a o 1\/4 blíž\./);
    // index lomu jako veličina kurzívou
    assert.equal(slide(53).querySelectorAll('var').length, 3);
});

test('Vidění, slide 49: barvy jen orientačně asi 5, 10 a 20 m, modrá nejhlouběji (otázka 1)', () => {
    const svg = slide(49).querySelector('svg');
    assert.deepEqual([...svg.querySelectorAll('text')].map(text), ['asi 5 m', 'asi 10 m', 'asi 20 m']);
    assert.doesNotMatch(text(slide(49)), /\b(12|22|30) m/);
    assert.match(text(slide(49).querySelector('figcaption')), /záleží na čistotě vody/);
    // Délka pruhu = nejhlubší bod šipky; pořadí od červené po modrou.
    const tip = (c) => Math.max(...points(svg.querySelector(`.fig-spec-${c}`).getAttribute('d')).map(p => p[1]));
    const order = ['red', 'orange', 'yellow', 'green', 'blue'].map(tip);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'červená nejmělčeji, modrá nejhlouběji');
    // Měřítko 12 px/m od hladiny v y = 36: hroty červené, oranžové a žluté na 5, 10 a 20 m.
    assert.deepEqual(order.slice(0, 3).map(y => (y - 36) / 12), [5, 10, 20]);
    assert.match(more(49), /v našich lomech a jezerech spíš zelená/, 'otázka 2');
});

test('Vidění, slide 48: lomený paprsek odpovídá Snellovu zákonu (n = 1,333) a láme se ke kolmici', () => {
    const svg = slide(48).querySelector('svg');
    const [incoming, refracted] = [...svg.querySelectorAll('path.fig-ray:not(.fig-weak)')].map(p => points(p.getAttribute('d')));
    const alpha = angleFromVertical(incoming[0], incoming.at(-1));
    const beta = angleFromVertical(refracted[0], refracted.at(-1));
    assert.ok(Math.abs(Math.sin(rad(alpha)) / Math.sin(rad(beta)) - N_WATER) < 0.01, `α ${alpha}, β ${beta}`);
    assert.ok(beta < alpha);
    const reflected = points(svg.querySelector('path.fig-ray.fig-weak').getAttribute('d'));
    assert.ok(Math.abs(angleFromVertical(reflected[0], reflected.at(-1)) - alpha) < 0.2, 'úhel odrazu = úhel dopadu');
});

test('Vidění, slide 50: „asi 3 %“ a „asi 30 %“ sedí s Fresnelovými vztahy pro nakreslené úhly', () => {
    const svg = slide(50).querySelector('svg');
    const rays = [...svg.querySelectorAll('path.fig-ray[marker-mid]')].map(p => points(p.getAttribute('d')));
    // dopadající paprsky končí na hladině y = 210
    const incoming = rays.filter(r => r.at(-1)[1] === 210).map(r => angleFromVertical(r[0], r.at(-1)));
    assert.equal(incoming.length, 2);
    const [high, low] = incoming.sort((a, b) => a - b);
    assert.ok(reflectance(high) <= 0.03, `slunce vysoko: ${reflectance(high)}`);
    assert.ok(Math.abs(reflectance(low) - 0.30) < 0.05, `slunce nízko: ${reflectance(low)}`);
    assert.deepEqual([...svg.querySelectorAll('text')].map(text).slice(0, 2), ['asi 3 %', 'asi 30 %']);
    // kontrola výpočtu: kolmo asi 2 %
    assert.ok(Math.abs(reflectance(0) - 0.0204) < 0.001);
});

test('Vidění, slide 51: okraj Snellova okna je mezní úhel 48,6°, na slidu „asi 49°“, číslo jen ve Více (otázka 5)', () => {
    const critical = deg(Math.asin(1 / N_WATER));
    assert.equal(critical.toFixed(1), '48.6');
    const cone = points(slide(51).querySelector('path.fig-window').getAttribute('d'));
    const eye = cone.find(p => p[1] > 150);
    for (const edge of cone.filter(p => p[1] === 150)) {
        assert.ok(Math.abs(angleFromVertical(eye, edge) - critical) < 0.1, String(edge));
    }
    assert.match(text(slide(51)), /asi 49°/);
    assert.doesNotMatch(text(slide(51)), /48,6/);
    assert.match(more(51), /nejvýš 48,6°/);
    assert.match(more(51), /asi 97° \(2 × 48,6°\)/);
    assert.match(more(51), /úplný odraz/);
});

test('Vidění, slide 51 (O5): vějíř paprsků z oblohy se láme podle Snellova zákona a sbíhá do oka v kuželu', () => {
    const svg = slide(51).querySelector('svg');
    const SURFACE = 150;
    const critical = deg(Math.asin(1 / N_WATER));
    const segments = [...svg.querySelectorAll('path.fig-ray')]
        .flatMap(p => p.getAttribute('d').split(/(?=M)/).map(points))
        .map(pts => [pts[0], pts.at(-1)]);
    const eye = points(svg.querySelector('path.fig-window').getAttribute('d')).find(p => p[1] > SURFACE);
    // ve vodě: z bodu na hladině do oka
    const inWater = segments.filter(([a, b]) => a[1] === SURFACE && b[0] === eye[0] && b[1] === eye[1]);
    // ze vzduchu: shora na hladinu
    const fromAir = segments.filter(([a, b]) => a[1] < SURFACE && b[1] === SURFACE);
    const fan = inWater.filter(([hit]) => angleFromVertical(hit, eye) <= critical + 0.1);
    assert.ok(fan.length >= 5, `paprsků z oblohy: ${fan.length}`);
    const alphas = [];
    for (const [hit] of fan) {
        const air = fromAir.find(([, end]) => end[0] === hit[0]);
        assert.ok(air, `paprsek ze vzduchu do bodu ${hit}`);
        const alpha = angleFromVertical(air[0], air[1]);
        const beta = angleFromVertical(hit, eye);
        alphas.push(alpha);
        if (alpha === 0) assert.equal(beta, 0, 'svislý paprsek jde rovně');
        else assert.ok(Math.abs(Math.sin(rad(alpha)) / Math.sin(rad(beta)) - N_WATER) < 0.01, `α ${alpha}, β ${beta}`);
    }
    // od obzoru (skoro vodorovně) z obou stran přesně na okraj kužele, šikmé i svislý
    const horizon = fan.filter(([hit]) => Math.abs(angleFromVertical(hit, eye) - critical) < 0.1);
    assert.equal(horizon.length, 2);
    assert.ok(horizon.some(([hit]) => hit[0] < eye[0]) && horizon.some(([hit]) => hit[0] > eye[0]));
    assert.ok(alphas.filter(a => a > 85).length === 2 && alphas.includes(0) && alphas.some(a => a > 20 && a < 70));
    // „odraz dna“: paprsek od kamene se odrazí od spodní strany hladiny mimo okno (úplný odraz) a jde do oka
    const reflected = inWater.filter(([hit]) => angleFromVertical(hit, eye) > critical + 1);
    assert.equal(reflected.length, 1);
    const [[hit]] = reflected;
    const up = segments.find(([a, b]) => a[1] > SURFACE && b[0] === hit[0] && b[1] === SURFACE);
    assert.ok(up, 'paprsek od kamene k hladině');
    assert.ok(Math.abs(angleFromVertical(up[0], up[1]) - angleFromVertical(hit, eye)) < 0.2, 'úhel odrazu = úhel dopadu');
    assert.ok((up[0][0] - hit[0]) * (eye[0] - hit[0]) < 0, 'kámen a oko na opačných stranách kolmice');
    const stone = svg.querySelector('.fig-stone');
    assert.ok(Math.hypot(up[0][0] - Number(stone.getAttribute('cx')), up[0][1] - Number(stone.getAttribute('cy'))) < 25, 'paprsek začíná u kamene');
    assert.deepEqual([...svg.querySelectorAll('text')].map(text), ['Snellovo okno', 'vzduch', 'voda', 'asi 49°', 'odraz', 'dna']);
});

test('Vidění, slide 51 (O5): fotka Snellova okna pod textem se zdrojem', () => {
    const img = slide(51).querySelector('.course-core > div > figure.course-figure-under > img');
    assert.ok(img);
    assert.equal(img.getAttribute('src'), '../images/course/p1/snellovo-okno.jpg');
    assert.ok(existsSync(new URL('images/course/p1/snellovo-okno.jpg', ROOT)));
    assert.equal(slide(51).querySelector('a.course-source').getAttribute('href'), 'zdroje.html#snellovo-okno');
    assert.match(read('images/course/p1/SOURCES.md'), /images\/course\/p1\/snellovo-okno\.jpg.*Hellbus.*CC BY-SA 3\.0/);
    assert.ok(read('sw.js').includes("'./images/course/p1/snellovo-okno.jpg'"));
    // P★★: na slidu žádná nová čísla ani index lomu, ty jsou ve Více
    assert.doesNotMatch(text(slide(51)), /1,33|48,|n\s*=/);
});

test('Vidění, Tyč do vody ponořená (O6, O6b): paprsky z konce tyče se lámou podle Snellova zákona, končí v zornici a zpětná prodloužení se sejdou ve zdánlivém konci', () => {
    const svg = slide(52).querySelector('svg');
    const SURFACE = 170;
    const segments = (sel) => [...svg.querySelectorAll(sel)]
        .flatMap(p => p.getAttribute('d').split(/(?=M)/).map(points)).map(pts => [pts[0], pts.at(-1)]);
    const tip = svg.querySelector('circle.fig-tip');
    const ghost = svg.querySelector('circle.fig-tip-ghost');
    const X = [Number(tip.getAttribute('cx')), Number(tip.getAttribute('cy'))];
    const Y = [Number(ghost.getAttribute('cx')), Number(ghost.getAttribute('cy'))];
    const rays = segments('path.fig-ray');
    const inWater = rays.filter(([a, b]) => a[0] === X[0] && a[1] === X[1] && b[1] === SURFACE);
    assert.equal(inWater.length, 2, 'dva paprsky z konce tyče');
    const back = segments('path.fig-ray-back');
    for (const [, hit] of inWater) {
        const air = rays.find(([a, b]) => a[0] === hit[0] && a[1] === SURFACE && b[1] < SURFACE);
        assert.ok(air, `paprsek ve vzduchu z bodu ${hit}`);
        const beta = angleFromVertical(X, hit);
        const alpha = angleFromVertical(air[0], air[1]);
        assert.ok(Math.abs(Math.sin(rad(alpha)) / Math.sin(rad(beta)) - N_WATER) < 0.01, `α ${alpha}, β ${beta}`);
        assert.ok(alpha > beta, 'z vody do vzduchu se láme od kolmice');
        // zpětné prodloužení: z bodu na hladině do zdánlivého konce, ve stejném směru jako paprsek ve vzduchu
        const ext = back.find(([a]) => a[0] === hit[0] && a[1] === SURFACE);
        assert.ok(ext, `čárkované prodloužení z ${hit}`);
        assert.deepEqual(ext[1], Y);
        const cross = (air[1][0] - hit[0]) * (Y[1] - hit[1]) - (air[1][1] - hit[1]) * (Y[0] - hit[0]);
        const len = Math.hypot(air[1][0] - hit[0], air[1][1] - hit[1]) * Math.hypot(Y[0] - hit[0], Y[1] - hit[1]);
        assert.ok(Math.abs(cross / len) < 0.002, 'prodloužení leží na přímce paprsku ve vzduchu');
    }
    // oba paprsky ve vzduchu končí v zornici oka (O6b: oko šikmo z boku, paprsky do něj skutečně vstoupí)
    const pupil = svg.querySelector('circle.fig-pupil');
    const [pcx, pcy, pr] = ['cx', 'cy', 'r'].map(k => Number(pupil.getAttribute(k)));
    const ends = inWater.map(([, hit]) => rays.find(([a, b]) => a[0] === hit[0] && a[1] === SURFACE && b[1] < SURFACE)[1]);
    for (const end of ends) assert.ok(Math.hypot(end[0] - pcx, end[1] - pcy) < pr, `paprsek končí v zornici: ${end}`);
    assert.ok(Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]) > pr, 'paprsky do zornice vstupují rozevřené');
    // pohled šikmo z boku: zdánlivý konec je výš (při pohledu shora by to byly asi 3/4 hloubky, z boku méně)
    const ratio = (Y[1] - SURFACE) / (X[1] - SURFACE);
    assert.ok(ratio > 0.35 && ratio < 0.8, `zdánlivá hloubka ${ratio}`);
    assert.ok(pcx > X[0] && Y[0] > X[0], 'oko z boku, zdánlivý konec posunutý k oku');
    // čárkovaná prodloužení jsou zřetelně rozevřená: na hladině aspoň 30 px od sebe
    assert.ok(Math.abs(inWater[0][1][0] - inWater[1][1][0]) > 30);
    // skutečná tyč je rovná a končí v X, zdánlivá ponořená část jde z hladiny do Y
    const [rod] = segments('path.fig-rod');
    assert.deepEqual(rod[1], X);
    const [rodGhost] = segments('path.fig-rod-ghost');
    assert.equal(rodGhost[0][1], SURFACE);
    assert.deepEqual(rodGhost[1], Y);
    const onRod = (rod[0][0] - X[0]) * (SURFACE - X[1]) - (rod[0][1] - X[1]) * (rodGhost[0][0] - X[0]);
    assert.ok(Math.abs(onRod) < 1, 'zdánlivá část začíná tam, kde tyč protíná hladinu');
    assert.deepEqual([...svg.querySelectorAll('text')].map(text), ['skutečně', 'vidíš', 'voda']);
    // fotka zůstává pod větou, schéma vedle; Více odkáže na schéma
    assert.ok(slide(52).querySelector('.course-core > div > figure.course-figure-under > img[src="../images/course/p1/tuzka-ve-vode.jpg"]'));
    assert.match(more(52), /Ve schématu vedle fotky je to vidět/);
});

test('Vidění: pojem underwater-vision, jeden jev (3/4 vzdálenosti → 4/3 velikosti), procvičování a zdroj fotky', () => {
    assert.deepEqual([...doc.querySelectorAll('[data-concept]')].map(el => el.dataset.concept), ['underwater-vision']);
    const c = concept('underwater-vision');
    assert.match(c, /^ ?Vidění pod vodou: oko láme světlo hlavně rohovkou/);
    assert.match(c, /jeví se asi o 1\/4 blíž a o 1\/3 větší/);
    assert.match(c, /Je to jeden jev, ne dva\. Přes masku se předmět jeví asi ve 3\/4 skutečné vzdálenosti \(1 \/ 1,33 = 0,75\)/);
    assert.ok(Math.abs(1 / N_WATER - 0.75) < 0.001 && Math.abs(N_WATER - 4 / 3) < 0.001);
    assert.ok(read('sw.js').includes("'./concepts/cs/underwater-vision.html'"));
    const blocks = [...doc.querySelectorAll('.course-practice')].map(el => [el.dataset.quizSource, el.dataset.questionIds]);
    assert.deepEqual(blocks, [['data/quiz-physics.json', '13,16,11']]);
    assert.ok(doc.querySelector('a[href="../quiz-physics.html?kategorie=optika"]'));
    const img = slide(52).querySelector('img');
    assert.equal(img.getAttribute('src'), '../images/course/p1/tuzka-ve-vode.jpg');
    assert.ok(existsSync(new URL('images/course/p1/tuzka-ve-vode.jpg', ROOT)));
    assert.match(read('images/course/p1/SOURCES.md'), /images\/course\/p1\/tuzka-ve-vode\.jpg.*Meganbeckett27.*CC BY-SA 3\.0/);
    // odkazy na hotové kapitoly a jejich kotvy
    assert.ok(doc.querySelector('a[href="stlacovani-plynu.html#dutiny"]'));
    assert.match(read('p1/stlacovani-plynu.html'), /<section id="dutiny"/);
});

test('Vidění: index lomu a úhly α, β jsou ve slovníčku s poznámkou ke kolizi n', () => {
    const g = read('docs/notation/glossary.md');
    assert.match(g, /\| \*n\* \| index lomu \| refractive index \|.*stejná značka jako látkové množství/);
    assert.match(g, /\| \*α\*, \*β\* \| úhel dopadu, úhel lomu/);
});

test('Vidění: texty neodkazují na čísla slidů, ale na název s proklikem (D16)', () => {
    const visible = [...doc.querySelectorAll('main details.course-more, main figcaption, main .course-core')].map(text).join(' ')
        + ' ' + concept('underwater-vision');
    assert.doesNotMatch(visible, /\bslid(e|u|em)\s+\d/i);
    for (const href of ['#barvy', '#bez-masky', 'index.html#osnova-p2', 'stlacovani-plynu.html#dutiny']) {
        assert.ok(doc.querySelector(`.course-more a[href="${href}"]`), href);
    }
    assert.match(read('p1/index.html'), /<section id="osnova-p2"/);
});
