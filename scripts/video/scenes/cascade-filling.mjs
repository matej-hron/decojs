// Walkthrough: sandbox/cascade-filling.html — one set of actions, narrated per language.
//   node make-video.mjs scenes/cascade-filling.mjs en|cs
// `text` is the on-screen caption, `say` is what the narrator speaks (numbers spelled
// out so the TTS reads them naturally). Keep the two saying the same thing.
//
// The lesson: fill from the lowest-pressure bank cylinder first. The bank starts as two
// identical pairs (C1 = C3 = 120 bar, C2 = C4 = 200 bar), so the "fullest first" fill of
// T1 (from C2, then C1) and the cascade fill of T2 (C3, then C4) draw on the same gas.
//   T1: 200·50 / 65                    = 153.8 bar  (C1 at 120 bar can no longer help)
//   T2: 120·50 / 65 = 92.3 bar, then (200·50 + 92.3·15) / 65 = 175.1 bar
// The bank state comes from the page's own share-link parameters.

const NB = ' ';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        values: { low: `120${NB}bar`, high: `200${NB}bar`, t1: `153.8${NB}bar`, t2a: `92.3${NB}bar`, t2: `175.1${NB}bar` },
        intro: { title: 'Cascade Filling', subtitle: 'Which bank cylinder should you open first?' },
        outro: {
            title: 'Try it yourself',
            subtitle: 'decotheory.eu → Sandbox → Cascade Filling',
            footer: 'EDUCATIONAL USE ONLY · NOT A SUBSTITUTE FOR GAS-BLENDER TRAINING',
        },
        lines: [
            ['Cascade filling: in which order should you open the storage cylinders?',
                'Cascade filling. In which order should you open the storage cylinders?'],
            ['On the left: a bank of four 50-litre cylinders and three empty 15-litre singles. On the right: the station, with a valve switch on every cylinder.',
                'On the left, a bank of four fifty litre cylinders, and three empty fifteen litre singles. On the right, the filling station, with a valve switch on every cylinder.'],
            [`The bank is part-used: C1 and C3 at 120${NB}bar, C2 and C4 at 200${NB}bar — two identical pairs.`,
                'The bank is part used. C1 and C3 are at one hundred and twenty bar, C2 and C4 at two hundred. Two identical pairs.'],
            ['First the tempting way: connect T1 and open the fullest cylinder, C2.',
                'First, the tempting way. Connect T1, and open the fullest cylinder, C2.'],
            [`T1 equalises at 153.8${NB}bar. Now C1, at 120${NB}bar, is useless: gas would flow back out of T1.`,
                'T1 equalises at one hundred and fifty three point eight bar. Now C1, at one hundred and twenty, is useless. Gas would flow back out of T1.'],
            ['Now the cascade way: connect T2 and start with the lowest bank cylinder, C3.',
                'Now, the cascade way. Connect T2, and start with the lowest bank cylinder, C3.'],
            ['Close C3, then open C4 for the top-up.',
                'Close C3, then open C4 for the top-up.'],
            [`T2 ends at 175.1${NB}bar: over 20${NB}bar more than T1 — that is over 300${NB}l of gas.`,
                'T2 ends at one hundred and seventy five point one bar. Over twenty bar more than T1. That is over three hundred litres of gas.'],
            ['Each step only equalises. Drain the low cylinders first, and save the high-pressure gas for the final top-up.',
                'Each step can only equalise. So drain the low cylinders first, and save the high pressure gas for the final top-up.'],
            ['Caveat: ideal gas only. The cylinder warms as it fills and reads lower once cool.',
                'One caveat. This is the ideal gas picture. The cylinder warms up as it fills, so it reads lower once it cools.'],
            ['Try it yourself in the Deco Theory sandbox. Thanks for watching!',
                'Try it yourself, in the Deco Theory sandbox. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        // Piper has a single Czech voice, so both narrator slots use it.
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        values: { low: `120${NB}bar`, high: `200${NB}bar`, t1: `153,8${NB}bar`, t2a: `92,3${NB}bar`, t2: `175,1${NB}bar` },
        intro: { title: 'Kaskádové plnění', subtitle: 'Kterou lahev baterie otevřít jako první?' },
        outro: {
            title: 'Vyzkoušejte si to sami',
            subtitle: 'decotheory.eu → Pískoviště → Kaskádové plnění',
            footer: 'POUZE PRO VÝUKOVÉ ÚČELY · NENAHRAZUJE KURZ MÍCHÁNÍ PLYNŮ',
        },
        lines: [
            ['Kaskádové plnění: v jakém pořadí otevírat zásobní lahve?',
                'Kaskádové plnění. V jakém pořadí otevírat zásobní lahve?'],
            [`Vlevo je baterie čtyř lahví po 50${NB}l a tři prázdné Single 15${NB}l. Vpravo plnicí stanice, každá lahev má nahoře ventil.`,
                'Vlevo je baterie čtyř lahví po padesáti litrech, a tři prázdné patnáctilitrové lahve. Vpravo plnicí stanice. Každá lahev má nahoře ventil.'],
            [`Baterie už se používala: C1 a C3 mají 120${NB}bar, C2 a C4 200${NB}bar – dva stejné páry.`,
                'Baterie už se používala. C1 a C3 mají sto dvacet barů, C2 a C4 dvě stě. Dva stejné páry.'],
            ['Nejdřív svůdný postup: připojte T1 a otevřete nejplnější lahev, C2.',
                'Nejdřív ten svůdný postup. Připojte T1, a otevřete nejplnější lahev, C2.'],
            [`T1 se vyrovná na 153,8${NB}bar. C1 se 120${NB}bar je teď k ničemu: plyn by z T1 tekl zpátky.`,
                'T1 se vyrovná na sto padesát tři celé osm desetin baru. C1 se sto dvaceti bary je teď k ničemu. Plyn by z T1 tekl zpátky.'],
            ['Teď kaskádově: připojte T2 a začněte lahví s nejnižším tlakem, C3.',
                'Teď kaskádově. Připojte T2, a začněte lahví s nejnižším tlakem, C3.'],
            ['Zavřete C3 a otevřete C4 na dopuštění.',
                'Zavřete C3, a otevřete C4 na dopuštění.'],
            [`T2 skončí na 175,1${NB}bar: o víc než 20${NB}bar víc než T1, tedy přes 300${NB}l plynu.`,
                'T2 skončí na sto sedmdesáti pěti celých jedné desetině baru. To je o víc než dvacet barů víc než T1, tedy přes tři sta litrů plynu.'],
            ['Každý krok tlaky jen vyrovná. Proto začněte nejnižším tlakem a nejplnější lahev si nechte na konec.',
                'Každý krok tlaky jen vyrovná. Proto začněte nejnižším tlakem, a nejplnější lahev si nechte na konec.'],
            ['Pozor: jde o ideální plyn. Lahev se při plnění zahřeje a po vychladnutí tlak klesne.',
                'Pozor, jde o ideální plyn. Lahev se při plnění zahřeje, a po vychladnutí tlak klesne.'],
            ['Vyzkoušejte si to sami v pískovišti Deco Theory. Díky za pozornost!',
                'Vyzkoušejte si to sami v pískovišti. Díky za pozornost!'],
        ],
    },
};

