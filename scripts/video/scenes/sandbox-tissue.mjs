// Series 2, walkthrough 4/4: the Dive Profile chart's Tissue Loading tab (sandbox/index.html).
//   node make-video.mjs scenes/sandbox-tissue.mjs [en|cs] [--dry]
// Reads tissue nitrogen against the inspired (alveolar) pN₂, the on-/off-gassing boundary,
// and against ambient pressure (supersaturation). Design: scripts/video/design/sandbox-deco-2.md §5.

import {
    NB, DIVE_URL, PROFILE_CANVAS, assertPlan, introTabs, outro,
    muteChartHover, fitChartFullscreen, hideFullscreenClose,
    dataPoint, dataRect, legendBox, datasets, annotationBox, sampleAt, pick,
} from '../lib/sandbox.mjs';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        lines: [
            ['Dive profile tabs, part four: reading the Tissue Loading tab.',
                'Dive profile tabs, part four. Reading the Tissue Loading tab.'],
            ['Click Tissue Loading. Compartment 1, the fastest, is shown; tick 5 to compare a slower one, then go full screen.',
                'Click Tissue Loading. Compartment one, the fastest, is shown. Tick five to compare a slower one, then go full screen.'],
            ['Solid lines are the nitrogen in each compartment, on the right axis. The purple dashed line is the nitrogen you breathe in.',
                'Solid lines are the nitrogen in each compartment, on the right axis. The purple dashed line is the nitrogen you breathe in.'],
            ['Below the purple line a tissue takes up nitrogen; above it, the tissue gives it off.',
                'Below the purple line, a tissue takes up nitrogen. Above it, the tissue gives it off.'],
            [`On the bottom, compartment 1 almost catches up, at about 3.7${NB}bar. Compartment 5 reaches only about 2.`,
                'On the bottom, compartment one almost catches up, at about three point seven bar. Compartment five reaches only about two.'],
            ['Compartment 1 starts off-gassing as soon as you ascend; compartment 5 only once the switch to EAN50 drops the purple line.',
                'Compartment one starts off-gassing as soon as you ascend. Compartment five, only once the switch to E A N fifty drops the purple line.'],
            ['The orange dashed line is ambient pressure. A tissue above it is supersaturated, as on the pressure–pressure diagram.',
                'The orange dashed line is ambient pressure. A tissue above it is supersaturated, as on the pressure pressure diagram.'],
            ['On the surface, compartment 1 is already below the orange line, compartment 5 still above it: supersaturated. Both are above the purple line, so both keep off-gassing after the dive.',
                'On the surface, compartment one is already below the orange line, compartment five still above it: supersaturated. Both are above the purple line, so both keep off-gassing after the dive.'],
            ["Thin dotted lines are each compartment's ceiling, on the depth axis; the deepest of all sixteen is the Profile tab's ceiling.",
                "Thin dotted lines are each compartment's ceiling, on the depth axis. The deepest of all sixteen is the Profile tab's ceiling."],
            ['Compartments are a mathematical model, not real body tissues.',
                'Compartments are a mathematical model, not real body tissues.'],
            ["That's all the tabs. Try them yourself in the sandbox. Thanks for watching!",
                "That's all the tabs. Try them yourself, in the sandbox. Thanks for watching!"],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        lines: [
            ['Záložky profilu ponoru, díl čtvrtý: jak číst záložku Sycení tkání.',
                'Záložky profilu ponoru, díl čtvrtý. Jak číst záložku Sycení tkání.'],
            ['Klikněte na Sycení tkání. Je vidět kompartment 1, nejrychlejší; zaškrtněte 5 pro srovnání s pomalejším a přejděte na celou obrazovku.',
                'Klikněte na Sycení tkání. Je vidět kompartment jedna, nejrychlejší. Zaškrtněte pětku pro srovnání s pomalejším a přejděte na celou obrazovku.'],
            ['Plné čáry jsou dusík v každém kompartmentu, na pravé ose. Fialová čárkovaná je dusík, který vdechujete.',
                'Plné čáry jsou dusík v každém kompartmentu, na pravé ose. Fialová čárkovaná je dusík, který vdechujete.'],
            ['Pod fialovou čarou tkáň dusík přijímá; nad ní ho odevzdává.',
                'Pod fialovou čarou tkáň dusík přijímá. Nad ní ho odevzdává.'],
            [`Na dně kompartment 1 téměř dožene vdechovaný dusík, asi na 3,7${NB}bar. Kompartment 5 dosáhne jen asi 2${NB}bar.`,
                'Na dně kompartment jedna téměř dožene vdechovaný dusík, asi na tři celé sedm baru. Kompartment pět dosáhne jen asi dvou barů.'],
            ['Kompartment 1 začne odsycovat hned při výstupu; kompartment 5 až když přechod na EAN50 sníží fialovou čáru.',
                'Kompartment jedna začne odsycovat hned při výstupu. Kompartment pět až když přechod na EAN padesát sníží fialovou čáru.'],
            ['Oranžová čárkovaná čára je okolní tlak. Tkáň nad ní je přesycená, jako na diagramu tlak–tlak.',
                'Oranžová čárkovaná čára je okolní tlak. Tkáň nad ní je přesycená, jako na diagramu tlak tlak.'],
            ['Na hladině je kompartment 1 už pod oranžovou čarou, kompartment 5 stále nad ní: přesycený. Oba jsou nad fialovou čarou, takže oba odsycují i po ponoru.',
                'Na hladině je kompartment jedna už pod oranžovou čarou, kompartment pět stále nad ní: přesycený. Oba jsou nad fialovou čarou, takže oba odsycují i po ponoru.'],
            ['Tenké tečkované čáry jsou stropy jednotlivých kompartmentů, na ose hloubky; nejhlubší ze všech šestnácti je strop ze záložky Profil.',
                'Tenké tečkované čáry jsou stropy jednotlivých kompartmentů, na ose hloubky. Nejhlubší ze všech šestnácti je strop ze záložky Profil.'],
            ['Kompartmenty jsou matematický model, ne skutečné tkáně těla.',
                'Kompartmenty jsou matematický model, ne skutečné tkáně těla.'],
            ['To jsou všechny záložky. Vyzkoušejte si je sami v pískovišti. Díky za pozornost!',
                'To jsou všechny záložky. Vyzkoušejte si je sami v pískovišti. Díky za pozornost!'],
        ],
    },
};

