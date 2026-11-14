/**
 * TissueSaturationSim — interactive single-diver physics playground.
 *
 * The learner drives a diver: slider depth changes and gas switches are
 * applied instantly, while typed depth waits briefly for input to settle.
 * Tissue saturation follows exponentially. The
 * simulator composes primitives from decoModel.js and tissueCompartments.js;
 * no new physics is introduced here.
 *
 * Time model: each wall-clock tick (100 ms) advances simulated time by
 * `0.1 * speed` minutes. 1× = 1 min/sec, 60× = 1 h/sec. Step buttons
 * advance/rewind by a fixed minute increment.
 *
 * Rewind re-simulates from t=0 over a preserved action log — tissues
 * cannot be reliably un-integrated, so we replay.
 */

import {
    getAmbientPressure,
    getAlveolarN2Pressure,
    getInitialTissueN2,
    haldaneEquation,
    SURFACE_PRESSURE,
    WATER_VAPOR_PRESSURE
} from '../decoModel.js';
import { COMPARTMENTS } from '../tissueCompartments.js';
import { PREDEFINED_GASES } from '../diveSetup.js';
import { translate } from '../i18n.js';

import { fmtNum } from '../format.js';
/** Helper: replace {0}, {1}, ... placeholders with the given values. */
function fmt(str, ...values) {
    return String(str).replace(/\{(\d+)\}/g, (_, i) => {
        const v = values[Number(i)];
        return v === undefined ? '' : String(v);
    });
}

const TICK_MS = 100;
const MIN_PER_TICK_AT_1X = 0.1;         // 100 ms tick × 1× = 0.1 sim-min
const HISTORY_WINDOW_MIN = 45;          // rolling chart window
const STEP_BUTTON_MINUTES = 1;          // forward/backward button increment
const DEPTH_INPUT_DEBOUNCE_MS = 250;

// Three representative compartments. Indices into COMPARTMENTS (1-based id).
const TRACKED_COMPARTMENT_IDS = [1, 5, 12];

// Alert thresholds — kept literal on purpose, see plan's "out of scope".
const PPO2_DECO_LIMIT = 1.6;
const PPO2_REC_LIMIT = 1.4;
const PPO2_HYPOXIA = 0.18;
const PPN2_NARCOSIS = 4.0;

/** Dlaždice simulátoru: klíč popisku, výchozí popisek, údaj, výchozí hodnota, třída navíc. */
const TILES = [
    ['sandbox.tissue.readout.depth', 'Depth', 'depth', '0.0\u00a0m'],
    ['sandbox.tissue.readout.pAmb', '<var>p</var><sub>amb</sub>', 'pAmb', '1.00\u00a0bar'],
    ['sandbox.tissue.readout.gas', 'Gas', 'gas', 'Air'],
    ['sandbox.tissue.readout.pO2', '<var>p</var><sub>O₂</sub>', 'pO2', '0.21\u00a0bar'],
    ['sandbox.tissue.readout.pN2Inspired', '<var>p</var><sub>N₂</sub> inspired', 'pN2Insp', '0.79\u00a0bar'],
    ['sandbox.tissue.readout.pN2Alveolar', '<var>p</var><sub>N₂</sub> alveolar', 'pN2Alv', '0.74\u00a0bar'],
    ['sandbox.tissue.readout.tcFast', 'TC1 • fast • <var>t</var><sub>1/2</sub> = 5\u00a0min', 'pFast', '0.74\u00a0bar', ' tsim-tile-fast'],
    ['sandbox.tissue.readout.tcMed', 'TC5 • medium • <var>t</var><sub>1/2</sub> = 27\u00a0min', 'pMed', '0.74\u00a0bar', ' tsim-tile-med'],
    ['sandbox.tissue.readout.tcSlow', 'TC12 • slow • <var>t</var><sub>1/2</sub> = 239\u00a0min', 'pSlow', '0.74\u00a0bar', ' tsim-tile-slow'],
    ['sandbox.tissue.readout.time', 'Sim time', 'time', '0:00'],
];

