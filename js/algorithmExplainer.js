import { generateDecoProfile } from './diveSetup.js';
import { DECO_MODES } from './decoModel.js';
import { getSandboxUrl } from './urlParams.js';
import { createLanguageSwitcher, initI18n, translate } from './i18n.js';
import { fmtNum } from './format.js';

const AIR = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
const MODES = [
    DECO_MODES.STANDARD,
    DECO_MODES.ADAPTIVE,
    DECO_MODES.CONTINUOUS
];

let profileChart;
let stopChart;

function cssColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function modeLabel(mode) {
    const keys = {
        [DECO_MODES.STANDARD]: ['algorithm.chart.standard', 'Standard'],
        [DECO_MODES.ADAPTIVE]: ['algorithm.chart.adaptive', 'Adaptive'],
        [DECO_MODES.CONTINUOUS]: ['algorithm.chart.continuous', 'Fine grid']
    };
    return translate(...keys[mode]);
}

function currentInputs() {
    return {
        depth: Number(document.getElementById('algorithm-depth').value),
        time: Number(document.getElementById('algorithm-time').value),
        gfLow: Number(document.getElementById('algorithm-gf-low').value),
        gfHigh: Number(document.getElementById('algorithm-gf-high').value)
    };
}

function createSetup(profile, mode, inputs) {
    return {
        name: `${inputs.depth}\u00a0m / ${inputs.time}\u00a0min Air`,
        gases: AIR,
        dives: [{ waypoints: profile.waypoints }],
        algorithm: 'ZH-L16C',
        gfLow: inputs.gfLow,
        gfHigh: inputs.gfHigh,
        decoMode: mode,
        units: { depth: 'meters', time: 'minutes', pressure: 'bar' }
    };
}

function calculateProfiles(inputs) {
    const profiles = {};
    for (const mode of MODES) {
        profiles[mode] = generateDecoProfile(
            inputs.depth,
            inputs.time,
            AIR,
            inputs.gfLow,
            inputs.gfHigh,
            { enabled: false },
            { decoMode: mode }
        );
    }
    return profiles;
}

function updateOutputs(inputs, standard) {
    document.getElementById('algorithm-depth-value').textContent =
        `${fmtNum(inputs.depth)}\u00a0m`;
    document.getElementById('algorithm-time-value').textContent =
        `${fmtNum(inputs.time)}\u00a0min`;
    document.getElementById('algorithm-gf-low-value').textContent = fmtNum(inputs.gfLow);
    document.getElementById('algorithm-gf-high-value').textContent = fmtNum(inputs.gfHigh);

    const descentTime = inputs.depth / 20;
    document.getElementById('algorithm-load-value').textContent =
        `${fmtNum(descentTime, 2)}\u00a0min ${translate('algorithm.values.descent', 'descent')}`;
    const directResult = standard.requiresDeco
        ? translate('algorithm.values.directFailed', 'Direct ascent fails')
        : translate('algorithm.values.directPassed', 'Direct ascent passes');
    document.getElementById('algorithm-ndl-value').textContent =
        `${directResult} · NDL ${fmtNum(standard.ndl)}\u00a0min`;
    document.getElementById('algorithm-anchor-value').textContent = standard.requiresDeco
        ? `${fmtNum(standard.anchorDepth)}\u00a0m`
        : translate('algorithm.values.noAnchor', 'No anchor');
    document.getElementById('algorithm-stop-value').textContent = standard.requiresDeco
        ? `${standard.decoStops.length} ${translate('algorithm.values.levels', 'levels')} · ${fmtNum(standard.totalDecoTime)}\u00a0min`
        : translate('algorithm.values.noStops', 'No mandatory stops');
}

function profileDatasets(profiles) {
    const colors = {
        [DECO_MODES.STANDARD]: cssColor('--cp-accent'),
        [DECO_MODES.ADAPTIVE]: cssColor('--cp-warning'),
        [DECO_MODES.CONTINUOUS]: cssColor('--cp-link')
    };
    return MODES.map(mode => ({
        label: modeLabel(mode),
        data: profiles[mode].waypoints.map(point => ({ x: point.time, y: point.depth })),
        borderColor: colors[mode],
        backgroundColor: colors[mode],
        borderWidth: mode === DECO_MODES.STANDARD ? 3 : 2,
        pointRadius: mode === DECO_MODES.CONTINUOUS ? 0 : 2,
        stepped: false,
        tension: 0
    }));
}

