// Walkthrough: sandbox/cascade-filling.html — one set of actions, narrated per language.
//   node make-video.mjs scenes/cascade-filling.mjs en|cs
// `text` is the on-screen caption, `say` is what the narrator speaks (numbers spelled
// out so the TTS reads them naturally). Keep the two saying the same thing.
//
// A realistic weekend: a full bank (4 × 50 l at 300 bar) refills fifteen 12 l singles
// that came back at 20 bar, three at a time (three hoses, 200 bar cap).
//   Cascade (each round: lowest bank cylinder still above the tanks first, fuller ones
//   after) fills all 15 to 200 bar and leaves C4 at ~270 bar.
//   Fullest-first fills only 9 of 15 — measured in prepare() by driving the real page
//   in a hidden tab, so the claim fails the render if the page logic ever changes.
//   Round 1: (300·50 + 20·36) / 86 = 182.8 bar from C1, then C2 tops up to 200 bar.

const NB = ' ';
const ROUNDS = 5;
const PER_ROUND = 3;
const FULL = 200;
const FILL_MS = 950; // page animates a fill for 750 ms

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        values: { first: `182.8${NB}bar`, full: `200${NB}bar` },
        intro: { title: 'Cascade Filling', subtitle: 'Fifteen cylinders from one bank — which bank cylinder first?' },
        outro: {
            title: 'Try it yourself',
            subtitle: 'decotheory.eu → Sandbox → Cascade Filling',
            footer: 'EDUCATIONAL USE ONLY · NOT A SUBSTITUTE FOR GAS-BLENDER TRAINING',
        },
        lines: [
            ['Cascade filling: fifteen cylinders from one bank. Which bank cylinder do you open first?',
                'Cascade filling. Fifteen cylinders from one bank. Which bank cylinder do you open first?'],
            [`The bank: four 50-litre cylinders, full at 300${NB}bar. After a dive weekend: fifteen 12-litre singles at 20${NB}bar. Three hoses, and the fill stops at 200${NB}bar.`,
                'The bank: four fifty litre cylinders, full at three hundred bar. After a dive weekend, fifteen twelve litre singles, at twenty bar. There are three hoses, and the fill stops at two hundred bar.'],
            [`Connect three tanks and start with the lowest bank cylinder, C1. They equalise at 182.8${NB}bar.`,
                'Connect three tanks, and start with the lowest bank cylinder, C1. They equalise at about one hundred and eighty three bar.'],
            [`Close C1 and top up from C2 to 200${NB}bar. C1 is now part-used; C2 has barely been touched.`,
                'Close C1, and top up from C2, to two hundred bar. C1 is now part used. C2 has barely been touched.'],
            ['That is the cascade: each round starts on the lowest cylinder still above the tanks, and finishes on a fuller one.',
                'That is the cascade. Each round starts on the lowest cylinder that is still above the tanks, and finishes on a fuller one.'],
            ['Round after round, the bank drains from the left. The fullest cylinder stays in reserve for the final top-ups.',
                'Round after round, the bank drains from the left. The fullest cylinder stays in reserve, for the final top ups.'],
            [`All fifteen tanks reach 200${NB}bar — and C4 still holds about 270${NB}bar.`,
                'All fifteen tanks reach two hundred bar. And C4 still holds about two hundred and seventy.'],
            [`Start every round on the fullest cylinder instead, and only 9 of the 15 tanks reach 200${NB}bar.`,
                'Start every round on the fullest cylinder instead, and only nine of the fifteen tanks reach two hundred bar.'],
            ['Ideal gas only: tanks warm up as they fill and read lower once they cool, so real fills go slowly.',
                'One caveat. This is the ideal gas picture. Tanks warm up as they fill, and read lower once they cool, so real fills go slowly.'],
            ['Try it yourself in the Deco Theory sandbox. Thanks for watching!',
                'Try it yourself, in the Deco Theory sandbox. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        values: { first: `182,8${NB}bar`, full: `200${NB}bar` },
        intro: { title: 'Kaskádové plnění', subtitle: 'Patnáct lahví z jedné baterie — kterou lahev otevřít první?' },
        outro: {
            title: 'Vyzkoušejte si to sami',
            subtitle: 'decotheory.eu → Pískoviště → Kaskádové plnění',
            footer: 'POUZE PRO VÝUKOVÉ ÚČELY · NENAHRAZUJE KURZ MÍCHÁNÍ PLYNŮ',
        },
        lines: [
            ['Kaskádové plnění: patnáct lahví z jedné baterie. Kterou lahev baterie otevřít první?',
                'Kaskádové plnění. Patnáct lahví z jedné baterie. Kterou lahev baterie otevřít první?'],
            [`Baterie: čtyři lahve po 50${NB}l, plné na 300${NB}bar. Po víkendu: patnáct Singlů 12${NB}l na 20${NB}bar. Tři hadice, plnění končí na 200${NB}bar.`,
                'Baterie má čtyři padesátilitrové lahve, plné na tři sta barů. Po potápěčském víkendu čeká patnáct dvanáctilitrových lahví, na dvaceti barech. Máme tři hadice, a plnění končí na dvou stech barech.'],
            [`Připojte tři lahve a začněte nejnižší lahví baterie, C1. Tlaky se vyrovnají na 182,8${NB}bar.`,
                'Připojte tři lahve, a začněte nejnižší lahví baterie, C1. Tlaky se vyrovnají zhruba na sto osmdesáti třech barech.'],
            [`Zavřete C1 a dotlačte z C2 na 200${NB}bar. C1 je teď načatá, C2 skoro netknutá.`,
                'Zavřete C1, a dotlačte z C2, na dvě stě barů. C1 je teď načatá. C2 je skoro netknutá.'],
            ['To je kaskáda: každé kolo začíná nejnižší lahví, která má ještě víc než plněné lahve, a končí plnější.',
                'To je kaskáda. Každé kolo začíná nejnižší lahví, která má ještě víc než plněné lahve, a končí lahví plnější.'],
            ['Kolo za kolem se baterie vyprazdňuje zleva. Nejplnější lahev zůstává v záloze na závěrečné dotlačení.',
                'Kolo za kolem se baterie vyprazdňuje zleva. Nejplnější lahev zůstává v záloze, na závěrečné dotlačení.'],
            [`Všech patnáct lahví má 200${NB}bar — a C4 má pořád zhruba 270${NB}bar.`,
                'Všech patnáct lahví má dvě stě barů. A C4 má pořád zhruba dvě stě sedmdesát.'],
            [`Když každé kolo začnete nejplnější lahví, dosáhne 200${NB}bar jen 9 lahví z 15.`,
                'Když každé kolo začnete nejplnější lahví, dosáhne dvou set barů jen devět lahví z patnácti.'],
            ['Model ideálního plynu: lahve se při plnění zahřejí a po vychladnutí ukážou méně, proto se plní pomalu.',
                'Jedna poznámka. Tohle je model ideálního plynu. Lahve se při plnění zahřejí, a po vychladnutí ukážou méně, proto se ve skutečnosti plní pomalu.'],
            ['Vyzkoušejte si to sami v pískovišti Deco Theory. Díky za pozornost!',
                'Vyzkoušejte si to sami v pískovišti. Díky za pozornost!'],
        ],
    },
};

