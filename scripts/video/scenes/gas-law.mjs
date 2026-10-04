// Walkthrough: sandbox/gas-law.html — one set of actions, narrated per language.
//   node make-video.mjs scenes/gas-law.mjs en|cs
// `text` is the on-screen caption, `say` is what the narrator speaks (numbers spelled
// out so the TTS reads them naturally). Keep the two saying the same thing.
//
// Physics notes for whoever edits this:
// - p2 = p1 × T2 / T1 with T in kelvin (the page adds 273.15).
// - The page puts the *gauge* reading straight into the ratio. Strictly the law needs
//   absolute pressure (gauge + ~1 bar); at 200 bar that moves the answer by 0.1–0.2 bar
//   for both examples here (179.8 vs 179.9, 234.3 vs 234.1). The caveat scene says so.

const NB = ' ';

const LANG = {
    en: {
        locale: 'en-US',
        voices: { a: 'bf_emma', b: 'bm_george' },
        values: {
            t1: `35${NB}°C`,
            cold: `179.9${NB}bar`, coldDelta: `-20.1${NB}bar`,
            kelvin: `T1 = 35${NB}°C + 273.15 = 308.15${NB}K ${NB}${NB}|${NB}${NB} T2 = 4${NB}°C + 273.15 = 277.15${NB}K`,
            gas: `-241${NB}l`, time: `-4.0${NB}min`,
            hot: `234.1${NB}bar`, hotDelta: `+34.1${NB}bar`,
            hotSafety: `Maximum cylinder working pressure of 200${NB}bar exceeded. Current pressure: 234.1${NB}bar.`,
        },
        intro: { title: 'Gas Law: Temperature & Pressure', subtitle: 'Why does the gauge drop when the cylinder cools down?' },
        outro: {
            title: 'Try it yourself',
            subtitle: 'decotheory.eu → Sandbox → Gas Law: Temp & Pressure',
            footer: 'EDUCATIONAL USE ONLY · NOT A SUBSTITUTE FOR DIVER TRAINING',
        },
        lines: [
            ['Gas law: what happens to cylinder pressure when the cylinder warms up or cools down?',
                'Gas law. What happens to cylinder pressure, when the cylinder warms up, or cools down?'],
            ['Set a preset, fill pressure, size and two temperatures. The cylinder is rigid, so pressure simply follows temperature: Gay-Lussac’s law.',
                'Set a preset, the fill pressure, the size, and two temperatures. The cylinder is rigid, so its pressure simply follows temperature. That is Gay-Lussac’s law.'],
            [`Example one: a 12-litre cylinder filled to 200${NB}bar in a warm shop at 35${NB}°C, then cooled in a lake to 4${NB}°C.`,
                'Example one. A twelve litre cylinder, filled to two hundred bar in a warm shop at thirty five degrees, then cooled in a lake to four degrees.'],
            ['Work it out first, then click Show Result.',
                'Work it out yourself first. Then click Show Result.'],
            [`The gauge reads about 180${NB}bar: 20${NB}bar gone, and nothing leaked.`,
                'The gauge now reads about one hundred and eighty bar. Twenty bar gone, and nothing leaked.'],
            [`In the ratio, temperatures must be in kelvin: add 273.15. In °C, 4/35 would claim almost all the gas vanished.`,
                'In the ratio, temperatures must be in kelvin. Add two hundred and seventy three point one five. In Celsius, four over thirty five would claim almost all the gas had vanished.'],
            [`That is 241${NB}l less gas at 1${NB}bar, about 4${NB}minutes less at 20${NB}m.`,
                'That is two hundred and forty one litres less gas, or about four minutes less at twenty metres.'],
            [`Example two: the same cylinder, 200${NB}bar at 20${NB}°C, left in the sun until it reaches 70${NB}°C.`,
                'Example two. The same cylinder, two hundred bar at twenty degrees, left in the sun until it reaches seventy.'],
            [`Now it climbs to about 234${NB}bar, above the 200${NB}bar working pressure. Keep cylinders in the shade.`,
                'Now it climbs to about two hundred and thirty four bar, above the two hundred bar working pressure. Keep cylinders in the shade.'],
            [`Caveat: the law needs absolute pressure, gauge + about 1${NB}bar. The page uses the gauge reading directly, which shifts the result by only a fraction of a bar.`,
                'One caveat. The law needs absolute pressure: the gauge reading plus about one bar. The page uses the gauge reading directly, which shifts the result by only a fraction of a bar.'],
            ['Try it yourself in the Deco Theory sandbox. Thanks for watching!',
                'Try it yourself, in the Deco Theory sandbox. Thanks for watching!'],
        ],
    },
    cs: {
        locale: 'cs-CZ',
        // Piper has a single Czech voice, so both narrator slots use it.
        voices: { a: { piper: 'cs_CZ-jirka-medium' }, b: { piper: 'cs_CZ-jirka-medium' } },
        values: {
            t1: `35${NB}°C`,
            cold: `179,9${NB}bar`, coldDelta: `-20,1${NB}bar`,
            kelvin: `T1 = 35${NB}°C + 273,15 = 308,15${NB}K ${NB}${NB}|${NB}${NB} T2 = 4${NB}°C + 273,15 = 277,15${NB}K`,
            gas: `-241${NB}l`, time: `-4,0${NB}min`,
            hot: `234,1${NB}bar`, hotDelta: `+34,1${NB}bar`,
            hotSafety: `Překročen maximální provozní tlak lahve 200${NB}bar. Aktuální tlak: 234,1${NB}bar.`,
        },
        intro: { title: 'Tlak v lahvi při změně teploty', subtitle: 'Proč manometr ukazuje méně, když lahev vychladne?' },
        outro: {
            title: 'Vyzkoušejte si to sami',
            subtitle: 'decotheory.eu → Pískoviště → Tlak v lahvi při změně teploty',
            footer: 'POUZE PRO VÝUKOVÉ ÚČELY · NENAHRAZUJE POTÁPĚČSKÝ KURZ',
        },
        lines: [
            ['Tlak v lahvi: co se s ním stane, když se lahev zahřeje nebo ochladí?',
                'Tlak v lahvi. Co se s ním stane, když se lahev zahřeje, nebo ochladí?'],
            ['Nastavte předvolbu, tlak, objem a dvě teploty. Lahev je tuhá, takže tlak sleduje teplotu: Gay-Lussacův zákon.',
                'Nastavte předvolbu, tlak, objem, a dvě teploty. Lahev je tuhá, takže tlak sleduje teplotu. To je Gay-Lussacův zákon.'],
            [`První příklad: lahev 12${NB}l, naplněná na 200${NB}bar v teplé plnírně při 35${NB}°C, vychladne v jezeře na 4${NB}°C.`,
                'První příklad. Dvanáctilitrová lahev, naplněná na dvě stě barů v teplé plnírně při třiceti pěti stupních, vychladne v jezeře na čtyři stupně.'],
            ['Nejdřív to spočítejte sami, pak klikněte na Zobrazit výsledek.',
                'Nejdřív to spočítejte sami. Pak klikněte na Zobrazit výsledek.'],
            [`Manometr ukazuje asi 180${NB}bar: 20${NB}bar zmizelo, a nic neuniklo.`,
                'Manometr ukazuje asi sto osmdesát barů. Dvacet barů zmizelo, a nic neuniklo.'],
            [`Do poměru patří teploty v kelvinech. Ve °C by poměr 4/35 tvrdil, že skoro všechen plyn zmizel.`,
                'Do poměru patří teploty v kelvinech. Ve stupních Celsia by poměr čtyři ku třiceti pěti tvrdil, že skoro všechen plyn zmizel.'],
            [`To je o 241${NB}l méně plynu při 1${NB}bar, asi o 4${NB}minuty kratší ponor ve 20${NB}m.`,
                'To je o dvě stě čtyřicet jedna litrů méně plynu, asi o čtyři minuty kratší ponor ve dvaceti metrech.'],
            [`Druhý příklad: stejná lahev, 200${NB}bar při 20${NB}°C, zůstane na slunci, až má 70${NB}°C.`,
                'Druhý příklad. Stejná lahev, dvě stě barů při dvaceti stupních, zůstane na slunci, až má sedmdesát.'],
            [`Tlak vystoupá asi na 234${NB}bar, nad provozní tlak 200${NB}bar. Lahve nechávejte ve stínu.`,
                'Tlak vystoupá asi na dvě stě třicet čtyři barů, nad provozní tlak dvě stě barů. Lahve nechávejte ve stínu.'],
            [`Poznámka: zákon platí pro absolutní tlak, manometr + asi 1${NB}bar. Stránka dosazuje přímo údaj manometru, což výsledek mění jen o zlomek baru.`,
                'Jedna poznámka. Zákon platí pro absolutní tlak, manometr plus asi jeden bar. Stránka dosazuje přímo údaj manometru, což výsledek mění jen o zlomek baru.'],
            ['Vyzkoušejte si to sami v pískovišti Deco Theory. Díky za pozornost!',
                'Vyzkoušejte si to sami v pískovišti. Díky za pozornost!'],
        ],
    },
};

