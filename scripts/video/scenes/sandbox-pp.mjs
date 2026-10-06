// Walkthrough 4/4 of the decompression sandbox (sandbox/index.html): the P-P diagram.
//   node make-video.mjs scenes/sandbox-pp.mjs [en|cs] [--dry]
// The diagram is a Chart.js canvas: rings and the cursor are placed from the chart
// instance (lib/sandbox.mjs), and every value the narration relies on is checked.
// Design: scripts/video/design/sandbox-deco.md §5 (rev 2 + review 2 S5).

import {
    NB, DIVE_URL, PP_CANVAS, assertPlan, intro, outro,
    dataPoint, dataPoints, dataRect, scaleBox, legendBox, datasets, muteChartHover, fitChartFullscreen,
} from '../lib/sandbox.mjs';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        lines: [
            ['Part four: reading the pressure–pressure diagram.',
                'Part four. Reading the pressure pressure diagram.'],
            [`Across: ambient pressure, from 1${NB}bar at the surface, the grey line, to 5${NB}bar at 40${NB}m. Up: nitrogen in one compartment.`,
                'Across, ambient pressure. From one bar at the surface, the grey line, to five bar at forty metres. Up, the nitrogen in one compartment.'],
            [`The dot is compartment 1, half-time 5${NB}min, with 0.75${NB}bar of nitrogen. Above the blue line, tissue is supersaturated.`,
                'The dot is compartment one, with a half-time of five minutes, holding zero point seven five bar of nitrogen. Above the blue line, the tissue is supersaturated.'],
            [`Descend and stay 20${NB}min: the dot jumps right, then climbs as the tissue takes up nitrogen; the faint line is its path.`,
                'Descend, and stay twenty minutes. The dot jumps right, then climbs as the tissue takes up nitrogen. The faint line is its path.'],
            [`The dotted line is the M-value, the compartment's limit. GF Low allows 30${NB}% of the gap between it and the blue line, GF High 70${NB}%.`,
                "The dotted line is the M value, the compartment's limit. G F low allows thirty percent of the gap between it and the blue line. G F high, seventy percent."],
            [`The solid line is the ascent limit: GF Low at the orange anchor, the 18${NB}m first stop, rising to GF High at the surface.`,
                'The solid line is the ascent limit. G F low at the orange anchor, the eighteen metre first stop, rising to G F high at the surface.'],
            ["At the first stop, compartment 2's dot would meet its solid line first if you ascended: it is the controlling compartment, outlined in the selector.",
                "At the first stop, compartment two's dot would meet its solid line first, if you ascended. It is the controlling compartment, outlined in the selector."],
            ["Later on the last stop, the slower compartment 5 takes over: to surface, its dot must drop below the solid line's left end.",
                "Later on the last stop, the slower compartment five takes over. To surface, its dot must drop below the solid line's left end."],
            ['Surfaced: the dot is above the blue line, supersaturated, but just under the limit you chose.',
                'Surfaced. The dot is above the blue line, supersaturated, but just under the limit you chose.'],
            ['One compartment is shown; the plan respects all sixteen. A model, not a guarantee against decompression sickness.',
                'One compartment is shown here. The plan respects all sixteen. It is a model, not a guarantee against decompression sickness.'],
            ['Try it yourself in the Deco Theory sandbox. Thanks for watching!',
                'Try it yourself, in the Deco Theory sandbox. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        lines: [
            ['Čtvrtý díl: jak číst diagram tlak–tlak.',
                'Čtvrtý díl. Jak číst diagram tlak tlak.'],
            [`Vodorovně: okolní tlak, od 1${NB}bar na hladině, šedá čára, po 5${NB}bar ve 40${NB}m. Svisle: dusík v jednom kompartmentu.`,
                'Vodorovně je okolní tlak. Od jednoho baru na hladině, to je šedá čára, po pět barů ve čtyřiceti metrech. Svisle je dusík v jednom kompartmentu.'],
            [`Tečka je kompartment 1, poločas 5${NB}min, s 0,75${NB}bar dusíku. Nad modrou přímkou je tkáň přesycená.`,
                'Tečka je kompartment jedna, s poločasem pět minut a nula celá sedmdesát pět baru dusíku. Nad modrou přímkou je tkáň přesycená.'],
            [`Sestup a 20${NB}min na dně: tečka skočí doprava a pak stoupá, jak tkáň přijímá dusík; slabá čára je její dráha.`,
                'Sestup a dvacet minut na dně. Tečka skočí doprava a pak stoupá, jak tkáň přijímá dusík. Slabá čára je její dráha.'],
            [`Tečkovaná čára je M-hodnota, nejvíc dusíku, kolik kompartment snese. GF Low dovolí 30${NB}% rozdílu mezi ní a modrou přímkou, GF High 70${NB}%.`,
                'Tečkovaná čára je M hodnota, nejvíc dusíku, kolik kompartment snese. GF low dovolí třicet procent rozdílu mezi ní a modrou přímkou, GF high sedmdesát procent.'],
            [`Plná čára je limit pro výstup: GF Low u oranžové kotvy, tedy první zastávky v 18${NB}m, k hladině roste na GF High.`,
                'Plná čára je limit pro výstup. GF low u oranžové kotvy, tedy první zastávky v osmnácti metrech, k hladině roste na GF high.'],
            ['Na první zastávce by při výstupu narazila na svou plnou čáru jako první tečka kompartmentu 2: je řídicí, v nabídce je zvýrazněný.',
                'Na první zastávce by při výstupu narazila na svou plnou čáru jako první tečka kompartmentu dva. Je řídicí, v nabídce je zvýrazněný.'],
            ['Později na poslední zastávce převezme řízení pomalejší kompartment 5: před vynořením musí jeho tečka klesnout pod levý konec plné čáry.',
                'Později na poslední zastávce převezme řízení pomalejší kompartment pět. Před vynořením musí jeho tečka klesnout pod levý konec plné čáry.'],
            ['Na hladině: tečka je nad modrou přímkou, přesycená, ale těsně pod zvoleným limitem.',
                'Na hladině. Tečka je nad modrou přímkou, přesycená, ale těsně pod zvoleným limitem.'],
            ['Je vidět jeden kompartment, plán hlídá všech šestnáct. Model, ne záruka proti dekompresní nemoci.',
                'Je vidět jeden kompartment, plán hlídá všech šestnáct. Je to model, ne záruka proti dekompresní nemoci.'],
            ['Vyzkoušejte si to sami v pískovišti Deco Theory. Díky za pozornost!',
                'Vyzkoušejte si to sami v pískovišti. Díky za pozornost!'],
        ],
    },
};

