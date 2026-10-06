// Walkthrough 1/4 of the decompression sandbox (sandbox/index.html): entering a dive.
//   node make-video.mjs scenes/sandbox-setup.mjs [en|cs] [--dry]
// Builds the series dive step by step in the editor, so every change has a visible
// effect on the plan. `text` is the caption, `say` the narration (numbers spelled out).
// Design: scripts/video/design/sandbox-deco.md §2.

import { NB, assertPlan, intro, outro, muteChartHover } from '../lib/sandbox.mjs';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        lines: [
            ['Part one: entering a dive into the decompression sandbox.',
                'Part one. Entering a dive into the decompression sandbox.'],
            ['Describe the dive on the left; the plan on the right recalculates as you type.',
                'Describe the dive on the left. The plan on the right recalculates as you type.'],
            [`Quick setup: 40${NB}m deep, bottom time 20${NB}min, counted from leaving the surface.`,
                'Quick setup. Forty metres deep, and a bottom time of twenty minutes, counted from leaving the surface.'],
            [`Raw Bühlmann allows 11${NB}min at 40${NB}m on air without stops, so this is a deco dive: 8${NB}min of stops.`,
                'Raw Buhlmann allows eleven minutes at forty metres on air without stops. So this is a deco dive, with eight minutes of stops.'],
            [`Watch the Tank column: one 12-litre cylinder would end at 7${NB}bar, and rows below the 50-bar reserve turn red.`,
                'Watch the Tank column. One twelve litre cylinder would end at seven bar, and rows below the fifty bar reserve turn red.'],
            [`Open Gases and switch to twin 12-litre cylinders. Air's MOD at pO₂ 1.4${NB}bar is 56${NB}m.`,
                "Open Gases, and switch to twin twelve litre cylinders. Air's M O D, at a P O two of one point four bar, is fifty six metres."],
            [`Add a deco gas: EAN50 in an S080 stage. Its deco MOD at pO₂ 1.6${NB}bar is 22${NB}m, so the plan switches at 21${NB}m.`,
                'Add a deco gas. E A N fifty, in an S zero eighty stage. Its deco M O D, at a P O two of one point six bar, is twenty two metres. So the plan switches at twenty one.'],
            [`Less nitrogen means faster off-gassing: the stops shrink from 8 to 5${NB}min.`,
                'Less nitrogen means faster off-gassing. The stops shrink from eight to five minutes.'],
            ['Now set the conservatism: gradient factors 30/70.',
                'Now set the conservatism. Gradient factors thirty seventy.'],
            [`GF Low 30 moves the first stop from 6${NB}m to 18${NB}m. GF High 70 limits supersaturation at the surface, so the shallow stops grow: 15${NB}min in total.`,
                'G F low thirty moves the first stop from six metres to eighteen. G F high seventy limits supersaturation at the surface, so the shallow stops grow. Fifteen minutes in total.'],
            [`Environment and Gas consumption keep their defaults: altitude 0${NB}m, SAC 20 and 15${NB}L/min.`,
                'Environment and Gas consumption keep their defaults. Altitude zero, and a S A C of twenty and fifteen litres per minute.'],
            ['Next: reading the runtime table. Thanks for watching!',
                'Next: reading the runtime table. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        lines: [
            ['První díl: jak zadat ponor do dekompresního pískoviště.',
                'První díl. Jak zadat ponor do dekompresního pískoviště.'],
            ['Vlevo popíšete ponor, plán vpravo se při psaní hned přepočítá.',
                'Vlevo popíšete ponor, plán vpravo se při psaní hned přepočítá.'],
            [`Rychlé nastavení: hloubka 40${NB}m, čas na dně 20${NB}min, počítaný od opuštění hladiny.`,
                'Rychlé nastavení. Hloubka čtyřicet metrů, čas na dně dvacet minut, počítaný od opuštění hladiny.'],
            [`Čistý Bühlmann dovolí ve 40${NB}m na vzduch 11${NB}min bez zastávek, takže jde o dekompresní ponor: 8${NB}min zastávek.`,
                'Čistý Bühlmann dovolí ve čtyřiceti metrech na vzduch jedenáct minut bez zastávek. Jde tedy o dekompresní ponor, s osmi minutami zastávek.'],
            [`Sledujte sloupec Láhev: jedna 12litrová láhev by skončila na 7${NB}bar a řádky pod rezervou 50${NB}bar zčervenají.`,
                'Sledujte sloupec Láhev. Jedna dvanáctilitrová láhev by skončila na sedmi barech a řádky pod rezervou padesát barů zčervenají.'],
            [`Otevřete Plyny a zvolte dvojče 2${NB}×${NB}12${NB}l. MOD vzduchu při pO₂ 1,4${NB}bar je 56${NB}m.`,
                'Otevřete Plyny a zvolte dvojče dvakrát dvanáct litrů. MOD vzduchu při parciálním tlaku kyslíku jedna celá čtyři baru je padesát šest metrů.'],
            [`Přidejte dekompresní plyn: EAN50 ve stage S080. Jeho deko MOD při pO₂ 1,6${NB}bar je 22${NB}m, plán proto přepne ve 21${NB}m.`,
                'Přidejte dekompresní plyn. EAN padesát ve stage S nula osmdesát. Jeho deko MOD při parciálním tlaku kyslíku jedna celá šest baru je dvacet dva metrů, plán proto přepne ve dvaceti jedna.'],
            [`Méně dusíku znamená rychlejší odsycování: zastávky se zkrátí z 8 na 5${NB}min.`,
                'Méně dusíku znamená rychlejší odsycování. Zastávky se zkrátí z osmi na pět minut.'],
            ['Teď nastavíme konzervativnost: gradient faktory 30/70.',
                'Teď nastavíme konzervativnost. Gradient faktory třicet sedmdesát.'],
            [`GF Low 30 posune první zastávku z 6${NB}m na 18${NB}m. GF High 70 omezí přesycení na hladině, takže mělké zastávky se prodlouží: celkem 15${NB}min.`,
                'GF low třicet posune první zastávku ze šesti metrů na osmnáct. GF high sedmdesát omezí přesycení na hladině, takže mělké zastávky se prodlouží. Celkem patnáct minut.'],
            [`Prostředí a Spotřebu plynu necháme ve výchozím stavu: nadmořská výška 0${NB}m, SAC 20 a 15${NB}l/min.`,
                'Prostředí a Spotřebu plynu necháme ve výchozím stavu. Nadmořská výška nula, SAC dvacet a patnáct litrů za minutu.'],
            ['Příště: jak číst runtime. Díky za pozornost!',
                'Příště: jak číst runtime. Díky za pozornost!'],
        ],
    },
};