/**
 * Ovládání, čísla, hlášky a plátno grafu simulátoru. Jedna definice pro Pískoviště
 * (`sandbox/tissue-saturation.html`) i pro překryv v kurzu P1 (Henry, slide 46).
 *
 * Pískoviště: výchozí `t` je jazyk webu a prvky nesou `data-i18n`, takže je přepnutí jazyka přeloží znovu.
 * Kurz: `t` je pevný překladač (`createTranslator('cs')`) a `i18n: false`, takže zůstanou česky.
 * @param {HTMLElement} root prázdný prvek; dostane třídy `tsim-root tsim-layout`
 * @param {{t?: (key: string, fallback?: string) => string, i18n?: boolean}} [options]
 */
export function renderTissueSimMarkup(root, { t = translate, i18n = true } = {}) {
    // Text prvku z překladu; atribut data-i18n jen tam, kde se má překládat s webem.
    const tx = (key, fallback) => `${i18n ? ` data-i18n="${key}"` : ''}>${t(key, fallback)}`;
    const tile = (key, fallback, readout, value, extra = '') => `
                    <div class="tsim-tile${extra}">
                        <span class="tsim-tile-label"${tx(key, fallback)}</span>
                        <span class="tsim-tile-value" data-tsim-readout="${readout}">${value}</span>
                    </div>`;
    root.classList.add('tsim-root', 'tsim-layout');
    root.innerHTML = `
            <aside class="tsim-controls">
                <div class="tsim-control-block">
                    <label class="tsim-label"${tx('sandbox.tissue.depth', 'Depth')}</label>
                    <div class="tsim-depth-row">
                        <input type="range" class="tsim-depth-slider" min="0" max="40" step="1" value="0" aria-label="Depth in meters">
                        <input type="number" class="tsim-depth-input" min="0" max="40" step="1" value="0" aria-label="Depth in meters">
                        <span class="tsim-unit">m</span>
                    </div>
                    <div class="tsim-depth-hint"${tx('sandbox.tissue.depthHint', '0–40\u00a0m. Typed values apply after a brief pause; the slider is immediate.')}</div>
                </div>

                <div class="tsim-control-block">
                    <label class="tsim-label"${tx('sandbox.tissue.gas', 'Breathing gas')}</label>
                    <select class="tsim-gas-select">
                        <option value="air"${tx('sandbox.tissue.gases.air', 'Air (21/79)')}</option>
                        <option value="ean32"${tx('sandbox.tissue.gases.ean32', 'EAN32')}</option>
                        <option value="ean36"${tx('sandbox.tissue.gases.ean36', 'EAN36')}</option>
                        <option value="ean50"${tx('sandbox.tissue.gases.ean50', 'EAN50')}</option>
                        <option value="ean80"${tx('sandbox.tissue.gases.ean80', 'EAN80')}</option>
                        <option value="o2"${tx('sandbox.tissue.gases.o2', 'O₂ 100%')}</option>
                    </select>
                </div>

                <div class="tsim-control-block">
                    <label class="tsim-label"${tx('sandbox.tissue.speed', 'Speed')}</label>
                    <div class="tsim-speed-row">
                        <button class="btn btn-small tsim-speed-btn active" data-speed="1">1×</button>
                        <button class="btn btn-small tsim-speed-btn" data-speed="5">5×</button>
                        <button class="btn btn-small tsim-speed-btn" data-speed="10">10×</button>
                        <button class="btn btn-small tsim-speed-btn" data-speed="60">60×</button>
                    </div>
                    <div class="tsim-speed-hint"${tx('sandbox.tissue.speedHint', '1× = 1 sim-minute per real second.')}</div>
                </div>

                <div class="tsim-control-block">
                    <label class="tsim-label"${tx('sandbox.tissue.time', 'Time')}</label>
                    <div class="tsim-time-row">
                        <button class="btn btn-small tsim-step-back-btn" title="Step back 1\u00a0min (←)"${tx('sandbox.tissue.timeButtons.back', '◀ 1\u00a0min')}</button>
                        <button class="btn btn-small tsim-play-btn" title="Play / Pause (Space)">▶</button>
                        <button class="btn btn-small tsim-step-fwd-btn" title="Step forward 1\u00a0min (→)"${tx('sandbox.tissue.timeButtons.forward', '1\u00a0min ▶')}</button>
                    </div>
                    <div class="tsim-speed-hint"${tx('sandbox.tissue.keyboardHint', 'Keyboard: ← / → to step, Space to play/pause.')}</div>
                    <button class="btn btn-small btn-secondary tsim-reset-btn" style="margin-top:0.5rem;"${tx('sandbox.tissue.timeButtons.reset', 'Reset')}</button>
                </div>
            </aside>

            <section class="tsim-readouts">
                <div class="tsim-numbers">${TILES.map(args => tile(...args)).join('')}
                </div>

                <div class="tsim-alerts">
                    <div class="tsim-alert tsim-alert-ok"${tx('sandbox.tissue.alertOk', 'No partial-pressure warning: <var>p</var><sub>O₂</sub> is 0.18–1.4\u00a0bar and <var>p</var><sub>N₂</sub> does not exceed 4.0\u00a0bar.')}</div>
                </div>

                <div class="tsim-chart">
                    <canvas></canvas>
                </div>
            </section>`;
}

