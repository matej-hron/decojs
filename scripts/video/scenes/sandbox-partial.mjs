// Series 2, walkthrough 2/4: the Dive Profile chart's Partial Pressure tab (sandbox/index.html).
//   node make-video.mjs scenes/sandbox-partial.mjs [en|cs] [--dry]
// Reads pO₂ and pN₂ against the drawn limits and the jump at the gas switch.
// Design: scripts/video/design/sandbox-deco-2.md §3 (+ review 1 S1/S5/S7/N3).

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
            ['Dive profile tabs, part two: reading the Partial Pressure tab.',
                'Dive profile tabs, part two. Reading the Partial Pressure tab.'],
            ['Click Partial Pressure and go full screen.',
                'Click Partial Pressure, and go full screen.'],
            ['Each gas in the mix carries its share of the ambient pressure: green is oxygen, purple is nitrogen, on the right axis.',
                'Each gas in the mix carries its share of the ambient pressure. Green is oxygen, purple is nitrogen, on the right axis.'],
            [`On the surface, air gives 0.21${NB}bar of oxygen. At 40${NB}m it is five times more, 1.05${NB}bar, below the 1.4${NB}bar bottom limit.`,
                'On the surface, air gives nought point two one bar of oxygen. At forty metres it is five times more, one point nought five bar, below the one point four bar bottom limit.'],
            [`Nitrogen reaches 3.96${NB}bar at 40${NB}m, just under the 4${NB}bar narcosis line: mild narcosis is already possible on air at this depth.`,
                'Nitrogen reaches three point nine six bar at forty metres, just under the four bar narcosis line. Mild narcosis is already possible on air at this depth.'],
            [`At 21${NB}m you switch to EAN50: oxygen jumps to 1.56${NB}bar, just under the 1.6${NB}bar deco limit, and nitrogen drops.`,
                'At twenty one metres you switch to E A N fifty. Oxygen jumps to one point five six bar, just under the one point six bar deco limit, and nitrogen drops.'],
            ['Breathing less nitrogen speeds up off-gassing; that is what the deco gas is for. In EAN50 oxygen and nitrogen are equal, so the green line hides under the purple one as they step down together.',
                'Breathing less nitrogen speeds up off-gassing. That is what the deco gas is for. In E A N fifty, oxygen and nitrogen are equal, so the green line hides under the purple one, as they step down together.'],
            [`After surfacing you breathe air again: oxygen is back at 0.21${NB}bar.`,
                'After surfacing you breathe air again. Oxygen is back at nought point two one bar.'],
            [`The limits drawn, 1.4 and 1.6${NB}bar, are common teaching values; follow the limits of your own training agency.`,
                'The limits drawn, one point four and one point six bar, are common teaching values. Follow the limits of your own training agency.'],
            ['Next: gas consumption. Thanks for watching!',
                'Next: gas consumption. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        lines: [
            ['Záložky profilu ponoru, díl druhý: jak číst záložku Parciální tlak.',
                'Záložky profilu ponoru, díl druhý. Jak číst záložku Parciální tlak.'],
            ['Klikněte na Parciální tlak a přejděte na celou obrazovku.',
                'Klikněte na Parciální tlak a přejděte na celou obrazovku.'],
            ['Každý plyn ve směsi nese svůj podíl okolního tlaku: zelená je kyslík, fialová dusík, na pravé ose.',
                'Každý plyn ve směsi nese svůj podíl okolního tlaku. Zelená je kyslík, fialová dusík, na pravé ose.'],
            [`Na hladině dává vzduch 0,21${NB}bar kyslíku. Ve 40${NB}m je to pětkrát víc, 1,05${NB}bar, pod limitem 1,4${NB}bar pro dno.`,
                'Na hladině dává vzduch nula celá dvacet jedna baru kyslíku. Ve čtyřiceti metrech je to pětkrát víc, jedna celá nula pět baru, pod limitem jedna celá čtyři baru pro dno.'],
            [`Dusík dosáhne ve 40${NB}m 3,96${NB}bar, těsně pod čárou opojení 4${NB}bar: mírné opojení je na vzduch v této hloubce už možné.`,
                'Dusík dosáhne ve čtyřiceti metrech tři celé devadesát šest baru, těsně pod čárou opojení čtyři bary. Mírné opojení je na vzduch v této hloubce už možné.'],
            [`Ve 21${NB}m přejdete na EAN50: kyslík vyskočí na 1,56${NB}bar, těsně pod deko limit 1,6${NB}bar, a dusík klesne.`,
                'Ve dvaceti jedna metrech přejdete na EAN padesát. Kyslík vyskočí na jedna celá padesát šest baru, těsně pod deko limit jedna celá šest baru, a dusík klesne.'],
            ['Méně dusíku na vstupu znamená rychlejší odsycování; k tomu je dekompresní plyn. V EAN50 je kyslíku a dusíku stejně, takže zelená čára se schová pod fialovou a klesají spolu.',
                'Méně dusíku na vstupu znamená rychlejší odsycování. K tomu je dekompresní plyn. V EAN padesát je kyslíku a dusíku stejně, takže zelená čára se schová pod fialovou a klesají spolu.'],
            [`Po vynoření dýcháte opět vzduch: kyslík je zpět na 0,21${NB}bar.`,
                'Po vynoření dýcháte opět vzduch. Kyslík je zpět na nula celá dvacet jedna baru.'],
            [`Zakreslené limity 1,4 a 1,6${NB}bar jsou běžné výukové hodnoty; řiďte se limity své výcvikové organizace.`,
                'Zakreslené limity jedna celá čtyři a jedna celá šest baru jsou běžné výukové hodnoty. Řiďte se limity své výcvikové organizace.'],
            ['Příště: spotřeba plynu. Díky za pozornost!',
                'Příště: spotřeba plynu. Díky za pozornost!'],
        ],
    },
};