const ZOOM = 1.6;
const C = PROFILE_CANVAS;
const P = { yScale: 'yPressure' };
const D = { yScale: 'yDepth' };
const CHECKBOX = (n) => `.dpc-tissue-controls input[data-compartment-id="${n}"]`;

export default function sandboxTissue(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`sandbox-tissue: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    let page;
    let profileCeilingMax; // from the hidden-tab check in prepare()
    const check = (ok, msg) => { if (!ok) throw new Error(`sandbox-tissue: ${msg}`); };
    const series = async () => {
        const all = await datasets(page, C);
        return {
            all,
            tc1: pick(all, 'TC1 (5 min)').data,
            tc5: pick(all, 'TC5 (27 min)').data,
            alv: pick(all, /^Alveolar pN₂/).data,
            amb: pick(all, /^Ambient Pressure/).data,
            tc1c: pick(all, /^TC1 ceiling/).data,
            tc5c: pick(all, /^TC5 ceiling/).data,
        };
    };
    const at = (data, t) => sampleAt(data, t).y;
    const round = async (x, y, opts, r = 18) => {
        const p = await dataPoint(page, C, x, y, opts);
        return { left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r, round: true };
    };

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(500);
            await ui.click('#dpc-tissue');
            await ui.wait(500);
            check(await page.locator('#dpc-tissue.active').count() === 1, 'Tissue Loading tab is not active');
            await ui.highlight('.dpc-tissue-controls');
            await ui.wait(2600);
            await ui.click(CHECKBOX(5));
            await ui.wait(500);
            const checked = await page.$$eval('.dpc-tissue-controls input[data-compartment-id]', (els) =>
                els.filter((e) => e.checked).map((e) => e.dataset.compartmentId));
            check(checked.join(',') === '1,5', `checked compartments are ${checked.join(',')}, expected 1,5`);
            await ui.wait(1200);
            await ui.highlight(null);
            await ui.click('#dive-profile-container .dpc-fullscreen-btn');
            await ui.wait(400);
            check(await page.locator('#dive-profile-container .dpc-fullscreen').count() === 1, 'not in fullscreen');
            const { all } = await series();
            const alveolar = pick(all, /^Alveolar pN₂/);
            check(!alveolar.hidden, 'the Alveolar pN₂ line is hidden by default (the narration relies on it)');
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.ring(await legendBox(page, C, 0, { match: '^TC1 \\(' }));
            await ui.wait(1800);
            await ui.ring(await legendBox(page, C, 0, { match: '^TC5 \\(' }));
            await ui.wait(2200);
            const alv = await legendBox(page, C, 0, { match: '^Alveolar' });
            check(/^Alveolar pN₂ \(bar\)$/.test(alv.text), `legend "${alv.text}"`);
            await ui.ring(alv);
        },
        async (ui) => {
            await ui.ring(await dataRect(page, C, 2, 0.7, 20, 4.0, { ...P, pad: 4 }));
        },
        async (ui) => {
            const { tc1, tc5, alv } = await series();
            const tc1Max = tc1.reduce((a, q) => (q.y > a.y ? q : a));
            check(tc1Max.y >= 3.6 && tc1Max.y <= 3.75, `TC1 maximum ${tc1Max.y}`);
            check(tc1Max.y < at(alv, 10), `TC1 maximum ${tc1Max.y} is not below the bottom alveolar pN₂ ${at(alv, 10)}`);
            const tc5Bottom = at(tc5, 20);
            check(tc5Bottom >= 1.9 && tc5Bottom <= 2.1, `TC5 at the end of the bottom time ${tc5Bottom}`);
            await ui.ring(await round(tc1Max.x, tc1Max.y, P));
            await ui.wait(3600);
            await ui.ring(await round(20, tc5Bottom, P));
        },
        async (ui) => {
            const { tc1, tc5, alv } = await series();
            const cross = (tc) => tc.find((q) => q.x > 5 && q.y > sampleAt(alv, q.x).y);
            const c1 = cross(tc1);
            const c5 = cross(tc5);
            check(c1 && c1.x >= 20 && c1.x <= 20.5, `TC1 rises above the alveolar line at ${c1?.x}`);
            check(c5 && Math.abs(c5.x - 21.9) <= 0.05, `TC5 rises above the alveolar line at ${c5?.x}`);
            await ui.ring(await round(c1.x, c1.y, P));
            await ui.wait(3400);
            const dot = await annotationBox(page, C, 'gasSwitchDot0');
            await ui.ring([await round(c5.x, c5.y, P), { ...dot, round: true }]);
        },
        async (ui) => {
            const amb = await legendBox(page, C, 0, { match: '^Ambient' });
            check(amb.text === 'Ambient Pressure (bar)', `legend "${amb.text}"`);
            await ui.ring(amb);
            await ui.wait(2600);
            const { tc5, amb: ambient } = await series();
            const stop3 = tc5.filter((q) => q.x >= 31.7 && q.x <= 38.7);
            check(stop3.every((q) => q.y > sampleAt(ambient, q.x).y), 'TC5 is not above ambient throughout the 3 m stop');
            await ui.ring(await dataRect(page, C, 31.7, 1.2, 38.7, 1.85, { ...P, pad: 4 }));
        },
        async (ui) => {
            const { tc1, tc5, alv, amb } = await series();
            check(at(tc1, 39.2) < at(amb, 39.2), `TC1 at the surface ${at(tc1, 39.2)} is not below ambient`);
            check(at(tc5, 39.2) > at(amb, 39.2), `TC5 at the surface ${at(tc5, 39.2)} is not above ambient`);
            for (const t of [39.2, 44]) {
                for (const [name, tc] of [['TC1', tc1], ['TC5', tc5]]) {
                    check(at(tc, t) > at(alv, t), `${name} at ${t} min is not above the alveolar pN₂ (still off-gassing)`);
                }
            }
            check(at(tc1, 44) < at(tc1, 39.2) && at(tc5, 44) < at(tc5, 39.2), 'TC1/TC5 are not falling after surfacing');
            await ui.ring([await round(39.2, at(tc1, 39.2), P), await round(39.2, at(tc5, 39.2), P)]);
            await ui.wait(4500);
            await ui.ring(await dataRect(page, C, 39.2, 0.6, 44, 1.75, { ...P, pad: 4 }));
        },
        async (ui) => {
            const { tc1c, tc5c } = await series();
            const p1 = tc1c.reduce((a, q) => (q.y > a.y ? q : a));
            const p5 = tc5c.reduce((a, q) => (q.y > a.y ? q : a));
            check(Math.abs(p1.y - profileCeilingMax) <= 0.01, `TC1 ceiling peak ${p1.y} m ≠ Profile ceiling peak ${profileCeilingMax} m`);
            await ui.ring(await round(p1.x, p1.y, D));
            await ui.wait(3000);
            await ui.ring([await round(p1.x, p1.y, D), await round(p5.x, p5.y, D)]);
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
    if (actions.length !== L.lines.length) throw new Error(`sandbox-tissue/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    /** Off camera: with All compartments, the Profile ceiling = the deepest of the 16 compartment ceilings. */
    async function hiddenTabCheck() {
        const hidden = await page.context().newPage();
        try {
            await hidden.goto(page.url());
            await hidden.waitForLoadState('networkidle');
            await hidden.evaluate(() => document.getElementById('dpc-tissue').click());
            await hidden.waitForTimeout(400);
            await hidden.evaluate(() => [...document.querySelectorAll('.dpc-tissue-controls button')]
                .find((b) => b.textContent.trim() === 'All').click());
            await hidden.waitForTimeout(600);
            const ceilings = (await datasets(hidden, C)).filter((d) => /^TC\d+ ceiling/.test(d.label ?? ''));
            check(ceilings.length === 16, `${ceilings.length} compartment ceilings with All selected`);
            const deepest = ceilings[0].data.map((_, i) => Math.max(...ceilings.map((d) => d.data[i].y)));
            await hidden.evaluate(() => document.getElementById('dpc-depth').click());
            await hidden.waitForTimeout(600);
            const profile = pick(await datasets(hidden, C), 'Ceiling (m)').data;
            check(profile.length === deepest.length, 'sample counts differ between tabs');
            const worst = Math.max(...profile.map((q, i) => Math.abs(q.y - deepest[i])));
            check(worst <= 0.01, `Profile ceiling differs from the deepest compartment ceiling by ${worst} m`);
            profileCeilingMax = Math.max(...profile.map((q) => q.y));
        } finally {
            await hidden.close();
        }
    }

    return {
        page: DIVE_URL,
        locale: L.locale,
        zoom: ZOOM,
        publish: 'videos/sandbox-tissue',

        async prepare(p, ui) {
            page = p;
            await assertPlan(page);
            await hiddenTabCheck();
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
            await ui.card(introTabs(lang, 4));
        },

        scenes: L.lines.map(([text, say], i) => ({
            voice: i % 2 === 0 ? L.voices.a : L.voices.b,
            text,
            say,
            run: actions[i] ?? undefined,
        })),
    };
}