export class TissueSaturationSim {
    /**
     * @param {HTMLElement} root prvek s ovládáním a čísly (viz `renderTissueSimMarkup`)
     * @param {Object} [options] výchozí hodnoty chovají simulátor jako v Pískovišti
     * @param {(key: string, fallback?: string) => string} [options.t] překladač pro pevný jazyk
     *        (kurz P1: čeština i na anglickém webu); bez něj jazyk webu a přepnutí jazyka
     * @param {string} [options.lang] jazyk čísel (desetinná čárka), bez něj jazyk webu
     * @param {number} [options.depth=0] počáteční hloubka v m (předvolba z kurzu)
     * @param {() => boolean} [options.keyboardActive] klávesy ← → a mezerník jen když vrátí true
     *        (kurz: jen v otevřeném překryvu, jinak šipky přepínají slidy)
     */
    constructor(root, options = {}) {
        this.root = root;
        this.tr = options.t ?? translate;
        this.lang = options.lang;
        this.initialDepth = Math.max(0, Math.min(40, Number(options.depth) || 0));
        this.keyboardActive = options.keyboardActive ?? (() => true);
        this._collectDom();
        this._initChart();
        this._initState();
        this._wireControls();
        this._renderAll();
        this._startLoop();

        // Re-render alerts and retranslate chart labels on language change.
        const tr = this.tr;
        this._onLanguageChange = () => {
            const ds = this.chart && this.chart.data && this.chart.data.datasets;
            if (ds) {
                ds[0].label = tr('tissueSim.chartLabels.pAmb', 'Ambient pressure');
                ds[1].label = tr('tissueSim.chartLabels.pN2Alveolar', 'Alveolar pN₂');
                ds[2].label = tr('tissueSim.chartLabels.tcFast', 'TC1 fast (half-time 5\u00a0min)');
                ds[3].label = tr('tissueSim.chartLabels.tcMed', 'TC5 medium (half-time 27\u00a0min)');
                ds[4].label = tr('tissueSim.chartLabels.tcSlow', 'TC12 slow (half-time 239\u00a0min)');
            }
            if (this.chart && this.chart.options && this.chart.options.scales) {
                const s = this.chart.options.scales;
                if (s.x && s.x.title) s.x.title.text = tr('chart.axes.timeMin', 'Time (min)');
                if (s.y && s.y.title) s.y.title.text = tr('chart.axes.pressureBar', 'Pressure (bar)');
                if (s.yDepth && s.yDepth.title) s.yDepth.title.text = tr('chart.axes.depthEquivalent', 'Depth equivalent (m)');
            }
            this._renderAlerts();
            this._renderNumbers();
            if (this.chart) this.chart.update('none');
        };
        // Pevný jazyk (options.t) se přepnutím jazyka webu nemění.
        if (!options.t) document.addEventListener('languagechange', this._onLanguageChange);
    }

