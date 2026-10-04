// Walkthrough: sandbox/deco-table.html — one set of actions, narrated per language.
//   node make-video.mjs scenes/deco-table.mjs en|cs
// `text` is the on-screen caption, `say` is what the narrator speaks (numbers spelled
// out so the TTS reads them naturally). Keep the two saying the same thing.

import fs from 'node:fs';
import { lookupDive } from '../../../js/cmasTables.js';

const NB = ' ';

// The example plan. Every number below is also checked against the page (ui.expectText)
// or, for the "on its own" comparison the page never shows, against the lookup itself.
const DIVE1 = { depth: 25, time: 22 };
const DIVE2 = { siH: 1, siM: 30, depth: 16, time: 30 };
{
    const table = JSON.parse(fs.readFileSync(new URL('../../../data/cmas-deco-tables.json', import.meta.url)));
    const g = (r) => table.groups[r.groupIdx];
    const r1 = lookupDive(table, DIVE1);
    const r2 = lookupDive(table, { depth: DIVE2.depth, time: DIVE2.time, prevGroupIdx: r1.groupIdx, surfaceInterval: DIVE2.siH * 60 + DIVE2.siM });
    const alone = lookupDive(table, { depth: DIVE2.depth, time: DIVE2.time });
    const facts = [r1.tableDepth, r1.cell.bottomTime, r1.isDeco, g(r1), g(r2.si), r2.tableDepth, r2.penalty, r2.tableTime,
        r2.ndl, r2.maxNoDecoTime, r2.cell.bottomTime, r2.cell.stop5m, g(r2), alone.isDeco].join(' ');
    const expected = '27 25 false G E 18 30 60 55 25 60 5 J false';
    if (facts !== expected) throw new Error(`deco-table: table lookup changed: "${facts}", narration assumes "${expected}"`);
}

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        values: {
            depthRow: `27${NB}m`, firstCell: `25${NB}min`, ndl: 'no decompression', group1: 'G',
            si: '1:30', newGroup: 'E', siDepth: `18${NB}m`, penalty: `+30${NB}min`, total: `30 + 30 = 60${NB}min`,
            stop: `5${NB}min at 5${NB}m`, group2: 'J',
            resultTitle: 'Plan of 2 dives — includes a decompression dive',
        },
        intro: { title: 'Decompression Tables', subtitle: 'How to read a dive from the NOAA air tables (SPČR/CMAS 2018 edition)' },
        outro: {
            title: 'Try it yourself',
            subtitle: 'decotheory.eu → Sandbox → CMAS Decompression Tables',
            footer: 'NOAA AIR TABLES · SPČR/CMAS 2018 EDITION',
        },
        lines: [
            ['The NOAA decompression tables, as published by SPČR/CMAS in 2018: how do you read a dive from them?',
                'The Noah decompression tables, as published by the Czech diving federation. How do you read a dive from them?'],
            ['Enter your dives at the top. Below is a copy of the paper table, read clockwise in three parts.',
                'Enter your dives at the top. Below is a copy of the paper table, read clockwise, in three parts.'],
            [`First dive: 25${NB}m for 22${NB}min. Look up.`,
                'First dive. Twenty five metres, for twenty two minutes. Look up.'],
            [`There is no 25${NB}m row, so round up to 27${NB}m. Always up, never down.`,
                'There is no twenty five metre row, so round up to twenty seven. Always up, never down.'],
            [`Go right to the first time of at least 22${NB}min: 25${NB}min.`,
                'Go right, to the first time of at least twenty two minutes. That is twenty five.'],
            ['That is the no-decompression limit here: just a safety stop. Below the column: group G.',
                'That is the no decompression limit here. Just a safety stop. Below the column, group G.'],
            [`Now a repetitive dive after 1${NB}h${NB}30${NB}min on the surface: 16${NB}m for 30${NB}min.`,
                'Now a repetitive dive, after an hour and a half. Sixteen metres, for thirty minutes.'],
            ['For dive 2, go down column G to the cell holding 1:30. Its row letter is your new group: E.',
                'For dive two, go down column G, to the cell holding one thirty. Its row letter is your new group. E.'],
            [`Go left along row E to 18${NB}m, rounded up from 16. Penalty: +30${NB}min.`,
                'Go left along row E, to eighteen metres, rounded up from sixteen. The penalty is thirty minutes.'],
            [`Add it to the actual time: 30 + 30 = 60${NB}min, and follow the arrow back to START.`,
                'Add it to the actual time. Thirty plus thirty is sixty minutes. Then follow the arrow back to START.'],
            [`At 18${NB}m, 60${NB}min is a blue cell: a stop of 5${NB}min at 5${NB}m. Alone, this dive would need none.`,
                'At eighteen metres, sixty minutes is a blue cell. A stop, five minutes at five metres. Alone, this dive would need none.'],
            [`This table is for air, up to 300${NB}m above sea level. Higher up, use the altitude sheet with its depth corrections.`,
                'One note. This table is for air, up to three hundred metres above sea level. Higher up, you use the altitude sheet, with its depth corrections.'],
            ['Try it yourself in the Deco Theory sandbox. Thanks for watching!',
                'Try it yourself, in the Deco Theory sandbox. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        // Piper has a single Czech voice, so both narrator slots use it.
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        values: {
            depthRow: `27${NB}m`, firstCell: `25${NB}min`, ndl: 'bez dekomprese', group1: 'G',
            si: '1:30', newGroup: 'E', siDepth: `18${NB}m`, penalty: `+30${NB}min`, total: `30 + 30 = 60${NB}min`,
            stop: `5${NB}min v 5${NB}m`, group2: 'J',
            resultTitle: 'Plán 2 ponorů — obsahuje dekompresní ponor',
        },
        intro: { title: 'Dekompresní tabulky', subtitle: 'Jak v tabulkách NOAA pro vzduch (vydání SPČR/CMAS 2018) vyhledat ponor' },
        outro: {
            title: 'Vyzkoušejte si to sami',
            subtitle: 'decotheory.eu → Pískoviště → Dekompresní tabulky SPČR/CMAS',
            footer: 'TABULKY NOAA PRO VZDUCH · VYDÁNÍ SPČR/CMAS 2018',
        },
        lines: [
            ['Jak číst dekompresní tabulky NOAA ve vydání SPČR/CMAS 2018?',
                'Jak číst dekompresní tabulky Noa, ve vydání svazu potápěčů?'],
            ['Nahoře zadáte ponory, pod tím je kopie papírové tabulky. Čte se po směru hodin.',
                'Nahoře zadáte ponory, pod tím je kopie papírové tabulky. Čte se po směru hodin.'],
            [`První ponor: 25${NB}m na 22${NB}min. Vyhledat.`,
                'První ponor. Dvacet pět metrů, na dvacet dva minut. Vyhledat.'],
            [`Řádek 25${NB}m chybí, zaokrouhlíme vždy nahoru: na 27${NB}m.`,
                'Řádek dvacet pět metrů chybí. Zaokrouhlíme vždy nahoru, na dvacet sedm.'],
            [`Doprava k prvnímu času aspoň 22${NB}min: 25${NB}min.`,
                'Doprava, k prvnímu času aspoň dvacet dva minut. To je dvacet pět.'],
            ['To je tu limit bez dekomprese, stačí bezpečnostní zastávka. Pod sloupcem: skupina G.',
                'To je tu limit bez dekomprese, stačí bezpečnostní zastávka. Pod sloupcem je skupina Gé.'],
            [`Opakovaný ponor po 1${NB}h${NB}30${NB}min: 16${NB}m na 30${NB}min.`,
                'Opakovaný ponor, po hodině a půl. Šestnáct metrů, na třicet minut.'],
            ['Sloupcem G dolů k buňce, kam patří 1:30. Písmeno řádku je nová skupina: E.',
                'Sloupcem Gé dolů, k buňce, kam patří hodina třicet. Písmeno řádku je nová skupina. É.'],
            [`Řádkem E vlevo k 18${NB}m, nahoru z 16. Přirážka: +30${NB}min.`,
                'Řádkem É vlevo, k osmnácti metrům, nahoru ze šestnácti. Přirážka je třicet minut.'],
            [`K reálné době: 30 + 30 = 60${NB}min. Po šipce zpět na START.`,
                'K reálné době. Třicet plus třicet je šedesát minut. Po šipce zpět na START.'],
            [`V 18${NB}m je 60${NB}min modrá buňka: zastávka 5${NB}min v 5${NB}m. Samotný by ponor zastávku nepotřeboval.`,
                'V osmnácti metrech je šedesát minut modrá buňka. Zastávka pět minut v pěti metrech. Samotný by ponor zastávku nepotřeboval.'],
            [`Tabulka platí pro vzduch do 300${NB}m${NB}n.${NB}m. Výš se používá list pro hory s korekcemi hloubky.`,
                'Jedna poznámka. Tabulka platí pro vzduch, do tří set metrů nad mořem. Výš se používá list pro hory, s korekcemi hloubky.'],
            ['Vyzkoušejte si to sami v pískovišti Deco Theory. Díky za pozornost!',
                'Vyzkoušejte si to sami v pískovišti. Díky za pozornost!'],
        ],
    },
};

