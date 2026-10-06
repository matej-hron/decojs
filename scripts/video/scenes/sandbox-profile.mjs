// Walkthrough 3/4 of the decompression sandbox (sandbox/index.html): reading the dive
// profile chart.
//   node make-video.mjs scenes/sandbox-profile.mjs [en|cs] [--dry]
// The chart is a Chart.js canvas in its CSS fullscreen: rings and the cursor are placed
// from the chart instance (lib/sandbox.mjs). Design: scripts/video/design/sandbox-deco.md §4.

import {
    NB, DIVE_URL, PROFILE_CANVAS, assertPlan, intro, outro,
    annotationBox, dataPoint, dataPoints, dataRect, scaleBox, datasets, muteChartHover, fitChartFullscreen,
} from '../lib/sandbox.mjs';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        lines: [
            ['Part three: reading the dive profile chart.',
                'Part three. Reading the dive profile chart.'],
            ["These buttons switch the chart's view. We stay on Profile, in full screen.",
                "These buttons switch the chart's view. We stay on Profile, in full screen."],
            ['Time runs left to right in minutes; depth runs down in metres, with the surface at zero.',
                'Time runs left to right, in minutes. Depth runs down, in metres, with the surface at zero.'],
            [`The blue line is you: down at 20${NB}m/min to 40${NB}m, and 20${NB}min of bottom time, the yellow bracket.`,
                'The blue line is you. Down at twenty metres a minute, to forty metres, and twenty minutes of bottom time, the yellow bracket.'],
            [`The red dashed curve is the ceiling: the shallowest depth allowed right now. At the end of the bottom time it is almost 17${NB}m.`,
                'The red dashed curve is the ceiling. The shallowest depth allowed right now. At the end of the bottom time, it is almost seventeen metres.'],
            [`So no direct ascent: the shaded band is off limits. Ascend to 21${NB}m and switch to EAN50 at the purple dot.`,
                'So, no direct ascent. The shaded band is off limits. Ascend to twenty one metres, and switch to E A N fifty at the purple dot.'],
            [`Then the stops, a staircase every 3${NB}m, each deeper than the ceiling while your tissues off-gas.`,
                'Then the stops. A staircase every three metres, each one deeper than the ceiling, while your tissues off-gas.'],
            [`The ceiling rises to the surface; you surface at 39${NB}min, the total dive time (TDT).`,
                'The ceiling rises to the surface. You surface at thirty nine minutes, the total dive time, T D T.'],
            [`The green dotted line is the average depth, 24.1${NB}m, used for gas planning.`,
                'The green dotted line is the average depth, twenty four point one metres, used for gas planning.'],
            [`The ceiling line is a guide for your current depth; the planner puts stops on a 3${NB}m grid, a little deeper.`,
                'The ceiling line is a guide for your current depth. The planner puts stops on a three metre grid, a little deeper.'],
            ['Next: the pressure–pressure diagram. Thanks for watching!',
                'Next: the pressure pressure diagram. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        lines: [
            ['Třetí díl: jak číst profil ponoru.',
                'Třetí díl. Jak číst profil ponoru.'],
            ['Tlačítka přepínají pohled grafu. Zůstaneme u profilu, na celou obrazovku.',
                'Tlačítka přepínají pohled grafu. Zůstaneme u profilu, na celou obrazovku.'],
            ['Čas běží zleva doprava v minutách, hloubka roste dolů v metrech, hladina je nula.',
                'Čas běží zleva doprava, v minutách. Hloubka roste dolů, v metrech, hladina je nula.'],
            [`Modrá čára jste vy: sestup 20${NB}m/min do 40${NB}m a 20${NB}min času na dně, které ukazuje žlutá závorka.`,
                'Modrá čára jste vy. Sestup dvacet metrů za minutu do čtyřiceti metrů a dvacet minut času na dně, které ukazuje žlutá závorka.'],
            [`Červená čárkovaná křivka je strop: nejmenší hloubka, která je právě teď dovolená. Na konci času na dně je skoro 17${NB}m.`,
                'Červená čárkovaná křivka je strop. Nejmenší hloubka, která je právě teď dovolená. Na konci času na dně je skoro sedmnáct metrů.'],
            [`Přímý výstup tedy nejde: stínované pásmo je zakázané. Vystoupáte do 21${NB}m a u fialové tečky přejdete na EAN50.`,
                'Přímý výstup tedy nejde. Stínované pásmo je zakázané. Vystoupáte do dvaceti jedna metrů a u fialové tečky přejdete na EAN padesát.'],
            [`Pak zastávky, schody po 3${NB}m, každý hlouběji než strop, zatímco probíhá odsycování tkání.`,
                'Pak zastávky, schody po třech metrech, každý hlouběji než strop, zatímco probíhá odsycování tkání.'],
            [`Strop stoupá k hladině; vynoříte se ve 39${NB}min, to je celkový čas ponoru (TDT).`,
                'Strop stoupá k hladině. Vynoříte se ve třicet deváté minutě, to je celkový čas ponoru.'],
            [`Zelená tečkovaná čára je průměrná hloubka, 24,1${NB}m, potřebná pro plán spotřeby plynu.`,
                'Zelená tečkovaná čára je průměrná hloubka, dvacet čtyři celá jedna metru, potřebná pro plán spotřeby plynu.'],
            [`Čára stropu je vodítko pro vaši aktuální hloubku; plánovač dává zastávky po 3${NB}m, o kus hlouběji.`,
                'Čára stropu je vodítko pro vaši aktuální hloubku. Plánovač dává zastávky po třech metrech, o kus hlouběji.'],
            ['Příště: diagram tlak–tlak. Díky za pozornost!',
                'Příště: diagram tlak tlak. Díky za pozornost!'],
        ],
    },
};

