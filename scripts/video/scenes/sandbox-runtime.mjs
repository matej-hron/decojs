// Walkthrough 2/4 of the decompression sandbox (sandbox/index.html): reading the
// runtime table (the written dive plan).
//   node make-video.mjs scenes/sandbox-runtime.mjs [en|cs] [--dry]
// Explains how to READ the table on a dive, not how its runtimes are computed
// (owner decision H). Design: scripts/video/design/sandbox-deco.md §3.

import { NB, DIVE_URL, assertPlan, intro, outro, unstickNav } from '../lib/sandbox.mjs';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        lines: [
            ['Part two: reading the runtime table.',
                'Part two. Reading the runtime table.'],
            [`Same dive: 40${NB}m, 20${NB}min, air, EAN50 for deco, GF 30/70: the plan you copy onto your wetnotes.`,
                'Same dive. Forty metres, twenty minutes, air, E A N fifty for deco, G F thirty seventy. The plan you copy onto your wetnotes.'],
            ['Each row is one phase: depth, duration, runtime, gas and expected tank pressure.',
                'Each row is one phase. Depth, duration, runtime, gas, and the expected tank pressure.'],
            [`Descent to 40${NB}m takes 2${NB}min, then 18 on the bottom: runtime 20, as bottom time includes the descent.`,
                'The descent to forty metres takes two minutes, then eighteen on the bottom. Runtime twenty, as bottom time includes the descent.'],
            [`Ascend to 21${NB}m, runtime 22, and switch to EAN50; the stage starts full, at 200${NB}bar.`,
                'Ascend to twenty one metres, runtime twenty two, and switch to E A N fifty. The stage starts full, at two hundred bar.'],
            [`Then a stop every 3${NB}m: 1${NB}min at 18, 15, 12 and 9${NB}m, 4${NB}min at 6${NB}m, 7${NB}min at 3${NB}m.`,
                'Then a stop every three metres. One minute at eighteen, fifteen, twelve and nine metres. Four minutes at six, and seven minutes at three.'],
            [`Runtime is the dive clock, in whole minutes, when each step ends. Watch your timer: at 24 you leave 18${NB}m.`,
                'Runtime is the dive clock, in whole minutes, when each step ends. Watch your timer. At twenty four, you leave eighteen metres.'],
            [`The last stop, at 3${NB}m, ends at runtime 39; an 18-second ascent to the surface ends the dive.`,
                'The last stop, at three metres, ends at runtime thirty nine. An eighteen second ascent to the surface ends the dive.'],
            [`Tank is the expected pressure from your SAC: air is at 114${NB}bar when you switch, the stage ends at 159${NB}bar.`,
                'Tank is the expected pressure, from your S A C. Air is at one hundred and fourteen bar when you switch. The stage ends at one hundred and fifty nine bar.'],
            ['The plan is the model alone; real dives add contingency plans and a computer.',
                'The plan is the model alone. Real dives add contingency plans, and a computer.'],
            ['Next: reading the dive profile chart. Thanks for watching!',
                'Next: reading the dive profile chart. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        lines: [
            ['Druhý díl: jak číst runtime.',
                'Druhý díl. Jak číst runtime.'],
            [`Stejný ponor: 40${NB}m, 20${NB}min, vzduch, EAN50 na dekompresi, GF 30/70: plán, který si opíšete na wetnotes.`,
                'Stejný ponor. Čtyřicet metrů, dvacet minut, vzduch, EAN padesát na dekompresi, GF třicet sedmdesát. Plán, který si opíšete na wetnotes.'],
            ['Každý řádek je jedna fáze: hloubka, doba trvání, runtime, plyn a očekávaný tlak v láhvi.',
                'Každý řádek je jedna fáze. Hloubka, doba trvání, runtime, plyn a očekávaný tlak v láhvi.'],
            [`Sestup do 40${NB}m trvá 2${NB}min, pak 18${NB}min na dně: runtime 20, protože čas na dně zahrnuje sestup.`,
                'Sestup do čtyřiceti metrů trvá dvě minuty, pak osmnáct minut na dně. Runtime dvacet, protože čas na dně zahrnuje sestup.'],
            [`Výstup do 21${NB}m, runtime 22, a změna na EAN50; stage začíná plná, na 200${NB}bar.`,
                'Výstup do dvaceti jedna metrů, runtime dvacet dva, a změna na EAN padesát. Stage začíná plná, na dvou stech barech.'],
            [`Pak zastávka každé 3${NB}m: 1${NB}min v 18, 15, 12 a 9${NB}m, 4${NB}min v 6${NB}m, 7${NB}min ve 3${NB}m.`,
                'Pak zastávka každé tři metry. Minuta v osmnácti, patnácti, dvanácti a devíti metrech, čtyři minuty v šesti a sedm minut ve třech metrech.'],
            [`Runtime je čas ponoru v celých minutách, kdy daný krok končí. Sledujte časomíru: ve 24 opouštíte 18${NB}m.`,
                'Runtime je čas ponoru v celých minutách, kdy daný krok končí. Sledujte časomíru. Ve dvacet čtyři opouštíte osmnáct metrů.'],
            [`Poslední zastávka ve 3${NB}m končí v runtime 39; 18sekundový výstup na hladinu ponor ukončí.`,
                'Poslední zastávka ve třech metrech končí v runtime třicet devět. Osmnáctisekundový výstup na hladinu ponor ukončí.'],
            [`Láhev je očekávaný tlak podle vašeho SAC: vzduch má při přepnutí 114${NB}bar, stage skončí na 159${NB}bar.`,
                'Láhev je očekávaný tlak podle vašeho SAC. Vzduch má při přepnutí sto čtrnáct barů, stage skončí na sto padesáti devíti barech.'],
            ['Plán je jen model; skutečný ponor potřebuje i nouzové plány a počítač.',
                'Plán je jen model. Skutečný ponor potřebuje i nouzové plány a počítač.'],
            ['Příště: jak číst profil ponoru. Díky za pozornost!',
                'Příště: jak číst profil ponoru. Díky za pozornost!'],
        ],
    },
};