const ZOOM = 1.6;
const C = PROFILE_CANVAS;
const P = { yScale: 'yPressure' };

export default function sandboxPartial(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`sandbox-partial: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    let page;
    const check = (ok, msg) => { if (!ok) throw new Error(`sandbox-partial: ${msg}`); };
    const series = async () => {
        const all = await datasets(page, C);
        return { po2: pick(all, 'pO₂ (bar)').data, pn2: pick(all, 'pN₂ (bar)').data };
    };
    const at = (data, t) => sampleAt(data, t).y;
    const text = (c) => [].concat(c ?? []).join(' ').replace(/\s+/g, ' ').trim();
    const round = async (x, y, r = 18) => {
        const p = await dataPoint(page, C, x, y, P);
        return { left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r, round: true };
    };
    const intersects = (a, b) => !(a.left + a.width <= b.left || b.left + b.width <= a.left
        || a.top + a.height <= b.top || b.top + b.height <= a.top);

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(500);
            await ui.click('#dpc-pp');
            await ui.wait(500);
            check(await page.locator('#dpc-pp.active').count() === 1, 'Partial Pressure tab is not active');
            await ui.click('#dive-profile-container .dpc-fullscreen-btn');
            await ui.wait(400);
            check(await page.locator('#dive-profile-container .dpc-fullscreen').count() === 1, 'not in fullscreen');
            await ui.cursorAway();
        },
        async (ui) => {
            const o2 = await legendBox(page, C, 0, { match: '^pO₂' });
            const n2 = await legendBox(page, C, 0, { match: '^pN₂' });
            check(o2.text === 'pO₂ (bar)' && n2.text === 'pN₂ (bar)', `legend "${o2.text}" / "${n2.text}"`);
            await ui.ring(o2);
            await ui.wait(2200);
            await ui.ring(n2);
            await ui.wait(2000);
            await ui.ring(await scaleBox(page, C, 'yPressure'));
        },
        async (ui) => {
            const { po2 } = await series();
            check(at(po2, 0).toFixed(2) === '0.21', `surface pO₂ ${at(po2, 0)}`);
            check(at(po2, 10).toFixed(2) === '1.05', `bottom pO₂ ${at(po2, 10)}`);
            const working = await annotationBox(page, C, 'ppO2Working', { part: 'label', pad: 4 });
            check(text(working.content) === 'pO₂ 1.4 (bottom)', `1.4 label "${text(working.content)}"`);
            await ui.ring(await round(0, at(po2, 0)));
            await ui.wait(2800);
            await ui.ring(await dataRect(page, C, 2, 0.95, 20, 1.15, { ...P, pad: 4 }));
            await ui.wait(2600);
            await ui.ring(working);
        },
        async (ui) => {
            const { pn2 } = await series();
            check(at(pn2, 10).toFixed(2) === '3.96', `bottom pN₂ ${at(pn2, 10)}`);
            const n2max = await annotationBox(page, C, 'ppN2Max', { part: 'label', pad: 4 });
            check(text(n2max.content) === 'pN₂ narcosis (4.0)', `narcosis label "${text(n2max.content)}"`);
            const warnings = (await page.locator('#dive-warnings').textContent()).replace(/\s+/g, ' ');
            check(warnings.includes('3.96'), 'the page warning does not mention pN₂ 3.96 (cross-check)');
            await ui.ring(n2max);
            await ui.wait(3000);
            await ui.ring(await dataRect(page, C, 2, 3.85, 20, 4.05, { ...P, pad: 4 }));
        },
        async (ui) => {
            const { po2, pn2 } = await series();
            const peak = po2.filter((q) => q.x > 21 && q.x < 23).reduce((a, q) => (q.y > a.y ? q : a));
            check(Math.abs(peak.x - 21.9) <= 0.05 && peak.y.toFixed(2) === '1.56' && peak.y < 1.6, `pO₂ at the switch ${peak.y} at ${peak.x}`);
            check(at(pn2, 22) < 1.6, `pN₂ after the switch ${at(pn2, 22)}`);
            const working = await annotationBox(page, C, 'ppO2Working', { part: 'label', pad: 0 });
            const deco = await annotationBox(page, C, 'ppO2Deco', { part: 'label', pad: 0 });
            check(text(deco.content) === 'pO₂ 1.6 (deco)', `1.6 label "${text(deco.content)}"`);
            check(!intersects(working, deco), 'the pO₂ 1.4 and 1.6 labels overlap');
            const dot = await annotationBox(page, C, 'gasSwitchDot0');
            await ui.ring([{ ...dot, round: true }, await dataRect(page, C, 21.5, 0.6, 22.4, 1.7, { ...P, pad: 4 })]);
            await ui.wait(3800);
            await ui.ring(await annotationBox(page, C, 'ppO2Deco', { part: 'label', pad: 4 }));
        },
        async (ui) => {
            const { po2, pn2 } = await series();
            // On EAN50 pO₂ = pN₂: the green line is hidden under the purple one (the caption says so).
            const onStage = po2.filter((q) => q.x >= 21.95 && q.x <= 39.0);
            check(onStage.length > 0 && onStage.every((q) => Math.abs(q.y - sampleAt(pn2, q.x).y) <= 0.001),
                'pO₂ ≠ pN₂ on EAN50 (21.95–39.0 min)');
            const plateaus = [22.7, 24, 25.3, 26.6, 29.4, 35].map((t) => at(po2, t));
            check(plateaus.slice(1).every((v, i) => v < plateaus[i]), `pO₂ plateaus ${plateaus.map((v) => v.toFixed(3)).join(' / ')} are not decreasing`);
            await ui.ring(await dataRect(page, C, 22, 0.4, 39, 1.6, { ...P, pad: 4 }));
        },
        async (ui) => {
            const { po2 } = await series();
            check(po2.filter((q) => q.x >= 39.17).every((q) => q.y.toFixed(2) === '0.21'), 'pO₂ after surfacing is not 0.21 bar');
            await ui.ring(await dataRect(page, C, 39.2, 0.1, 44, 0.35, { ...P, pad: 4 }));
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
    if (actions.length !== L.lines.length) throw new Error(`sandbox-partial/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: DIVE_URL,
        locale: L.locale,
        zoom: ZOOM,
        publish: 'videos/sandbox-partial',

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
            await ui.card(introTabs(lang, 2));
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
