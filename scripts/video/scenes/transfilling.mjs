// Walkthrough: sandbox/transfilling.html — one set of actions, narrated per language.
//   node make-video.mjs scenes/transfilling.mjs en|cs
// `text` is the on-screen caption, `say` is what the narrator speaks (numbers spelled
// out so the TTS reads them naturally). Keep the two saying the same thing.

const NB = ' ';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        values: { gasA: `2400${NB}l at 1${NB}bar`, first: `144.7${NB}bar`, second: `183.3${NB}bar` },
        intro: { title: 'Cylinder Transfilling', subtitle: 'What happens when you connect two cylinders?' },
        outro: {
            title: 'Try it yourself',
            subtitle: 'decotheory.eu → Sandbox → Transfilling',
            footer: 'EDUCATIONAL USE ONLY · NOT A SUBSTITUTE FOR GAS-BLENDER TRAINING',
        },
        lines: [
            ['Cylinder transfilling: what actually happens when you connect two cylinders?',
                'Cylinder transfilling. What actually happens when you connect two cylinders?'],
            ['On the left, you set up two cylinders: A is the source, B receives the gas. On the right, you see how full each one is.',
                'On the left, you set up two cylinders. A is the source, and B receives the gas. On the right, you can see how full each one is.'],
            [`Cylinder A is a 12-litre single at 200${NB}bar. Cylinder B is a 7-litre cylinder at 50${NB}bar.`,
                'Cylinder A is a twelve litre single, filled to two hundred bar. Cylinder B is a seven litre cylinder, at fifty bar.'],
            [`The small line under each pressure is the gas inside, as litres at 1${NB}bar: 12${NB}l × 200${NB}bar = 2400${NB}l.`,
                'The small line under each pressure tells you how much gas is inside, measured as litres at one bar. Twelve litres times two hundred bar is two thousand four hundred litres.'],
            ['Now open the valves. Gas flows from high pressure to low, until both pressures are equal.',
                'Now, open the valves. Gas flows from high pressure to low, until both pressures are equal.'],
            [`They meet at about 145${NB}bar — not halfway at 125. The bigger cylinder pulls the result towards its own pressure.`,
                'They meet at about one hundred and forty five bar. Not halfway, at one hundred and twenty five. The bigger cylinder pulls the result towards its own pressure.'],
            ['The rule is simple: add up the gas in both cylinders, then share it across the total volume.',
                'The rule is simple. Add up the gas in both cylinders, then share it across the total volume.'],
            [`Now a big twinset, 2${NB}×${NB}12 litres at 200${NB}bar, topping up a small 3-litre pony at 50${NB}bar.`,
                'Now, a big twinset, two times twelve litres at two hundred bar, topping up a small three litre pony at fifty bar.'],
            [`The pony jumps to over 180${NB}bar. The twinset barely notices the gas it gave away.`,
                'The pony jumps to over one hundred and eighty bar. The twinset barely notices the gas it gave away.'],
            ['This is the ideal-gas picture. In reality the receiving cylinder warms up as it fills, so its pressure drops a little once it cools.',
                'One caveat. This is the ideal gas picture. In reality, the receiving cylinder warms up as it fills, so its pressure drops a little once it cools down.'],
            ['Try it yourself in the Deco Theory sandbox. Thanks for watching!',
                'Try it yourself, in the Deco Theory sandbox. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        // Piper has a single Czech voice, so both narrator slots use it.
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        values: { gasA: `2400${NB}l při 1${NB}bar`, first: `144,7${NB}bar`, second: `183,3${NB}bar` },
        intro: { title: 'Přepouštění lahví', subtitle: 'Co se stane, když propojíte dvě lahve?' },
        outro: {
            title: 'Vyzkoušejte si to sami',
            subtitle: 'decotheory.eu → Pískoviště → Přepouštění lahví',
            footer: 'POUZE PRO VÝUKOVÉ ÚČELY · NENAHRAZUJE KURZ MÍCHÁNÍ PLYNŮ',
        },
        lines: [
            ['Přepouštění lahví: co se doopravdy stane, když propojíte dvě lahve?',
                'Přepouštění lahví. Co se doopravdy stane, když propojíte dvě lahve?'],
            ['Vlevo nastavíte dvě lahve: A je zdroj, B plyn přijímá. Vpravo vidíte, jak je která plná.',
                'Vlevo nastavíte dvě lahve. A je zdroj, a B plyn přijímá. Vpravo vidíte, jak je která plná.'],
            [`Lahev A je Single 12${NB}l naplněný na 200${NB}bar. Lahev B má 7${NB}l a 50${NB}bar.`,
                'Lahev A má dvanáct litrů, a je naplněná na dvě stě barů. Lahev B má sedm litrů, a padesát barů.'],
            [`Řádek pod tlakem ukazuje množství plynu v litrech při 1${NB}bar: 12${NB}l × 200${NB}bar = 2400${NB}l.`,
                'Malý řádek pod tlakem ukazuje, kolik plynu je uvnitř, v litrech při jednom baru. Dvanáct litrů krát dvě stě barů, je dva tisíce čtyři sta litrů.'],
            ['Teď otevřete ventily. Plyn proudí z vyššího tlaku do nižšího, dokud se tlaky nevyrovnají.',
                'Teď otevřete ventily. Plyn proudí z vyššího tlaku do nižšího, dokud se tlaky nevyrovnají.'],
            [`Tlaky se setkají zhruba na 145${NB}bar – ne v polovině na 125. Větší lahev táhne výsledek ke svému tlaku.`,
                'Tlaky se setkají zhruba na sto čtyřiceti pěti barech. Ne v polovině, na sto dvaceti pěti. Větší lahev táhne výsledek ke svému vlastnímu tlaku.'],
            ['Pravidlo je jednoduché: sečtěte plyn v obou lahvích a rozdělte ho do celkového objemu.',
                'Pravidlo je jednoduché. Sečtěte plyn v obou lahvích, a rozdělte ho do celkového objemu.'],
            [`Teď velké dvojče 2${NB}×${NB}12${NB}l na 200${NB}bar dopouští malou pony lahev 3${NB}l s 50${NB}bar.`,
                'Teď velké dvojče, dvakrát dvanáct litrů na dvě stě barů, dopouští malou třílitrovou pony lahev s padesáti bary.'],
            [`Pony lahev vyskočí přes 180${NB}bar. Dvojče si úbytku plynu skoro nevšimne.`,
                'Pony lahev vyskočí přes sto osmdesát barů. Dvojče si úbytku plynu skoro ani nevšimne.'],
            ['Tohle je model ideálního plynu. Ve skutečnosti se plněná lahev zahřeje, takže po vychladnutí její tlak trochu klesne.',
                'Jedna poznámka. Tohle je model ideálního plynu. Ve skutečnosti se plněná lahev při plnění zahřeje, takže po vychladnutí její tlak trochu klesne.'],
            ['Vyzkoušejte si to sami v pískovišti Deco Theory. Díky za pozornost!',
                'Vyzkoušejte si to sami v pískovišti. Díky za pozornost!'],
        ],
    },
};

