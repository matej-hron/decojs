// Shared helpers for the decompression-sandbox video series (scenes/sandbox-*.mjs):
// the series dive and its expected plan, the intro/outro cards, and chart geometry.
// Not a scenario itself; lives outside scenes/ on purpose.
//
// Chart helpers return VIEWPORT coordinates ({left, top, width, height} or {x, y}),
// ready for ui.ring() / ui.glideTo(). Each first waits for the chart to settle (two
// animation frames + 150 ms): MValueChart rebuilds on every time/compartment change,
// and DiveProfileChart resizes at 0/100/300 ms after entering fullscreen (wait ~400 ms
// after the click before measuring).

import fs from 'node:fs';

export const NB = '\u00a0';

/** The series dive: 40 m / 20 min, air in 2 × 12 l + EAN50 in an S080 stage, GF 30/70. */
export const DIVE_URL = 'sandbox/index.html?v=1&d=40&t=20&gfL=30&gfH=70&cyl=24&dg=50:11.1:50:200';

export const PROFILE_CANVAS = '#dive-profile-container canvas';
// The P-P container also holds the raw mini-profile canvas; the Chart.js one comes first.
export const PP_CANVAS = '#mvalue-container canvas';

/**
 * The plan as the page shows it (en-US): [row class, phase, depth, duration, runtime, gas, tank].
 * Bottom table: rows 0–1; ascent table: rows 2–10 (A1 = ascent … A9 = surface).
 */
export const EXPECTED_PLAN = [
    ['des', '↓ Des', `40${NB}m`, '2', '2', 'Air', `195${NB}bar`],
    ['bottom', '● Bottom', `40${NB}m`, '18', '20', 'Air', `120${NB}bar`],
    ['asc', '↑ Asc', `21${NB}m`, '2', '22', 'Air', `114${NB}bar`],
    ['switch', '⇄ Switch', `21${NB}m`, '—', '22', 'EAN50', `200${NB}bar`],
    ['stop', '■ Stop', `18${NB}m`, '1', '24', 'EAN50', `195${NB}bar`],
    ['stop', '■ Stop', `15${NB}m`, '1', '25', 'EAN50', `190${NB}bar`],
    ['stop', '■ Stop', `12${NB}m`, '1', '26', 'EAN50', `186${NB}bar`],
    ['stop', '■ Stop', `9${NB}m`, '1', '28', 'EAN50', `182${NB}bar`],
    ['stop', '■ Stop', `6${NB}m`, '4', '32', 'EAN50', `172${NB}bar`],
    ['stop', '■ Stop', `3${NB}m`, '7', '39', 'EAN50', `159${NB}bar`],
    ['asc', '▲ Surface', `0${NB}m`, `18${NB}s`, '39', 'EAN50', `159${NB}bar`],
];

