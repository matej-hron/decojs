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
    // Verze licence (CC BY-SA 4.0) je označení, ne desetinné číslo.
    const core = [...doc.querySelectorAll('.course-core')].map(text).join(' ').replace(/CC BY-SA \d\.\d/g, '');
    assert.match(text(slide(11)), /Tlak \(a tlaková síla, kterou vyvolává\) je nejzávažnější/);
    assert.match(text(slide(11)), /Tlak udává, jak velká síla působí kolmo na jednotku plochy\./);
    assert.doesNotMatch(text(slide(11)), /definován velikostí síly/);
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
    assert.match(text(answers[0]), /10\s*m · 1\s*000\s*kg\/m³ · 10\s*m\/s² = 100\s*000\s*Pa = 1\s*bar/, 'jednotky v dosazení (R2-04)');
    assert.match(text(answers[0]), /p = h\/10 \+ 1 \[bar\], h v metrech/);
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
    assert.deepEqual(seaRows.map(r => r[0]), [0, 10, 20, 22, 28, 30, 33, 40, 56]);
    for (const [h, answer] of seaRows) assert.equal(answer, formatBar(pressureAt(h).total, 'school'), `moře ${h} m`);
    const lakeRows = tableAnswers(lake);
    assert.deepEqual(lakeRows.map(r => r[0]), [0, 10, 20, 30, 40, 45, 51, 55.5]);
    for (const [h, answer] of lakeRows) {
        assert.equal(answer, formatBar(pressureAt(h, { altitude: 5500 }).total, 'school'), `jezero ${h} m`);
    }
    assert.match(text(s), /Horské jezero ve výšce 5\s*500\s*m n\. m\. \(jako v testu SPČR\)/);
    assert.match(text(s), /Moře \(Los Gigantes/);
    assert.match(text(s), /Los Gigantes, Kanárské ostrovy|Los Gigantes, Canary Islands/);
});

test('Tlak: slide 20, meze 30, 40 a 56 m jsou zvýrazněné (T10), 28 m je cvičný řádek', () => {
    const rows = [...slide(20).querySelectorAll('table.course-table')[0].querySelectorAll('tbody tr')];
    const alerts = rows.filter(r => r.classList.contains('course-alert')).map(r => text(r.querySelector('td')));
    assert.deepEqual(alerts, ['30', '40', '56']);
    const last = rows.at(-1);
    assert.equal(text(last.querySelector('td')), '56');
    assert.equal(text(last.querySelector('details')).replace(/^\?/, ''), '6,6', '56 m: 6,6 bar');
});

test('Tlak: slide 22 má GIF částic s odkazem na zdroj (T18)', () => {
    const img = slide(22).querySelector('figure img');
    assert.match(img.getAttribute('src'), /\.\.\/images\/gas-particles\.gif$/);
    assert.ok(img.getAttribute('alt').length > 10);
    assert.equal(slide(22).querySelector('figure figcaption a.course-source').getAttribute('href'), 'zdroje.html#castice');
    assert.match(slide(22).innerHTML, /<var>p<\/var><var>V<\/var> = <var>n<\/var><var>R<\/var><var>T<\/var>/);
    assert.match(text(slide(22)), /Víc částic plynu \(větší látkové množství n\) → větší tlak\./);
    assert.match(text(slide(22)), /Vyšší teplota T \(částice mají větší energii\) → větší tlak\./);
    assert.doesNotMatch(text(slide(22)), /počet částic plynu \(n\)|energie částic \(T\)/);
});