const PP = '#mvalue-container';
const SLIDER = `${PP} .mvc-timeline input[type=range]`;
const READOUT = `${PP} .mvc-timeline > span`;
const STATUS = `${PP} .mvc-controlling-status`;
const OPTION = (n) => `${PP} .mvc-compartment-option[data-compartment-id="${n}"]`;
const Y_MAX = 5.5; // the plot's top at this dive
const ZOOM = 1.4; // above this the compartment selector wraps and the plot gets too flat

export default function sandboxPP(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`sandbox-pp: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    let page;
    const check = (ok, msg) => { if (!ok) throw new Error(`sandbox-pp: ${msg}`); };
    const ds = async () => datasets(page, PP_CANVAS);
    /** The current-point dataset ("TCn (h min)") and the selected compartment's corridor. */
    const state = async () => {
        const all = await ds();
        const point = all.find((d) => /^TC\d+ \(/.test(d.label ?? ''));
        const corridor = all.find((d) => /^GF Corridor TC\d+$/.test(d.label ?? ''));
        const left = corridor.data.reduce((a, q) => (q.x < a.x ? q : a));
        return { all, point, dot: point.data[0], corridor, left };
    };
    /** y of a dataset's polyline at x (linear interpolation). */
    const yAt = (data, x) => {
        const pts = [...data].sort((a, b) => a.x - b.x);
        for (let i = 1; i < pts.length; i++) {
            if (pts[i].x >= x) {
                const [a, b] = [pts[i - 1], pts[i]];
                return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
            }
        }
        return pts.at(-1).y;
    };
    const roundAt = async (x, y, r = 18) => {
        const p = await dataPoint(page, PP_CANVAS, x, y);
        return { left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r };
    };
    const readout = async () => (await page.locator(READOUT).innerText()).replace(/\s+/g, ' ').trim();
    const status = async () => (await page.locator(STATUS).innerText()).replace(/\s+/g, ' ').trim();

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(700);
            check((await ds()).some((d) => d.label === 'Surface (1.013 bar)'), `no surface line dataset (have: ${(await ds()).map((d) => JSON.stringify(d.label)).join(', ')})`);
            await ui.ring(await scaleBox(page, PP_CANVAS, 'x'));
            await ui.wait(2600);
            await ui.ring(await dataRect(page, PP_CANVAS, 0.97, 0, 1.06, Y_MAX, { pad: 4 }));
            await ui.wait(2600);
            await ui.ring(await scaleBox(page, PP_CANVAS, 'y'));
        },
        async (ui) => {
            await ui.highlight(OPTION(1));
            const { point, dot } = await state();
            check(point.label === 'TC1 (5 min)', `point label is "${point.label}"`);
            check(dot.y >= 0.745 && dot.y <= 0.755, `TC1 surface pN2 is ${dot.y}`);
            await ui.wait(1800);
            const p = await dataPoint(page, PP_CANVAS, dot.x, dot.y);
            await ui.glideTo(p.x + 30, p.y + 30);
            await ui.ring(await roundAt(dot.x, dot.y), { round: true });
            await ui.wait(2800);
            await ui.ring(await dataRect(page, PP_CANVAS, 2.5, 2.5, 4, 4));
        },
        async (ui) => {
            await ui.ring(null);
            await ui.slide(SLIDER, 45, 3500);
            check(await readout() === '20.0 min @ 40.0 m', `readout at v=45 is "${await readout()}"`);
            const { dot, all } = await state();
            check(Math.abs(dot.x - (1.01325 + 40 * 0.1)) <= 0.01, `TC1 at 40 m sits at x=${dot.x}, expected 5.013`);
            const trail = all.find((d) => d.label === 'Trail TC1').data;
            const xs = trail.map((q) => q.x), ys = trail.map((q) => q.y);
            await ui.ring(await dataRect(page, PP_CANVAS, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), { pad: 10 }));
        },
        async (ui) => {
            const { all } = await state();
            for (const name of ['M-value TC1', 'GF Low (30%) TC1', 'GF High (70%) TC1']) {
                check(all.some((d) => d.label === name), `no dataset "${name}"`);
            }
            const curve = (name) => all.find((d) => d.label === name).data;
            await ui.ring(await roundAt(1.6, yAt(curve('M-value TC1'), 1.6), 22), { round: true });
            await ui.wait(3500);
            await ui.ring(await roundAt(2, yAt(curve('GF Low (30%) TC1'), 2), 22), { round: true });
            await ui.wait(2600);
            await ui.ring(await roundAt(2, yAt(curve('GF High (70%) TC1'), 2), 22), { round: true });
        },
        async (ui) => {
            const anchor = await legendBox(page, PP_CANVAS, 0, { match: '^Anchor' });
            check(anchor.text === 'Anchor pressure 2.81 bar (18.0 m)', `anchor legend is "${anchor.text}"`);
            await ui.ring(anchor);
            await ui.wait(1800);
            await ui.ring(await dataRect(page, PP_CANVAS, 2.79, 0, 2.84, Y_MAX, { pad: 4 }));
            await ui.wait(1500);
            await ui.ring(null);
            const { corridor } = await state();
            const path = [...corridor.data].sort((a, b) => b.x - a.x); // anchor -> surface
            const pts = await dataPoints(page, PP_CANVAS, path);
            for (const [i, p] of pts.entries()) await ui.glideTo(p.x, p.y, i === 0 ? 600 : 160);
        },
        async (ui) => {
            await ui.slide(SLIDER, 50, 1200);
            await ui.click(OPTION(2), 500);
            await ui.wait(300);
            check(await readout() === '22.2 min @ 18.0 m', `readout at v=50 is "${await readout()}"`);
            check((await status()).includes('controlling compartment: TC2'), `status is "${await status()}"`);
            check(await page.locator(OPTION(2)).evaluate((el) => el.classList.contains('mvc-controlling-compartment')), 'TC2 is not outlined');
            // The dot first (the sentence starts with it), then the outlined selector.
            const { dot } = await state();
            await ui.ring(await roundAt(dot.x, dot.y), { round: true });
            await ui.wait(3000);
            await ui.highlight(OPTION(2));
        },
        async (ui) => {
            await ui.ring(null);
            // Slide first, then select TC5: the outline the viewer sees is then TC5's
            // (compartments 3 and 4 control earlier on the way up).
            await ui.slide(SLIDER, 80, 2000);
            check((await status()).includes('controlling compartment: TC5'), `status at v=80 is "${await status()}"`);
            await ui.click(OPTION(5), 500);
            await ui.slide(SLIDER, 88, 1200);
            check(await readout() === '38.7 min @ 3.0 m', `readout at v=88 is "${await readout()}"`);
            const { dot, left } = await state();
            check(dot.y < left.y, `TC5 at 38.7 min (${dot.y}) is not below the corridor end (${left.y})`);
            await ui.ring([await roundAt(left.x, left.y), await roundAt(dot.x, dot.y)], { round: true });
        },
        async (ui) => {
            await ui.ring(null);
            await ui.slide(SLIDER, 89, 800);
            check(await readout() === '39.2 min @ 0.0 m', `readout at v=89 is "${await readout()}"`);
            const { dot, left } = await state();
            check(dot.y > dot.x && dot.y < left.y, `surface TC5 (${dot.x}, ${dot.y}) is not between the blue line and ${left.y}`);
            await ui.ring(await roundAt(dot.x, dot.y), { round: true });
        },
        async (ui) => {
            await ui.wait(1200);
            await ui.ring(null);
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.card(outro(lang));
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`sandbox-pp/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: DIVE_URL,
        locale: L.locale,
        zoom: ZOOM, // larger selector/readout/axis text; fitChartFullscreen() keeps it in frame
        publish: 'videos/sandbox-pp',

        async prepare(p, ui) {
            page = p;
            await assertPlan(page);
            await muteChartHover(page);
            await fitChartFullscreen(page, ZOOM);
            // JS click: a real mouse click would leave the visible cursor parked on the button.
            await page.evaluate(() => document.getElementById('collapse-btn').click());
            await page.waitForTimeout(400);
            await page.evaluate(() => document.querySelector('#mvalue-container').scrollIntoView());
            // Off camera: a JS click (at this zoom the chart's lock button overlaps the hit area).
            await page.evaluate((sel) => document.querySelector(sel).click(), `${PP} .mvc-fullscreen-btn`);
            await page.waitForTimeout(600);
            check(await page.locator(`${PP} .mvc-wrapper.mvc-fullscreen`).count() === 1, 'the P-P diagram did not enter fullscreen');
            await ui.card(intro(lang, 4));
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
