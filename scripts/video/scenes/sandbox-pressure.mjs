// Series 2, walkthrough 1/4: the Dive Profile chart's Pressure tab (sandbox/index.html).
//   node make-video.mjs scenes/sandbox-pressure.mjs [en|cs] [--dry]
// Reads ambient pressure off the right-hand axis. Design: scripts/video/design/sandbox-deco-2.md §2.

import {
    NB, DIVE_URL, PROFILE_CANVAS, assertPlan, introTabs, outro,
    muteChartHover, fitChartFullscreen, hideFullscreenClose,
    dataPoint, dataPoints, dataRect, scaleBox, legendBox, datasets, sampleAt, pick,
} from '../lib/sandbox.mjs';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        lines: [
            ['Dive profile tabs, part one: reading the Pressure tab.',
                'Dive profile tabs, part one. Reading the Pressure tab.'],
            ['Same dive as before. Click Pressure, then go full screen.',
                'Same dive as before. Click Pressure, then go full screen.'],
            ['The orange dashed line is ambient pressure, the total pressure around you. Read it on the right-hand axis, in bar.',
                'The orange dashed line is ambient pressure, the total pressure around you. Read it on the right hand axis, in bar.'],
            [`At the surface it is 1${NB}bar, the atmosphere. Every 10${NB}m of water adds another bar.`,
                'At the surface it is one bar, the atmosphere. Every ten metres of water adds another bar.'],
            [`So at 40${NB}m you are under 5${NB}bar, and the line stays flat while you stay on the bottom.`,
                'So at forty metres you are under five bar, and the line stays flat while you stay on the bottom.'],
            ['The pressure line is the depth profile turned upside down: deeper on the left axis, higher pressure on the right.',
                'The pressure line is the depth profile turned upside down. Deeper on the left axis, higher pressure on the right.'],
            [`On the way up, each stop, 3${NB}m shallower, is 0.3${NB}bar less. Between 10${NB}m and the surface, the pressure halves, from 2${NB}bar to 1.`,
                'On the way up, each stop, three metres shallower, is zero point three bar less. Between ten metres and the surface, the pressure halves, from two bar to one.'],
            ['That is the biggest relative change of the ascent: a volume of gas doubles there.',
                'That is the biggest relative change of the ascent. A volume of gas doubles there.'],
            [`After surfacing, the line stays at 1${NB}bar for the rest of the chart, the start of the surface interval.`,
                'After surfacing, the line stays at one bar for the rest of the chart, the start of the surface interval.'],
            [`The sandbox follows the EN 13319 standard, 1${NB}bar per 10${NB}m. Under Environment you can pick fresh or sea water, or an altitude.`,
                'The sandbox follows the E N thirteen three nineteen standard, one bar per ten metres. Under Environment, you can pick fresh or sea water, or an altitude.'],
            ['Next: partial pressures. Thanks for watching!',
                'Next: partial pressures. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        lines: [
            ['Záložky profilu ponoru, díl první: jak číst záložku Tlak.',
                'Záložky profilu ponoru, díl první. Jak číst záložku Tlak.'],
            ['Stejný ponor jako předtím. Klikněte na Tlak a přejděte na celou obrazovku.',
                'Stejný ponor jako předtím. Klikněte na Tlak a přejděte na celou obrazovku.'],
            ['Oranžová čárkovaná čára je okolní tlak, celkový tlak kolem vás. Čte se na pravé ose, v barech.',
                'Oranžová čárkovaná čára je okolní tlak, celkový tlak kolem vás. Čte se na pravé ose, v barech.'],
            [`Na hladině je to 1${NB}bar, atmosféra. Každých 10${NB}m vody přidá další bar.`,
                'Na hladině je to jeden bar, atmosféra. Každých deset metrů vody přidá další bar.'],
            [`Ve 40${NB}m jste tedy pod tlakem 5${NB}bar a čára zůstává rovná, dokud jste na dně.`,
                'Ve čtyřiceti metrech jste tedy pod tlakem pěti barů a čára zůstává rovná, dokud jste na dně.'],
            ['Čára tlaku je profil ponoru obrácený vzhůru nohama: hlouběji na levé ose, vyšší tlak na pravé.',
                'Čára tlaku je profil ponoru obrácený vzhůru nohama. Hlouběji na levé ose, vyšší tlak na pravé.'],
            [`Při výstupu má každá další zastávka, o 3${NB}m výš, o 0,3${NB}bar nižší tlak. Mezi 10${NB}m a hladinou se tlak sníží na polovinu, ze 2${NB}barů na 1.`,
                'Při výstupu má každá další zastávka, o tři metry výš, o nula celá tři baru nižší tlak. Mezi deseti metry a hladinou se tlak sníží na polovinu, ze dvou barů na jeden.'],
            ['To je největší relativní změna celého výstupu: objem plynu se tu zdvojnásobí.',
                'To je největší relativní změna celého výstupu. Objem plynu se tu zdvojnásobí.'],
            [`Po vynoření zůstane čára na 1${NB}baru až do konce grafu, to je začátek povrchového intervalu.`,
                'Po vynoření zůstane čára na jednom baru až do konce grafu, to je začátek povrchového intervalu.'],
            [`Pískoviště počítá podle normy EN 13319, 1${NB}bar na 10${NB}m. V Prostředí lze zvolit sladkou nebo mořskou vodu či nadmořskou výšku.`,
                'Pískoviště počítá podle normy EN třináct tři set devatenáct, jeden bar na deset metrů. V Prostředí lze zvolit sladkou nebo mořskou vodu či nadmořskou výšku.'],
            ['Příště: parciální tlaky. Díky za pozornost!',
                'Příště: parciální tlaky. Díky za pozornost!'],
        ],
    },
};

