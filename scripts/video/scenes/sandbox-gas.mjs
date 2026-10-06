// Series 2, walkthrough 3/4: the Dive Profile chart's Gas Consumption tab (sandbox/index.html).
//   node make-video.mjs scenes/sandbox-gas.mjs [en|cs] [--dry]
// Reads each tank's pressure and its slope, the switch and the reserve line.
// Design: scripts/video/design/sandbox-deco-2.md §4 (+ review 1 S1/S4/S6/S7).

import {
    NB, DIVE_URL, PROFILE_CANVAS, assertPlan, introTabs, outro,
    muteChartHover, fitChartFullscreen, hideFullscreenClose,
    dataPoint, dataRect, scaleBox, legendBox, datasets, annotationBox, sampleAt, pick,
} from '../lib/sandbox.mjs';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        lines: [
            ['Dive profile tabs, part three: reading the Gas Consumption tab.',
                'Dive profile tabs, part three. Reading the Gas Consumption tab.'],
            ['Click Gas Consumption and go full screen.',
                'Click Gas Consumption, and go full screen.'],
            ["Each line is one tank's pressure, read on the right axis: red for the twin 12s of air, dark grey for the EAN50 stage.",
                "Each line is one tank's pressure, read on the right axis. Red for the twin twelves of air, dark grey for the E A N fifty stage."],
            [`Both start full at 200${NB}bar. The steeper the line, the faster the tank empties: about 4${NB}bar a minute on the bottom.`,
                'Both start full, at two hundred bar. The steeper the line, the faster the tank empties: about four bar a minute on the bottom.'],
            [`At 21${NB}m you switch: the air line goes flat at 114${NB}bar, and the stage takes over.`,
                'At twenty one metres you switch. The air line goes flat at one hundred and fourteen bar, and the stage takes over.'],
            [`The stage line flattens as you go up: about 4${NB}bar a minute at 18${NB}m, 2 at 6${NB}m. A smaller tank drops faster for the same gas.`,
                'The stage line flattens as you go up: about four bar a minute at eighteen metres, two at six metres. A smaller tank drops faster for the same gas.'],
            [`The dashed line marked RESERVE is your 50${NB}bar reserve. Both tanks stay far above it; the stage still holds over 150${NB}bar.`,
                'The dashed line marked RESERVE is your fifty bar reserve. Both tanks stay far above it. The stage still holds over one hundred and fifty bar.'],
            ['The green dotted line is average depth and the red dashed line maximum depth, on the left axis.',
                'The green dotted line is average depth, and the red dashed line maximum depth, on the left axis.'],
            ["This assumes a steady SAC; work, cold and stress raise it. Plan reserves by your agency's rules, such as thirds.",
                "This assumes a steady S A C. Work, cold and stress raise it. Plan reserves by your agency's rules, such as thirds."],
            ['Next: tissue loading. Thanks for watching!',
                'Next: tissue loading. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        lines: [
            ['Záložky profilu ponoru, díl třetí: jak číst záložku Spotřeba plynu.',
                'Záložky profilu ponoru, díl třetí. Jak číst záložku Spotřeba plynu.'],
            ['Klikněte na Spotřeba plynu a přejděte na celou obrazovku.',
                'Klikněte na Spotřeba plynu a přejděte na celou obrazovku.'],
            [`Každá čára je tlak v jedné lahvi, na pravé ose: červená je dvojče 2${NB}×${NB}12${NB}l se vzduchem, tmavě šedá je stage s EAN50.`,
                'Každá čára je tlak v jedné lahvi, na pravé ose. Červená je dvojče dvakrát dvanáct litrů se vzduchem, tmavě šedá je stage s EAN padesát.'],
            [`Obě začínají plné na 200${NB}bar. Čím strmější čára, tím rychleji se láhev vyprazdňuje: na dně asi 4${NB}bary za minutu.`,
                'Obě začínají plné na dvou stech barech. Čím strmější čára, tím rychleji se láhev vyprazdňuje. Na dně asi čtyři bary za minutu.'],
            [`Ve 21${NB}m přejdete na EAN50: čára vzduchu se zastaví na 114${NB}bar a převezme to stage.`,
                'Ve dvaceti jedna metrech přejdete na EAN padesát. Čára vzduchu se zastaví na sto čtrnácti barech a převezme to stage.'],
            [`Čára stage se při výstupu zplošťuje: v 18${NB}m asi 4${NB}bary za minutu, v 6${NB}m 2. Menší láhev klesá rychleji při stejné spotřebě.`,
                'Čára stage se při výstupu zplošťuje. V osmnácti metrech asi čtyři bary za minutu, v šesti metrech dva. Menší láhev klesá rychleji při stejné spotřebě.'],
            [`Čárkovaná čára REZERVA je vaše rezerva 50${NB}bar. Obě lahve zůstávají vysoko nad ní; ve stage zbývá přes 150${NB}bar.`,
                'Čárkovaná čára REZERVA je vaše rezerva padesát barů. Obě lahve zůstávají vysoko nad ní. Ve stage zbývá přes sto padesát barů.'],
            ['Zelená tečkovaná čára je průměrná hloubka a červená čárkovaná maximální, na levé ose.',
                'Zelená tečkovaná čára je průměrná hloubka a červená čárkovaná maximální, na levé ose.'],
            ['Počítá se s ustáleným SAC; práce, chlad a stres ho zvyšují. Rezervy plánujte podle pravidel své organizace, třeba podle pravidla třetin.',
                'Počítá se s ustáleným SAC. Práce, chlad a stres ho zvyšují. Rezervy plánujte podle pravidel své organizace, třeba podle pravidla třetin.'],
            ['Příště: sycení tkání. Díky za pozornost!',
                'Příště: sycení tkání. Díky za pozornost!'],
        ],
    },
};