const Y = { yScale: 'yDepth' };
const ZOOM = 1.6; // largest zoom that still shows the whole dive without label collisions

export default function sandboxProfile(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`sandbox-profile: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    let page;
    const check = (ok, msg) => { if (!ok) throw new Error(`sandbox-profile: ${msg}`); };
    const text = (content) => [].concat(content ?? []).join(' ').replace(/\s+/g, ' ').trim();
    const ann = (id, opts) => annotationBox(page, PROFILE_CANVAS, id, opts);
    /** One box around several boxes. */
    const union = (boxes) => {
        const left = Math.min(...boxes.map((b) => b.left));
        const top = Math.min(...boxes.map((b) => b.top));
        return {
            left, top,
            width: Math.max(...boxes.map((b) => b.left + b.width)) - left,
            height: Math.max(...boxes.map((b) => b.top + b.height)) - top,
        };
    };
    const centre = (b) => [b.left + b.width / 2, b.top + b.height / 2];
    const series = async () => {
        const all = await datasets(page, PROFILE_CANVAS);
        const depth = all.find((d) => d.label === 'Depth (m)')?.data;
        const ceiling = all.find((d) => d.label === 'Ceiling (m)')?.data;
        check(depth && ceiling, `no depth/ceiling datasets (have: ${all.map((d) => d.label).join(', ')})`);
        return { depth, ceiling };
    };

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(700);
            await ui.highlight('.chart-controls');
            await ui.wait(2600);
            await ui.highlight(null);
            await ui.click('#dive-profile-container .dpc-fullscreen-btn');
            await ui.wait(400); // the chart resizes at 0, 100 and 300 ms
            check(await page.locator('#dive-profile-container .dpc-fullscreen').count() === 1, 'the profile chart did not enter fullscreen');
            check(await page.locator('#dpc-depth').evaluate((el) => el.classList.contains('active')), 'Profile view is not active');
        },
        async (ui) => {
            await ui.ring(await scaleBox(page, PROFILE_CANVAS, 'x'));
            await ui.wait(2200);
            await ui.ring(await scaleBox(page, PROFILE_CANVAS, 'yDepth'));
            await ui.wait(2200);
            await ui.ring(await dataRect(page, PROFILE_CANVAS, -100, -0.6, 100, 0.6, { ...Y, pad: 3 }));
        },
        async (ui) => {
            await ui.ring(null);
            const descent = await ann('descentLabel');
            const max = await ann('maxDepthLine', { part: 'label' });
            const bottomLine = await ann('bottomTimeBracket', { pad: 8 });
            const bottomLabel = await ann('bottomTimeBracket', { part: 'label' });
            check(text(descent.content) === `⬇ 20 m/min`, `descent label "${text(descent.content)}"`);
            check(text(max.content) === 'MAX: 40 m', `max label "${text(max.content)}"`);
            check(text(bottomLabel.content) === 'BOTTOM TIME: 20 min', `bottom-time label "${text(bottomLabel.content)}"`);
            await ui.glideTo(...centre(descent));
            await ui.ring(descent);
            await ui.wait(1600);
            await ui.glideTo(...centre(max));
            await ui.ring(max);
            await ui.wait(1600);
            await ui.glideTo(...centre(bottomLabel));
            await ui.ring(union([bottomLine, bottomLabel]));
        },
        async (ui) => {
            await ui.ring(null);
            const { ceiling } = await series();
            const peak = ceiling.reduce((a, q) => (q.y > a.y ? q : a));
            check(peak.y >= 16.5 && peak.y <= 17.0, `ceiling peak is ${peak.y} m`);
            check(peak.x >= 20 && peak.x <= 21, `ceiling peak at ${peak.x} min`);
            // Glide along the curve first, so "red dashed curve" can't mean the MAX line.
            const path = ceiling.filter((q) => q.x >= 3 && q.x <= peak.x);
            const step = Math.max(1, Math.floor(path.length / 24));
            const pts = await dataPoints(page, PROFILE_CANVAS, path.filter((_, i) => i % step === 0), Y);
            for (const [i, p] of pts.entries()) await ui.glideTo(p.x, p.y, i === 0 ? 500 : 80);
            const p = await dataPoint(page, PROFILE_CANVAS, peak.x, peak.y, Y);
            await ui.glideTo(p.x + 24, p.y + 24, 300);
            await ui.ring({ left: p.x - 16, top: p.y - 16, width: 32, height: 32 }, { round: true });
        },
        async (ui) => {
            await ui.ring(await dataRect(page, PROFILE_CANVAS, 3, 0, 39, 17, { ...Y, pad: 2 }));
            await ui.wait(3400);
            const sw = await ann('gasSwitch0', { pad: 4 });
            check(text(sw.content) === 'Air → EAN50 @ 21 m', `gas switch label "${text(sw.content)}"`);
            // Two rings (label box + round dot): one box around both would cut through
            // the "DECO 18 m" label just above the dot at this zoom.
            const dot = await ann('gasSwitchDot0');
            const [cx, cy] = centre(dot);
            await ui.glideTo(cx + 14, cy + 14);
            await ui.ring([sw, { left: cx - 13, top: cy - 13, width: 26, height: 26, round: true }]);
        },
        async (ui) => {
            await ui.ring(null);
            const boxes = [];
            const want = [[18, 1], [15, 1], [12, 1], [9, 1], [6, 4], [3, 7]];
            for (const [i, [depth, min]] of want.entries()) {
                const b = await ann(`stopLabel${i}`, { pad: 4 });
                check(text(b.content) === `DECO ${depth} m · ${min} min`, `stop label ${i} "${text(b.content)}"`);
                boxes.push(b);
            }
            const { depth, ceiling } = await series();
            check(depth.length === ceiling.length, 'depth and ceiling sample counts differ');
            const crossing = ceiling.findIndex((q, i) => q.y > depth[i].y + 1e-6);
            check(crossing === -1, `the ceiling is deeper than the diver at ${ceiling[crossing]?.x} min`);
            for (let i = 1; i <= boxes.length; i++) {
                await ui.glideTo(...centre(boxes[i - 1]), 450);
                await ui.ring(boxes.slice(0, i));
                await ui.wait(250);
            }
        },
        async (ui) => {
            await ui.ring(null);
            const tdt = await ann('totalDiveTime');
            check(text(tdt.content) === 'TDT: 39 min', `TDT label "${text(tdt.content)}"`);
            await ui.expectText('#dive-plan-table-container .dse-plan-table:nth-of-type(2) tbody tr:last-child .dse-plan-runtime', '39');
            const { depth } = await series();
            const surfaced = depth.find((q) => q.x > 5 && q.y <= 0);
            check(surfaced && Math.abs(surfaced.x - 39) < 0.05, `depth first reaches 0 m at ${surfaced?.x} min`);
            await ui.glideTo(...centre(tdt));
            await ui.ring(tdt);
        },
        async (ui) => {
            const avg = await ann('avgDepthLine', { part: 'label' });
            check(text(avg.content) === 'AVG: 24.1 m', `average-depth label "${text(avg.content)}"`);
            await ui.glideTo(...centre(avg));
            await ui.ring(avg);
        },
        async (ui) => {
            await ui.wait(800);
            await ui.ring(null);
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.card(outro(lang));
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`sandbox-profile/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: DIVE_URL,
        locale: L.locale,
        zoom: ZOOM, // larger chart text; fitChartFullscreen() keeps the fullscreen in frame
        publish: 'videos/sandbox-profile',

        async prepare(p, ui) {
            page = p;
            await assertPlan(page);
            await muteChartHover(page);
            await fitChartFullscreen(page, ZOOM);
            // JS click: a real mouse click would leave the visible cursor parked on the button.
            await page.evaluate(() => document.getElementById('collapse-btn').click());
            await page.waitForTimeout(400);
            await page.evaluate(() => {
                const top = document.querySelector('h3[data-i18n="sandbox.dive.profileChart"]').getBoundingClientRect().top;
                const nav = document.querySelector('.main-nav').getBoundingClientRect().bottom;
                window.scrollTo(0, window.scrollY + top - nav - 12);
            });
            await ui.card(intro(lang, 3));
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
