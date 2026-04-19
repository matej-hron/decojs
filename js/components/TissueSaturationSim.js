/**
 * TissueSaturationSim — interactive single-diver physics playground.
 *
 * The learner drives a diver: depth changes and gas switches are
 * applied instantly, tissue saturation follows exponentially. The
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

const TICK_MS = 100;
const MIN_PER_TICK_AT_1X = 0.1;         // 100 ms tick × 1× = 0.1 sim-min
const HISTORY_WINDOW_MIN = 45;          // rolling chart window
const STEP_BUTTON_MINUTES = 1;          // forward/backward button increment

// Three representative compartments. Indices into COMPARTMENTS (1-based id).
const TRACKED_COMPARTMENT_IDS = [1, 5, 12];

// Alert thresholds — kept literal on purpose, see plan's "out of scope".
const PPO2_DECO_LIMIT = 1.6;
const PPO2_REC_LIMIT = 1.4;
const PPO2_HYPOXIA = 0.18;
const PPN2_NARCOSIS = 4.0;

export class TissueSaturationSim {
    constructor(root) {
        this.root = root;
        this._collectDom();
        this._initChart();
        this._initState();
        this._wireControls();
        this._renderAll();
        this._startLoop();
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

        this.state = {
            depth: 0,
            gas,
            speed: 1,
            isPlaying: true,
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
        const onDepthChange = (rawVal) => {
            const d = Math.max(0, Math.min(60, Number(rawVal) || 0));
            this.state.depth = d;
            this.depthSlider.value = d;
            this.depthInput.value = d;
            this._renderNumbers();
        };
        this.depthSlider.addEventListener('input', (e) => onDepthChange(e.target.value));
        this.depthInput.addEventListener('input',  (e) => onDepthChange(e.target.value));

        this.gasSelect.addEventListener('change', (e) => {
            this.state.gas = this._lookupGas(e.target.value);
            this._renderNumbers();
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

        this.readouts.depth.textContent = `${depth.toFixed(1)} m`;
        this.readouts.pAmb.textContent  = `${ambient.toFixed(2)} bar`;
        this.readouts.gas.textContent   = gas.name;
        this.readouts.pO2.textContent   = `${pO2.toFixed(2)} bar`;
        this.readouts.pN2Insp.textContent = `${pN2Insp.toFixed(2)} bar`;
        this.readouts.pN2Alv.textContent  = `${pN2Alv.toFixed(2)} bar`;
        this.readouts.pFast.textContent = `${tissues[TRACKED_COMPARTMENT_IDS[0]].toFixed(2)} bar`;
        this.readouts.pMed.textContent  = `${tissues[TRACKED_COMPARTMENT_IDS[1]].toFixed(2)} bar`;
        this.readouts.pSlow.textContent = `${tissues[TRACKED_COMPARTMENT_IDS[2]].toFixed(2)} bar`;

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
        const { depth, gas } = this.state;
        const ambient = getAmbientPressure(depth);
        const pO2 = ambient * gas.o2;
        const pN2Insp = ambient * gas.n2;
        const alerts = [];
        if (pO2 > PPO2_DECO_LIMIT) {
            alerts.push({ level: 'critical',
                text: `pO₂ ${pO2.toFixed(2)} bar — oxygen toxicity (deco limit ${PPO2_DECO_LIMIT})` });
        } else if (pO2 > PPO2_REC_LIMIT) {
            alerts.push({ level: 'warn',
                text: `pO₂ ${pO2.toFixed(2)} bar — above recreational limit ${PPO2_REC_LIMIT}` });
        }
        if (pO2 < PPO2_HYPOXIA) {
            alerts.push({ level: 'critical',
                text: `pO₂ ${pO2.toFixed(2)} bar — hypoxic (< ${PPO2_HYPOXIA})` });
        }
        if (pN2Insp > PPN2_NARCOSIS) {
            alerts.push({ level: 'warn',
                text: `pN₂ ${pN2Insp.toFixed(2)} bar — nitrogen narcosis likely (> ${PPN2_NARCOSIS})` });
        }
        this.alertsEl.innerHTML = alerts.length === 0
            ? '<div class="tsim-alert tsim-alert-ok">All clear</div>'
            : alerts.map(a => `<div class="tsim-alert tsim-alert-${a.level}">${a.text}</div>`).join('');
    }

    _initChart() {
        // Chart.js is loaded via <script> in the HTML; use the global.
        // Two Y axes: left = partial pressure (bar), right = depth (m, inverted).
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
                    { label: 'pAmb (ambient)', data: [], borderColor: 'rgba(127,140,141,0.8)',
                      backgroundColor: 'rgba(127,140,141,0.15)',
                      borderWidth: 2, pointRadius: 0, yAxisID: 'y', fill: true, tension: 0 },
                    { label: 'pN₂ alveolar',  data: [], borderColor: '#2c3e50',
                      borderDash: [6,4], borderWidth: 1.5, pointRadius: 0, yAxisID: 'y' },
                    { label: 'TC1 fast (5 min)',     data: [], borderColor: colFast, borderWidth: 2.5, pointRadius: 0, yAxisID: 'y' },
                    { label: 'TC5 medium (27 min)',  data: [], borderColor: colMed,  borderWidth: 2.5, pointRadius: 0, yAxisID: 'y' },
                    { label: 'TC12 slow (239 min)',  data: [], borderColor: colSlow, borderWidth: 2.5, pointRadius: 0, yAxisID: 'y' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', axis: 'x', intersect: false },
                animation: false,
                scales: {
                    x: { type: 'linear',
                         title: { display: true, text: 'Time (min)' },
                         ticks: { maxTicksLimit: 10 } },
                    y: { type: 'linear', position: 'left',
                         // Fixed range so tissue movement is always in context
                         // and the axis doesn't rescale on every tick.
                         min: 0, max: 7,
                         title: { display: true, text: 'Pressure (bar)' } },
                    // Companion right-side axis: reads the SAME pressure
                    // values, but tick labels are rewritten as equivalent
                    // depth (m). Because it's the same scale, "surface"
                    // (pAmb = 1, depth = 0) aligns on both sides.
                    yDepth: { type: 'linear', position: 'right',
                              min: 0, max: 7,
                              title: { display: true, text: 'Depth equivalent (m)' },
                              grid: { drawOnChartArea: false },
                              ticks: {
                                  stepSize: 1,
                                  callback: (v) => {
                                      // pAmb = 1 + depth/10 ⇒ depth = (pAmb − 1) × 10
                                      const d = Math.round((v - 1) * 10);
                                      return d < 0 ? '' : `${d} m`;
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
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} bar`
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

    destroy() {
        if (this.tickHandle) clearInterval(this.tickHandle);
        if (this.chart) this.chart.destroy();
    }
}