/** Set a slider/number pair the way a user would, so the page's input handlers run. */
const setValue = (page, id, value) => page.evaluate(([i, v]) => {
    const el = document.getElementById(i);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
}, [id, value]);

/** expectText() reads innerText, which an <input> doesn't have: check its value instead. */
const expectValue = async (page, selector, expected) => {
    const actual = await page.locator(selector).inputValue();
    if (actual !== String(expected)) throw new Error(`${selector}: narration says "${expected}", input holds "${actual}"`);
};

export default function gasLaw(lang = 'en') {
    const L = LANG[lang];
    if (!L) throw new Error(`gas-law: no narration for "${lang}" (have: ${Object.keys(LANG).join(', ')})`);
    let page; // captured in prepare() for the input-value checks

    // Actions per scene, in the same order as L.lines; narrators alternate a/b.
    const actions = [
        null,
        async (ui) => {
            await ui.card(null);
            await ui.wait(900);
            await ui.highlight('.control-section:nth-of-type(1)');
            await ui.wait(900);
            await ui.highlight('.control-section:nth-of-type(2)');
            await ui.wait(1100);
            await ui.highlight('.control-section:nth-of-type(3)');
            await ui.wait(1300);
            await ui.highlight('.cylinder-viz');
        },
        async (ui) => {
            await ui.highlight('.control-section:nth-of-type(1)');
            await ui.select('#scenarioSelect', 'warm-shop');
            await ui.wait(600);
            await ui.highlight(['.control-section:nth-of-type(2)', '.control-section:nth-of-type(3)']);
            await expectValue(page, '#volumeSelect', 12);
            await expectValue(page, '#pressureInput', 200);
            await expectValue(page, '#t1Input', 35);
            await expectValue(page, '#t2Input', 4);
            await ui.expectText('#cylTemp', L.values.t1);
        },
        async (ui) => {
            await ui.highlight('#calculatePrompt');
            await ui.wait(1200);
            await ui.highlight('#showResultBtn');
            await ui.click('#showResultBtn');
            await ui.wait(300);
            await ui.highlight(null);
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.expectText('#finalPressure', L.values.cold);
            await ui.expectText('#deltaP', L.values.coldDelta);
            await ui.highlight(['.cylinder-viz', '.result-card:nth-of-type(1)', '.result-card:nth-of-type(2)']);
        },
        async (ui) => {
            await ui.expectText('#formulaKelvin', L.values.kelvin);
            await ui.highlight(['.formula-basic-note', '#formulaKelvin', '#formulaComputed']);
        },
        async (ui) => {
            await ui.expectText('#gasChange', L.values.gas);
            await ui.expectText('#timeChange', L.values.time);
            await ui.highlight(['.result-card:nth-of-type(3)', '.result-card:nth-of-type(4)']);
        },
        async (ui) => {
            await ui.highlight(null);
            await ui.reveal('.controls-panel');
            await ui.highlight('.control-section:nth-of-type(3)');
            await ui.slide('#t1Slider', 20);
            await ui.wait(300);
            await ui.slide('#t2Slider', 70, 1500);
            await expectValue(page, '#pressureInput', 200);
            await expectValue(page, '#t1Input', 20);
            await expectValue(page, '#t2Input', 70);
            await ui.highlight(null);
            await ui.click('#showResultBtn');
            await ui.cursorAway();
        },
        async (ui) => {
            await ui.expectText('#finalPressure', L.values.hot);
            await ui.expectText('#deltaP', L.values.hotDelta);
            await ui.expectText('#safetyIndicator', L.values.hotSafety);
            await ui.highlight(['.cylinder-viz', '.result-card:nth-of-type(1)']);
            await ui.wait(2400);
            await ui.highlight('#safetyIndicator');
        },
        async (ui) => {
            await page.evaluate(() => { document.getElementById('modelLimitationsDetails').open = true; });
            await ui.highlight('#modelLimitationsDetails');
            await ui.wait(1500);
            await ui.highlight('#modelLimitationsDetails li:first-child');
        },
        async (ui) => {
            await ui.highlight(null);
            await ui.card(L.outro);
        },
    ];
    if (actions.length !== L.lines.length) throw new Error(`gas-law/${lang}: ${L.lines.length} lines for ${actions.length} scenes`);

    return {
        page: 'sandbox/gas-law.html',
        locale: L.locale,
        zoom: 1.25,
        publish: `videos/gas-law-${lang}`, // -> .mp4 + poster .jpg, embedded in the page

        async prepare(p, ui) {
            page = p;
            // Start from a neutral custom state so the first example can pick its preset on camera.
            await setValue(page, 't1Input', 20);
            await setValue(page, 't2Input', 20);
            // Skip the hero: park the working area right under the sticky nav.
            await page.evaluate(() => {
                const top = document.querySelector('.gaslaw-layout').getBoundingClientRect().top;
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