    /** Číslo v jazyce simulátoru. */
    _num(value, decimals) {
        return fmtNum(value, decimals, this.lang);
    }

    _collectDom() {
        const $ = (sel) => this.root.querySelector(sel);
        this.depthSlider = $('.tsim-depth-slider');
        this.depthInput  = $('.tsim-depth-input');
        this.gasSelect   = $('.tsim-gas-select');
        this.speedButtons = this.root.querySelectorAll('.tsim-speed-btn');
        this.playBtn     = $('.tsim-play-btn');
        this.stepBackBtn = $('.tsim-step-back-btn');
        this.stepFwdBtn  = $('.tsim-step-fwd-btn');
        this.resetBtn    = $('.tsim-reset-btn');
        this.readouts = {
            depth:    $('[data-tsim-readout="depth"]'),
            pAmb:     $('[data-tsim-readout="pAmb"]'),
            gas:      $('[data-tsim-readout="gas"]'),
            pO2:      $('[data-tsim-readout="pO2"]'),
            pN2Insp:  $('[data-tsim-readout="pN2Insp"]'),
            pN2Alv:   $('[data-tsim-readout="pN2Alv"]'),
            pFast:    $('[data-tsim-readout="pFast"]'),
            pMed:     $('[data-tsim-readout="pMed"]'),
            pSlow:    $('[data-tsim-readout="pSlow"]'),
            time:     $('[data-tsim-readout="time"]'),
        };
        this.alertsEl = $('.tsim-alerts');
        this.canvas   = $('.tsim-chart canvas');
    }

    _initState() {
        const initialGasId = this.gasSelect.value || 'air';
        const gas = this._lookupGas(initialGasId);
        const initialN2 = getInitialTissueN2(gas.n2);

        this.depthSlider.value = this.initialDepth;
        this.depthInput.value = this.initialDepth;
        this.state = {
            depth: this.initialDepth,
            gas,
            speed: 1,
            // Start paused so the learner can arrange depth/gas first,
            // then press play to watch tissues respond.
            isPlaying: false,
            time: 0,
            tissues: {}                // pN per compartment id
        };
        for (const c of COMPARTMENTS) this.state.tissues[c.id] = initialN2;

        // history for chart: array of {t, depth, pAlv, pFast, pMed, pSlow}
        this.history = [];
        this._snapshot();
    }

    _lookupGas(id) {
        return PREDEFINED_GASES.find(g => g.id === id) || PREDEFINED_GASES[0];
    }