const ZOOM = 1.6;
const C = PROFILE_CANVAS;
const P = { yScale: 'yPressure' };

export default function sandboxPressure(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`sandbox-pressure: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    let page;
    const check = (ok, msg) => { if (!ok) throw new Error(`sandbox-pressure: ${msg}`); };
    const ambient = async () => pick(await datasets(page, C), 'Ambient Pressure (bar)').data;
    const at = (data, t) => sampleAt(data, t).y;
    const near = (v, want, tol = 0.001) => Math.abs(v - want) <= tol;
    const scaleTitle = (id) => page.evaluate(([sel, scale]) => {
        const canvas = [...document.querySelectorAll(sel)].find((c) => Chart.getChart(c));
        return Chart.getChart(canvas).options.scales[scale].title.text;
    }, [C, id]);

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(500);
            await ui.highlight('.chart-controls');
            await ui.wait(1600);
            await ui.highlight(null);
            await ui.click('#dpc-pressure');
            await ui.wait(500);
            check(await page.locator('#dpc-pressure.active').count() === 1, 'Pressure tab is not active');
            await ui.click('#dive-profile-container .dpc-fullscreen-btn');
            await ui.wait(400);
            check(await page.locator('#dive-profile-container .dpc-fullscreen').count() === 1, 'not in fullscreen');
            await ui.cursorAway();
        },
        async (ui) => {
            const legend = await legendBox(page, C, 0, { match: '^Ambient' });
            check(legend.text === 'Ambient Pressure (bar)', `legend "${legend.text}"`);
            check(await scaleTitle('yPressure') === 'Pressure (bar)', 'right axis title is not "Pressure (bar)"');
            await ui.ring(legend);
            await ui.wait(3200);
            await ui.ring(await scaleBox(page, C, 'yPressure'));
        },
        async (ui) => {
            await ui.ring(null);
            const amb = await ambient();
            check(at(amb, 0) >= 1.0 && at(amb, 0) <= 1.02, `surface pressure ${at(amb, 0)}`);
            const depth = pick(await datasets(page, C), 'Depth (m)').data;
            check(near(at(depth, 0.5), 10, 0.01) && near(at(amb, 0.5), 2.013), `at t 0.5 min: ${at(depth, 0.5)} m, ${at(amb, 0.5)} bar`);
            const p0 = await dataPoint(page, C, 0, at(amb, 0), P);
            await ui.glideTo(p0.x + 20, p0.y + 20);
            await ui.ring({ left: p0.x - 18, top: p0.y - 18, width: 36, height: 36 }, { round: true });
            await ui.wait(2600);
            const path = await dataPoints(page, C, amb.filter((q) => q.x <= 2), P);
            for (const [i, q] of path.entries()) await ui.glideTo(q.x, q.y, i === 0 ? 400 : 120);
        },
        async (ui) => {
            const amb = await ambient();
            const bottom = amb.filter((q) => q.x >= 2.1 && q.x <= 19.9);
            check(bottom.every((q) => near(q.y, 5.013)), 'ambient pressure is not 5.013 bar throughout the bottom time');
            await ui.ring(await dataRect(page, C, 2, 4.8, 20, 5.2, { ...P, pad: 4 }));
            await ui.cursorAway(); // it ended the descent glide on the plateau
        },
        async (ui) => {
            for (let i = 0; i < 2; i++) {
                await ui.ring(await scaleBox(page, C, 'yDepth'));
                await ui.wait(1600);
                await ui.ring(await scaleBox(page, C, 'yPressure'));
                await ui.wait(1600);
            }
        },
        async (ui) => {
            const amb = await ambient();
            const plateaus = [22.7, 24, 25.3, 26.6, 29.4, 35].map((t) => at(amb, t));
            const want = [2.813, 2.513, 2.213, 1.913, 1.613, 1.313];
            check(plateaus.every((v, i) => near(v, want[i])), `stop pressures ${plateaus.map((v) => v.toFixed(3)).join(' / ')}`);
            check(plateaus.slice(1).every((v, i) => near(plateaus[i] - v, 0.3)), 'stops are not 0.3 bar apart');
            check(near(at(amb, 0.5), 2.013, 0.05) && near(at(amb, 40), 1.013, 0.05), '10 m / surface pressures');
            await ui.ring(await dataRect(page, C, 22, 1.0, 39, 2.9, { ...P, pad: 4 }));
        },
        null, // keep the ring: the same staircase
        async (ui) => {
            const amb = await ambient();
            check(amb.filter((q) => q.x >= 39.0).every((q) => near(q.y, 1.013)), 'pressure after surfacing is not 1.013 bar');
            await ui.ring(await dataRect(page, C, 39, 0.8, 44, 1.2, { ...P, pad: 4 }));
        },
        async (ui) => {
            const hint = (await page.locator('details.dse-environment > summary .dse-summary-hint').textContent()).replace(/\s+/g, ' ').trim();
            check(hint === '(0 m · EN)', `environment hint "${hint}"`);
            await ui.wait(1500);
            await ui.ring(null);
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.card(outro(lang));
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`sandbox-pressure/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: DIVE_URL,
        locale: L.locale,
        zoom: ZOOM,
        publish: 'videos/sandbox-pressure',

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
            await ui.card(introTabs(lang, 1));
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