const PLAN = '#dive-plan-table-container';
const T = (n) => `${PLAN} .dse-plan-table:nth-of-type(${n})`;
const B = (n, cell = '') => `${T(1)} tbody tr:nth-child(${n})${cell && ` .dse-plan-${cell}`}`;
const A = (n, cell = '') => `${T(2)} tbody tr:nth-child(${n})${cell && ` .dse-plan-${cell}`}`;

export default function sandboxRuntime(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`sandbox-runtime: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    let page;
    const check = (ok, msg) => { if (!ok) throw new Error(`sandbox-runtime: ${msg}`); };

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(700);
            await ui.highlight(PLAN);
        },
        async (ui) => {
            await ui.highlight(`${T(1)} thead`);
        },
        async (ui) => {
            await ui.highlight([B(1), B(2)], { union: true });
            await ui.expectText(B(1, 'stop'), '2');
            await ui.expectText(B(2, 'stop'), '18');
            await ui.expectText(B(2, 'runtime'), '20');
        },
        async (ui) => {
            await ui.highlight([A(1), A(2)], { union: true });
            await ui.expectText(A(1, 'depth'), `21${NB}m`);
            await ui.expectText(A(1, 'runtime'), '22');
            await ui.expectText(A(2, 'gas'), 'EAN50');
            await ui.expectText(A(2, 'tank'), `200${NB}bar`);
            await ui.wait(3200);
            await ui.highlight(A(2, 'tank'));
        },
        async (ui) => {
            await ui.highlight([A(3), A(8)], { union: true });
            const want = [[18, 1], [15, 1], [12, 1], [9, 1], [6, 4], [3, 7]];
            for (const [i, [depth, min]] of want.entries()) {
                await ui.expectText(A(3 + i, 'depth'), `${depth}${NB}m`);
                await ui.expectText(A(3 + i, 'stop'), String(min));
            }
        },
        async (ui) => {
            await ui.highlight([A(1, 'runtime'), A(9, 'runtime')], { union: true });
            await ui.wait(3600);
            await ui.highlight(A(3));
            await ui.expectText(A(3, 'depth'), `18${NB}m`);
            await ui.expectText(A(3, 'runtime'), '24');
        },
        async (ui) => {
            await ui.highlight([A(8), A(9)], { union: true });
            await ui.expectText(A(8, 'depth'), `3${NB}m`);
            await ui.expectText(A(8, 'runtime'), '39');
            await ui.expectText(A(9, 'stop'), `18${NB}s`);
            await ui.expectText(A(9, 'runtime'), '39');
        },
        async (ui) => {
            await ui.highlight(A(1, 'tank'));
            await ui.expectText(A(1, 'tank'), `114${NB}bar`);
            await ui.expectText(A(9, 'tank'), `159${NB}bar`);
            check(await page.locator(`${PLAN} .danger-row`).count() === 0, 'a row is below the reserve');
            await ui.wait(3600);
            await ui.highlight(A(9, 'tank'));
        },
        async (ui) => {
            await ui.wait(800);
            await ui.highlight(null);
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.card(outro(lang));
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`sandbox-runtime/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: DIVE_URL,
        locale: L.locale,
        zoom: 1.45, // the heading, both tables and the footnotes fill the frame
        publish: 'videos/sandbox-runtime',

        async prepare(p, ui) {
            page = p;
            await assertPlan(page);
            // JS click: a real mouse click would leave the visible cursor parked on the button.
            await page.evaluate(() => document.getElementById('collapse-btn').click());
            await page.waitForTimeout(400);
            // At this zoom the plan only fits without the sticky nav: let it scroll away and
            // park the plan heading at the top of the frame.
            await unstickNav(page);
            await page.evaluate(() => {
                const top = document.querySelector('.sandbox-section-head').getBoundingClientRect().top;
                window.scrollTo(0, window.scrollY + top - 10);
            });
            await ui.card(intro(lang, 2));
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