const cascade = (n) => `#cascadeCylinders .cylinder-unit:nth-child(${n})`;
const target = (n) => `#targetCylinders .cylinder-unit:nth-child(${n})`;

/** Read all pressures from the page as numbers (handles decimal comma and nbsp). */
const readPressures = (p, row) => p.$$eval(`#${row} .pressure`, (els) =>
    els.map((e) => parseFloat(e.textContent.replace(/\s/g, '').replace(',', '.'))));

/**
 * Fill one round of PER_ROUND tanks. `click(selector)` performs the click and waits
 * for the fill; `ascending` picks the cascade order (lowest useful first) or the
 * fullest-first order.
 */
async function fillRound(p, round, ascending, click) {
    const tanks = Array.from({ length: PER_ROUND }, (_, k) => round * PER_ROUND + k + 1);
    for (const t of tanks) await click(`${target(t)} .valve-switch`);
    const bank = await readPressures(p, 'cascadeCylinders');
    const order = bank.map((_, i) => i).sort((a, b) => (ascending ? bank[a] - bank[b] : bank[b] - bank[a]));
    for (const i of order) {
        const tankP = (await readPressures(p, 'targetCylinders'))[tanks[0] - 1];
        const bankP = (await readPressures(p, 'cascadeCylinders'))[i];
        if (tankP >= FULL || bankP <= tankP) continue;
        await click(`${cascade(i + 1)} .valve-switch`);
        await click(`${cascade(i + 1)} .valve-switch`);
    }
    for (const t of tanks) await click(`${target(t)} .valve-switch`);
}

