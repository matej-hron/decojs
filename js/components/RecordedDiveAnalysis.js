/**
 * Recorded dive analysis page component.
 *
 * Opens Divesoft .DLF dive logs, lists them, and shows the selected dive in
 * DecoTheory's profile, P-P (M-value) and GF charts. GF sliders redraw the
 * limits over the fixed recorded profile; the summary panel reports how close
 * the dive came to them. Dives live only in the open page.
 */

import { parseDivesoftDLF } from '../import/divesoftDlf.js';
import { prepareRecordedSetup } from '../import/recordedDive.js';
import { analyzeRecordedDive, summarizeRecordedDive, CEILING_VIOLATION_TOLERANCE_M } from '../import/recordedDiveSummary.js';
import { MIN_GF_PERCENT, MAX_GF_PERCENT } from '../gfLimits.js';
import { GF_PRESETS } from '../gfPresets.js';
import { translate } from '../i18n.js';
import { fmtNum } from '../format.js';
import { escHtml } from '../utils/escHtml.js';

/** True for file names that look like Divesoft dive logs. */
export function isDlfFileName(name) {
    return /.\.dlf$/i.test(name ?? '');
}

/**
 * Parse every .DLF file among `files`; skip everything else.
 *
 * @param {Iterable<{name: string, arrayBuffer: () => Promise<ArrayBuffer>}>} files
 * @returns {Promise<{dives: Object[], errors: Array<{fileName: string, message: string}>}>}
 */
export async function loadDiveFiles(files) {
    const dives = [];
    const errors = [];
    for (const file of files) {
        if (!isDlfFileName(file.name)) continue;
        try {
            dives.push(parseDivesoftDLF(await file.arrayBuffer(), { fileName: file.name }));
        } catch (error) {
            errors.push({ fileName: file.name, message: error.message || String(error) });
        }
    }
    dives.sort((a, b) => {
        const na = a.source.diveNumber ?? Infinity;
        const nb = b.source.diveNumber ?? Infinity;
        if (na !== nb) return na - nb;
        return a.start.local.localeCompare(b.start.local);
    });
    return { dives, errors };
}

/**
 * Fetch demo DLF files into file-like objects.
 * @param {string[]} urls
 * @param {Function} [fetchImpl=fetch]
 * @returns {Promise<Array<{name: string, arrayBuffer: Function}>>}
 * @throws {Error} on a failed or non-ok response
 */
export async function fetchDemoFiles(urls, fetchImpl = (...a) => fetch(...a)) {
    return Promise.all(urls.map(async url => {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        return { name: url.split('/').pop(), arrayBuffer: async () => buffer };
    }));
}

/** Clamp a GF pair to the allowed range and make sure GF high is not below GF low. */
export function clampGfPair(gfLow, gfHigh) {
    const clamp = v => Math.min(MAX_GF_PERCENT, Math.max(MIN_GF_PERCENT, Math.round(Number(v) || 0)));
    const low = clamp(gfLow);
    return { gfLow: low, gfHigh: Math.max(low, clamp(gfHigh)) };
}

/** The GF the dive computer used, or 100/100 when the log has none. */
export function deviceGf(dive) {
    return { gfLow: dive.deco?.gfLow ?? 100, gfHigh: dive.deco?.gfHigh ?? 100 };
}

/** Only open-circuit dives with a profile can be analysed. */
export function canAnalyze(dive) {
    return dive.mode === 'oc' && dive.samples.length >= 2;
}

