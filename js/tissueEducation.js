/**
 * tissueEducation.js - Interactive educational components for tissue loading page
 * Handles gas pathway visualization (js/components/GasPathway.js) and half-time concept charts
 */

import { fmtNum } from './format.js';
import { translate } from './i18n.js';
import { GasPathway, renderGasPathway } from './components/GasPathway.js';
// Constants
const WATER_VAPOR_PRESSURE = 0.0627; // bar at 37°C
const SURFACE_PRESSURE = 1.01325; // 1 atm exactly
const N2_FRACTION = 0.7902; // N2-equivalent fraction (accounts for argon)
const SURFACE_ALVEOLAR_N2 = (SURFACE_PRESSURE - WATER_VAPOR_PRESSURE) * N2_FRACTION; // ~0.75 bar

function tr(key, fallback, values = {}) {
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, value),
        translate(key, fallback)
    );
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    initGasPathway();
    initHalfTimeCharts();
});

/* ==========================================================================
   Gas Pathway Visualization - Manual Toggle Control
   ========================================================================== */

let pathway = null;

function initGasPathway() {
    const host = document.querySelector('.gas-pathway-container');
    if (!host) return;
    renderGasPathway(host);
    pathway = new GasPathway(host);
}

/* ==========================================================================
   Half-Time Charts
   ========================================================================== */

let ongassingChart = null;
let offgassingChart = null;
let currentDepth = 30; // Shared depth state

function initHalfTimeCharts() {
    initOngassingChart();
    initOffgassingChart();
    
    // Link the depth slider to both charts
    const depthSlider = document.getElementById('ongassing-depth');
    if (depthSlider) {
        depthSlider.addEventListener('input', (e) => {
            currentDepth = parseInt(e.target.value);
            updateOngassingChart();
            updateOffgassingChart();
        });
    }
}

function getSaturatedTissuePpN2(depth) {
    // Tissue fully saturated at the given depth
    const ambientPressure = SURFACE_PRESSURE + depth / 10;
    return (ambientPressure - WATER_VAPOR_PRESSURE) * N2_FRACTION;
}

function initOngassingChart() {
    const canvas = document.getElementById('ongassing-chart');
    const depthSlider = document.getElementById('ongassing-depth');
    
    if (!canvas || !depthSlider) return;
    
    currentDepth = parseInt(depthSlider.value);
    const ctx = canvas.getContext('2d');
    
    const initialTarget = getSaturatedTissuePpN2(currentDepth);
    const initialData = calculateOngassing(initialTarget);
    
    ongassingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: initialData.halfTimes.map(t => fmtNum(t, 1)),
            datasets: [
                {
                    label: tr('tissueLoading.halfTimeCharts.chart.tissuePressure', 'Tissue pN₂'),
                    data: initialData.pressures,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: tr('tissueLoading.halfTimeCharts.chart.targetAlveolar', 'Target (Alveolar)'),
                    data: initialData.halfTimes.map(() => initialTarget),
                    borderColor: '#27ae60',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: tr('tissueLoading.halfTimeCharts.chart.initialSurface', 'Initial (Surface)'),
                    data: initialData.halfTimes.map(() => SURFACE_ALVEOLAR_N2),
                    borderColor: '#95a5a6',
                    borderDash: [3, 3],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => tr(
                            'tissueLoading.halfTimeCharts.chart.halfTimes',
                            '{value} half-times',
                            { value: items[0].label }
                        ),
                        label: (item) => {
                            const bar = `${item.dataset.label}: ${fmtNum(item.raw, 2)}\u00a0bar`;
                            if (item.datasetIndex === 0) {
                                const target = getSaturatedTissuePpN2(currentDepth);
                                const initial = SURFACE_ALVEOLAR_N2;
                                const pct = fmtNum(((item.raw - initial) / (target - initial) * 100), 1);
                                return `${bar} (${tr(
                                    'tissueLoading.halfTimeCharts.chart.saturated',
                                    '{value}% saturated',
                                    { value: pct }
                                )})`;
                            }
                            return bar;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: tr('tissueLoading.halfTimeCharts.chart.timeAxis', 'Time (half-times)'),
                        font: { size: 11 }
                    },
                    ticks: {
                        maxTicksLimit: 7,
                        callback: (value, index) => {
                            // With 0.5 step data: index 0=0T, 2=1T, 4=2T, etc.
                            const t = index / 2;
                            // Canvas: markup se nevykreslí, proto plain-text
                            // tvar značky poločasu (authoring.md §5b).
                            return Number.isInteger(t) ? `${t}t\u00bd` : '';
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: tr('tissueLoading.halfTimeCharts.chart.pressureAxis', 'pN₂ (bar)'),
                        font: { size: 11 }
                    },
                    min: 0,
                    max: 4
                }
            }
        }
    });

    updateOngassingChart();
}