    _wireControls() {
        // Depth — slider and number input kept in sync.
        // Hlášky se počítají ze stejného `state` jako čísla, takže se musí
        // překreslit spolu s nimi. Bez toho se údaj obarvil jako kritický,
        // ale text hlášky přišel až s dalším tikem hodin.
        const applyDepthChange = (rawVal) => {
            clearTimeout(this.depthInputDebounceHandle);
            this.depthInputDebounceHandle = null;
            const d = Math.max(0, Math.min(40, Number(rawVal) || 0));
            this.state.depth = d;
            this.depthSlider.value = d;
            this.depthInput.value = d;
            this._renderNumbers();
            this._renderAlerts();
        };
        const scheduleDepthChange = (rawVal) => {
            clearTimeout(this.depthInputDebounceHandle);
            this.depthInputDebounceHandle = setTimeout(
                () => applyDepthChange(rawVal),
                DEPTH_INPUT_DEBOUNCE_MS
            );
        };
        const flushDepthInput = () => {
            if (!this.depthInputDebounceHandle) return;
            applyDepthChange(this.depthInput.value);
        };
        this._applyDepthChange = applyDepthChange;
        this.depthSlider.addEventListener('input', (e) => applyDepthChange(e.target.value));
        this.depthInput.addEventListener('input', (e) => scheduleDepthChange(e.target.value));
        this.depthInput.addEventListener('change', flushDepthInput);
        this.depthInput.addEventListener('blur', flushDepthInput);
        this.depthInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') flushDepthInput();
        });

        this.gasSelect.addEventListener('change', (e) => {
            this.state.gas = this._lookupGas(e.target.value);
            this._renderNumbers();
            this._renderAlerts();
        });

        this.speedButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const s = Number(btn.dataset.speed);
                this.state.speed = s;
                this.speedButtons.forEach(b => b.classList.toggle('active', b === btn));
            });
        });

        this.playBtn.addEventListener('click',    () => this._togglePlay());
        this.stepBackBtn.addEventListener('click', () => this._stepBackward(STEP_BUTTON_MINUTES));
        this.stepFwdBtn.addEventListener('click',  () => this._stepForward(STEP_BUTTON_MINUTES));
        this.resetBtn.addEventListener('click',   () => this._reset());

        // Keyboard shortcuts — skip when the user is typing in the number
        // input or interacting with the slider / select.
        this._onKey = (e) => {
            if (!this.keyboardActive()) return;
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft')  { this._stepBackward(STEP_BUTTON_MINUTES); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { this._stepForward(STEP_BUTTON_MINUTES);  e.preventDefault(); }
            else if (e.key === ' ' || e.code === 'Space') { this._togglePlay(); e.preventDefault(); }
        };
        window.addEventListener('keydown', this._onKey);
    }

    _togglePlay() {
        this.state.isPlaying = !this.state.isPlaying;
        this.playBtn.textContent = this.state.isPlaying ? '⏸' : '▶';
    }

    _stepForward(minutes) {
        // Advance sim by N minutes in a single integration chunk.
        this._integrate(minutes);
        this._snapshot();
        this._renderAll();
    }

    _stepBackward(minutes) {
        // Can't truly reverse exponential saturation without the input log.
        // Trim the last `minutes` from history and reconstruct tissue state
        // from the nearest snapshot — conservative: just reset N2 to the
        // snapshot we took at that time, if the history reaches that far.
        const targetTime = Math.max(0, this.state.time - minutes);
        const idx = this.history.findIndex(h => h.t >= targetTime);
        if (idx < 0) {
            this._reset();
            return;
        }
        const snap = this.history[idx];
        this.state.time = snap.t;
        // Rehydrate tracked compartments directly; for the rest, leave them
        // as they are. This is a visualization aid, not a physics feature —
        // the approximation is acceptable for a teaching toy, and the
        // common case is step back by a minute or two while paused.
        for (const c of COMPARTMENTS) {
            if (snap.tissuesAll && snap.tissuesAll[c.id] !== undefined) {
                this.state.tissues[c.id] = snap.tissuesAll[c.id];
            }
        }
        this.history = this.history.slice(0, idx + 1);
        this._renderAll();
    }

    _reset() {
        clearTimeout(this.depthInputDebounceHandle);
        this.depthInputDebounceHandle = null;
        const initialN2 = getInitialTissueN2(this.state.gas.n2);
        this.state.time = 0;
        this.state.depth = 0;
        this.depthSlider.value = 0;
        this.depthInput.value = 0;
        for (const c of COMPARTMENTS) this.state.tissues[c.id] = initialN2;
        this.history = [];
        this._snapshot();
        this._renderAll();
    }

    _startLoop() {
        if (this.tickHandle) clearInterval(this.tickHandle);
        this.tickHandle = setInterval(() => {
            if (!this.state.isPlaying) return;
            const dtMin = MIN_PER_TICK_AT_1X * this.state.speed;
            this._integrate(dtMin);
            this._snapshot();
            this._renderAll();
        }, TICK_MS);
    }

    _integrate(dtMin) {
        const ambient = getAmbientPressure(this.state.depth);
        const alvN2 = getAlveolarN2Pressure(ambient, this.state.gas.n2);
        for (const c of COMPARTMENTS) {
            this.state.tissues[c.id] = haldaneEquation(
                this.state.tissues[c.id], alvN2, dtMin, c.halfTime
            );
        }
        this.state.time += dtMin;
    }

    _snapshot() {
        const ambient = getAmbientPressure(this.state.depth);
        const alvN2 = getAlveolarN2Pressure(ambient, this.state.gas.n2);
        const row = {
            t: this.state.time,
            depth: this.state.depth,
            pAmb: ambient,
            pAlv: alvN2,
            pFast: this.state.tissues[TRACKED_COMPARTMENT_IDS[0]],
            pMed:  this.state.tissues[TRACKED_COMPARTMENT_IDS[1]],
            pSlow: this.state.tissues[TRACKED_COMPARTMENT_IDS[2]],
            tissuesAll: { ...this.state.tissues }
        };
        this.history.push(row);
        // Trim history to the chart window plus a buffer for step-back.
        const cutoff = this.state.time - HISTORY_WINDOW_MIN * 3;
        while (this.history.length > 1 && this.history[0].t < cutoff) {
            this.history.shift();
        }
    }

    _renderAll() {
        this._renderNumbers();
        this._renderAlerts();
        this._renderChart();
        this._renderTimeDisplay();
    }

    _renderTimeDisplay() {
        this.readouts.time.textContent = this._formatTime(this.state.time);
    }

    _formatTime(min) {
        const m = Math.floor(min);
        const s = Math.round((min - m) * 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    _renderNumbers() {
        const { depth, gas, tissues } = this.state;
        const ambient = getAmbientPressure(depth);
        const pN2Insp = ambient * gas.n2;
        const pN2Alv = getAlveolarN2Pressure(ambient, gas.n2);
        const pO2 = ambient * gas.o2;

        this.readouts.depth.textContent = `${this._num(depth, 1)}\u00a0m`;
        this.readouts.pAmb.textContent  = `${this._num(ambient, 2)}\u00a0bar`;
        const selectedGas = this.gasSelect.options[this.gasSelect.selectedIndex];
        this.readouts.gas.textContent = selectedGas ? selectedGas.textContent : gas.name;
        this.readouts.pO2.textContent   = `${this._num(pO2, 2)}\u00a0bar`;
        this.readouts.pN2Insp.textContent = `${this._num(pN2Insp, 2)}\u00a0bar`;
        this.readouts.pN2Alv.textContent  = `${this._num(pN2Alv, 2)}\u00a0bar`;
        this.readouts.pFast.textContent = `${this._num(tissues[TRACKED_COMPARTMENT_IDS[0]], 2)}\u00a0bar`;
        this.readouts.pMed.textContent  = `${this._num(tissues[TRACKED_COMPARTMENT_IDS[1]], 2)}\u00a0bar`;
        this.readouts.pSlow.textContent = `${this._num(tissues[TRACKED_COMPARTMENT_IDS[2]], 2)}\u00a0bar`;

        this._colourPpO2(pO2);
    }

    _colourPpO2(pO2) {
        const el = this.readouts.pO2;
        el.classList.remove('tsim-critical', 'tsim-warn', 'tsim-hypoxic');
        if (pO2 > PPO2_DECO_LIMIT) el.classList.add('tsim-critical');
        else if (pO2 > PPO2_REC_LIMIT) el.classList.add('tsim-warn');
        else if (pO2 < PPO2_HYPOXIA) el.classList.add('tsim-hypoxic');
    }

    _renderAlerts() {
        const tr = this.tr;
        const { depth, gas } = this.state;
        const ambient = getAmbientPressure(depth);
        const pO2 = ambient * gas.o2;
        const pN2Insp = ambient * gas.n2;
        const alerts = [];
        if (pO2 > PPO2_DECO_LIMIT) {
            alerts.push({ level: 'critical',
                html: fmt(tr('tissueSim.ppO2OxygenToxicity',
                    '<var>p</var><sub>O₂</sub> {0}\u00a0bar — oxygen toxicity (deco limit {1}\u00a0bar)'),
                    this._num(pO2, 2), this._num(PPO2_DECO_LIMIT, 1)) });
        } else if (pO2 > PPO2_REC_LIMIT) {
            alerts.push({ level: 'warn',
                html: fmt(tr('tissueSim.ppO2AboveRec',
                    '<var>p</var><sub>O₂</sub> {0}\u00a0bar — above recreational limit {1}\u00a0bar'),
                    this._num(pO2, 2), this._num(PPO2_REC_LIMIT, 1)) });
        }
        if (pO2 < PPO2_HYPOXIA) {
            alerts.push({ level: 'critical',
                html: fmt(tr('tissueSim.ppO2Hypoxic',
                    '<var>p</var><sub>O₂</sub> {0}\u00a0bar — hypoxic (< {1}\u00a0bar)'),
                    this._num(pO2, 2), this._num(PPO2_HYPOXIA, 2)) });
        }
        if (pN2Insp > PPN2_NARCOSIS) {
            alerts.push({ level: 'warn',
                html: fmt(tr('tissueSim.ppN2Narcosis',
                    '<var>p</var><sub>N₂</sub> {0}\u00a0bar — nitrogen narcosis likely (> {1}\u00a0bar)'),
                    this._num(pN2Insp, 2), this._num(PPN2_NARCOSIS, 1)) });
        }
        const okText = tr(
            'tissueSim.alertOk',
            'No partial-pressure warning: <var>p</var><sub>O₂</sub> is 0.18–1.4\u00a0bar and <var>p</var><sub>N₂</sub> does not exceed 4.0\u00a0bar.'
        );
        this.alertsEl.innerHTML = alerts.length === 0
            ? `<div class="tsim-alert tsim-alert-ok">${okText}</div>`
            : alerts.map(a => `<div class="tsim-alert tsim-alert-${a.level}">${a.html}</div>`).join('');
    }

    _initChart() {
        // Chart.js is loaded via <script> in the HTML; use the global.
        // Two Y axes: left = partial pressure (bar), right = depth (m, inverted).
        const tr = this.tr;
        const ctx = this.canvas.getContext('2d');
        const tsEl = this.root.closest('section') || this.root;
        const colFast = COMPARTMENTS.find(c => c.id === TRACKED_COMPARTMENT_IDS[0]).color;
        const colMed  = COMPARTMENTS.find(c => c.id === TRACKED_COMPARTMENT_IDS[1]).color;
        const colSlow = COMPARTMENTS.find(c => c.id === TRACKED_COMPARTMENT_IDS[2]).color;

        // Single pressure axis. pAmb is plotted as a soft grey fill from 0
        // up to the current ambient pressure — this doubles as the depth
        // indicator (pAmb − 1 bar per 10 m of depth). Ticks on the right
        // edge re-label pAmb values as equivalent depths so the learner
        // can read both without the two axes drifting out of alignment.
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    // pAmb drawn first so fill sits under the other curves.
                    { label: tr('tissueSim.chartLabels.pAmb', 'Ambient pressure'), data: [], borderColor: 'rgba(127,140,141,0.8)',
                      backgroundColor: 'rgba(127,140,141,0.15)',
                      borderWidth: 2, pointRadius: 0, yAxisID: 'y', fill: true, tension: 0 },
                    { label: tr('tissueSim.chartLabels.pN2Alveolar', 'Alveolar pN₂'),  data: [], borderColor: '#2c3e50',
                      borderDash: [6,4], borderWidth: 1.5, pointRadius: 0, yAxisID: 'y' },
                    { label: tr('tissueSim.chartLabels.tcFast', 'TC1 fast (half-time 5\u00a0min)'),     data: [], borderColor: colFast, borderWidth: 2.5, pointRadius: 0, yAxisID: 'y' },
                    { label: tr('tissueSim.chartLabels.tcMed', 'TC5 medium (half-time 27\u00a0min)'),  data: [], borderColor: colMed,  borderWidth: 2.5, pointRadius: 0, yAxisID: 'y' },
                    { label: tr('tissueSim.chartLabels.tcSlow', 'TC12 slow (half-time 239\u00a0min)'),  data: [], borderColor: colSlow, borderWidth: 2.5, pointRadius: 0, yAxisID: 'y' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', axis: 'x', intersect: false },
                animation: false,
                scales: {
                    x: { type: 'linear',
                         title: { display: true, text: tr('chart.axes.timeMin', 'Time (min)') },
                         ticks: { maxTicksLimit: 10 } },
                    y: { type: 'linear', position: 'left',
                         // Fixed range so tissue movement is always in context
                         // and the axis doesn't rescale on every tick.
                         // 0–5 bar = 0–40 m depth equivalent, matches the
                         // slider range and covers typical recreational /
                         // early-tech profiles comfortably.
                         min: 0, max: 5,
                         title: { display: true, text: tr('chart.axes.pressureBar', 'Pressure (bar)') } },
                    // Companion right-side axis: reads the SAME pressure
                    // values, but tick labels are rewritten as equivalent
                    // depth (m). Because it's the same scale, "surface"
                    // (pAmb = 1, depth = 0) aligns on both sides.
                    yDepth: { type: 'linear', position: 'right',
                              min: 0, max: 5,
                              title: { display: true, text: tr('chart.axes.depthEquivalent', 'Depth equivalent (m)') },
                              grid: { drawOnChartArea: false },
                              ticks: {
                                  stepSize: 1,
                                  callback: (v) => {
                                      // pAmb = 1 + depth/10 ⇒ depth = (pAmb − 1) × 10
                                      const d = Math.round((v - 1) * 10);
                                      return d < 0 ? '' : `${d}\u00a0m`;
                                  }
                              }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: { boxWidth: 18, boxHeight: 3, usePointStyle: false, font: { size: 11 } }
                    },
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            label: (ctx) => fmt(
                                tr('tissueSim.tooltipLabel', '{0}: {1}\u00a0bar'),
                                ctx.dataset.label, this._num(ctx.parsed.y, 2)
                            )
                        }
                    }
                }
            }
        });
    }

    _renderChart() {
        const maxT = this.state.time;
        const minT = Math.max(0, maxT - HISTORY_WINDOW_MIN);
        const rows = this.history.filter(r => r.t >= minT);
        const ds = this.chart.data.datasets;
        ds[0].data = rows.map(r => ({ x: r.t, y: r.pAmb }));
        ds[1].data = rows.map(r => ({ x: r.t, y: r.pAlv }));
        ds[2].data = rows.map(r => ({ x: r.t, y: r.pFast }));
        ds[3].data = rows.map(r => ({ x: r.t, y: r.pMed }));
        ds[4].data = rows.map(r => ({ x: r.t, y: r.pSlow }));
        this.chart.options.scales.x.min = minT;
        this.chart.options.scales.x.max = Math.max(minT + HISTORY_WINDOW_MIN, maxT);
        this.chart.update('none');
    }

    /**
     * Nastaví hloubku zvenku (předvolba z kurzu), stejně jako posuvník.
     * @param {number} depth m
     */
    setDepth(depth) {
        this._applyDepthChange(depth);
    }

    /** Zastaví běh času (překryv v kurzu se zavřel). Stav simulace zůstává. */
    stop() {
        if (this.tickHandle) clearInterval(this.tickHandle);
        this.tickHandle = null;
    }

    /** Znovu spustí hodiny po `stop()`. Přehrávání (▶/⏸) zůstává, jak ho uživatel nechal. */
    start() {
        this._startLoop();
    }

    destroy() {
        if (this.tickHandle) clearInterval(this.tickHandle);
        clearTimeout(this.depthInputDebounceHandle);
        if (this._onKey) window.removeEventListener('keydown', this._onKey);
        if (this._onLanguageChange) document.removeEventListener('languagechange', this._onLanguageChange);
        if (this.chart) this.chart.destroy();
    }
}