const t = (key, fallback) => translate(`sandbox.recorded.${key}`, fallback);
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');
const minSec = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export class RecordedDiveAnalysis {
    /**
     * @param {HTMLElement} root - Element the page UI is built in
     * @param {{demoFiles?: string[]}} [config] - URLs of example .DLF files loaded when nothing is picked
     */
    constructor(root, { demoFiles = [] } = {}) {
        this.root = root;
        this.demoFiles = demoFiles;
        this.dives = [];
        this.errors = [];
        this.isDemo = false;
        this.selected = null;
        this.gf = { gfLow: 100, gfHigh: 100 };
        this.charts = null;
        this._buildDom();
        document.addEventListener('languagechange', () => this._renderAll());
        this._loadDemo();
    }

    _buildDom() {
        this.root.innerHTML = `
            <section class="rda-open rda-card">
                <label class="rda-picker"><span data-i18n="sandbox.recorded.openFolder">Open a DIVELOG folder</span>
                    <input type="file" id="rda-folder" webkitdirectory></label>
                <label class="rda-picker"><span data-i18n="sandbox.recorded.openFiles">or pick .DLF files</span>
                    <input type="file" id="rda-files" multiple accept=".dlf,.DLF"></label>
                <p class="rda-status" id="rda-status"></p>
            </section>
            <section class="rda-list rda-card"><div><table class="rda-table">
                <thead><tr>
                    <th data-i18n="sandbox.recorded.colDive">#</th>
                    <th data-i18n="sandbox.recorded.colStart">Start (device time)</th>
                    <th data-i18n="sandbox.recorded.colDepth">Max depth</th>
                    <th data-i18n="sandbox.recorded.colDuration">Duration</th>
                    <th data-i18n="sandbox.recorded.colMode">Mode</th>
                    <th data-i18n="sandbox.recorded.colGf">GF</th>
                    <th data-i18n="sandbox.recorded.colWater">Water</th>
                    <th data-i18n="sandbox.recorded.colWarnings">Warnings</th>
                </tr></thead>
                <tbody id="rda-rows"></tbody>
            </table></div></section>
            <section class="rda-analysis" id="rda-analysis" hidden>
                <div class="rda-controls rda-card">
                    <h2 data-i18n="sandbox.recorded.gfHeading">Gradient factors</h2>
                    <label for="rda-gf-low">GF Low <output id="rda-gf-low-out"></output></label>
                    <input type="range" id="rda-gf-low" min="${MIN_GF_PERCENT}" max="${MAX_GF_PERCENT}" step="1">
                    <label for="rda-gf-high">GF High <output id="rda-gf-high-out"></output></label>
                    <input type="range" id="rda-gf-high" min="${MIN_GF_PERCENT}" max="${MAX_GF_PERCENT}" step="1">
                    <div class="rda-presets" id="rda-presets"></div>
                    <button type="button" class="btn btn-small btn-secondary" id="rda-reset" data-i18n="sandbox.recorded.resetGf">Reset to device GF</button>
                </div>
                <div class="rda-summary rda-card" id="rda-summary"></div>
                <p class="rda-note" id="rda-note" hidden></p>
                <div class="rda-charts" id="rda-charts">
                    <div class="chart-wrapper" id="rda-profile" style="height: 520px;"></div>
                    <div class="chart-wrapper" id="rda-mvalue" style="height: 640px;"></div>
                    <div class="chart-wrapper" id="rda-gf" style="height: 640px;"></div>
                </div>
                <details class="rda-help rda-card">
                    <summary data-i18n="sandbox.recorded.helpHeading">How the ceilings compare</summary>
                    <p data-i18n="sandbox.recorded.helpText"></p>
                </details>
            </section>`;
        const $ = id => this.root.querySelector(`#${id}`);
        this.el = {
            status: $('rda-status'), rows: $('rda-rows'), analysis: $('rda-analysis'),
            gfLow: $('rda-gf-low'), gfHigh: $('rda-gf-high'), gfLowOut: $('rda-gf-low-out'), gfHighOut: $('rda-gf-high-out'),
            presets: $('rda-presets'), reset: $('rda-reset'), summary: $('rda-summary'), note: $('rda-note'),
            charts: $('rda-charts'), profile: $('rda-profile'), mvalue: $('rda-mvalue'), gfChart: $('rda-gf'),
        };
        const pick = async (input) => {
            const result = await loadDiveFiles(input.files);
            this.isDemo = false;
            this._setDives(result);
        };
        $('rda-folder').addEventListener('change', e => pick(e.target));
        $('rda-files').addEventListener('change', e => pick(e.target));
        const onSlider = () => this._setGf(clampGfPair(this.el.gfLow.value, this.el.gfHigh.value));
        this.el.gfLow.addEventListener('input', onSlider);
        this.el.gfHigh.addEventListener('input', onSlider);
        this.el.reset.addEventListener('click', () => this.selected && this._setGf(deviceGf(this.selected)));
        this.el.presets.innerHTML = GF_PRESETS.map(p =>
            `<button type="button" class="btn btn-small btn-secondary" data-gf-low="${p.gfLow}" data-gf-high="${p.gfHigh}">${escHtml(translate(p.labelKey, p.label))}</button>`).join('');
        this.el.presets.addEventListener('click', e => {
            const btn = e.target.closest('button[data-gf-low]');
            if (btn) this._setGf(clampGfPair(btn.dataset.gfLow, btn.dataset.gfHigh));
        });
    }

    async _loadDemo() {
        if (this.demoFiles.length === 0) return;
        try {
            const files = await fetchDemoFiles(this.demoFiles);
            if (this.dives.length > 0) return; // the user picked files meanwhile
            const result = await loadDiveFiles(files);
            this.isDemo = true;
            this._setDives(result);
        } catch (error) {
            if (this.dives.length > 0) return;
            this._setDives({ dives: [], errors: [{ fileName: this.demoFiles[0]?.split('/').pop() ?? '', message: error.message || String(error) }] });
        }
    }

    _setDives({ dives, errors }) {
        this.dives = dives;
        this.errors = errors;
        this.selected = null;
        this._renderList();
        if (dives.length > 0) this._select(dives.at(-1));
        else this.el.analysis.hidden = true;
    }

    _select(dive) {
        this.selected = dive;
        this._renderList();
        this._setGf(deviceGf(dive));
    }

    _setGf(gf) {
        this.gf = gf;
        this.el.gfLow.value = gf.gfLow;
        this.el.gfHigh.value = gf.gfHigh;
        this.el.gfLowOut.textContent = `${gf.gfLow}\u00a0%`;
        this.el.gfHighOut.textContent = `${gf.gfHigh}\u00a0%`;
        this._renderAnalysis();
    }

    _renderAll() {
        this._renderList();
        this._renderAnalysis();
    }

    _renderList() {
        const statusParts = [];
        if (this.isDemo) statusParts.push(t('demoNote', 'Showing example dives. Open your own DIVELOG folder above.'));
        if (this.dives.length === 0) statusParts.push(t('noDives', 'No dive logs found. Pick the DIVELOG folder from the dive computer, or its .DLF files.'));
        for (const e of this.errors) statusParts.push(fill(t('unreadable', 'Could not read {0}: {1}'), e.fileName, e.message));
        this.el.status.innerHTML = statusParts.map(s => `<span>${escHtml(s)}</span>`).join('<br>');

        this.el.rows.innerHTML = '';
        for (const dive of this.dives) {
            const tr = document.createElement('tr');
            if (dive === this.selected) tr.classList.add('rda-selected');
            const gf = dive.deco?.gfLow != null ? `${dive.deco.gfLow}/${dive.deco.gfHigh}` : '–';
            tr.innerHTML = `
                <td>${escHtml(String(dive.source.diveNumber ?? dive.source.fileName))}</td>
                <td>${escHtml(dive.start.local.replace('T', ' '))}</td>
                <td class="num">${fmtNum(dive.maxDepth, 1)}\u00a0m</td>
                <td class="num">${minSec(dive.duration)}</td>
                <td>${escHtml(dive.mode)}</td>
                <td>${gf}</td>
                <td>${escHtml(dive.environment.waterSetting ?? '–')}</td>
                <td class="rda-warn">${escHtml(dive.warnings.join(', '))}</td>`;
            tr.tabIndex = 0;
            tr.addEventListener('click', () => this._select(dive));
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') this._select(dive); });
            this.el.rows.appendChild(tr);
        }
    }

    _renderAnalysis() {
        const dive = this.selected;
        if (!dive) return;
        this.el.analysis.hidden = false;
        if (!canAnalyze(dive)) {
            this.el.charts.hidden = true;
            this.el.summary.innerHTML = '';
            this.el.note.hidden = false;
            this.el.note.textContent = dive.samples.length < 2
                ? t('noSamplesNote', 'This log has no depth profile to analyse.')
                : fill(t('nonOcNote', 'Analysis currently supports open-circuit dives only (this dive: {0}).'), dive.mode);
            return;
        }
        this.el.charts.hidden = false;
        const { setup, deviceCeiling } = prepareRecordedSetup(dive, this.gf);
        const summary = summarizeRecordedDive(analyzeRecordedDive(setup));
        this._renderSummary(dive, summary);
        this._renderCharts(setup, deviceCeiling, dive);
    }

    _renderSummary(dive, s) {
        const pct = v => `${fmtNum(v * 100, 0)}\u00a0%`;
        const device = deviceGf(dive);
        const rows = [
            [t('peakGf', 'Peak tissue GF during the dive'), s.peakGf
                ? fill(t('peakGfValue', '{0} (compartment {1} at {2}\u00a0min)'), pct(s.peakGf.value), s.peakGf.compartment, fmtNum(s.peakGf.t, 1))
                : '–'],
            [t('surfaceGf', 'Surface GF at the end'), s.surfaceGfEnd
                ? fill(t('surfaceGfValue', '{0} (compartment {1})'), pct(s.surfaceGfEnd.value), s.surfaceGfEnd.compartment)
                : t('surfaceGfNone', 'no tissue supersaturated')],
            [t('aboveCeiling', 'Time above ceiling'), s.aboveCeiling.seconds > 0
                ? fill(t('aboveCeilingValue', '{0} (up to {1}\u00a0m above)'), minSec(s.aboveCeiling.seconds), fmtNum(s.aboveCeiling.worstM, 1))
                : t('aboveCeilingNone', 'none — the dive stayed below the ceiling')],
            [t('decoObligation', 'Deco obligation'), s.deco
                ? fill(t('decoValue', 'deepest ceiling {0}\u00a0m, from {1} to {2}\u00a0min'), fmtNum(s.deco.maxCeiling, 1), fmtNum(s.deco.start, 1), fmtNum(s.deco.end, 1))
                : t('noDeco', 'no deco')],
        ];
        this.el.summary.innerHTML = `<h2>${escHtml(t('summaryHeading', 'At this GF'))}</h2><dl>${
            rows.map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd>`).join('')}</dl>`;
        const differs = this.gf.gfLow !== device.gfLow || this.gf.gfHigh !== device.gfHigh;
        this.el.note.hidden = !differs;
        this.el.note.textContent = differs
            ? fill(t('gfDiffers', 'GF {0}/{1} differs from the GF {2}/{3} the dive computer used. Its dashed ceiling still shows its own GF.'),
                this.gf.gfLow, this.gf.gfHigh, device.gfLow, device.gfHigh)
            : '';
    }

    async _renderCharts(setup, deviceCeiling, dive) {
        if (!this.charts) {
            const [{ DiveProfileChart }, { MValueChart }, { GFChart }] = await Promise.all([
                import('../charts/DiveProfileChart.js'),
                import('../charts/MValueChart.js'),
                import('../charts/GFChart.js'),
            ]);
            if (this.charts) return this._renderCharts(setup, deviceCeiling, dive);
            this.charts = {
                profile: new DiveProfileChart(this.el.profile, {
                    diveSetup: setup,
                    options: {
                        showCeiling: true, showLabels: false, showDecoStops: false, showGasSwitches: true,
                        highlightCeilingViolations: true, violationToleranceM: CEILING_VIOLATION_TOLERANCE_M,
                        referenceCeiling: deviceCeiling.length ? deviceCeiling : null,
                        referenceCeilingLabel: this._deviceCeilingLabel(dive),
                    },
                }),
                mvalue: new MValueChart(this.el.mvalue, {
                    diveSetup: setup,
                    options: { compartments: [1], showMValueLines: true, showGFLines: true, showAmbientLine: true, showTrail: true, compartmentSelector: true },
                }),
                gf: new GFChart(this.el.gfChart, {
                    diveSetup: setup,
                    options: { compartments: [1, 2, 3, 4, 5, 6], showTrail: true, compartmentSelector: true },
                }),
            };
            this._chartsDive = dive;
            this.charts.mvalue.options.onTimeIndexChange = i => this.charts.gf.setTimeIndex(i);
            this.charts.gf.options.onTimeIndexChange = i => this.charts.mvalue.setTimeIndex(i);
            return;
        }
        this.charts.profile.update(setup, {
            referenceCeiling: deviceCeiling.length ? deviceCeiling : null,
            referenceCeilingLabel: this._deviceCeilingLabel(dive),
        });
        // Keep the timeline position when only GF changed; reset for a different dive.
        const index = this._chartsDive === dive ? this.charts.mvalue.currentTimeIndex : 0;
        this._chartsDive = dive;
        this.charts.mvalue.update(setup);
        this.charts.gf.update(setup);
        this.charts.mvalue.setTimeIndex(index);
        this.charts.gf.setTimeIndex(index);
    }

    _deviceCeilingLabel(dive) {
        const gf = deviceGf(dive);
        return fill(t('deviceCeilingLabel', 'Dive computer ceiling, GF {0}/{1} (m)'), gf.gfLow, gf.gfHigh);
    }
}