function stopDatasets(profiles, depths) {
    const colors = {
        [DECO_MODES.STANDARD]: cssColor('--cp-accent'),
        [DECO_MODES.ADAPTIVE]: cssColor('--cp-warning'),
        [DECO_MODES.CONTINUOUS]: cssColor('--cp-link')
    };
    return MODES.map(mode => {
        const byDepth = new Map(
            profiles[mode].decoStops.map(stop => [stop.depth, stop.time])
        );
        return {
            label: modeLabel(mode),
            data: depths.map(depth => byDepth.get(depth) ?? 0),
            backgroundColor: colors[mode],
            borderColor: colors[mode],
            borderWidth: 1
        };
    });
}

function renderCharts(profiles) {
    const textColor = cssColor('--cp-text');
    const gridColor = cssColor('--cp-border');
    const profileData = profileDatasets(profiles);
    const profileCanvas = document.getElementById('algorithm-profile-chart');

    if (profileChart) profileChart.destroy();
    profileChart = new Chart(profileCanvas, {
        type: 'line',
        data: { datasets: profileData },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `${context.dataset.label}: ${fmtNum(context.parsed.x, 1)}\u00a0min, ${fmtNum(context.parsed.y, 1)}\u00a0m`
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: translate('algorithm.chart.timeAxis', 'Runtime (min)'),
                        color: textColor
                    },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    reverse: true,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: translate('algorithm.chart.depthAxis', 'Depth (m)'),
                        color: textColor
                    },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            }
        }
    });

    const depths = [...new Set(
        MODES.flatMap(mode => profiles[mode].decoStops.map(stop => stop.depth))
    )].sort((a, b) => b - a);
    const stopCanvas = document.getElementById('algorithm-stop-chart');
    if (stopChart) stopChart.destroy();
    stopChart = new Chart(stopCanvas, {
        type: 'bar',
        data: {
            labels: depths.map(depth => `${fmtNum(depth, 1)}\u00a0m`),
            datasets: stopDatasets(profiles, depths)
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor } },
                tooltip: {
                    callbacks: {
                        label: context =>
                            `${context.dataset.label}: ${fmtNum(context.parsed.x, 1)}\u00a0min`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: translate('algorithm.chart.stopAxis', 'Stop duration (min)'),
                        color: textColor
                    },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

function updateSandboxLinks(profiles, inputs) {
    const ids = {
        [DECO_MODES.STANDARD]: 'algorithm-standard-link',
        [DECO_MODES.ADAPTIVE]: 'algorithm-adaptive-link',
        [DECO_MODES.CONTINUOUS]: 'algorithm-continuous-link'
    };
    for (const mode of MODES) {
        document.getElementById(ids[mode]).href = getSandboxUrl(
            createSetup(profiles[mode], mode, inputs),
            { chartMode: 'profile' }
        );
    }
}

function render() {
    const inputs = currentInputs();
    const lowInput = document.getElementById('algorithm-gf-low');
    const highInput = document.getElementById('algorithm-gf-high');
    if (inputs.gfLow > inputs.gfHigh) {
        lowInput.value = String(inputs.gfHigh);
        inputs.gfLow = inputs.gfHigh;
    }
    highInput.min = String(inputs.gfLow);

    const profiles = calculateProfiles(inputs);
    updateOutputs(inputs, profiles[DECO_MODES.STANDARD]);
    renderCharts(profiles);
    updateSandboxLinks(profiles, inputs);
}

function toggleFullscreen(shell) {
    const active = shell.classList.toggle('fullscreen');
    document.body.style.overflow = active ? 'hidden' : '';
    setTimeout(() => {
        profileChart?.resize();
        stopChart?.resize();
    }, 50);
}

function initFullscreen() {
    document.querySelectorAll('[data-fullscreen]').forEach(button => {
        button.addEventListener('click', () => {
            toggleFullscreen(document.getElementById(button.dataset.fullscreen));
        });
    });
    document.querySelectorAll('[data-exit-fullscreen]').forEach(button => {
        button.addEventListener('click', () => {
            toggleFullscreen(button.closest('.algorithm-chart-shell'));
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const shell = document.querySelector('.algorithm-chart-shell.fullscreen');
        if (shell) toggleFullscreen(shell);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    createLanguageSwitcher();
    initI18n();
    document.querySelectorAll('.algorithm-controls input').forEach(input => {
        input.addEventListener('input', render);
    });
    initFullscreen();
    render();
});

document.addEventListener('languagechange', render);