const ZOOM = 1.6;
const C = PROFILE_CANVAS;
const G = { yScale: 'yGas' };
// The colours the narration names ("red", "dark grey"); checked against what is drawn.
const AIR_COLOR = '#e74c3c';
const STAGE_COLOR = '#34495e';

export default function sandboxGas(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`sandbox-gas: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    let page;
    const check = (ok, msg) => { if (!ok) throw new Error(`sandbox-gas: ${msg}`); };
    const series = async () => {
        const all = await datasets(page, C);
        return { air: pick(all, 'Air (bar)').data, stage: pick(all, 'EAN50 (bar)').data };
    };
    const at = (data, t) => sampleAt(data, t).y;
    const slope = (data, t0, t1) => (at(data, t0) - at(data, t1)) / (sampleAt(data, t1).x - sampleAt(data, t0).x);
    const text = (c) => [].concat(c ?? []).join(' ').replace(/\s+/g, ' ').trim();
    const round = async (x, y, r = 18) => {
        const p = await dataPoint(page, C, x, y, G);
        return { left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r, round: true };
    };
    const colorOf = (label) => page.evaluate(([sel, l]) => {
        const canvas = [...document.querySelectorAll(sel)].find((c) => Chart.getChart(c));
        return Chart.getChart(canvas).data.datasets.find((d) => d.label === l)?.borderColor;
    }, [C, label]);
    const scaleTitle = (id) => page.evaluate(([sel, scale]) => {
        const canvas = [...document.querySelectorAll(sel)].find((c) => Chart.getChart(c));
        return Chart.getChart(canvas).options.scales[scale].title.text;
    }, [C, id]);

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(500);
            await ui.click('#dpc-gas');
            await ui.wait(500);
            check(await page.locator('#dpc-gas.active').count() === 1, 'Gas Consumption tab is not active');
            await ui.click('#dive-profile-container .dpc-fullscreen-btn');
            await ui.wait(400);
            check(await page.locator('#dive-profile-container .dpc-fullscreen').count() === 1, 'not in fullscreen');
            await ui.cursorAway();
        },
        async (ui) => {
            check((await colorOf('Air (bar)'))?.toLowerCase() === AIR_COLOR, 'the air line is not red');
            check((await colorOf('EAN50 (bar)'))?.toLowerCase() === STAGE_COLOR, 'the stage line is not dark grey');
            check(await scaleTitle('yGas') === 'Tank Pressure (bar)', 'right axis title is not "Tank Pressure (bar)"');
            const air = await legendBox(page, C, 0, { match: '^Air' });
            const stage = await legendBox(page, C, 0, { match: '^EAN50' });
            check(air.text === 'Air (bar)' && stage.text === 'EAN50 (bar)', `legend "${air.text}" / "${stage.text}"`);
            await ui.ring(air);
            await ui.wait(2600);
            await ui.ring(stage);
            await ui.wait(2600);
            await ui.ring(await scaleBox(page, C, 'yGas'));
        },
        async (ui) => {
            const { air, stage } = await series();
            check(at(air, 0) === 200 && at(stage, 0) === 200, 'tanks do not start at 200 bar');
            const s = slope(air, 4, 18);
            check(s >= 3.9 && s <= 4.4, `bottom air slope ${s} bar/min`);
            await ui.ring(await round(0, 200));
            await ui.wait(2600);
            await ui.ring(await dataRect(page, C, 2, 115, 20, 200, { ...G, pad: 4 }));
        },
        async (ui) => {
            const { air, stage } = await series();
            const end = air.filter((q) => q.x >= 21.9);
            check(Math.round(at(air, 21.9)) === 114 && end.every((q) => Math.abs(q.y - end[0].y) < 1e-6), 'air is not flat at 114 bar after the switch');
            check(stage.filter((q) => q.x < 21.85).every((q) => q.y === 200), 'the stage is used before the switch');
            const dot = await annotationBox(page, C, 'gasSwitchDot0');
            await ui.ring([await round(21.9, at(air, 21.9)), { ...dot, round: true }]);
        },
        async (ui) => {
            const { stage } = await series();
            const s18 = slope(stage, 22.2, 23.2);
            const s6 = slope(stage, 28, 31);
            check(s18 >= 3.4 && s18 <= 4.2, `stage slope at 18 m ${s18} bar/min`);
            check(s6 >= 1.9 && s6 <= 2.4, `stage slope at 6 m ${s6} bar/min`);
            await ui.ring(await dataRect(page, C, 22.0, at(stage, 23.4) - 3, 23.4, 201, { ...G, pad: 6 }));
            await ui.wait(3000);
            await ui.ring(await dataRect(page, C, 27.4, at(stage, 31.4) - 3, 31.4, at(stage, 27.4) + 3, { ...G, pad: 6 }));
        },
        async (ui) => {
            await ui.ring(null);
            const reserve = await annotationBox(page, C, 'reserveLine', { part: 'label', pad: 4 });
            check(text(reserve.content) === 'RESERVE: 50 bar', `reserve label "${text(reserve.content)}"`);
            const { air, stage } = await series();
            const stageMin = Math.min(...stage.map((q) => q.y));
            check(Math.min(...air.map((q) => q.y)) > 50, 'air goes below the reserve');
            check(stageMin > 150 && stageMin < 200, `stage minimum ${stageMin}`);
            await ui.glideTo(reserve.left + reserve.width / 2, reserve.top + reserve.height + 16);
            await ui.ring(reserve);
            await ui.wait(3400);
            await ui.ring(await round(44, at(stage, 44)));
        },
        async (ui) => {
            const avg = await annotationBox(page, C, 'avgDepthLine', { part: 'label', pad: 4 });
            const max = await annotationBox(page, C, 'maxDepthLine', { part: 'label', pad: 4 });
            check(text(avg.content) === 'AVG: 24.1 m' && text(max.content) === 'MAX: 40 m', `labels "${text(avg.content)}" / "${text(max.content)}"`);
            await ui.ring(avg);
            await ui.wait(2400);
            await ui.ring(max);
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
    if (actions.length !== L.lines.length) throw new Error(`sandbox-gas/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: DIVE_URL,
        locale: L.locale,
        zoom: ZOOM,
        publish: 'videos/sandbox-gas',

        async prepare(p, ui) {
            page = p;
            await assertPlan(page);
            await muteChartHover(page);
            await fitChartFullscreen(page, ZOOM);
            await hideFullscreenClose(page);
            await page.evaluate(() => document.getElementById('collapse-btn').click());
            await page.waitForTimeout(400);
            await page.evaluate(() => {
                const top = document.querySelector('h3[data-i18n="sandbox.dive.profileChart"]').getBoundingClientRect().top;
                const nav = document.querySelector('.main-nav').getBoundingClientRect().bottom;
                window.scrollTo(0, window.scrollY + top - nav - 12);
            });
            await ui.card(introTabs(lang, 3));
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