test('Tlak: schémata jsou česká SVG (síla na plochu, píst, sloupec vzduchu, tři nádoby)', () => {
    for (const n of [11, 12, 14, 16, 18, 21]) {
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
    assert.equal(practice.dataset.questionIds, '29,59,54');
    assert.equal(doc.querySelector('#procvic .course-slide').dataset.slideFit, undefined, 'bez compact');
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

test('Tlak: kde originál nese myšlenku obrázkem, nese ji i náš slide (12, 13, 17, 21)', () => {
    for (const n of [12, 13, 17, 21]) {
        const svgs = [...slide(n).querySelectorAll('figure svg[role="img"]')];
        assert.ok(svgs.length > 0 && svgs.every(svg => svg.getAttribute('aria-label')), `slide ${n}`);
    }
    assert.equal(slide(12).querySelectorAll('figure svg').length, 2, 'boty a lyže, jehla');
    assert.match(text(slide(12)), /Stejná síla, menší plocha → větší tlak/);
    assert.match(text(slide(12)), /I malá síla může způsobit obrovský tlak/);
    assert.doesNotMatch(text(slide(12)), /potápěčské lahvi/, 'srovnání s lahví Matej zrušil');
    assert.match(text(slide(16).querySelector('svg')), /vzduchu ubývá, tlak klesá k\s0/);
    assert.doesNotMatch(text(slide(16).querySelector('svg')), /hranice atmosféry/);
});

test('Tlak: fotka manometru má odkaz na zdroj (autor a licence v zdroje.html, T18) a záznam v SOURCES.md', () => {
    const img = slide(12).querySelector('img');
    assert.match(img.getAttribute('src'), /\.\.\/images\/course\/p1\/manometr\.jpg$/);
    assert.equal(img.closest('figure').querySelector('figcaption a.course-source').getAttribute('href'), 'zdroje.html#manometr');
    const sources = read('images/course/p1/SOURCES.md');
    for (const f of ['images/course/p1/manometr.jpg', 'images/gas-particles.gif']) assert.ok(sources.includes(f), f);
    assert.match(sources, /\[CC BY-SA 4\.0\]\(https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/deed\.cs\)/);
    assert.ok(read('sw.js').includes("'./images/course/p1/manometr.jpg'"));
});

test('Tlak: 66 m na slidu 20 není zvýrazněné jen barvou', () => {
    const css = read('css/course.css');
    assert.match(css, /\.course-alert > td:first-child \{[^}]*text-decoration: underline/);
    assert.match(css, /\.course-alert > td \{[^}]*font-weight: 700/);
});

test('kvíz: vysvětlení otázek 6, 53, 52 a 29 (R1-03, R2-08), doslovné U+00A0', () => {
    const q = Object.fromEntries(JSON.parse(read('data/quiz-physics.json')).questions.map(x => [x.id, x]));
    const N = ' ';
    assert.ok(q[6].explanation.includes(`101${N}325${N}Pa a teplotě 10${N}°C je asi 1,25${N}kg/m³, při 0${N}°C asi 1,29${N}kg/m³`));
    assert.ok(q[53].explanation.startsWith(`Normální atmosférický tlak je 101${N}325${N}Pa, tedy přibližně 0,1${N}MPa`));
    assert.ok(q[52].explanation.endsWith(`Proto 10${N}m vody ≈ 1${N}bar ≈ tlak atmosféry.`));
    assert.ok(q[29].explanation.includes('Jednotkou je pascal (Pa)'));
    assert.doesNotMatch(q[52].explanation, /= 1 atmosféra/);
});

test('Tlak: „Více“ má texty a sdílené pojmy, žádné „Připravujeme“', () => {
    assert.doesNotMatch(html, /Připravujeme/);
    const concepts = (n) => [...slide(n).closest('section').querySelectorAll('details.course-more [data-concept]')].map(e => e.dataset.concept);
    assert.deepEqual(concepts(11), ['pressure']);
    assert.deepEqual(concepts(13), ['pascal-law']);
    assert.deepEqual(concepts(15), ['total-pressure']);
    assert.deepEqual(concepts(16), ['atmospheric-pressure']);
    assert.deepEqual(concepts(18), ['hydrostatic-pressure']);
    assert.deepEqual(concepts(22), ['gas-pressure']);
    const more = (n) => text(slide(n).closest('section').querySelector('details.course-more'));
    assert.match(read('concepts/cs/total-pressure.html'), /Přetlak/, 'přetlak a podtlak pod slidem 15 (R2-03)');
    assert.match(read('concepts/cs/total-pressure.html'), /podtlak/);
    assert.match(more(17), /standardní atmosféř/);
    assert.match(more(17), /Plánování ponorů/);
    assert.doesNotMatch(more(17), /300\s*m|hodin/, 'pravidlo 300 m bez zdroje a doby před odletem ne');
    assert.match(more(20), /předbíháme Daltonův zákon/);
    // T10: meze podle Mateje: 30 a 40 m se vzduchem podle systému výcviku, 56 m = pO₂ 1,4 bar (MOD vzduchu)
    for (const d of ['30', '40', '56']) assert.match(more(20), new RegExp(`${d}\\s?m`), d);
    // T13: mez dusíku pN₂ 4 bar → 40 m, 30 m jako přísnější mez některých systémů výcviku
    const limits = [...slide(20).closest('section').querySelectorAll('details.course-more li')].map(text);
    assert.deepEqual(limits.map(t => t.match(/^\d+ m/)?.[0]), ['40 m', '30 m', '56 m']);
    assert.match(limits[0], /^40 m: parciální tlak dusíku pN₂ 4 bar, mez pro dusík\. Celkový tlak smí být nejvýš 4 \/ 0,79 ≈ 5,06 bar, to je 40,6 m, zaokrouhleno dolů 40 m\.$/);
    assert.match(limits[1], /^30 m: některé systémy výcviku omezují hloubku se vzduchem víc, na 30 m \(kvůli dusíkové narkóze\)/);
    assert.match(more(20), /1,4 \/ 0,21 ≈ 6,7\s?bar/);
    assert.doesNotMatch(more(20), /28\s?m|40,5|66\s?m|1,6\s?bar|pN₂ asi [34]/, 'žádné meze z pN₂ 3 nebo 4 bar ani 1,6 bar');
    assert.match(more(20), /Co je parciální tlak a proč jsou to meze, vysvětlí kapitola Složení vzduchu a Daltonův zákon\./);
    // T12: Boyle je jádro P★, nad rámec jsou jen izobarický a izochorický děj
    const h22 = text(slide(22).closest('section').querySelector('details.course-more h3'));
    assert.equal(h22, 'Tři zvláštní děje');
    assert.doesNotMatch(more(22), /Nad rámec P★|Osnova je řadí/);
    assert.match(more(22), /Když jedna z veličin zůstává stejná, zjednoduší se stavová rovnice na jednodušší zákon:/);
    assert.match(more(22), /Boyle-Mariottův zákon, pV = konst\. Ten je jádrem P★, podrobně v kapitole Stlačování plynů/);
    assert.match(more(22), /Izobarický a izochorický děj řadí osnova až do P★★ \(slide 4\), tady jsou pro úplnost\./);
    assert.doesNotMatch(text(doc.body), /Boyleův|Mariotteův/, 'jedno jméno zákona: Boyle-Mariottův');
    assert.doesNotMatch(more(22), /anglicky/, 'Pískoviště je česky (R3-01)');
    assert.match(more(22), /V Pískovišti se izochorický děj jmenuje Gay-Lussacův zákon/);
    assert.match(more(22), /V testech SPČR platí Gay-Lussac = stálý tlak, Charles = stálý objem\./);
    for (const href of ['../sandbox/gas-law.html', '../sandbox/transfilling.html', '../sandbox/cascade-filling.html']) {
        assert.ok(slide(22).closest('section').querySelector(`details.course-more a[href="${href}"]`), href);
    }
});

test('pojmy Tlaku: první odstavec obstojí sám, se vzorcem nebo definicí a jednotkou', () => {
    const first = (id) => new JSDOM(read(`concepts/cs/${id}.html`)).window.document.querySelector('p');
    const cases = {
        pressure: /p = F\/S.*pascal/, 'pascal-law': /Pascalův zákon/, 'atmospheric-pressure': /101\s325\sPa/,
        'hydrostatic-pressure': /ph = h · ρ · g/, 'total-pressure': /p = patm \+ ph/, 'gas-pressure': /pV = nRT/,
    };
    for (const [id, re] of Object.entries(cases)) assert.match(text(first(id)), re, id);
});

test('R3: Pascalův zákon, počasí, pojmy bez hranatých závorek, citace stlačitelnosti, slide 13 a 12', () => {
    const pascal = read('concepts/cs/pascal-law.html');
    assert.match(pascal, /se přenáší do všech\s+míst kapaliny stejně: všude se tlak zvětší o&nbsp;stejnou hodnotu/);
    assert.match(pascal, /U&nbsp;většiny látek mají částice v&nbsp;kapalině větší rozestupy/);
    assert.match(pascal, /doi:10\.1021\/je60064a005/);
    assert.doesNotMatch(pascal, /CRC/);
    assert.match(read('concepts/cs/atmospheric-pressure.html'), /nejvýš asi o&nbsp;desetinu/);
    for (const id of ['pressure', 'pascal-law', 'atmospheric-pressure', 'hydrostatic-pressure', 'total-pressure', 'gas-pressure']) {
        assert.doesNotMatch(read(`concepts/cs/${id}.html`), /\[(bar|Pa|m|kPa)\]/, `${id}: bez hranatých závorek`);
    }
    assert.match(text(slide(13).querySelector('figure')), /kapalina: tlak se šíří všude stejně/);
    const [boots, needle] = slide(12).querySelectorAll('figure svg');
    const vb = (svg) => svg.getAttribute('viewBox').split(/\s+/).map(Number);
    assert.deepEqual(vb(boots), vb(needle), 'stejně velké obrázky, popisky stejně velké');
});

// ---------------------------------------------------------------- T6: styl ilustrací, vzor slide 12

test('T6: slide 12 nesou dvě ilustrace s krátkým nadpisem nad a popiskem pod', () => {
    const halves = [...slide(12).querySelectorAll('.course-core > div:not(.course-core-row)')];
    assert.equal(halves.length, 2);
    const titles = halves.map(h => text(h.querySelector('.course-figure-title')));
    assert.deepEqual(titles, ['Stejná síla, menší plocha → větší tlak', 'I malá síla může způsobit obrovský tlak']);
    const figs = halves.map(h => h.querySelector('figure.course-illustration'));
    assert.ok(figs.every(f => f?.querySelector('svg[role="img"][aria-label]')), 'ilustrace jsou SVG s popisem');
    const caps = figs.map(f => text(f.querySelector('figcaption')));
    assert.match(caps[0], /^Stejná síla, různě velká plocha$/);
    assert.match(caps[1], /^5\sN na hrotu jehly 0,1\smm² = 50\sMPa = 500\sbar 5\sN ≈ tíha půllitru vody$/);
    assert.ok(figs[1].querySelector('figcaption .course-figure-note'), 'kratší řádek o půllitru je doplněk');
    for (const h of halves) assert.equal(h.querySelectorAll('p').length, 0, 'žádný odstavec, jen nadpis a popisek');
});

test('T6: scéna se sněhem: boty se boří (hluboké stopy), lyže ne (mělká stopa), stejná šipka F', () => {
    const [snow, needle] = slide(12).querySelectorAll('figure.course-illustration svg');
    assert.ok(snow.querySelectorAll('.fig-track-deep').length >= 3, 'hluboké stopy bot');
    assert.ok(snow.querySelectorAll('.fig-track').length >= 1, 'mělká stopa lyží');
    assert.equal(snow.querySelectorAll('.fig-silhouette').length, 2, 'stejná postava dvakrát');
    const arrows = [...snow.querySelectorAll('polygon.fig-force')].map(p => p.getAttribute('points'));
    assert.equal(arrows.length, 2);
    const shape = (pts) => {
        const xy = pts.trim().split(/\s+/).map(p => p.split(',').map(Number));
        return xy.map(([x, y]) => `${x - xy[0][0]},${y - xy[0][1]}`).join(' ');
    };
    assert.equal(shape(arrows[0]), shape(arrows[1]), 'stejná síla = stejná šipka');
    assert.ok(needle.querySelector('polygon.fig-force'), 'šipka F na pístu stříkačky');
});

test('T6: ilustrace kreslí jen barvami tématu (třídy), popisky čitelné na projektoru i telefonu', () => {
    for (const svg of slide(12).querySelectorAll('figure.course-illustration svg')) {
        assert.doesNotMatch(svg.outerHTML, /\s(fill|stroke|style|color)="/, 'barvy jen z tříd');
        for (const t of svg.querySelectorAll('text')) assert.match(t.getAttribute('class') ?? '', /fig-label-xl/, text(t));
    }
    const css = read('css/course.css');
    // Popisek v px = písmo ve viewBoxu × výška obrázku / výška viewBoxu. Projektor 1920×1080: slide 959 px, aspoň 31 px.
    // Telefon: obrázek na šířku 334 px (390 px displej), aspoň 16 px.
    const font = Number(css.match(/\.fig-label-xl \{[^}]*font-size: (\d+)px/)[1]);
    const share = Number(css.match(/\.course-core:has\(> \.course-core-row\) \.course-illustration > svg \{[^}]*--course-slide-height\) \* ([\d.]+)\)/)[1]);
    const [, , vbW, vbH] = slide(12).querySelector('figure.course-illustration svg').getAttribute('viewBox').split(/\s+/).map(Number);
    assert.ok(font * share * 959 / vbH >= 31, `projektor: ${(font * share * 959 / vbH).toFixed(1)} px`);
    assert.ok(font * 334 / vbW >= 16, `telefon: ${(font * 334 / vbW).toFixed(1)} px`);
    assert.match(css, /\.course-core-row > \.course-figure > img \{[^}]*max-width: 100%/, 'fotka nepřeteče na telefonu');
    for (const cls of ['fig-sky', 'fig-snow', 'fig-silhouette', 'fig-track', 'fig-track-deep', 'fig-force', 'fig-glass', 'fig-label-xl']) {
        const rule = css.match(new RegExp(`\\.${cls} \\{([^}]*)\\}`));
        assert.ok(rule, cls);
        assert.doesNotMatch(rule[1], /#[0-9a-f]{3,8}\b|rgb/i, `${cls}: barva z proměnné scény`);
    }
    assert.match(css, /\.course-core:has\(> \.course-core-row\) \.course-illustration > svg \{[^}]*max-height/);
});

test('T6: styl ilustrací je popsaný v slides.md a ve vzorníku', () => {
    const md = read('docs/course/slides.md');
    assert.match(md, /### Styl ilustrací/);
    for (const w of ['course-illustration', 'fig-silhouette', 'fig-force', '31\u00a0px|31 px', '16 px', 'loga']) assert.match(md, new RegExp(w), w);
    assert.ok(read('docs/course/vzornik-slidu.html').includes('course-illustration'));
});

// ---------------------------------------------------------------- T7: styl ilustrací na všech schématech

const ILLUSTRATED = [11, 12, 13, 14, 16, 17, 18, 21];

test('T7: všechna schémata kapitoly jsou ilustrace ve světlém rámu se stejnou šířkou viewBoxu', () => {
    for (const n of ILLUSTRATED) {
        const svgs = [...slide(n).querySelectorAll('figure svg')];
        assert.ok(svgs.length > 0, `slide ${n}`);
        for (const svg of svgs) {
            assert.ok(svg.closest('figure').classList.contains('course-illustration'), `slide ${n}: course-illustration`);
            assert.equal(svg.getAttribute('viewBox').split(/\s+/)[2], '600', `slide ${n}: viewBox šířky 600 = stejně velké popisky`);
            assert.match(svg.firstElementChild.getAttribute('class'), /^fig-(sky|paper)$/, `slide ${n}: světlý rám`);
            assert.doesNotMatch(svg.outerHTML, /\s(fill|stroke|style|color)="/, `slide ${n}: barvy jen z tříd`);
            for (const t of svg.querySelectorAll('text')) assert.match(t.getAttribute('class') ?? '', /fig-label-xl/, `slide ${n}: ${text(t)}`);
        }
    }
});

test('T7: fyzika beze změny: stejné popisky, šipky sil a čísla', () => {
    const labels = {
        11: ['tlaková síla F', 'plocha (obsah) S'],
        13: ['F'],
        14: ['nízký tlak', 'vysoký tlak'],
        16: ['vzduchu ubývá, tlak klesá k 0', 'Mount Everest 8 850 m', '31 kPa', 'hladina moře', '101 kPa'],
        17: ['horské sedlo'],
        18: ['F', 'F', 'F', 'S', 'S', 'S', 'h', 'h', 'pár litrů v trubici', 'sud praskl'],
        21: ['obličejové dutiny', 'střední ucho', 'dýchací cesty', 'plíce', 'trávicí systém'],
    };
    for (const [n, want] of Object.entries(labels)) {
        const got = [...slide(n).querySelectorAll('figure svg text')].map(t => t.textContent.replace(/\s+/g, ' ').trim());
        assert.deepEqual(got.sort(), [...want].sort(), `slide ${n}`);
    }
    const forces = (n) => slide(n).querySelectorAll('figure svg .fig-force').length;
    assert.equal(forces(11), 1, 'tlaková síla');
    assert.equal(forces(13), 9, 'síla na píst a tlak do všech směrů (8 šipek)');
    assert.equal(forces(18), 3, 'stejná síla na tři dna');
    assert.equal(forces(14) + forces(16) + forces(17) + forces(21), 0, 'bez nových sil');
    assert.equal(slide(14).querySelectorAll('.fig-air').length, 20, 'stejné množství plynu v obou válcích');
    const fig13 = text(slide(13).querySelector('figure figcaption'));
    assert.match(fig13, /pevná látka: krystalická mřížka/);
    assert.match(fig13, /kapalina: tlak se šíří všude stejně/);
});

// ---------------------------------------------------------------- T8: jednotka pascal u vzorce na slidu 11

test('T8: pod vzorcem p = F/S [Pa] je řádek 1 Pa = 1 N/m² (jednotky stojatě, nedělitelné mezery)', () => {
    const formula = slide(11).querySelector('.course-formula');
    const note = formula.nextElementSibling;
    assert.ok(note?.classList.contains('course-formula-note'), 'řádek hned pod vzorcem');
    assert.equal(note.textContent.replace(/\s+/g, ' ').trim(), '1 Pa = 1 N/m², síla 1 N na ploše 1 m²');
    assert.match(note.innerHTML, /^1&nbsp;Pa = 1&nbsp;N\/m², síla 1&nbsp;N na ploše 1&nbsp;m²$/);
    assert.equal(note.querySelectorAll('var, i, em').length, 0, 'jednotky ani čísla nejsou kurzívou');
    assert.match(read('css/course.css'), /\.course-formula-note \{[^}]*text-align: center/);
});

// ---------------------------------------------------------------- T9: Pascalův sud na slidu 18

test('T9: slide 18 má nádoby i Pascalův sud vedle sebe v jedné ilustraci, rozhoduje výška', () => {
    const fig = slide(18).querySelector('figure.course-illustration');
    const svg = fig.querySelector('svg');
    assert.match(svg.getAttribute('aria-label'), /sud/);
    assert.ok(svg.querySelector('.fig-barrel'), 'sud');
    assert.ok(svg.querySelectorAll('.fig-jet').length >= 4, 'voda tryská ze spár sudu');
    assert.ok(svg.querySelector('.fig-can'), 'konvička, která dolévá');
    // stejná kóta h u nádob i u sudu, u sudu (trubice) výrazně vyšší
    const dims = [...svg.querySelectorAll('.fig-dim')].map(p => {
        const [, y0, y1] = p.getAttribute('d').match(/^M\d+ (\d+)V(\d+)/).map(Number);
        return Math.abs(y1 - y0);
    });
    assert.equal(dims.length, 2, 'kóta h u nádob a u sudu');
    const [vessels, barrel] = dims.sort((a, b) => a - b);
    assert.ok(barrel >= 2.5 * vessels, `trubice výrazně vyšší: ${barrel} vs ${vessels}`);
    // poslední odrážka je popisek pod sudem, myšlenka v jedné větě
    assert.doesNotMatch(text(slide(18).querySelector('ul')), /Rouen/);
    const caps = [...fig.querySelectorAll('figcaption.course-figure-pair > span')].map(text);
    assert.equal(caps.length, 2);
    assert.deepEqual(caps, ['stejná výška h, stejný tlak na dno', 'Pascalův pokus v Rouenu']);
    // obraz nese slide: sloupec s obrázkem je širší než text
    assert.ok(slide(18).querySelector('.course-core').classList.contains('course-core-figure-wide'));
    assert.match(read('css/course.css'), /\.course-core-figure-wide \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.35fr\)/);
});

test('T9: „Více“ u slidu 18 poctivě říká, že pokus se sudem je spíš legenda, se zdrojem', () => {
    const more = slide(18).closest('section').querySelector('details.course-more');
    const p = [...more.querySelectorAll('p')].find(el => /sud/.test(text(el)));
    assert.ok(p, 'věta o pokusu');
    assert.match(text(p), /19\. století/);
    assert.ok([...p.querySelectorAll('a')].some(a => a.getAttribute('href') === 'https://en.wikipedia.org/wiki/Pascal%27s_barrel'), 'zdroj');
});

test('T9: portrét Pascala na slidu 18 má jméno a odkaz na zdroj (T18), záznam v SOURCES.md', () => {
    const fig = slide(18).querySelector('figure.course-portrait');
    assert.ok(fig, 'portrét');
    const img = fig.querySelector('img');
    assert.equal(img.getAttribute('src'), '../images/course/p1/pascal.jpg');
    assert.ok(img.getAttribute('width') && img.getAttribute('height'), 'rozměry proti poskakování');
    assert.match(img.getAttribute('alt'), /Blaise Pascal/);
    const cap = text(fig.querySelector('figcaption'));
    assert.match(cap, /Blaise Pascal \(1623–1662\)/);
    assert.equal(fig.querySelector('a.course-source').getAttribute('href'), 'zdroje.html#pascal');
    assert.match(read('images/course/p1/SOURCES.md'), /`images\/course\/p1\/pascal\.jpg` \| Tlak, slide 18 \|.*PD-art-old-100-expired.*File:Blaise Pascal Versailles\.JPG/);
    assert.match(read('sw.js'), /'\.\/images\/course\/p1\/pascal\.jpg'/);
});

// ---------------------------------------------------------------- T11: nová kresba těla na slidu 21

/** Obdélník kolem bodů atributu d (řídicí body křivek bereme jako body, na hrubou kontrolu stačí). */
function pathBox(d) {
    const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Poslední bod každé podcesty (M…) atributu d. */
const subpathEnds = (d) => d.split('M').filter(Boolean).map(p => p.match(/-?\d+(\.\d+)?/g).map(Number).slice(-2));

// T17: kresba těla je jediná definice v images/course/p1/telo-profil.svg (symbol #telo), slidy 21 a 27 ji vkládají přes <use>.
const TELO = 'images/course/p1/telo-profil.svg';
const telo = new JSDOM(read(TELO), { contentType: 'image/svg+xml' }).window.document.querySelector('symbol#telo');

test('T17: slide 21 vkládá kresbu těla ze sdíleného souboru, ne kopii', () => {
    const svg = slide(21).querySelector('figure svg');
    const use = svg.querySelector('use');
    assert.equal(use?.getAttribute('href'), `../${TELO}#telo`);
    assert.equal(svg.querySelectorAll('.fig-body, .fig-air-space, .fig-airway').length, 0, 'kresba jen v souboru');
    assert.equal(telo.getAttribute('viewBox'), '0 0 600 640');
    for (const el of telo.querySelectorAll('[style]')) {
        assert.doesNotMatch(el.getAttribute('style'), /#[0-9a-f]{3,6}\b|rgb\(/i, 'barvy jen z proměnných scény');
        if (/fill: (?!none)|stroke: /.test(el.getAttribute('style'))) assert.match(el.getAttribute('style'), /var\(--slide-/);
    }
    assert.ok(!read(TELO).match(/<!--[\s\S]*?--[\s\S]*?-->/)?.[0].slice(4, -3).includes('--'), 'komentář bez dvojité pomlčky (jinak to není XML)');
    assert.match(read('sw.js'), new RegExp(`'\\./${TELO.replaceAll('/', '\\/').replaceAll('.', '\\.')}'`));
});

test('T16: slide 21 je celá postava z profilu, dutiny nejsou na místě očí, střední ucho s Eustachovou trubicí', () => {
    const svg = telo;
    const eye = svg.querySelector('.fig-eye');
    assert.ok(eye, 'oko jen obrysem, aby se dutiny nečetly jako oči');
    const ey = +eye.getAttribute('cy');
    const sinus = [...svg.querySelectorAll('.fig-sinus')].map(e => +e.getAttribute('cy')).sort((a, b) => a - b);
    assert.equal(sinus.length, 2, 'čelní a čelistní dutina');
    assert.ok(sinus[0] < ey && ey < sinus[1], `čelní nad okem, čelistní pod ním (${sinus}, oko ${ey})`);
    assert.ok(svg.querySelector('.fig-middle-ear'), 'střední ucho');
    assert.equal(svg.querySelectorAll('.fig-eustachian').length, 1, 'Eustachova trubice');
    assert.equal(svg.querySelectorAll('.fig-body').length, 1, 'jedna silueta, hlava i trup bokem');
    assert.ok(svg.querySelector('.fig-spine'), 'páteř, před ní průdušnice');
});

test('T16: cesta vzduchu je jedna plynulá linie do plíce, bránice odděluje plíci od trávicího systému', () => {
    const svg = telo;
    assert.ok(svg.querySelector('.fig-upper-airway'), 'nosní dutina, nosohltan a hltan jako jedna plocha');
    assert.ok(svg.querySelector('.fig-mouth'), 'ústní dutina');
    const airways = svg.querySelectorAll('path.fig-airway');
    assert.equal(airways.length, 1, 'jedna cesta, ne kusy');
    const d = airways[0].getAttribute('d');
    assert.doesNotMatch(d.split('M')[1], /[LHV]/, 'průdušnice bez pravých úhlů, jen křivky');
    const lungs = [...svg.querySelectorAll('.fig-lung-gas')].map(l => pathBox(l.getAttribute('d')));
    assert.equal(lungs.length, 1, 'z profilu je vidět jedna plíce');
    const [lung] = lungs;
    const ends = subpathEnds(d).slice(1);
    assert.ok(ends.length >= 3 && ends.every(([x, y]) => x > lung.x0 && x < lung.x1 && y > lung.y0 && y < lung.y1), 'průdušky končí v plíci');
    const diaphragm = pathBox(svg.querySelector('.fig-diaphragm').getAttribute('d'));
    const stomach = pathBox(svg.querySelector('.fig-stomach').getAttribute('d'));
    const gut = pathBox(svg.querySelector('.fig-gut').getAttribute('d'));
    assert.ok(lung.y1 <= diaphragm.y1 && diaphragm.y1 < stomach.y0, 'plíce nad bránicí, žaludek pod ní');
    assert.ok(stomach.y1 < gut.y0, 'střeva pod žaludkem');
    assert.ok(stomach.w * stomach.h < lung.w * lung.h && gut.w * gut.h < lung.w * lung.h, 'trávicí systém menší než plíce');
});

test('T16: popisky slidu 21 jsou o stupeň lehčí a obrázek má víc místa', () => {
    const svg = slide(21).querySelector('figure svg');
    const labels = [...svg.querySelectorAll('text')];
    assert.equal(labels.length, 5);
    for (const t of labels) assert.ok(t.classList.contains('fig-label-medium'), text(t));
    assert.equal(svg.querySelectorAll('.fig-leader-dot').length, svg.querySelectorAll('path.fig-leader').length, 'každá odkazová čára končí tečkou');
    const core = slide(21).querySelector('.course-core');
    assert.ok(core.classList.contains('course-core-figure-wide') && core.classList.contains('course-core-figure-tall'));
    const css = read('css/course.css');
    assert.match(css, /\.fig-label-xl\.fig-label-medium \{ font-weight: 500; \}/);
    assert.match(css, /\.course-core-figure-tall \.course-illustration > svg \{ max-height: calc\(var\(--course-slide-height\) \* 0\.62\); \}/);
});

// ---------------------------------------------------------------- T13: odkrytá buňka nemění výšku řádku

test('T13: odkrytá buňka má stejný rámeček jako otazník, tabulka se nezkrátí a náhled modelu se neořízne', () => {
    const css = read('css/course.css');
    const summary = css.match(/details\.course-cell > summary \{([^}]*)\}/)[1];
    assert.match(summary, /border: 1px dashed/);
    assert.match(summary, /padding: 0 0\.4em/);
    const open = css.match(/details\.course-cell\[open\] \{([^}]*)\}/)?.[1] ?? '';
    assert.match(open, /border: 1px solid transparent/, 'stejně vysoký rámeček, jen neviditelný');
    assert.match(open, /padding: 0 0\.4em/);
});

// ---------------------------------------------------------------- T14: popisek pod nádobami a paradox ve „Více“

test('T14: pod nádobami „stejný tlak na dno“, ve „Více“ věta o síle na dno a tíze vody', () => {
    const cap = slide(18).querySelector('figcaption.course-figure-pair > span');
    assert.match(cap.innerHTML, /^stejná výška <var>h<\/var>, stejný&nbsp;tlak&nbsp;na&nbsp;dno$/, '„stejný tlak na dno“ se neláme, dno nezůstane samo');
    const more = slide(18).closest('section').querySelector('details.course-more');
    const p = [...more.querySelectorAll('p')].find(el => /paradox/.test(text(el)));
    assert.ok(p, 'věta o paradoxu');
    assert.equal(text(p), 'Síla na dno F = p · S je ve všech třech nádobách stejná, i když tíha vody je v každé jiná: to je hydrostatický paradox.');
    assert.match(p.innerHTML, /<var>F<\/var> = <var>p<\/var> · <var>S<\/var>/);
});