/** Throw (failing the render) unless the written plan matches EXPECTED_PLAN exactly. */
export async function assertPlan(page, expected = EXPECTED_PLAN) {
    const rows = await page.$$eval('#dive-plan-table-container .dse-plan-table tbody tr', (trs) =>
        trs.map((tr) => [
            tr.className,
            ...[...tr.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
        ]));
    const norm = (s) => s.replace(/\s+/g, ' ').trim(); // \s includes U+00A0
    const problems = [];
    if (rows.length !== expected.length) problems.push(`${rows.length} rows, expected ${expected.length}`);
    expected.forEach(([cls, ...cells], i) => {
        const row = rows[i];
        if (!row) return;
        const [className, ...actual] = row;
        const classes = className.split(/\s+/);
        if (!classes.includes(`dse-plan-${cls}`)) problems.push(`row ${i + 1}: class "${className}", expected dse-plan-${cls}`);
        if (classes.includes('danger-row')) problems.push(`row ${i + 1}: unexpected danger-row`);
        cells.forEach((want, j) => {
            if (norm(actual[j] ?? '') !== norm(want)) problems.push(`row ${i + 1} col ${j + 1}: page "${actual[j]}", narration assumes "${want}"`);
        });
    });
    if (problems.length) throw new Error(`assertPlan: the plan changed:\n  ${problems.join('\n  ')}`);
}

// ---------------------------------------------------------------- cards

const locale = (lang) => JSON.parse(fs.readFileSync(new URL(`../../../locales/${lang}.json`, import.meta.url), 'utf8'));

const SERIES = {
    en: {
        part: (n) => `Decompression Modelling · part ${n} of 4`,
        titles: ['Entering a Dive', 'Reading the Runtime Table', 'Reading the Dive Profile', 'The Pressure–Pressure Diagram'],
        introFooter: 'DECO THEORY · DECOTHEORY.EU',
        outroTitle: 'Try it yourself',
        outroFooter: 'EDUCATIONAL USE ONLY · NOT FOR REAL DIVE PLANNING',
    },
    cs: {
        part: (n) => `Modelování dekomprese · díl ${n} ze 4`,
        titles: ['Zadání ponoru', 'Jak číst runtime', 'Jak číst profil ponoru', 'Diagram tlak–tlak'],
        introFooter: 'DECO THEORY · DECOTHEORY.EU',
        outroTitle: 'Vyzkoušejte si to sami',
        outroFooter: 'POUZE PRO VÝUKU · NE PRO PLÁNOVÁNÍ SKUTEČNÝCH PONORŮ',
    },
};

const series = (lang) => {
    const s = SERIES[lang];
    if (!s) throw new Error(`sandbox videos: no cards for "${lang}" (have: ${Object.keys(SERIES).join(', ')})`);
    return s;
};

/** Intro card for part n (1–4), for ui.card(). */
export function intro(lang, n) {
    const s = series(lang);
    return { title: s.titles[n - 1], subtitle: s.part(n), footer: s.introFooter };
}

// Series 2: the other Dive Profile tabs (own part count; series 1's cards stay valid).
const TABS = {
    en: { part: (n) => `Dive Profile tabs · part ${n} of 4`,
        titles: ['The Pressure Tab', 'The Partial Pressure Tab', 'The Gas Consumption Tab', 'The Tissue Loading Tab'] },
    cs: { part: (n) => `Záložky profilu ponoru · díl ${n} ze 4`,
        titles: ['Záložka Tlak', 'Záložka Parciální tlak', 'Záložka Spotřeba plynu', 'Záložka Sycení tkání'] },
};

/** Intro card for series 2 (Dive Profile tabs), part n (1–4). */
export function introTabs(lang, n) {
    const t = TABS[lang];
    if (!t) throw new Error(`sandbox videos: no tab cards for "${lang}" (have: ${Object.keys(TABS).join(', ')})`);
    return { title: t.titles[n - 1], subtitle: t.part(n), footer: series(lang).introFooter };
}

/** Outro card; the path is read from the nav labels so it always matches the menu. */
export function outro(lang) {
    const s = series(lang);
    const nav = locale(lang).nav.sandbox;
    return { title: s.outroTitle, subtitle: `decotheory.eu → ${nav.label} → ${nav.deco}`, footer: s.outroFooter };
}

// ---------------------------------------------------------------- chart geometry

/**
 * Let the visible cursor glide over the charts without hover effects: Chart.js would
 * otherwise pop tooltips wherever the cursor passes. Recording only; call in prepare().
 */
export async function muteChartHover(page) {
    await page.addStyleTag({ content: `${PROFILE_CANVAS}, ${PP_CANVAS} { pointer-events: none !important; }` });
}

/**
 * The charts' CSS fullscreen is sized in viewport units, which body zoom does not
 * scale: at zoom z it would be z times too big. Size it to the zoomed viewport instead,
 * so a zoomed recording (larger, readable chart text) still fits the frame. Recording only.
 */
export async function fitChartFullscreen(page, zoom) {
    await page.addStyleTag({
        content: `.dpc-chart-container.dpc-fullscreen, .mvc-wrapper.mvc-fullscreen {
            width: calc(100vw / ${zoom}) !important; height: calc(100vh / ${zoom}) !important; }
        /* Under body zoom Chart.js sizes the profile canvas to the container's padding box,
           and CSS then squeezes it into the content box: a non-uniform stretch. Swap the
           20 px padding for an equal inset (and a background-coloured outline as the margin). */
        .dpc-chart-container.dpc-fullscreen {
            padding: 0 !important; top: 20px !important; left: 20px !important;
            width: calc(100vw / ${zoom} - 40px) !important; height: calc(100vh / ${zoom} - 40px) !important;
            outline: 20px solid var(--background-color, white); }`,
    });
}

/**
 * Hide the charts' fullscreen ✕ (it covers the top tick of the right-hand axis). Recording
 * only; it stays clickable for JS. Keep cursor glides out of its 63 × 63 px hit area.
 */
export async function hideFullscreenClose(page) {
    await page.addStyleTag({ content: '.dpc-exit-fullscreen-btn, .mvc-exit-fullscreen-btn { opacity: 0 !important; }' });
}

/** Let the sticky nav scroll away with the page (more room for a zoomed table). Recording only. */
export async function unstickNav(page) {
    await page.addStyleTag({ content: '.main-nav { position: static !important; }' });
}

/** Let a Chart.js canvas finish (re)building: two animation frames + 150 ms. */
export async function settle(page) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(150);
}