const cascade = (n) => `#cascadeCylinders .cylinder-unit:nth-child(${n})`;
const target = (n) => `#targetCylinders .cylinder-unit:nth-child(${n})`;
const FILL_MS = 950; // the page animates a fill for 750 ms and ignores clicks meanwhile

export default function cascadeFilling(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`cascade-filling: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);
    const V = L.values;
    let page; // captured in prepare() for checks the ui helpers cannot express

    // The page rebuilds every cylinder on each render, so a ring on a single cylinder
    // would lose its element: clear rings before toggling a valve, re-ring after.
    const toggle = async (ui, unit) => {
        await ui.highlight(null);
        await ui.click(`${unit} .valve-switch`);
        await ui.wait(FILL_MS);
    };

    // Actions per scene, in the same order as L.lines; narrators alternate a/b.
    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(900);
            await ui.highlight(['.controls-panel .section:nth-of-type(1)', '.controls-panel .section:nth-of-type(2)']);
            await ui.wait(3600);
            await ui.highlight('.cylinders-area');
            await ui.wait(1200);
            await ui.moveTo(`${cascade(1)} .valve-switch`);
            await ui.wait(1200);
            await ui.moveTo(`${target(1)} .valve-switch`);
            await ui.cursorAway();
        },
        async (ui) => {
            for (const n of [1, 3]) await ui.expectText(`${cascade(n)} .pressure`, V.low);
            for (const n of [2, 4]) await ui.expectText(`${cascade(n)} .pressure`, V.high);
            await ui.highlight([cascade(1), cascade(3)]);
            await ui.wait(3000);
            await ui.highlight([cascade(2), cascade(4)]);
        },
        async (ui) => {
            await ui.wait(1500);
            await toggle(ui, target(1));
            await toggle(ui, cascade(2));
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.expectText(`${target(1)} .pressure`, V.t1);
            await ui.expectText(`${cascade(1)} .pressure`, V.low);
            await ui.highlight([target(1), '#connectionStatus']);
            await ui.wait(2000);
            await ui.highlight([cascade(1), target(1)]);
        },
        async (ui) => {
            // Close both valves so the next fill starts from a clean manifold.
            await toggle(ui, cascade(2));
            await toggle(ui, target(1));
            await toggle(ui, target(2));
            await toggle(ui, cascade(3));
            await ui.expectText(`${target(2)} .pressure`, V.t2a);
            await ui.highlight([cascade(3), target(2)]);
            await ui.cursorAway();
        },
        async (ui) => {
            await toggle(ui, cascade(3));
            await toggle(ui, cascade(4));
            await ui.highlight([cascade(4), target(2)]);
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.expectText(`${target(2)} .pressure`, V.t2);
            await ui.expectText(`${target(1)} .pressure`, V.t1);
            // "over 20 bar" and "over 300 l" (15 l × the pressure difference)
            const [p1, p2, vol] = await page.evaluate(() => ['1', '2'].map((n) => parseFloat(
                document.querySelector(`#targetCylinders .cylinder-unit:nth-child(${n}) .pressure`).textContent.replace(',', '.'),
            )).concat(+document.getElementById('targetVolume').value));
            if (!(p2 - p1 > 20 && (p2 - p1) * vol > 300 && vol === 15)) {
                throw new Error(`cascade-filling: narration says >20 bar / >300 l, page gives ${p2 - p1} bar × ${vol} l`);
            }
            await ui.highlight([target(1), target(2)]);
        },
        async (ui) => {
            await ui.highlight('#cascadeCylinders');
        },
        async (ui) => {
            await ui.highlight(null);
        },
        async (ui) => {
            await ui.card(L.outro);
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`cascade-filling/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        // Share-link state: bank 120/200/120/200 bar, three empty 15 l targets.
        page: 'sandbox/cascade-filling.html?cp=200&tc=3&tv=15&tp=0&c=120,200,120,200&t=0,0,0',
        locale: L.locale,
        zoom: 1.25,
        publish: `videos/cascade-filling-${lang}`, // -> .mp4 + poster .jpg, embedded in the page

        async prepare(p, ui) {
            page = p;
            // Skip the hero: park the working area right under the sticky nav.
            await page.evaluate(() => {
                const top = document.querySelector('.cascade-layout').getBoundingClientRect().top;
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