function calculateOngassing(targetPpN2, initialPpN2 = SURFACE_ALVEOLAR_N2) {
    const halfTimes = [];
    const pressures = [];
    
    // Use 0.5 half-time steps for less sensitive hover (0, 0.5, 1, 1.5, ... 6)
    for (let t = 0; t <= 6; t += 0.5) {
        halfTimes.push(t);
        const pressure = targetPpN2 + (initialPpN2 - targetPpN2) * Math.exp(-Math.LN2 * t);
        pressures.push(pressure);
    }
    
    return { halfTimes, pressures };
}

function updateOngassingChart() {
    const depthValue = document.getElementById('ongassing-depth-value');
    const ppn2Value = document.getElementById('ongassing-ppn2-value');
    
    const targetPpN2 = getSaturatedTissuePpN2(currentDepth);
    
    if (depthValue) depthValue.textContent = `${currentDepth}\u00a0m`;
    if (ppn2Value) ppn2Value.innerHTML = `(<var>p</var><sub>N₂</sub> = ${fmtNum(targetPpN2, 2)}\u00a0bar)`;
    
    const data = calculateOngassing(targetPpN2);
    
    if (ongassingChart) {
        ongassingChart.data.labels = data.halfTimes.map(t => fmtNum(t, 1));
        ongassingChart.data.datasets[0].data = data.pressures;
        ongassingChart.data.datasets[1].data = data.halfTimes.map(() => targetPpN2);
        ongassingChart.data.datasets[2].data = data.halfTimes.map(() => SURFACE_ALVEOLAR_N2);
        ongassingChart.options.scales.y.max = Math.max(4, targetPpN2 + 0.5);
        ongassingChart.update('none');
    }
}

function initOffgassingChart() {
    const canvas = document.getElementById('offgassing-chart');
    
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const initialTissuePpN2 = getSaturatedTissuePpN2(currentDepth);
    const initialData = calculateOffgassing(initialTissuePpN2);
    
    offgassingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: initialData.halfTimes.map(t => fmtNum(t, 1)),
            datasets: [
                {
                    label: tr('tissueLoading.halfTimeCharts.chart.tissuePressure', 'Tissue pN₂'),
                    data: initialData.pressures,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: tr('tissueLoading.halfTimeCharts.chart.targetSurface', 'Target (Surface)'),
                    data: initialData.halfTimes.map(() => SURFACE_ALVEOLAR_N2),
                    borderColor: '#27ae60',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: tr(
                        'tissueLoading.halfTimeCharts.chart.initialDepth',
                        'Initial (Saturated @ {depth})',
                        { depth: `${currentDepth}\u00a0m` }
                    ),
                    data: initialData.halfTimes.map(() => initialTissuePpN2),
                    borderColor: '#95a5a6',
                    borderDash: [3, 3],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => tr(
                            'tissueLoading.halfTimeCharts.chart.halfTimes',
                            '{value} half-times',
                            { value: items[0].label }
                        ),
                        label: (item) => {
                            const bar = `${item.dataset.label}: ${fmtNum(item.raw, 2)}\u00a0bar`;
                            if (item.datasetIndex === 0) {
                                const initial = getSaturatedTissuePpN2(currentDepth);
                                const target = SURFACE_ALVEOLAR_N2;
                                const pct = fmtNum(((initial - item.raw) / (initial - target) * 100), 1);
                                return `${bar} (${tr(
                                    'tissueLoading.halfTimeCharts.chart.desaturated',
                                    '{value}% desaturated',
                                    { value: pct }
                                )})`;
                            }
                            return bar;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: tr('tissueLoading.halfTimeCharts.chart.timeAxis', 'Time (half-times)'),
                        font: { size: 11 }
                    },
                    ticks: {
                        maxTicksLimit: 7,
                        callback: (value, index) => {
                            // With 0.5 step data: index 0=0T, 2=1T, 4=2T, etc.
                            const t = index / 2;
                            // Canvas: markup se nevykreslí, proto plain-text
                            // tvar značky poločasu (authoring.md §5b).
                            return Number.isInteger(t) ? `${t}t\u00bd` : '';
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: tr('tissueLoading.halfTimeCharts.chart.pressureAxis', 'pN₂ (bar)'),
                        font: { size: 11 }
                    },
                    min: 0,
                    max: 3.5
                }
            }
        }
    });
    
    updateOffgassingChart();
}