const PLAN = '#dive-plan-table-container';
const ASCENT = `${PLAN} .dse-plan-table:nth-of-type(2)`;
const CARD = (n) => `.dse-gas-card:nth-child(${n})`;

export default function sandboxSetup(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`sandbox-setup: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    let page;
    const check = (ok, msg) => { if (!ok) throw new Error(`sandbox-setup: ${msg}`); };
    /** Click a number field and type a new value, digit by digit. */
    const type = async (ui, selector, value) => {
        await ui.click(selector);
        await page.locator(selector).evaluate((el) => el.select());
        await page.keyboard.type(String(value), { delay: 60 });
        await ui.wait(250);
    };
    /** Rows of the written plan as { cls, depth, stop, runtime, gas, tank }, plain spaces (\s covers U+00A0). */
    const rows = () => page.$$eval(`${PLAN} .dse-plan-table tbody tr`, (trs) => trs.map((tr) => {
        const [, depth, stop, runtime, gas, tank] = [...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
        return { cls: tr.className, depth, stop, runtime, gas, tank };
    }));
    const firstStop = async () => (await rows()).find((r) => /\bdse-plan-stop\b/.test(r.cls));
    const textOf = async (sel) => (await page.locator(sel).innerText()).replace(/\s+/g, ' ').trim();

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(700);
            await ui.highlight('#editor-panel');
            await ui.wait(2500);
            await ui.highlight(PLAN);
        },
        async (ui) => {
            await ui.highlight(null);
            await type(ui, '.dse-quick-depth', 40);
            await type(ui, '.dse-quick-time', 20);
            await ui.highlight('details.dse-quick-setup');
            check(await page.inputValue('.dse-quick-depth') === '40', 'depth input is not 40');
            check(await page.inputValue('.dse-quick-time') === '20', 'time input is not 20');
            await ui.expectText(`${PLAN} tr.dse-plan-bottom .dse-plan-runtime`, '20');
        },
        async (ui) => {
            await ui.highlight('.dse-ndl-display');
            await ui.expectText('.dse-ndl-value', '11');
            await ui.expectText('.dse-deco-time', '8');
        },
        async (ui) => {
            await ui.highlight(ASCENT);
            const last = (await rows()).filter((r) => /\bdse-plan-stop\b/.test(r.cls)).at(-1);
            check(last?.depth === '3 m' && last.tank === '7 bar', `3 m stop tank is ${last?.tank}, narration says 7 bar`);
            check(/\bdanger-row\b/.test(last.cls), '3 m stop row is not red');
            check(await page.inputValue('.dse-reserve-input') === '50', 'reserve is not 50 bar');
        },
        async (ui) => {
            await ui.highlight(null);
            await ui.click('details.dse-gases > summary');
            await ui.wait(300);
            await ui.reveal('details.dse-gases');
            await ui.select(`${CARD(1)} .dse-gas-cylinder`, 24);
            await ui.wait(300);
            await ui.highlight('details.dse-gases');
            check(await textOf(`${CARD(1)} .dse-gas-mod`) === 'MOD: 56 m', 'air MOD is not 56 m');
            check((await rows())[1].tank === '120 bar', 'bottom-row tank is not 120 bar');
        },
        async (ui) => {
            await ui.highlight(null);
            await ui.click('.dse-add-gas-btn');
            await ui.wait(400);
            check(await page.inputValue(`${CARD(2)} .dse-gas-preset`) === 'ean50', 'new deco gas is not EAN50');
            await ui.select(`${CARD(2)} .dse-gas-cylinder`, '11.1');
            await ui.wait(300);
            await ui.highlight(`${CARD(2)} .dse-gas-mod`);
            check(await textOf(`${CARD(2)} .dse-gas-mod`) === 'MOD: 18 m deco MOD: 22 m recommended switch: 21 m',
                `EAN50 MOD block reads "${await textOf(`${CARD(2)} .dse-gas-mod`)}"`);
            const sw = (await rows()).find((r) => /\bdse-plan-switch\b/.test(r.cls));
            check(sw?.depth === '21 m' && sw.gas === 'EAN50', 'no switch to EAN50 at 21 m');
            check(!(await page.isChecked('.dse-gf-lock-input')), 'GF lock is still checked (scene 9 types two values)');
            // "…so the plan switches at 21 m": at this zoom the table row is out of view; show it.
            await ui.wait(4500);
            await ui.highlight(`${ASCENT} tr.dse-plan-switch`);
        },
        async (ui) => {
            await ui.highlight('.dse-ndl-display');
            await ui.expectText('.dse-deco-time', '5');
            check((await firstStop())?.depth === '6 m', 'first stop is not 6 m with EAN50 at GF 100/100');
        },
        async (ui) => {
            await ui.highlight(null);
            await ui.click('details.dse-gases > summary', 450);
            await ui.wait(150);
            await ui.click('details.dse-gf > summary', 450);
            await ui.wait(150);
            await ui.reveal('details.dse-gf', 400);
            await type(ui, '.dse-gf-low-input', 30);
            await type(ui, '.dse-gf-high-input', 70);
            await ui.expectText('details.dse-gf > summary .dse-summary-hint', '(GF 30/70)');
        },
        async (ui) => {
            await ui.highlight(ASCENT); // the whole plan is taller than the frame at this zoom
            check((await firstStop())?.depth === '18 m', 'first stop is not 18 m at GF 30/70');
            await ui.expectText('.dse-deco-time', '15');
            await assertPlan(page);
        },
        async (ui) => {
            await ui.highlight(['details.dse-environment > summary', 'details.dse-sac > summary']);
            await ui.expectText('details.dse-environment > summary .dse-summary-hint', `(0${NB}m · EN)`);
            await ui.expectText('details.dse-sac > summary .dse-summary-hint', `(SAC 20/15${NB}L/min)`);
            await ui.wait(3000);
            await ui.highlight(null);
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.card(outro(lang));
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`sandbox-setup/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: 'sandbox/index.html',
        locale: L.locale,
        zoom: 1.4,
        publish: 'videos/sandbox-setup',

        async prepare(p, ui) {
            page = p;
            await muteChartHover(page); // scene 11's cursorAway() crosses the profile chart
            // Fresh context: the default "Simple 30 m" dive, editor expanded at 1920 px.
            await page.evaluate(() => {
                const top = document.querySelector('#sandbox-layout').getBoundingClientRect().top;
                const nav = document.querySelector('.main-nav').getBoundingClientRect().bottom;
                window.scrollTo(0, window.scrollY + top - nav - 8);
            });
            await ui.card(intro(lang, 1));
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