const setPressure = (page, id, value) => page.evaluate(([i, v]) => {
    const el = document.getElementById(i);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
}, [id, value]);

export default function transfilling(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`transfilling: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);

    // Actions per scene, in the same order as L.lines; narrators alternate a/b.
    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(900);
            await ui.highlight('.controls-panel');
            await ui.wait(3600);
            await ui.highlight('.cylinders-display');
        },
        async (ui) => {
            await ui.highlight('.cylinder-input:nth-of-type(1)');
            await ui.slide('#pressureASlider', 200);
            await ui.wait(800);
            await ui.highlight('.cylinder-input:nth-of-type(2)');
            await ui.slide('#pressureBSlider', 50);
        },
        async (ui) => {
            await ui.highlight(['#gasADisplay', '#gasBDisplay']);
            await ui.moveTo('#gasADisplay');
            await ui.expectText('#gasADisplay', L.values.gasA);
        },
        async (ui) => {
            await ui.highlight('#openValvesBtn');
            await ui.click('#openValvesBtn');
            await ui.wait(300);
            await ui.highlight('.cylinders-display');
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.expectText('#finalPressure', L.values.first);
            await ui.highlight('#resultSection');
        },
        async (ui) => {
            await ui.highlight('.formula-section');
        },
        async (ui) => {
            await ui.highlight(null);
            await ui.reveal('.controls-panel'); // scroll up first: reset shortens the page
            await ui.click('#resetBtn');
            await ui.wait(400);
            await ui.highlight('.cylinder-input:nth-of-type(1)');
            await ui.select('#volumeA', 24);
            await ui.wait(700);
            await ui.highlight('.cylinder-input:nth-of-type(2)');
            await ui.select('#volumeB', 3);
            await ui.wait(700);
            await ui.highlight(null);
            await ui.click('#openValvesBtn');
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.expectText('#finalPressure', L.values.second);
            await ui.highlight('#resultSection');
        },
        async (ui) => {
            await ui.highlight(null);
        },
        async (ui) => {
            await ui.card(L.outro);
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`transfilling/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: 'sandbox/transfilling.html',
        locale: L.locale,
        zoom: 1.25,
        publish: `videos/transfilling`, // -> .mp4 + poster .jpg + <lang>.vtt subtitles, embedded in the page

        async prepare(page, ui) {
            // Start from "wrong" pressures so the setup scene can drag them into place.
            await setPressure(page, 'pressureASlider', 150);
            await setPressure(page, 'pressureBSlider', 20);
            // Skip the hero: park the working area right under the sticky nav.
            await page.evaluate(() => {
                const top = document.querySelector('.transfilling-layout').getBoundingClientRect().top;
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