function calculateOffgassing(initialTissuePpN2) {
    // Off-gassing to surface with air
    const targetPpN2 = SURFACE_ALVEOLAR_N2;
    
    const halfTimes = [];
    const pressures = [];
    
    // Use 0.5 half-time steps for less sensitive hover (0, 0.5, 1, 1.5, ... 6)
    for (let t = 0; t <= 6; t += 0.5) {
        halfTimes.push(t);
        const pressure = targetPpN2 + (initialTissuePpN2 - targetPpN2) * Math.exp(-Math.LN2 * t);
        pressures.push(pressure);
    }
    
    return { halfTimes, pressures };
}

function updateOffgassingChart() {
    const depthDisplay = document.getElementById('offgassing-depth-display');
    
    const initialTissuePpN2 = getSaturatedTissuePpN2(currentDepth);
    const data = calculateOffgassing(initialTissuePpN2);
    
    if (depthDisplay) depthDisplay.textContent = `${currentDepth}\u00a0m`;
    
    if (offgassingChart) {
        offgassingChart.data.labels = data.halfTimes.map(t => fmtNum(t, 1));
        offgassingChart.data.datasets[0].data = data.pressures;
        offgassingChart.data.datasets[1].data = data.halfTimes.map(() => SURFACE_ALVEOLAR_N2);
        offgassingChart.data.datasets[2].data = data.halfTimes.map(() => initialTissuePpN2);
        offgassingChart.data.datasets[2].label = tr(
            'tissueLoading.halfTimeCharts.chart.initialDepth',
            'Initial (Saturated @ {depth})',
            { depth: `${currentDepth}\u00a0m` }
        );
        offgassingChart.options.scales.y.max = Math.max(3.5, initialTissuePpN2 + 0.5);
        offgassingChart.update('none');
    }
}

export function refreshTissueEducationLanguage() {
    pathway?.refresh();

    if (ongassingChart) {
        ongassingChart.data.datasets[0].label = tr('tissueLoading.halfTimeCharts.chart.tissuePressure', 'Tissue pN₂');
        ongassingChart.data.datasets[1].label = tr('tissueLoading.halfTimeCharts.chart.targetAlveolar', 'Target (Alveolar)');
        ongassingChart.data.datasets[2].label = tr('tissueLoading.halfTimeCharts.chart.initialSurface', 'Initial (Surface)');
        ongassingChart.options.scales.x.title.text = tr('tissueLoading.halfTimeCharts.chart.timeAxis', 'Time (half-times)');
        ongassingChart.options.scales.y.title.text = tr('tissueLoading.halfTimeCharts.chart.pressureAxis', 'pN₂ (bar)');
        ongassingChart.update('none');
    }

    if (offgassingChart) {
        offgassingChart.data.datasets[0].label = tr('tissueLoading.halfTimeCharts.chart.tissuePressure', 'Tissue pN₂');
        offgassingChart.data.datasets[1].label = tr('tissueLoading.halfTimeCharts.chart.targetSurface', 'Target (Surface)');
        offgassingChart.data.datasets[2].label = tr(
            'tissueLoading.halfTimeCharts.chart.initialDepth',
            'Initial (Saturated @ {depth})',
            { depth: `${currentDepth}\u00a0m` }
        );
        offgassingChart.options.scales.x.title.text = tr('tissueLoading.halfTimeCharts.chart.timeAxis', 'Time (half-times)');
        offgassingChart.options.scales.y.title.text = tr('tissueLoading.halfTimeCharts.chart.pressureAxis', 'pN₂ (bar)');
        offgassingChart.update('none');
    }
}