// Runs in the page: the chart behind `sel` and a chart-px → viewport-px mapper
// (robust to body zoom: kx, ky = rendered size / chart size, per axis).
const IN_PAGE = `
    const chartOf = (sel) => {
        const canvas = [...document.querySelectorAll(sel)].find((c) => Chart.getChart(c));
        if (!canvas) throw new Error('no Chart.js canvas for ' + sel);
        const chart = Chart.getChart(canvas);
        const r = canvas.getBoundingClientRect();
        // Separate factors: under body zoom the canvas box can be scaled differently in x and y.
        const kx = r.width / chart.width;
        const ky = r.height / chart.height;
        // Different factors mean CSS is stretching the canvas (squashed text, oval dots):
        // fail the render instead of shipping a distorted chart.
        if (Math.abs(kx / ky - 1) > 0.02) {
            throw new Error('canvas ' + sel + ' is stretched: kx ' + kx.toFixed(3) + ' vs ky ' + ky.toFixed(3));
        }
        const box = (left, top, width, height, pad = 0) => ({
            left: r.left + left * kx - pad, top: r.top + top * ky - pad,
            width: width * kx + 2 * pad, height: height * ky + 2 * pad,
        });
        const pt = (x, y) => ({ x: r.left + x * kx, y: r.top + y * ky });
        return { chart, box, pt };
    };
`;

async function inChart(page, sel, body, arg) {
    await settle(page);
    // eslint-disable-next-line no-new-func
    return page.evaluate(([src, s, a]) => new Function('sel', 'arg', src)(s, a), [`${IN_PAGE}\n${body}`, sel, arg ?? null]);
}

/**
 * Box of a chartjs-plugin-annotation element by id. `part: 'label'` takes the label of a
 * line/box annotation (e.g. the "MAX: 40 m" text of maxDepthLine) instead of the whole element.
 */
export function annotationBox(page, sel, id, { part = 'element', pad = 6 } = {}) {
    return inChart(page, sel, `
        const { chart, box } = chartOf(sel);
        const els = Chart.registry.getPlugin('annotation').getAnnotations(chart);
        const el = els.find((e) => e.options?.id === arg.id);
        if (!el) throw new Error('no annotation ' + arg.id + ' (have: ' + els.map((e) => e.options?.id).join(', ') + ')');
        const target = arg.part === 'label' ? el.elements?.[0] : el;
        if (!target) throw new Error('annotation ' + arg.id + ' has no label');
        const p = target.getProps(['x', 'y', 'x2', 'y2', 'width', 'height'], true);
        const left = Number.isFinite(p.x2) ? Math.min(p.x, p.x2) : p.x;
        const top = Number.isFinite(p.y2) ? Math.min(p.y, p.y2) : p.y;
        const width = Number.isFinite(p.x2) ? Math.abs(p.x2 - p.x) : p.width;
        const height = Number.isFinite(p.y2) ? Math.abs(p.y2 - p.y) : p.height;
        return { ...box(left, top, width, height, arg.pad), content: el.options.content ?? el.options.label?.content ?? null };
    `, { id, part, pad });
}

/** Viewport point of a data value. Profile chart: yScale 'yDepth'; P-P chart: 'y'. */
export function dataPoint(page, sel, xVal, yVal, { xScale = 'x', yScale = 'y' } = {}) {
    return inChart(page, sel, `
        const { chart, pt } = chartOf(sel);
        return pt(chart.scales[arg.xScale].getPixelForValue(arg.xVal), chart.scales[arg.yScale].getPixelForValue(arg.yVal));
    `, { xVal, yVal, xScale, yScale });
}