export default function cascadeFilling(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`cascade-filling: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);
    const V = L.values;
    let page; // captured in prepare() for reading pressures

    // Rings on single cylinders would lose their element (the page re-renders every
    // cylinder on each toggle), so only the stable row containers get highlighted.
    const visibleClick = (ms, settle) => async (sel) => {
        await ui_.click(sel, ms);
        await ui_.wait(sel.startsWith('#cascade') ? FILL_MS : settle);
    };
    let ui_;

    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(900);
            await ui.highlight('#cascadeCylinders');
            await ui.wait(4500);
            await ui.highlight('#targetCylinders');
        },
        async (ui) => {
            await ui.highlight(null);
            for (const t of [1, 2, 3]) await ui.click(`${target(t)} .valve-switch`);
            await ui.click(`${cascade(1)} .valve-switch`);
            await ui.wait(FILL_MS);
            await ui.expectText(`${target(1)} .pressure`, V.first);
            await ui.highlight('#targetCylinders');
        },
        async (ui) => {
            await ui.highlight(null);
            await ui.click(`${cascade(1)} .valve-switch`);
            await ui.click(`${cascade(2)} .valve-switch`);
            await ui.wait(FILL_MS);
            await ui.expectText(`${target(1)} .pressure`, V.full);
            await ui.click(`${cascade(2)} .valve-switch`);
            for (const t of [1, 2, 3]) await ui.click(`${target(t)} .valve-switch`, 350);
            await ui.highlight('#cascadeCylinders');
            await ui.cursorAway();
        },
        async (ui) => {
            ui_ = ui;
            await ui.highlight(null);
            await fillRound(page, 1, true, visibleClick(220, 80));
        },
        async (ui) => {
            ui_ = ui;
            for (let r = 2; r < ROUNDS; r++) await fillRound(page, r, true, visibleClick(160, 50));
            await ui.cursorAway();
        },
        async (ui) => {
            const tanks = await readPressures(page, 'targetCylinders');
            if (tanks.length !== ROUNDS * PER_ROUND || tanks.some((p) => p !== FULL)) {
                throw new Error(`cascade: expected all tanks at ${FULL} bar, page shows ${tanks.join(', ')}`);
            }
            const c4 = (await readPressures(page, 'cascadeCylinders'))[3];
            if (Math.abs(c4 - 270) > 2) throw new Error(`cascade: narration says C4 ≈ 270 bar, page shows ${c4}`);
            await ui.highlight('#targetCylinders');
            await ui.wait(3000);
            await ui.highlight(cascade(4));
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
        page: `sandbox/cascade-filling.html?cp=300&tc=${ROUNDS * PER_ROUND}&tv=12&tp=20`,
        locale: L.locale,
        zoom: 1,
        publish: `videos/cascade-filling`, // -> .mp4 + poster .jpg + <lang>.vtt subtitles, embedded in the page

        async prepare(p, ui) {
            page = p;
            // Measure the fullest-first alternative on the real page logic in a hidden tab.
            const hidden = await p.context().newPage();
            await hidden.goto(p.url());
            await hidden.waitForLoadState('networkidle');
            const hiddenClick = async (sel) => {
                await hidden.click(sel);
                await hidden.waitForTimeout(sel.startsWith('#cascade') ? FILL_MS : 50);
            };
            for (let r = 0; r < ROUNDS; r++) await fillRound(hidden, r, false, hiddenClick);
            const full = (await readPressures(hidden, 'targetCylinders')).filter((x) => x >= FULL).length;
            await hidden.close();
            if (full !== 9) throw new Error(`cascade: narration says fullest-first fills 9 of 15, page logic gives ${full}`);

            // Park the cylinders (bank above, 15 tanks below) right under the sticky nav.
            await p.evaluate(() => {
                const top = document.querySelector('.cylinders-area').getBoundingClientRect().top;
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