export default function decoTable(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`deco-table: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);
    const V = L.values;

    // Some helpers need the page itself; prepare() hands it over.
    let page;
    /** Click a number field and type a new value, digit by digit. */
    const type = async (ui, selector, value) => {
        await ui.click(selector);
        await page.locator(selector).evaluate((el) => el.select());
        await page.keyboard.type(String(value), { delay: 70 });
    };
    const strong = (n) => `#stepText strong:nth-of-type(${n})`;
    const next = async (ui) => { await ui.click('#nextStepBtn'); await ui.wait(900); };

    // Actions per scene, in the same order as L.lines; narrators alternate a/b.
    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(700);
            await ui.highlight('.plan-panel');
            await ui.wait(2400);
            await ui.highlight('#decoTable');
        },
        async (ui) => {
            await ui.highlight(null);
            await ui.reveal('.plan-panel');
            await ui.highlight('.plan-panel .plan-row');
            await type(ui, '#inputDepth', DIVE1.depth);
            await type(ui, '#inputTime', DIVE1.time);
            await ui.highlight(null);
            await ui.click('#lookupBtn');
        },
        async (ui) => {
            await ui.wait(300);
            await ui.cursorAway();
            await ui.expectText('#stepText strong', V.depthRow);
        },
        async (ui) => {
            await next(ui);
            await ui.expectText(strong(1), `22${NB}min`);
            await ui.expectText(strong(2), V.firstCell);
            await ui.cursorAway();
        },
        async (ui) => {
            await next(ui);
            await ui.expectText(strong(1), V.ndl);
            await ui.expectText(strong(2), V.group1);
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.reveal('.plan-panel');
            await ui.click('#addRepeatBtn'); // changing the plan also resets the walkthrough
            await ui.wait(200);
            await ui.highlight('#repeatRows .plan-row');
            // the new row already has 1 h; only the minutes, depth and time change
            if (await page.locator('#repeatRows [data-f="siH"]').inputValue() !== String(DIVE2.siH)) throw new Error('deco-table: new row no longer starts at 1 h');
            await type(ui, '#repeatRows [data-f="siM"]', DIVE2.siM);
            await type(ui, '#repeatRows [data-f="depth"]', DIVE2.depth);
            await type(ui, '#repeatRows [data-f="time"]', DIVE2.time);
            await ui.highlight(null);
            await ui.click('#lookupBtn');
        },
        async (ui) => {
            await ui.wait(500);
            // dive 1 reads as before: jump to the first step of dive 2 (its dot in the progress bar)
            await ui.click('#stepIndicator .dot-group:nth-child(3) button:first-of-type');
            await ui.wait(2200);
            await next(ui);
            await ui.expectText(strong(1), V.si);
            await ui.expectText(strong(2), V.newGroup);
            await ui.cursorAway();
        },
        async (ui) => {
            await next(ui);
            await ui.expectText(strong(2), V.siDepth);
            await ui.expectText(strong(3), V.penalty);
            await ui.cursorAway();
        },
        async (ui) => {
            await next(ui);
            await ui.expectText(strong(1), V.total);
            await ui.cursorAway();
        },
        async (ui) => {
            await next(ui);
            await ui.wait(600);
            await next(ui);
            await ui.expectText(strong(2), V.stop);
            await ui.expectText(strong(3), V.group2);
            await ui.wait(3400);
            await ui.click('#nextStepBtn');
            await ui.wait(700);
            await ui.expectText('#resultTitle', V.resultTitle);
            await ui.highlight('#resultBody');
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.highlight(null);
        },
        async (ui) => {
            await ui.card(L.outro);
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`deco-table/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: 'sandbox/deco-table.html',
        locale: L.locale,
        zoom: 1,
        publish: `videos/deco-table`, // -> .mp4 + poster .jpg + <lang>.vtt subtitles, embedded in the page

        async prepare(p, ui) {
            page = p;
            // Start with the first dive only; the repetitive dive is added on camera.
            await page.evaluate(() => document.querySelectorAll('#repeatRows .remove-btn').forEach((b) => b.click()));
            // Skip the hero: park the working area right under the sticky nav.
            await page.evaluate(() => {
                const top = document.querySelector('.deco-table-layout').getBoundingClientRect().top;
                const nav = document.querySelector('.main-nav').getBoundingClientRect().bottom;
                window.scrollTo(0, window.scrollY + top - nav);
            });
            await ui.card({ ...L.intro, footer: 'DECO THEORY · DECOTHEORY.EU' });
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