/** Viewport points of many data values at once (one settle): [{x, y}] -> [{x, y}]. For cursor paths. */
export function dataPoints(page, sel, values, { xScale = 'x', yScale = 'y' } = {}) {
    return inChart(page, sel, `
        const { chart, pt } = chartOf(sel);
        return arg.values.map((v) => pt(chart.scales[arg.xScale].getPixelForValue(v.x), chart.scales[arg.yScale].getPixelForValue(v.y)));
    `, { values, xScale, yScale });
}

/** Viewport box spanning two data corners (any order), clipped to the chart area. */
export function dataRect(page, sel, x0, y0, x1, y1, { xScale = 'x', yScale = 'y', pad = 0 } = {}) {
    return inChart(page, sel, `
        const { chart, box } = chartOf(sel);
        const a = chart.chartArea;
        const xs = [arg.x0, arg.x1].map((v) => chart.scales[arg.xScale].getPixelForValue(v));
        const ys = [arg.y0, arg.y1].map((v) => chart.scales[arg.yScale].getPixelForValue(v));
        const left = Math.max(a.left, Math.min(...xs)), right = Math.min(a.right, Math.max(...xs));
        const top = Math.max(a.top, Math.min(...ys)), bottom = Math.min(a.bottom, Math.max(...ys));
        return box(left, top, right - left, bottom - top, arg.pad);
    `, { x0, y0, x1, y1, xScale, yScale, pad });
}

/** Viewport box of a scale (axis with its ticks and title), e.g. 'x', 'y', 'yDepth'. */
export function scaleBox(page, sel, id, { pad = 4 } = {}) {
    return inChart(page, sel, `
        const { chart, box } = chartOf(sel);
        const s = chart.scales[arg.id];
        if (!s) throw new Error('no scale ' + arg.id + ' (have: ' + Object.keys(chart.scales).join(', ') + ')');
        return box(s.left, s.top, s.width, s.height, arg.pad);
    `, { id, pad });
}

/** Viewport box of the chart's plotting area. */
export function chartAreaBox(page, sel, { pad = 0 } = {}) {
    return inChart(page, sel, `
        const { chart, box } = chartOf(sel);
        const a = chart.chartArea;
        return box(a.left, a.top, a.right - a.left, a.bottom - a.top, arg.pad);
    `, { pad });
}

/** Viewport box of legend item i (or the first whose text matches the RegExp source `match`). */
export function legendBox(page, sel, i, { match = null, pad = 4 } = {}) {
    return inChart(page, sel, `
        const { chart, box } = chartOf(sel);
        const items = chart.legend?.legendItems ?? [];
        const idx = arg.match ? items.findIndex((it) => new RegExp(arg.match).test(it.text)) : arg.i;
        const hb = chart.legend?.legendHitBoxes?.[idx];
        if (!hb) throw new Error('no legend item ' + (arg.match ?? arg.i));
        const text = items[idx]?.text;
        return { ...box(hb.left, hb.top, hb.width, hb.height, arg.pad), text: text == null ? null : String(text).replace(/\\s+/g, ' ') };
    `, { i, match, pad });
}

/**
 * Datasets for numeric checks: [{ label, data: [{x, y}], hidden }] (labels with plain spaces). Filter in Node
 * (functions can't cross into the page), e.g. (await datasets(page, PROFILE_CANVAS))
 * .find((d) => d.label === 'Ceiling (m)').
 */
export function datasets(page, sel) {
    return inChart(page, sel, `
        const { chart } = chartOf(sel);
        return chart.data.datasets.map((d, i) => ({
            label: d.label == null ? null : String(d.label).replace(/\\s+/g, ' '), // U+00A0 -> space
            hidden: !chart.isDatasetVisible(i),
            data: (d.data ?? []).map((p) => (p && typeof p === 'object' ? { x: +p.x, y: +p.y } : p)),
        }));
    `);
}

/** The sample of a dataset's data nearest to x (e.g. time in min): `sampleAt(ds.data, 20).y`. */
export function sampleAt(data, x) {
    return data.reduce((best, q) => (Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best));
}

/** A dataset from `datasets()` by exact label or RegExp; throws with the available labels if absent. */
export function pick(all, label) {
    const d = all.find((x) => (label instanceof RegExp ? label.test(x.label ?? '') : x.label === label));
    if (!d) throw new Error(`no dataset ${label} (have: ${all.map((x) => x.label).join(', ')})`);
    return d;
}

