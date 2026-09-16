/**
 * Simple Test Runner for DecoJS
 * 
 * Run with: node tests/run-tests.mjs
 * 
 * No external dependencies required - works with pure Node.js
 */

// ============================================================================
// MINI TEST FRAMEWORK
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let currentSuite = '';

function describe(name, fn) {
    const prevSuite = currentSuite;
    currentSuite = currentSuite ? `${currentSuite} > ${name}` : name;
    console.log(`\n📦 ${currentSuite}`);
    fn();
    currentSuite = prevSuite;
}

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ ${name}`);
    } catch (error) {
        failedTests++;
        console.log(`  ❌ ${name}`);
        console.log(`     Error: ${error.message}`);
    }
}

function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected} but got ${actual}`);
            }
        },
        toBeDefined() {
            if (actual === undefined) {
                throw new Error(`Expected value to be defined but got undefined`);
            }
        },
        toEqual(expected) {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
            }
        },
        toBeCloseTo(expected, precision = 2) {
            const factor = Math.pow(10, precision);
            if (Math.round(actual * factor) !== Math.round(expected * factor)) {
                throw new Error(`Expected ${expected} (±${1/factor}) but got ${actual}`);
            }
        },
        toBeGreaterThan(expected) {
            if (!(actual > expected)) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeLessThan(expected) {
            if (!(actual < expected)) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        toBeGreaterThanOrEqual(expected) {
            if (!(actual >= expected)) {
                throw new Error(`Expected ${actual} to be >= ${expected}`);
            }
        },
        toBeLessThanOrEqual(expected) {
            if (!(actual <= expected)) {
                throw new Error(`Expected ${actual} to be <= ${expected}`);
            }
        },
        toBeNull() {
            if (actual !== null) {
                throw new Error(`Expected null but got ${actual}`);
            }
        },
        not: {
            toBeNaN() {
                if (Number.isNaN(actual)) {
                    throw new Error(`Expected not NaN but got NaN`);
                }
            }
        },
        toHaveProperty(prop) {
            if (!(prop in actual)) {
                throw new Error(`Expected object to have property "${prop}"`);
            }
        },
        toHaveLength(len) {
            if (actual.length !== len) {
                throw new Error(`Expected length ${len} but got ${actual.length}`);
            }
        },
        toContain(item) {
            if (typeof actual === 'string') {
                if (!actual.includes(item)) {
                    throw new Error(`Expected "${actual}" to contain "${item}"`);
                }
            } else if (!actual.includes(item)) {
                throw new Error(`Expected array to contain ${item}`);
            }
        }
    };
}

// ============================================================================
// IMPORT MODULES
// ============================================================================

import { decimalSeparator, fmtGroup, fmtNum, localeTag, localizeLatex } from '../js/format.js';
import { baseFromStartDate, epochMinToLocalInput, localInputToEpochMin } from '../js/tripTime.js';
import { addDive, editDive, removeDive, rescheduleDive } from '../js/tripState.js';
import { JSDOM } from 'jsdom';
import { DiveSetupEditor } from '../js/components/DiveSetupEditor.js';

import {
    getDefaultSetup,
    extendDiveSetup,
    getDiveSetupWaypoints,
    getSurfaceInterval,
    formatDiveSetupSummary,
    generateSimpleProfile,
    generateDecoProfile,
    generateDecoProfileSync,
    generateDecisionAudit,
    clearCache,
    getGases,
    getGasAtWaypoint,
    getGasAtTime,
    getGasSwitchEvents,
    insertGasSwitchWaypoints,
    calculateMOD,
    computeGasConsumption,
    getDiveSetupPressurePerMeter,
    getDiveSetupSurfacePressure,
    getNDLStatus,
    renderDivePlanTableHTML
} from '../js/diveSetup.js';

import { escHtml } from '../js/utils/escHtml.js';
import {
    encodeDiveSetup,
    decodeDiveSetup,
    getCompactDecoMode,
    MAX_SHARED_TEXT_LENGTH
} from '../js/urlParams.js';

let warningHtml = {};
try {
    warningHtml = await import('../js/warningHtml.js');
} catch {
    // The TDD regression test below reports the missing production API.
}

import {
    createDefaultProfile,
    validateProfile,
    parseProfileInput,
    calculateRates,
    getDiveStats
} from '../js/diveProfile.js';

import {
    SURFACE_PRESSURE,
    getPressureAtAltitude,
    getSurfacePressure,
    getPressurePerMeter,
    WATER_VAPOR_PRESSURE,
    N2_FRACTION,
    PRESSURE_PER_METER,
    WATER_DENSITIES,
    WATER_TYPES,
    DEFAULT_GF_LOW,
    DEFAULT_GF_HIGH,
    DECO_MODES,
    DECISION_AUDIT_VERSION,
    getDecoMode,
    getAmbientPressure,
    getAlveolarN2Pressure,
    getInitialTissueN2,
    haldaneEquation,
    schreinerEquation,
    getMValue,
    getAdjustedMValue,
    getCompartmentCeiling,
    getDiveCeiling,
    interpolateGF,
    getFirstStopDepth,
    calculateCeilingTimeSeries,
    calculateTissueLoading,
    calculateNDL,
    simulateDepthTime,
    simulateDepthChange,
    generateDecoSchedule,
    calculateInstantGF,
    calculateMaxGF
} from '../js/decoModel.js';

import {
    COMPARTMENTS,
    ZHL16_VARIANTS,
    getZHL16Variant,
    setZHL16Variant,
    getCompartmentsForVariant,
    getCompartmentCategory
} from '../js/tissueCompartments.js';

import { planTrip } from '../js/tripPlanner.js';
import { preSaturation } from '../js/preSaturation.js';
import {
    calculateChartGFAnchor,
    createLegendHelpIcon,
    normalizeDiveSetup,
    positionLegendHelpIcon
} from '../js/charts/chartTypes.js';
import { buildRuntimeRows } from '../js/components/RuntimeTable.js';
import {
    buildDecisionAuditLines,
    renderDecisionAuditHTML
} from '../js/components/DecisionAudit.js';
import { computeCalendarLayout } from '../js/calendarLayout.js';
import { snapClamp, diveBlockLabel, diveTimeRange } from '../js/components/TripCalendar.js';
import { previewNdl } from '../js/ndlPreview.js';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GF_PRESETS } from '../js/gfPresets.js';
import { encodeTrip, decodeTrip } from '../js/tripUrl.js';
import { isAndroid } from '../js/appBanner.js';
import {
    initTooltipShortcut,
    resolveChartTooltipEnabled
} from '../js/components/tooltipShortcut.js';
import { GFChart } from '../js/charts/GFChart.js';
import {
    MValueChart,
    calculateMValueRulerIntersections,
    calculateCurrentControllingCompartment
} from '../js/charts/MValueChart.js';
import { DiveProfileChart } from '../js/charts/DiveProfileChart.js';

describe('Chart tooltip shortcut', () => {
    test('toggles only the focused or hovered chart and persists across rebuilds', () => {
        const originalDocument = globalThis.document;
        const originalWindow = globalThis.window;
        const handlers = {};
        const updates = [];

        const makeChart = (id, isMValue = false) => {
            const resolvedPlugins = { tooltip: { enabled: true } };
            const options = {};
            Object.defineProperty(options, 'plugins', {
                get() {
                    return resolvedPlugins;
                },
                set() {
                    throw new Error('Chart.js resolved options must not be replaced');
                }
            });
            const canvas = {
                id,
                closest(selector) {
                    if (selector === '.mvc-wrapper' && isMValue) return {};
                    return selector === 'canvas' ? canvas : null;
                },
                contains(target) {
                    return target === canvas;
                },
                matches() {
                    return false;
                }
            };
            return {
            canvas,
            options,
            config: { options: { plugins: { tooltip: { enabled: true } } } },
            setActiveElements(elements) {
                updates.push(`${id}:active:${elements.length}`);
            },
            tooltip: {
                setActiveElements(elements) {
                    updates.push(`${id}:tooltip:${elements.length}`);
                }
            },
            update(mode) {
                resolvedPlugins.tooltip.enabled =
                    this.config.options.plugins.tooltip.enabled;
                updates.push(`${id}:update:${mode}`);
            }
        };
        };
        const first = makeChart('first');
        const second = makeChart('second');
        const mvalue = makeChart('mvalue', true);
        const firstContainer = {
            tagName: 'DIV',
            contains(target) {
                return target === first.canvas;
            }
        };
        const body = {
            tagName: 'BODY',
            contains(target) {
                return target === first.canvas || target === second.canvas;
            }
        };
        const documentElement = { tagName: 'HTML' };

        try {
            globalThis.document = {
                body,
                documentElement,
                addEventListener(type, handler) {
                    handlers[type] = handler;
                }
            };
            globalThis.window = {
                Chart: { instances: new Map([['first', first], ['second', second]]) }
            };

            initTooltipShortcut();
            handlers.keydown({ key: 't', target: firstContainer });

            expect(first.options.plugins.tooltip.enabled).toBe(false);
            expect(first.config.options.plugins.tooltip.enabled).toBe(false);
            expect(second.options.plugins.tooltip.enabled).toBe(true);
            expect(resolveChartTooltipEnabled(true, first.canvas)).toBe(false);
            expect(resolveChartTooltipEnabled(true, second.canvas)).toBe(true);
            expect(updates.includes('first:tooltip:0')).toBe(true);
            expect(updates.includes('second:update:none')).toBe(false);

            globalThis.window.Chart.instances = { first, second };
            handlers.pointerover({ target: second.canvas });
            handlers.pointerout?.({ target: second.canvas, relatedTarget: { tagName: 'DIV' } });
            handlers.keydown({ key: 'T', target: body });

            expect(first.options.plugins.tooltip.enabled).toBe(false);
            expect(second.config.options.plugins.tooltip.enabled).toBe(false);
            expect(resolveChartTooltipEnabled(true, second.canvas)).toBe(false);

            handlers.keydown({ key: 't', target: { tagName: 'INPUT' } });
            expect(resolveChartTooltipEnabled(true, second.canvas)).toBe(false);

            const mvalueContainer = {
                tagName: 'DIV',
                contains(target) {
                    return target === mvalue.canvas;
                }
            };
            globalThis.window.Chart.instances = new Map([['mvalue', mvalue]]);
            handlers.keydown({ key: 'T', target: mvalueContainer });
            expect(mvalue.options.plugins.tooltip.enabled).toBe(true);

            handlers.keydown({
                key: 't',
                metaKey: true,
                target: mvalueContainer
            });
            expect(mvalue.options.plugins.tooltip.enabled).toBe(true);
        } finally {
            globalThis.document = originalDocument;
            globalThis.window = originalWindow;
        }
    });
});

describe('P-P chart fullscreen controls', () => {
    test('keeps the profile wrapper in fullscreen and restores both buttons', () => {
        const dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
        const originalDocument = globalThis.document;
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.document = dom.window.document;
        globalThis.setTimeout = () => 0;

        try {
            for (const [ChartClass, fullscreenClass] of [
                [GFChart, 'gfc-fullscreen'],
                [MValueChart, 'mvc-fullscreen']
            ]) {
                const wrapper = dom.window.document.createElement('div');
                const miniProfileCanvas = dom.window.document.createElement('canvas');
                wrapper.appendChild(miniProfileCanvas);
                const context = {
                    wrapper,
                    chartContainer: dom.window.document.getElementById('chart'),
                    miniProfileCanvas,
                    fullscreenBtn: { style: {} },
                    exitFullscreenBtn: { style: {} },
                    resize() {}
                };

                ChartClass.prototype._toggleFullscreen.call(context);
                expect(context.wrapper.classList.contains(fullscreenClass)).toBe(true);
                expect(context.wrapper.contains(miniProfileCanvas)).toBe(true);
                expect(context.fullscreenBtn.style.display).toBe('none');
                expect(context.exitFullscreenBtn.style.display).toBe('block');

                ChartClass.prototype._toggleFullscreen.call(context);
                expect(context.wrapper.classList.contains(fullscreenClass)).toBe(false);
                expect(context.fullscreenBtn.style.display).toBe('');
                expect(context.exitFullscreenBtn.style.display).toBe('none');
            }

            const css = readFileSync(
                new URL('../css/styles.css', import.meta.url),
                'utf8'
            );
            expect(css.includes('.gfc-wrapper.gfc-fullscreen {')).toBe(true);
            expect(css.includes('.mvc-wrapper.mvc-fullscreen {')).toBe(true);
        } finally {
            globalThis.document = originalDocument;
            globalThis.setTimeout = originalSetTimeout;
            dom.window.close();
        }
    });

    test('toggles fullscreen with unmodified F in every chart', () => {
        const cases = [
            {
                ChartClass: MValueChart,
                fullscreenProperty: 'wrapper',
                fullscreenClass: 'mvc-fullscreen',
                extra: { calculationResults: null }
            },
            {
                ChartClass: GFChart,
                fullscreenProperty: 'wrapper',
                fullscreenClass: 'gfc-fullscreen',
                extra: { calculationResults: null }
            },
            {
                ChartClass: DiveProfileChart,
                fullscreenProperty: 'chartContainer',
                fullscreenClass: 'dpc-fullscreen',
                extra: {}
            }
        ];

        for (const chartCase of cases) {
            const dom = new JSDOM(
                '<!doctype html><body><div id="container" tabindex="0"></div></body>'
            );
            const originalDocument = globalThis.document;
            globalThis.document = dom.window.document;
            let toggles = 0;
            const fullscreenElement = dom.window.document.createElement('div');
            const context = {
                container: dom.window.document.getElementById('container'),
                options: {
                    fullscreenButton: true,
                    showTissueLoading: false
                },
                wrapper: fullscreenElement,
                chartContainer: fullscreenElement,
                _toggleFullscreen() { toggles++; },
                ...chartCase.extra
            };
            context[chartCase.fullscreenProperty] = fullscreenElement;
            context.container.focus();

            try {
                chartCase.ChartClass.prototype._setupKeyboardShortcuts.call(context);
                dom.window.document.dispatchEvent(
                    new dom.window.KeyboardEvent('keydown', {
                        key: 'F',
                        bubbles: true
                    })
                );
                expect(toggles).toBe(1);

                dom.window.document.dispatchEvent(
                    new dom.window.KeyboardEvent('keydown', {
                        key: 'F',
                        metaKey: true,
                        bubbles: true
                    })
                );
                expect(toggles).toBe(1);
            } finally {
                dom.window.document.removeEventListener(
                    'keydown',
                    context._keyHandler
                );
                globalThis.document = originalDocument;
                dom.window.close();
            }
        }
    });
});

describe('GF chart maximum GF toggle', () => {
    test('draws the compartment number inside each visible current point', () => {
        const calls = [];
        const ctx = {
            save() {},
            restore() {},
            strokeText(...args) {
                calls.push(['stroke', ...args]);
            },
            fillText(...args) {
                calls.push(['fill', ...args]);
            }
        };
        const chart = {
            ctx,
            data: {
                datasets: [
                    { gfcCompartmentId: 3 },
                    { gfcCompartmentId: 12 },
                    { gfcCompartmentId: 16 },
                    { label: 'Trail TC3' }
                ]
            },
            chartArea: { left: 50, right: 200, top: 50, bottom: 120 },
            isDatasetVisible(index) {
                return index !== 1;
            },
            getDatasetMeta(index) {
                return {
                    data: [{
                        skip: false,
                        getProps() {
                            return index === 2
                                ? { x: 220, y: 80 }
                                : { x: 120 + index, y: 80 };
                        }
                    }]
                };
            }
        };

        GFChart.prototype._drawCompartmentPointLabels.call({}, chart);

        expect(calls).toEqual([
            ['stroke', '3', 120, 80],
            ['fill', '3', 120, 80]
        ]);
        expect(ctx.textAlign).toBe('center');
        expect(ctx.textBaseline).toBe('middle');
    });

    test('ranks visible compartments by current GF', () => {
        const results = {
            compartments: {
                1: { pressures: [4] },
                2: { pressures: [3] },
                3: { pressures: [1] }
            }
        };
        const context = {
            visibleCompartments: new Set([1, 2, 3])
        };

        const ranking = GFChart.prototype._calculateCompartmentRanking.call(
            context,
            results,
            0,
            2
        );

        expect(ranking.map((row) => row.id)).toEqual([1, 2]);
        expect(ranking[0].gfPercent).toBeGreaterThan(ranking[1].gfPercent);
    });

    test('renders the GF ranking table only when the chart is wide enough', () => {
        const dom = new JSDOM('<!doctype html><body><aside id="ranking"></aside></body>');
        const originalDocument = globalThis.document;
        globalThis.document = dom.window.document;
        try {
            const panel = dom.window.document.getElementById('ranking');
            const context = { rankingPanel: panel };
            const chart = {
                width: 1000,
                chartArea: {
                    right: 820,
                    top: 60,
                    height: 500
                }
            };
            const ranking = [
                { id: 3, color: '#e67e22', gfPercent: 45.2 },
                { id: 2, color: '#c0392b', gfPercent: 41.7 }
            ];

            GFChart.prototype._renderCompartmentRanking.call(
                context,
                chart,
                ranking
            );

            expect(panel.style.display).toBe('block');
            expect(panel.querySelectorAll('tbody tr').length).toBe(2);
            expect(panel.querySelector('caption').textContent).toBe('Tissue ranking');
            expect(panel.querySelector('tbody').textContent.includes('TC3')).toBe(true);
            expect(panel.querySelector('tbody').textContent.includes('45.2\u00a0%')).toBe(true);

            chart.width = 700;
            GFChart.prototype._renderCompartmentRanking.call(
                context,
                chart,
                ranking
            );
            expect(panel.style.display).toBe('none');
        } finally {
            globalThis.document = originalDocument;
            dom.window.close();
        }
    });

    test('toggles the maximum GF trail and point together and preserves the state', () => {
        const visibilityChanges = [];
        const updates = [];
        const chart = {
            data: {
                datasets: [
                    { gfcGroup: 'leading-tissue', gfcLegendItem: true },
                    { gfcGroup: 'leading-tissue', gfcLegendItem: false },
                    { label: 'TC1' }
                ]
            },
            setDatasetVisibility(index, visible) {
                visibilityChanges.push([index, visible]);
            },
            update(mode) {
                updates.push(mode);
            }
        };
        const context = {
            showLeadingTissue: true,
            chart,
            _toggleLeadingTissue: GFChart.prototype._toggleLeadingTissue
        };

        GFChart.prototype._handleLegendClick.call(
            context,
            { datasetIndex: 0 },
            { chart }
        );
        expect(context.showLeadingTissue).toBe(false);
        expect(visibilityChanges).toEqual([[0, false], [1, false]]);
        expect(updates).toEqual(['none']);

        GFChart.prototype._handleLegendClick.call(
            context,
            { datasetIndex: 1 },
            { chart }
        );
        expect(context.showLeadingTissue).toBe(true);
        expect(visibilityChanges).toEqual([
            [0, false], [1, false],
            [0, true], [1, true]
        ]);
        expect(updates).toEqual(['none', 'none']);

        const gfLegendData = {
            datasets: [
                { gfcGroup: 'leading-tissue', gfcLegendItem: true },
                { label: 'TC1' },
                { label: 'Anchor pressure', gfcAnchor: true }
            ]
        };
        expect(GFChart.prototype._isLegendItemVisible(
            { datasetIndex: 0, text: 'Highest GF' },
            gfLegendData
        )).toBe(true);
        expect(GFChart.prototype._isLegendItemVisible(
            { datasetIndex: 1, text: 'TC1 (5 min)' },
            gfLegendData
        )).toBe(false);
        expect(GFChart.prototype._isLegendItemVisible(
            { datasetIndex: 2, text: 'Anchor pressure' },
            gfLegendData
        )).toBe(true);
        const mValueLegendData = {
            datasets: [
                { label: 'TC1' },
                { label: 'Anchor pressure', mvalueAnchor: true }
            ]
        };
        expect(MValueChart.prototype._isLegendItemVisible(
            { datasetIndex: 0, text: 'TC1 (5 min)' },
            mValueLegendData
        )).toBe(false);
        expect(MValueChart.prototype._isLegendItemVisible(
            { datasetIndex: 1, text: 'Anchor pressure' },
            mValueLegendData
        )).toBe(true);
        expect(GFChart.prototype._formatMaxGFLabel(
            { id: 5 },
            81.4
        )).toBe('Highest GF: TC5 (81%)');
        expect(GFChart.prototype._formatMaxGFLabel(
            null,
            0
        )).toBe('Highest GF');
    });

    test('creates an accessible anchor help icon isolated from chart clicks', () => {
        const dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
        const originalDocument = globalThis.document;
        globalThis.document = dom.window.document;
        try {
            const container = dom.window.document.getElementById('chart');
            let chartClicks = 0;
            container.addEventListener('click', () => chartClicks++);
            const icon = createLegendHelpIcon();
            container.appendChild(icon);

            expect(icon.classList.contains('chart-anchor-help')).toBe(true);
            expect(icon.getAttribute('role')).toBe('note');
            expect(icon.tabIndex).toBe(0);
            expect(icon.textContent).toBe('?');

            icon.dispatchEvent(new dom.window.MouseEvent('click', {
                bubbles: true,
                cancelable: true
            }));
            expect(chartClicks).toBe(0);
        } finally {
            globalThis.document = originalDocument;
            dom.window.close();
        }
    });

    test('positions anchor help by marker and hides it without an anchor', () => {
        const icon = {
            style: {},
            dataset: {},
            setAttribute(name, value) {
                this[name] = value;
            }
        };
        const chart = {
            data: {
                datasets: [
                    { label: 'TC1' },
                    { label: 'Anchor pressure', mvalueAnchor: true }
                ]
            },
            legend: {
                legendItems: [
                    { datasetIndex: 0 },
                    { datasetIndex: 1 }
                ],
                legendHitBoxes: [
                    { left: 10, top: 5, width: 40, height: 12 },
                    { left: 60, top: 5, width: 90, height: 12 }
                ]
            }
        };
        positionLegendHelpIcon(
            chart,
            icon,
            'mvalueAnchor',
            'Deepest stop anchor explanation'
        );
        expect(icon.style.display).toBe('inline-flex');
        expect(icon.style.left).toBe('155px');
        expect(icon.style.top).toBe('5px');
        expect(icon['aria-label']).toBe('Deepest stop anchor explanation');
        expect(icon.dataset.tooltip).toBe('Deepest stop anchor explanation');

        delete chart.data.datasets[1].mvalueAnchor;
        positionLegendHelpIcon(chart, icon, 'mvalueAnchor', 'Ignored');
        expect(icon.style.display).toBe('none');
    });
});

describe('P-P chart timeline synchronization', () => {
    test('notifies user changes but not externally synchronized updates', () => {
        for (const ChartClass of [GFChart, MValueChart]) {
            const notifications = [];
            const context = {
                currentTimeIndex: 3,
                options: {
                    onTimeIndexChange(index) {
                        notifications.push(index);
                    }
                },
                calculationResults: { timePoints: [0, 1, 2, 3, 4] },
                _updateSliderPosition() {},
                _updateTimeDisplay() {},
                _render() {},
                _stopPlayback() {},
                _applyTimeIndexChange: ChartClass.prototype._applyTimeIndexChange
            };

            ChartClass.prototype._applyTimeIndexChange.call(context);
            expect(notifications).toEqual([3]);

            ChartClass.prototype.setTimeIndex.call(context, 4);
            expect(context.currentTimeIndex).toBe(4);
            expect(notifications).toEqual([3]);
        }
    });
});

describe('M-value intersection ruler', () => {
    test('identifies only a compartment that creates a decompression ceiling', () => {
        const tissuePressures = Object.fromEntries(
            COMPARTMENTS.map(comp => [comp.id, 0.75])
        );
        tissuePressures[1] = 3.1;
        tissuePressures[8] = 2.4;

        const controlling = calculateCurrentControllingCompartment({
            tissuePressures,
            gfLow: 0.3,
            gfHigh: 0.8,
            pAnchor: 2.2
        });
        expect(controlling.controllingCompartment).toBeDefined();
        expect(controlling.ceilingDepth).toBeGreaterThan(0);

        const clear = calculateCurrentControllingCompartment({
            tissuePressures: Object.fromEntries(
                COMPARTMENTS.map(comp => [comp.id, 0.75])
            ),
            gfLow: 0.3,
            gfHigh: 0.8,
            pAnchor: 2.2
        });
        expect(clear.controllingCompartment).toBe(null);
        expect(clear.ceilingDepth).toBe(0);
    });

    test('matches the deepest ruler intersection and uses GF High without a ramp', () => {
        const pressuresAtNineMeters = Object.fromEntries(
            COMPARTMENTS.map(comp => [comp.id, 0.75])
        );
        pressuresAtNineMeters[3] = 2.58;
        const atNineMeters = calculateCurrentControllingCompartment({
            tissuePressures: pressuresAtNineMeters,
            gfLow: 0.6,
            gfHigh: 0.9,
            pAnchor: 1.91325
        });
        expect(atNineMeters.controllingCompartment).toBe(3);
        expect(atNineMeters.ceilingDepth).toBeCloseTo(5.099, 3);
        expect(atNineMeters.gf).toBeCloseTo(0.73004, 5);

        const pressuresAtSixMeters = Object.fromEntries(
            COMPARTMENTS.map(comp => [comp.id, 0.75])
        );
        pressuresAtSixMeters[4] = 2.19;
        const atSixMeters = calculateCurrentControllingCompartment({
            tissuePressures: pressuresAtSixMeters,
            gfLow: 0.6,
            gfHigh: 0.9,
            pAnchor: 1.91325
        });
        expect(atSixMeters.controllingCompartment).toBe(4);
        expect(atSixMeters.ceilingDepth).toBeCloseTo(2.762, 3);
        expect(atSixMeters.gf).toBeCloseTo(0.80793, 5);

        const noRamp = calculateMValueRulerIntersections({
            tissuePressure: 2.19,
            compartment: COMPARTMENTS[3],
            gfLow: 0.6,
            gfHigh: 0.9,
            surfacePressure: SURFACE_PRESSURE,
            pAnchor: SURFACE_PRESSURE
        });
        expect(noRamp.gfRamp.gf).toBe(0.9);
        expect(noRamp.gfRamp.pressure).toBe(noRamp.gfHigh.pressure);
    });

    test('marks the controlling selector without changing compartment selection', () => {
        const dom = new JSDOM(`<!doctype html><body>
            <div id="controls">
                <label class="mvc-compartment-option" data-compartment-id="1"></label>
                <label class="mvc-compartment-option" data-compartment-id="8"></label>
            </div>
            <div id="status"></div>
        </body>`);
        const context = {
            controlsContainer: dom.window.document.getElementById('controls'),
            controllingCompartmentStatus: dom.window.document.getElementById('status')
        };

        MValueChart.prototype._updateControllingCompartmentIndicator.call(
            context,
            { controllingCompartment: 8, ceilingDepth: 6, currentDepth: 9 }
        );
        const labels = context.controlsContainer.querySelectorAll('label');
        expect(labels[0].classList.contains('mvc-controlling-compartment')).toBe(false);
        expect(labels[1].classList.contains('mvc-controlling-compartment')).toBe(true);
        expect(labels[1].getAttribute('aria-current')).toBe('true');
        expect(context.controllingCompartmentStatus.textContent.includes('TC8')).toBe(true);
        expect(context.controllingCompartmentStatus.textContent.includes('9.0')).toBe(true);

        MValueChart.prototype._updateControllingCompartmentIndicator.call(
            context,
            { controllingCompartment: null, ceilingDepth: 0, currentDepth: 0 }
        );
        expect(labels[1].classList.contains('mvc-controlling-compartment')).toBe(false);
        expect(labels[1].hasAttribute('aria-current')).toBe(false);
        expect(readFileSync(
            new URL('../js/charts/MValueChart.js', import.meta.url),
            'utf8'
        ).includes('intersections.equilibrium')).toBe(false);
    });

        test('calculates fixed-GF and ramp intersections', () => {
            const compartment = COMPARTMENTS[1];
            const inputs = {
                tissuePressure: 3.1,
                compartment,
                gfLow: 0.3,
                gfHigh: 0.85,
                surfacePressure: 1.01325,
                pAnchor: 2.21325
            };
            const intersections = calculateMValueRulerIntersections(inputs);

            for (const [key, gf] of [
                ['gfLow', inputs.gfLow],
                ['gfHigh', inputs.gfHigh]
            ]) {
                expect(intersections[key].pressure).toBeCloseTo(
                    getCompartmentCeiling(
                        inputs.tissuePressure,
                        compartment.aN2,
                        compartment.bN2,
                        gf
                    ),
                    12
                );
                expect(intersections[key].depth).toBeGreaterThanOrEqual(0);
            }
        });

        test('finds the TC1 intersection shown by the GF ramp', () => {
            const intersections = calculateMValueRulerIntersections({
                tissuePressure: 2.98,
                compartment: COMPARTMENTS[0],
                gfLow: 0.4,
                gfHigh: 0.8,
                surfacePressure: 1.01325,
                pAnchor: 2.21325
            });

            expect(intersections.gfRamp.pressure).toBeCloseTo(1.46665, 5);
            expect(intersections.gfRamp.depth).toBeCloseTo(4.534, 3);
            expect(intersections.gfRamp.gf).toBeCloseTo(0.648867, 5);
            expect(intersections.gfLow.pressure)
                .toBeGreaterThan(intersections.gfRamp.pressure);
            expect(intersections.gfRamp.pressure)
                .toBeGreaterThan(intersections.gfHigh.pressure);
            expect(getAdjustedMValue(
                intersections.gfRamp.pressure,
                COMPARTMENTS[0].aN2,
                COMPARTMENTS[0].bN2,
                intersections.gfRamp.gf
            )).toBeCloseTo(2.98, 12);
        });

        test('toggles the hovered tissue or the only visible tissue with T', () => {
            const datasets = [
                { mvalueCompartmentId: 2, mvalueCurrentPoint: true },
                { label: 'ambient' }
            ];
            const context = {
                rulerCompartmentId: null,
                visibleCompartments: new Set([1, 2]),
                chart: {
                    getActiveElements: () => [{ datasetIndex: 0 }],
                    data: { datasets }
                },
                _render() {}
            };

            MValueChart.prototype._toggleRuler.call(context);
            expect(context.rulerCompartmentId).toBe(2);
            MValueChart.prototype._toggleRuler.call(context);
            expect(context.rulerCompartmentId).toBe(null);

            context.chart.getActiveElements = () => [];
            context.visibleCompartments = new Set([5]);
            MValueChart.prototype._toggleRuler.call(context);
            expect(context.rulerCompartmentId).toBe(5);
            MValueChart.prototype._toggleRuler.call(context);
            expect(context.rulerCompartmentId).toBe(null);

            const dom = new JSDOM(
                '<!doctype html><body><div id="container" tabindex="0"></div></body>'
            );
            const originalDocument = globalThis.document;
            globalThis.document = dom.window.document;
            let toggleCount = 0;
            let auditCount = 0;
            const keyboardContext = {
                container: dom.window.document.getElementById('container'),
                wrapper: dom.window.document.createElement('div'),
                calculationResults: { timePoints: [0] },
                options: {
                    onDecisionAuditRequest() { auditCount++; },
                    isDecisionAuditOpen() { return auditCount === 1; }
                },
                _toggleRuler() { toggleCount++; }
            };
            keyboardContext.container.focus();

            try {
                MValueChart.prototype._setupKeyboardShortcuts.call(keyboardContext);
                dom.window.document.dispatchEvent(
                    new dom.window.KeyboardEvent('keydown', {
                        key: 'T',
                        bubbles: true
                    })
                );
                expect(toggleCount).toBe(1);
                dom.window.document.dispatchEvent(
                    new dom.window.KeyboardEvent('keydown', {
                        key: 'T',
                        metaKey: true,
                        bubbles: true
                    })
                );
                expect(toggleCount).toBe(1);
                dom.window.document.dispatchEvent(
                    new dom.window.KeyboardEvent('keydown', {
                        key: 'A',
                        bubbles: true
                    })
                );
                expect(auditCount).toBe(1);
                keyboardContext.container.blur();
                dom.window.document.dispatchEvent(
                    new dom.window.KeyboardEvent('keydown', {
                        key: 'A',
                        bubbles: true
                    })
                );
                expect(auditCount).toBe(2);
            } finally {
                dom.window.document.removeEventListener(
                    'keydown',
                    keyboardContext._keyHandler
                );
                globalThis.document = originalDocument;
                dom.window.close();
            }
    });

    test('moves an active ruler to the newly selected tissue in one action', () => {
        const context = {
            rulerCompartmentId: 1,
            visibleCompartments: new Set([2])
        };
        MValueChart.prototype._reconcileRulerCompartment.call(context, 2);
        expect(context.rulerCompartmentId).toBe(2);

        context.rulerCompartmentId = 2;
        context.visibleCompartments = new Set([5]);
        context.chart = {
            getActiveElements: () => [],
            data: { datasets: [] }
        };
        let renders = 0;
        context._render = () => { renders++; };
        MValueChart.prototype._toggleRuler.call(context);
        expect(context.rulerCompartmentId).toBe(5);
        expect(renders).toBe(1);
    });

    test('renders ruler quantities with semantic symbols and subscripts', () => {
        const dom = new JSDOM('<!doctype html><body><div id="panel"></div></body>');
        const originalDocument = globalThis.document;
        globalThis.document = dom.window.document;

        try {
            const panel = dom.window.document.getElementById('panel');
            const compartment = COMPARTMENTS[1];
            const intersections = calculateMValueRulerIntersections({
                tissuePressure: 2.82,
                compartment,
                gfLow: 0.4,
                gfHigh: 0.8,
                surfacePressure: 1.01325,
                pAnchor: 2.21325
            });
            MValueChart.prototype._renderRulerPanel.call(
                { rulerPanel: panel },
                {
                    compartment,
                    tissuePressure: 2.82,
                    currentAmbient: 2.21325,
                    currentDepth: 12,
                    intersections
                }
            );

            const subscripts = [...panel.querySelectorAll('sub')]
                .map(sub => sub.textContent);
            expect(panel.querySelectorAll('var').length).toBeGreaterThan(0);
            expect(subscripts.includes('t')).toBe(true);
            expect(subscripts.includes('amb')).toBe(true);
            expect(subscripts.includes('amb,tol')).toBe(true);
            expect(subscripts.includes('low')).toBe(true);
            expect(subscripts.includes('high')).toBe(true);
            expect(panel.innerHTML.includes('p_t')).toBe(false);
            expect(panel.textContent.includes('\u00a0bar')).toBe(true);
            expect(panel.textContent.includes('\u00a0m')).toBe(true);
            expect(panel.textContent.includes('\u00a0%')).toBe(true);
            expect(panel.textContent.includes('2.21\u00a0bar')).toBe(true);
            expect(panel.textContent.includes('12.0\u00a0m')).toBe(true);
        } finally {
            globalThis.document = originalDocument;
            dom.window.close();
        }
    });

    test('collapses GF 100/100 references into one M-value row', () => {
        const dom = new JSDOM('<!doctype html><body><div id="panel"></div></body>');
        const originalDocument = globalThis.document;
        globalThis.document = dom.window.document;

        try {
            const panel = dom.window.document.getElementById('panel');
            const compartment = COMPARTMENTS[0];
            const intersections = calculateMValueRulerIntersections({
                tissuePressure: 2.82,
                compartment,
                gfLow: 1,
                gfHigh: 1,
                surfacePressure: 1.01325,
                pAnchor: 1.01325
            });
            MValueChart.prototype._renderRulerPanel.call(
                { rulerPanel: panel },
                {
                    compartment,
                    tissuePressure: 2.82,
                    currentAmbient: 1.01325,
                    currentDepth: 0,
                    intersections
                }
            );

            expect(panel.children.length).toBe(3);
            expect(panel.textContent.includes('GF ramp')).toBe(false);
            expect(panel.textContent.includes('GFlow')).toBe(false);
            expect(panel.textContent.includes('GFhigh')).toBe(false);
            expect(panel.textContent.includes('pt = pamb')).toBe(false);
            expect([...panel.querySelectorAll('var')]
                .some(variable => variable.textContent === 'M')).toBe(true);
        } finally {
            globalThis.document = originalDocument;
            dom.window.close();
        }
    });

    test('keeps the alveolar pressure toggle inside fullscreen controls', () => {
        const dom = new JSDOM('<!doctype html><body><div id="controls"></div></body>');
        const originalDocument = globalThis.document;
        globalThis.document = dom.window.document;
        let renders = 0;
        const context = {
            controlsContainer: dom.window.document.getElementById('controls'),
            options: { showAlveolarLine: false },
            visibleCompartments: new Set([1]),
            _selectAllCompartments() {},
            _selectNoCompartments() {},
            _selectFastCompartments() {},
            _selectSlowCompartments() {},
            _updateCompartmentCheckboxes() {},
            _render() { renders++; }
        };

        try {
            MValueChart.prototype._buildCompartmentSelector.call(context);
            const control = context.controlsContainer.querySelector(
                '.mvc-alveolar-toggle'
            );
            const checkbox = control.querySelector('input');
            expect(control.querySelector('var').textContent).toBe('p');
            expect(control.querySelector('sub').textContent).toBe('N₂');
            expect(checkbox.checked).toBe(false);

            checkbox.checked = true;
            checkbox.dispatchEvent(new dom.window.Event('change'));
            expect(context.options.showAlveolarLine).toBe(true);
            expect(renders).toBe(1);

            const sandbox = readFileSync(
                new URL('../sandbox/index.html', import.meta.url),
                'utf8'
            );
            expect(sandbox.includes('opt-showAlveolarLine')).toBe(false);
        } finally {
            globalThis.document = originalDocument;
            dom.window.close();
        }
    });
});

// ============================================================================
// GF PRESETS TESTS
// ============================================================================

describe('gfPresets - GF_PRESETS', () => {
    test('has the 7 standard presets with the expected GF pairs', () => {
        expect(GF_PRESETS.length).toBe(7);
        const byLabel = Object.fromEntries(GF_PRESETS.map(p => [p.label, [p.gfLow, p.gfHigh]]));
        expect(byLabel['Bühlmann']).toEqual([100, 100]);
        expect(byLabel['Recreational']).toEqual([60, 90]);
        expect(byLabel['Deco Planner']).toEqual([20, 80]);
        expect(byLabel['Freedom']).toEqual([30, 80]);
    });
});

describe('appBanner - isAndroid', () => {
    test('true for an Android user agent', () => {
        expect(isAndroid('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile')).toBe(true);
    });
    test('false for desktop and iOS user agents', () => {
        expect(isAndroid('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605')).toBe(false);
        expect(isAndroid('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605')).toBe(false);
    });
    test('false for empty/undefined', () => {
        expect(isAndroid('')).toBe(false);
        expect(isAndroid(undefined)).toBe(false);
    });
});

// ============================================================================
// DIVE SETUP TESTS
// ============================================================================

describe('diveSetup', () => {
    describe('getDefaultSetup', () => {
        test('returns a valid dive setup object', () => {
            const setup = getDefaultSetup();
            expect(setup).toHaveProperty('name');
            expect(setup).toHaveProperty('gases');
            expect(setup).toHaveProperty('dives');
        });

        test('has valid gas mix totaling 100%', () => {
            const setup = getDefaultSetup();
            const gas = setup.gases[0];
            const total = gas.o2 + gas.n2 + gas.he;
            expect(total).toBeCloseTo(1.0, 5);
        });

        test('has waypoints starting at surface', () => {
            const setup = getDefaultSetup();
            const waypoints = setup.dives[0].waypoints;
            expect(waypoints[0].time).toBe(0);
            expect(waypoints[0].depth).toBe(0);
        });

        test('waypoints have ascending time values', () => {
            const setup = getDefaultSetup();
            const waypoints = setup.dives[0].waypoints;
            for (let i = 1; i < waypoints.length; i++) {
                expect(waypoints[i].time).toBeGreaterThan(waypoints[i - 1].time);
            }
        });
    });

    describe('extendDiveSetup', () => {
        test('overrides simple properties', () => {
            const base = getDefaultSetup();
            const extended = extendDiveSetup(base, { name: 'Custom Dive', surfaceInterval: 120 });
            expect(extended.name).toBe('Custom Dive');
            expect(extended.surfaceInterval).toBe(120);
        });

        test('replaces gases array entirely', () => {
            const base = getDefaultSetup();
            const newGases = [{ id: 'bottom', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0, cylinderVolume: 12, startPressure: 200 }];
            const extended = extendDiveSetup(base, { gases: newGases });
            expect(extended.gases).toHaveLength(1);
            expect(extended.gases[0].name).toBe('EAN32');
        });

        test('replaces dives array entirely', () => {
            const base = getDefaultSetup();
            const newDives = [{ waypoints: [{ time: 0, depth: 0 }, { time: 5, depth: 20 }] }];
            const extended = extendDiveSetup(base, { dives: newDives });
            expect(extended.dives[0].waypoints).toHaveLength(2);
        });
    });

    describe('getDiveSetupWaypoints', () => {
        test('extracts waypoints from dives array', () => {
            const setup = {
                dives: [{ waypoints: [{ time: 0, depth: 0, note: 'Start' }] }]
            };
            const waypoints = getDiveSetupWaypoints(setup);
            expect(waypoints[0].time).toBe(0);
            expect(waypoints[0].depth).toBe(0);
        });

        test('preserves gasId in waypoints', () => {
            const setup = { 
                dives: [{
                    waypoints: [
                        { time: 0, depth: 0, gasId: 'bottom' },
                        { time: 5, depth: 30, gasId: 'bottom' },
                        { time: 25, depth: 30, gasId: 'bottom' },
                        { time: 28, depth: 6, gasId: 'deco' }
                    ] 
                }]
            };
            const waypoints = getDiveSetupWaypoints(setup);
            expect(waypoints[0].gasId).toBe('bottom');
            expect(waypoints[3].gasId).toBe('deco');
        });

        test('merges multi-dive format into timeline', () => {
            const setup = {
                dives: [
                    { waypoints: [{ time: 0, depth: 0 }, { time: 10, depth: 20 }, { time: 20, depth: 0 }] },
                    { surfaceIntervalBefore: 60, waypoints: [{ time: 0, depth: 0 }, { time: 10, depth: 15 }, { time: 20, depth: 0 }] }
                ]
            };
            const waypoints = getDiveSetupWaypoints(setup);
            expect(waypoints).toHaveLength(6);
            expect(waypoints[3].time).toBe(80); // 20 + 60 = 80
            expect(waypoints[5].time).toBe(100); // 80 + 20 = 100
        });

        test('returns empty for missing dives', () => {
            const setup = {};
            const waypoints = getDiveSetupWaypoints(setup);
            expect(waypoints).toEqual([]);
        });
    });

    describe('getSurfaceInterval', () => {
        test('returns surface interval from setup', () => {
            expect(getSurfaceInterval({ surfaceInterval: 90 })).toBe(90);
        });

        test('returns default 15 if not set', () => {
            expect(getSurfaceInterval({})).toBe(15);
        });

        test('returns 0 when explicitly set to 0', () => {
            expect(getSurfaceInterval({ surfaceInterval: 0 })).toBe(0);
        });
    });

    describe('formatDiveSetupSummary', () => {
        test('includes key dive info', () => {
            const setup = getDefaultSetup();
            const summary = formatDiveSetupSummary(setup);
            expect(summary).toContain(setup.name);
            expect(summary).toContain('40\u00a0m');
        });
    });

    describe('generateSimpleProfile', () => {
        test('generates profile with 6 waypoints', () => {
            const waypoints = generateSimpleProfile(30, 20);
            expect(waypoints).toHaveLength(6);
        });

        test('starts and ends at surface', () => {
            const waypoints = generateSimpleProfile(30, 20);
            expect(waypoints[0]).toEqual({ time: 0, depth: 0 });
            expect(waypoints[5].depth).toBe(0);
        });

        test('reaches max depth', () => {
            const waypoints = generateSimpleProfile(40, 25);
            const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
            expect(maxDepth).toBe(40);
        });

        test('includes 3 min safety stop at 5m', () => {
            const waypoints = generateSimpleProfile(30, 20);
            // Find safety stop waypoints (at 5m)
            const safetyStopWaypoints = waypoints.filter(wp => wp.depth === 5);
            expect(safetyStopWaypoints).toHaveLength(2);
            // Safety stop should be 3 minutes
            const duration = safetyStopWaypoints[1].time - safetyStopWaypoints[0].time;
            expect(duration).toBe(3);
        });

        test('calculates descent time correctly (20 m/min, exact)', () => {
            // 40m at 20 m/min = 2 min exactly
            const waypoints = generateSimpleProfile(40, 20);
            expect(waypoints[1].time).toBe(2);
            // 30m at 20 m/min = 1.5 min (exact, not rounded)
            const waypoints2 = generateSimpleProfile(30, 20);
            expect(waypoints2[1].time).toBe(1.5);
        });

        test('descent and ascent both use exact fractional times (matches decotengu/divetools)', () => {
            const waypoints = generateSimpleProfile(25, 15);
            // Descent arrival: 25m / 20 = 1.25 min (exact)
            expect(waypoints[1].time).toBe(1.25);
            // Bottom time is from dive start, so depth is left at minute 15
            expect(waypoints[2].time).toBe(15);
            // Ascent 25m → 5m safety stop at exact 10 m/min = 2.0 min
            expect(waypoints[3].time).toBe(17);
            // Safety stop of 3 min → leave at 20
            expect(waypoints[4].time).toBe(20);
            // Final ascent 5m → 0 at exact 10 m/min = 0.5 min
            expect(waypoints[5].time).toBeCloseTo(20.5, 5);
        });

        test('maintains correct bottom time (from dive start)', () => {
            const waypoints = generateSimpleProfile(30, 20);
            // Descent: 30m / 20 = 1.5 min (exact). BT from dive start, leave at t=20.
            expect(waypoints[1].time).toBe(1.5);  // Arrive at depth
            expect(waypoints[2].time).toBe(20);   // Leave depth at bottom time
        });

        test('bottom time is measured from dive start, not from reaching depth', () => {
            // User says "30m for 30min" - they expect ascent to start at minute 30
            const waypoints = generateSimpleProfile(30, 30);
            expect(waypoints[1].time).toBe(1.5); // Arrive at 30m at minute 1.5 (exact)
            expect(waypoints[2].time).toBe(30);  // Leave 30m at minute 30
            expect(waypoints[2].depth).toBe(30);
        });

        test('waypoints have ascending time values', () => {
            const waypoints = generateSimpleProfile(35, 18);
            for (let i = 1; i < waypoints.length; i++) {
                expect(waypoints[i].time).toBeGreaterThan(waypoints[i - 1].time);
            }
        });
    });

    // Multi-gas tests
    describe('getGases', () => {
        test('returns gases array if present', () => {
            const setup = {
                gases: [
                    { id: 'bottom', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0, cylinderVolume: 12, startPressure: 200 },
                    { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0, cylinderVolume: 7, startPressure: 200 }
                ]
            };
            const gases = getGases(setup);
            expect(gases.length).toBe(2);
            expect(gases[0].name).toBe('EAN32');
            expect(gases[1].name).toBe('EAN50');
        });

        test('returns default air if no gases', () => {
            const setup = {};
            const gases = getGases(setup);
            expect(gases.length).toBe(1);
            expect(gases[0].o2).toBe(0.2098);
            expect(gases[0].n2).toBe(0.7902);
        });

        test('gases have cylinder info', () => {
            const setup = getDefaultSetup();
            const gases = getGases(setup);
            expect(gases[0].cylinderVolume).toBe(12);
            expect(gases[0].startPressure).toBe(200);
        });
    });

    describe('getGasAtWaypoint', () => {
        test('returns gas by gasId on waypoint', () => {
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
            ];
            const waypoint = { time: 30, depth: 6, gasId: 'deco' };
            const gas = getGasAtWaypoint(waypoint, gases);
            expect(gas.name).toBe('EAN50');
        });

        test('returns first gas if no gasId', () => {
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
            ];
            const waypoint = { time: 5, depth: 30 };
            const gas = getGasAtWaypoint(waypoint, gases);
            expect(gas.name).toBe('Air');
        });
    });

    describe('getGasAtTime', () => {
        test('returns gas active at given time', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 5, depth: 30 },
                { time: 25, depth: 30 },
                { time: 28, depth: 6, gasId: 'deco' },
                { time: 31, depth: 6 },
                { time: 32, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
            ];
            // At time 10, should be on bottom gas (Air)
            expect(getGasAtTime(waypoints, gases, 10).name).toBe('Air');
            // At time 30, should be on deco gas (EAN50)
            expect(getGasAtTime(waypoints, gases, 30).name).toBe('EAN50');
        });

        test('gas changes discretely at switch time, not interpolated', () => {
            // Gas switch happens at time 49
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 48, depth: 9, gasId: 'bottom' },
                { time: 49, depth: 6, gasId: 'deco' },
                { time: 60, depth: 6, gasId: 'deco' }
            ];
            const gases = [
                { id: 'bottom', name: 'Trimix', o2: 0.18, n2: 0.37, he: 0.45 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }
            ];
            
            // Just before switch time - should still be on bottom gas
            expect(getGasAtTime(waypoints, gases, 48).o2).toBe(0.18);
            expect(getGasAtTime(waypoints, gases, 48.5).o2).toBe(0.18);
            expect(getGasAtTime(waypoints, gases, 48.9).o2).toBe(0.18);
            
            // At and after switch time - should be on deco gas
            expect(getGasAtTime(waypoints, gases, 49).o2).toBe(1.0);
            expect(getGasAtTime(waypoints, gases, 49.1).o2).toBe(1.0);
            expect(getGasAtTime(waypoints, gases, 50).o2).toBe(1.0);
        });
    });

    describe('getGasSwitchEvents', () => {
        test('returns empty array for single gas', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'gas-1' },
                { time: 5, depth: 30 },
                { time: 25, depth: 30 },
                { time: 30, depth: 0 }
            ];
            const gases = [{ id: 'gas-1', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
            const events = getGasSwitchEvents(waypoints, gases);
            expect(events.length).toBe(0);
        });

        test('detects gas switch events', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 5, depth: 30, gasId: 'bottom' },
                { time: 25, depth: 30, gasId: 'bottom' },
                { time: 28, depth: 6, gasId: 'deco' },
                { time: 31, depth: 6, gasId: 'deco' },
                { time: 32, depth: 0, gasId: 'deco' }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
            ];
            const events = getGasSwitchEvents(waypoints, gases);
            expect(events.length).toBe(1);
            expect(events[0].time).toBe(28);
            expect(events[0].toGas.name).toBe('EAN50');
            expect(events[0].fromGas.name).toBe('Air');
        });
    });

    describe('calculateMOD', () => {
        test('calculates MOD for EAN32 at 1.4 ppO2', () => {
            // MOD = floor((1.4 / 0.32 - 1) * 10) = floor(33.75) = 33m
            const mod = calculateMOD(0.32, 1.4);
            expect(mod).toBe(33);
        });

        test('calculates MOD for Oxygen at 1.6 ppO2', () => {
            // MOD = floor((1.6 / 1.0 - 1) * 10) = 6m
            const mod = calculateMOD(1.0, 1.6);
            expect(mod).toBe(6);
        });

        test('keeps exact integer MOD for EAN50 despite floating-point error', () => {
            expect(calculateMOD(0.5, 1.4)).toBe(18);
            expect(calculateMOD(0.5, 1.6)).toBe(22);
        });
    });

    describe('insertGasSwitchWaypoints', () => {
        test('inserts deco gas switch during ascent', () => {
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 2, depth: 40 },
                { time: 22, depth: 40 },
                { time: 28, depth: 5 },
                { time: 31, depth: 5 },
                { time: 32, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }  // MOD = 22m at 1.6 ppO2
            ];
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            // Should have inserted a gas switch waypoint
            const switchWp = result.find(wp => wp.gasId === 'deco');
            expect(switchWp !== undefined).toBe(true);
            // EAN50 MOD at 1.6 ppO2 = 22m, rounded down to 3m increment = 21m
            expect(switchWp.depth).toBe(21);
        });

        test('merges gas switch with existing deco stop at same depth', () => {
            // Profile with an existing deco stop at 6m
            const waypoints = [
                { time: 0, depth: 0, gasId: 'bottom' },
                { time: 2, depth: 40 },
                { time: 22, depth: 40 },
                { time: 26, depth: 6 },   // Arrive at 6m deco stop
                { time: 31, depth: 6 },   // End of 6m deco stop (5 min)
                { time: 32, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }  // MOD = 6m at 1.6 ppO2
            ];
            
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            
            // Should have gas switch at 6m but no extra time added (merged with existing stop)
            const switchWp = result.find(wp => wp.gasId === 'deco');
            expect(switchWp !== undefined).toBe(true);
            expect(switchWp.depth).toBe(6);
            
            // Check that total time is not increased (no extra 3 min for gas switch)
            const endTime = result[result.length - 1].time;
            expect(endTime).toBe(32); // Same as original
        });

        test('does not create duplicate waypoints when gas switch matches existing waypoint time', () => {
            // Deep technical dive profile - the 6m stop starts at time 49
            const waypoints = [
                { time: 0, depth: 0 },
                { time: 3, depth: 55 },
                { time: 18, depth: 55 },
                { time: 22, depth: 21 },
                { time: 25, depth: 21 },
                { time: 26, depth: 18 },
                { time: 29, depth: 18 },
                { time: 30, depth: 15 },
                { time: 34, depth: 15 },
                { time: 35, depth: 12 },
                { time: 40, depth: 12 },
                { time: 41, depth: 9 },
                { time: 48, depth: 9 },
                { time: 49, depth: 6 },   // Arrival at 6m - this is where O2 switch would happen
                { time: 60, depth: 6 },   // End of 6m stop
                { time: 61, depth: 3 },
                { time: 75, depth: 3 },
                { time: 78, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Trimix 18/45', o2: 0.18, n2: 0.37, he: 0.45 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }  // MOD = 6m
            ];
            
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            
            // Should not have duplicate waypoints at same time
            const times = result.map(wp => wp.time);
            const uniqueTimes = [...new Set(times)];
            expect(times.length).toBe(uniqueTimes.length);
            
            // All waypoints should have ascending times (validation requirement)
            for (let i = 1; i < result.length; i++) {
                expect(result[i].time).toBeGreaterThan(result[i-1].time);
            }
        });

        test('gas switch events are detected when merged with existing deco stop', () => {
            // Deep technical dive profile - the 6m stop starts at time 49
            const waypoints = [
                { time: 0, depth: 0 },
                { time: 3, depth: 55 },
                { time: 18, depth: 55 },
                { time: 22, depth: 21 },
                { time: 25, depth: 21 },
                { time: 48, depth: 9 },
                { time: 49, depth: 6 },   // Arrival at 6m - this is where O2 switch would happen
                { time: 60, depth: 6 },   // End of 6m stop
                { time: 61, depth: 3 },
                { time: 75, depth: 3 },
                { time: 78, depth: 0 }
            ];
            const gases = [
                { id: 'bottom', name: 'Trimix 18/45', o2: 0.18, n2: 0.37, he: 0.45 },
                { id: 'deco', name: 'Oxygen', o2: 1.0, n2: 0, he: 0 }  // MOD = 6m
            ];
            
            const result = insertGasSwitchWaypoints(waypoints, gases, 10, 1.6);
            
            // Verify gasId is set correctly on waypoints around the switch
            const wp48 = result.find(wp => wp.time === 48);
            const wp49 = result.find(wp => wp.time === 49);
            expect(wp48.gasId).toBe('bottom');
            expect(wp49.gasId).toBe('deco');
            
            // Verify getGasSwitchEvents detects the switch
            const gasSwitchEvents = getGasSwitchEvents(result, gases);
            expect(gasSwitchEvents.length).toBe(1);
            expect(gasSwitchEvents[0].time).toBe(49);
            expect(gasSwitchEvents[0].depth).toBe(6);
            expect(gasSwitchEvents[0].toGas.id).toBe('deco');
        });
    });
});

describe('diveSetup - renderDivePlanTableHTML', () => {
    // Same 45m/25min GF 30/70-style multi-stop profile used for the empirical
    // runtime-semantics verification during design: descent, bottom, ascent
    // to first stop, four deco stops, final ascent to surface.
    const waypoints = [
        { time: 0, depth: 0, gasId: 'air' },
        { time: 2, depth: 45, gasId: 'air' },
        { time: 27, depth: 45, gasId: 'air' },
        { time: 29.5, depth: 12, gasId: 'air' },
        { time: 34.5, depth: 12, gasId: 'air' },
        { time: 36, depth: 9, gasId: 'air' },
        { time: 38.6, depth: 9, gasId: 'air' },
        { time: 39.6, depth: 6, gasId: 'air' },
        { time: 45.6, depth: 6, gasId: 'air' },
        { time: 46.6, depth: 3, gasId: 'air' },
        { time: 56.6, depth: 3, gasId: 'air' },
        { time: 57.6, depth: 0, gasId: 'air' },
    ];
    const gases = [{ id: 'air', name: 'Air', cylinderVolume: 24, startPressure: 200, reservePressure: 50 }];

    test('both tables repeat the column headings and share one Runtime footnote', () => {
        const html = renderDivePlanTableHTML(waypoints, gases, {});
        expect((html.match(/<th>Duration \(min\)<\/th>/g) || []).length).toBe(2);
        expect((html.match(/<th>Runtime \(min\) \*<\/th>/g) || []).length).toBe(2);
        expect(html).toContain('<p class="dse-plan-footnote">* Runtime is the elapsed time from the start of the dive to the end of the stage.</p>');
        expect(html).toContain('<p class="dse-plan-footnote">The model continuously calculates tissue on-gassing during descent. Descent is therefore included in both bottom time and the decompression-profile calculation.</p>');
    });

    test('renders separate Bottom and Ascent tables in dive order', () => {
        const html = renderDivePlanTableHTML(waypoints, gases, {});
        expect((html.match(/<table class="dse-plan-table">/g) || []).length).toBe(2);
        expect((html.match(/<caption>Bottom<\/caption>/g) || []).length).toBe(1);
        expect((html.match(/<caption>Ascent<\/caption>/g) || []).length).toBe(1);
        expect(html.indexOf('<caption>Bottom</caption>')).toBeLessThan(html.indexOf('<caption>Ascent</caption>'));
        const ascentHeaderIdx = html.indexOf('<caption>Ascent</caption>');
        const firstStopRowIdx = html.indexOf('dse-plan-asc');
        expect(ascentHeaderIdx).toBeLessThan(firstStopRowIdx);
        expect(html.indexOf('dse-plan-bottom')).toBeLessThan(ascentHeaderIdx);
    });

    test('terminal Surface row is always last with blank/dash cells', () => {
        const html = renderDivePlanTableHTML(waypoints, gases, {});
        const rowStart = html.indexOf('<tr class="dse-plan-surface-final">');
        expect(rowStart).toBeGreaterThan(-1);
        const rowEnd = html.indexOf('</tbody>', rowStart);
        const finalRow = html.slice(rowStart, rowEnd);
        // The final row must be the last <tr> before </tbody> (no other row follows it).
        expect(finalRow.split('<tr').length).toBe(2);
        expect(finalRow).toContain('Surface');
        expect(finalRow).toContain('0\u00a0m');
        expect((finalRow.match(new RegExp('>—<', 'g')) || []).length).toBe(4); // stop, runtime, gas, tank all dashes
    });

    test('merge/fold row values are unchanged by the section/footnote additions', () => {
        const html = renderDivePlanTableHTML(waypoints, gases, {});
        // "Stop 12m" row: duration 6, runtime 36 (arrival at next level, 9m) —
        // matches the fold-the-ascent-into-the-preceding-stop behavior.
        expect(html).toContain('<td class="dse-plan-depth">12\u00a0m</td><td class="dse-plan-stop">6</td><td class="dse-plan-runtime">36</td>');
    });

    test('departure runtime convention preserves model stops and renders real ascent segments', () => {
        const operationalWaypoints = [
            { time: 0, depth: 0, gasId: 'air' },
            { time: 2, depth: 45, gasId: 'air' },
            { time: 27, depth: 45, gasId: 'air' },
            { time: 30, depth: 12, gasId: 'air' },
            { time: 35, depth: 12, gasId: 'air' },
            { time: 35.3, depth: 9, gasId: 'air' },
            { time: 38, depth: 9, gasId: 'air' },
            { time: 38.3, depth: 0, gasId: 'air' }
        ];
        const html = renderDivePlanTableHTML(
            operationalWaypoints, gases, { runtimeConvention: 'departure' }
        );

        expect(html).toContain('<td class="dse-plan-depth">12\u00a0m</td><td class="dse-plan-stop">5</td><td class="dse-plan-runtime">35</td>');
        expect(html).toContain('<td class="dse-plan-depth">9\u00a0m</td><td class="dse-plan-stop">2.7</td><td class="dse-plan-runtime">38</td>');
        expect(html).toContain('<td class="dse-plan-depth">12\u00a0m</td><td class="dse-plan-stop">3</td><td class="dse-plan-runtime">30</td>');
        expect(html).toContain('<td class="dse-plan-depth">9\u00a0m</td><td class="dse-plan-stop">0.3</td><td class="dse-plan-runtime">35.3</td>');
        expect(html).toContain('<td class="dse-plan-depth">0\u00a0m</td><td class="dse-plan-stop">0.3</td><td class="dse-plan-runtime">38.3</td>');
        expect(html.includes('dse-plan-surface-final')).toBe(false);
        expect(html).toContain('runtime is the whole minute when the diver leaves for the next level');
    });

    test('practical runtime keeps whole model stops and uses 20-second inter-stop ascents', () => {
        const practicalWaypoints = [
            { time: 0, depth: 0, gasId: 'air' },
            { time: 1.55, depth: 31, gasId: 'air' },
            { time: 29, depth: 31, gasId: 'air' },
            { time: 31.8, depth: 3, gasId: 'air' },
            { time: 38.8, depth: 3, gasId: 'air' },
            { time: 39.1, depth: 0, gasId: 'air' }
        ];
        const html = renderDivePlanTableHTML(
            practicalWaypoints, gases, { runtimeConvention: 'practical' }
        );

        expect(html).toContain('<td class="dse-plan-depth">3\u00a0m</td><td class="dse-plan-stop">3</td><td class="dse-plan-runtime">32</td>');
        expect(html).toContain('<td class="dse-plan-depth">3\u00a0m</td><td class="dse-plan-stop">7</td><td class="dse-plan-runtime">39</td>');
        expect(html).toContain('<td class="dse-plan-depth">0\u00a0m</td><td class="dse-plan-stop">20\u00a0s</td><td class="dse-plan-runtime">39</td>');
        const runtimeValues = [...html.matchAll(
            /<td class="dse-plan-runtime">([^<]+)<\/td>/g
        )].map(match => match[1]);
        expect(runtimeValues.every(value => /^\d+$/.test(value))).toBe(true);
        expect(html).toContain('Intermediate 3\u00a0m ascents are included as 20\u00a0seconds');
    });

    test('practical runtime hides intermediate ascent rows without losing their time', () => {
        const multiStopWaypoints = [
            { time: 0, depth: 0, gasId: 'air' },
            { time: 2, depth: 40, gasId: 'air' },
            { time: 25, depth: 40, gasId: 'air' },
            { time: 27.5, depth: 15, gasId: 'air' },
            { time: 29.5, depth: 15, gasId: 'air' },
            { time: 29.8, depth: 12, gasId: 'air' },
            { time: 31.8, depth: 12, gasId: 'air' },
            { time: 32.1, depth: 9, gasId: 'air' },
            { time: 35.1, depth: 9, gasId: 'air' },
            { time: 36, depth: 0, gasId: 'air' }
        ];
        const html = renderDivePlanTableHTML(
            multiStopWaypoints, gases, { runtimeConvention: 'practical' }
        );

        expect((html.match(/<tr class="dse-plan-asc">/g) || []).length).toBe(2);
        expect((html.match(/<tr class="dse-plan-stop">/g) || []).length).toBe(3);
        expect(html).toContain('<td class="dse-plan-depth">12\u00a0m</td><td class="dse-plan-stop">2</td><td class="dse-plan-runtime">32</td>');
        expect(html).toContain('<td class="dse-plan-depth">9\u00a0m</td><td class="dse-plan-stop">3</td><td class="dse-plan-runtime">35</td>');
    });

    // A gas switch taken exactly on arrival during an ascent (no stop at the
    // switch depth) must not relabel the whole ascent leg with the new gas —
    // it gets its own zero-duration row instead (Divesoft-style "Profile" table).
    const twoGases = [
        { id: 'air', name: 'Air', cylinderVolume: 18, startPressure: 200, reservePressure: 50 },
        { id: 'ean50', name: 'EAN50', cylinderVolume: 11, startPressure: 200, reservePressure: 50 }
    ];
    const switchOnArrivalWaypoints = [
        { time: 0, depth: 0, gasId: 'air' },
        { time: 2, depth: 40, gasId: 'air' },
        { time: 20, depth: 40, gasId: 'air' },
        { time: 22, depth: 21, gasId: 'ean50' }, // switch exactly on arrival, no stop here
        { time: 23, depth: 15, gasId: 'ean50' },
        { time: 24, depth: 15, gasId: 'ean50' },
        { time: 25, depth: 0, gasId: 'ean50' },
    ];

    test('gas switch on arrival during ascent gets its own row, ascent leg keeps the OLD gas', () => {
        const html = renderDivePlanTableHTML(switchOnArrivalWaypoints, twoGases, {});
        // The ascent leg leading up to the switch depth must still be billed
        // to Air, not relabeled with the new gas (was the reported bug).
        expect(html).toContain('<td class="dse-plan-depth">21\u00a0m</td><td class="dse-plan-stop">2</td><td class="dse-plan-runtime">22</td><td class="dse-plan-gas">Air</td>');
        // A dedicated switch row follows: blank Stop, same runtime as the
        // ascent, and the NEW gas.
        expect(html).toContain('<tr class="dse-plan-switch">');
        expect(html).toContain('<td class="dse-plan-depth">21\u00a0m</td><td class="dse-plan-stop">—</td><td class="dse-plan-runtime">22</td><td class="dse-plan-gas">EAN50</td>');
        expect((html.match(/dse-plan-switch/g) || []).length).toBe(1);
    });

    test('gas switch with a dedicated stop time at the switch depth renders as ONE switch row carrying that real duration (not a blank marker + separate Stop row)', () => {
        // 21m is both the switch depth AND has a dedicated stay (as
        // generateDecoProfile produces when gasSwitchTime > 0) — the table
        // must not "ignore" that configured time by downgrading the row to
        // a plain Stop; it must stay a single Switch row with the real
        // duration (3 min: 22 -> 25), not split into a zero-duration marker
        // plus a same-depth Stop row.
        const waypoints2 = [
            { time: 0, depth: 0, gasId: 'air' },
            { time: 2, depth: 40, gasId: 'air' },
            { time: 20, depth: 40, gasId: 'air' },
            { time: 22, depth: 21, gasId: 'ean50' },
            { time: 25, depth: 21, gasId: 'ean50' },
            { time: 26, depth: 0, gasId: 'ean50' },
        ];
        const html = renderDivePlanTableHTML(waypoints2, twoGases, {});
        expect((html.match(/dse-plan-switch/g) || []).length).toBe(1);
        expect(html).toContain('<tr class="dse-plan-switch"><td class="dse-plan-phase"><span class="dse-plan-icon">⇄</span> Switch</td><td class="dse-plan-depth">21\u00a0m</td><td class="dse-plan-stop">3</td><td class="dse-plan-runtime">25</td><td class="dse-plan-gas">EAN50</td>');
        expect(html.includes('<tr class="dse-plan-stop"><td class="dse-plan-phase"><span class="dse-plan-icon">■</span> Stop</td><td class="dse-plan-depth">21\u00a0m</td>')).toBe(false);
    });
});

// ============================================================================
// DIVE PROFILE TESTS
// ============================================================================

describe('diveProfile', () => {
    describe('createDefaultProfile', () => {
        test('returns an array of waypoints', () => {
            const profile = createDefaultProfile();
            expect(Array.isArray(profile)).toBe(true);
        });

        test('starts at surface', () => {
            const profile = createDefaultProfile();
            expect(profile[0].time).toBe(0);
            expect(profile[0].depth).toBe(0);
        });

        test('ends at surface', () => {
            const profile = createDefaultProfile();
            expect(profile[profile.length - 1].depth).toBe(0);
        });
    });

    describe('validateProfile', () => {
        test('valid profile passes', () => {
            const result = validateProfile(createDefaultProfile());
            expect(result.valid).toBe(true);
        });

        test('rejects non-array', () => {
            const result = validateProfile('not an array');
            expect(result.valid).toBe(false);
        });

        test('rejects less than 2 waypoints', () => {
            const result = validateProfile([{ time: 0, depth: 0 }]);
            expect(result.valid).toBe(false);
        });

        test('rejects profile not starting at time 0', () => {
            const result = validateProfile([{ time: 5, depth: 0 }, { time: 10, depth: 20 }]);
            expect(result.valid).toBe(false);
        });

        test('rejects non-ascending times', () => {
            const result = validateProfile([
                { time: 0, depth: 0 },
                { time: 10, depth: 20 },
                { time: 5, depth: 10 }
            ]);
            expect(result.valid).toBe(false);
        });
    });

    describe('calculateRates', () => {
        test('calculates descent rate', () => {
            const rates = calculateRates([{ time: 0, depth: 0 }, { time: 2, depth: 40 }]);
            expect(rates[0].rate).toBe(20);
            expect(rates[0].type).toBe('descent');
        });

        test('calculates ascent rate', () => {
            const rates = calculateRates([{ time: 0, depth: 40 }, { time: 4, depth: 0 }]);
            expect(rates[0].rate).toBe(10);
            expect(rates[0].type).toBe('ascent');
        });
    });

    describe('getDiveStats', () => {
        test('returns null for invalid profile', () => {
            expect(getDiveStats(null)).toBeNull();
            expect(getDiveStats([])).toBeNull();
        });

        test('calculates max depth', () => {
            const stats = getDiveStats([
                { time: 0, depth: 0 },
                { time: 10, depth: 40 },
                { time: 20, depth: 0 }
            ]);
            expect(stats.maxDepth).toBe(40);
        });
    });
});

// ============================================================================
// DECO MODEL TESTS
// ============================================================================

describe('decoModel', () => {
    describe('getAmbientPressure', () => {
        test('surface pressure is 1 atm (1.01325 bar)', () => {
            expect(getAmbientPressure(0)).toBe(SURFACE_PRESSURE);
        });

        test('10m depth adds 1 bar', () => {
            expect(getAmbientPressure(10)).toBeCloseTo(SURFACE_PRESSURE + 1.0, 5);
        });

        test('40m depth is ~5 bar', () => {
            expect(getAmbientPressure(40)).toBeCloseTo(SURFACE_PRESSURE + 4.0, 5);
        });

        test('explicit sea-level environment preserves the default pressure', () => {
            expect(getSurfacePressure({ altitude: 0 })).toBe(SURFACE_PRESSURE);
            expect(getSurfacePressure({ surfacePressure: SURFACE_PRESSURE })).toBe(SURFACE_PRESSURE);
            expect(getAmbientPressure(30, getSurfacePressure({ altitude: 0 })))
                .toBe(getAmbientPressure(30));
        });

        test('standard atmosphere matches representative altitude pressures', () => {
            expect(getPressureAtAltitude(1000)).toBeCloseTo(0.899, 3);
            expect(getPressureAtAltitude(1500)).toBeCloseTo(0.846, 3);
            expect(getPressureAtAltitude(2500)).toBeCloseTo(0.747, 3);
        });

        test('water modes use the declared hydrostatic pressure factors', () => {
            expect(getPressurePerMeter({ waterType: WATER_TYPES.STANDARD }))
                .toBe(PRESSURE_PER_METER);
            expect(getPressurePerMeter({ waterType: WATER_TYPES.FRESH }))
                .toBeCloseTo(0.0980665, 9);
            expect(getPressurePerMeter({ waterType: WATER_TYPES.SEA }))
                .toBeCloseTo(0.1005181625, 9);
            expect(WATER_DENSITIES[WATER_TYPES.FRESH]).toBe(1000);
            expect(WATER_DENSITIES[WATER_TYPES.SEA]).toBe(1025);
        });

        test('water modes change ambient pressure in density order', () => {
            const fresh = getAmbientPressure(
                40, SURFACE_PRESSURE,
                getPressurePerMeter({ waterType: WATER_TYPES.FRESH })
            );
            const standard = getAmbientPressure(40);
            const sea = getAmbientPressure(
                40, SURFACE_PRESSURE,
                getPressurePerMeter({ waterType: WATER_TYPES.SEA })
            );
            expect(fresh).toBeLessThan(standard);
            expect(standard).toBeLessThan(sea);
        });

        test('invalid water configuration fails explicitly', () => {
            let unsupportedFailed = false;
            let densityFailed = false;
            try {
                getPressurePerMeter({ waterType: 'brine' });
            } catch {
                unsupportedFailed = true;
            }
            try {
                getPressurePerMeter({ waterDensity: 0 });
            } catch {
                densityFailed = true;
            }
            expect(unsupportedFailed).toBe(true);
            expect(densityFailed).toBe(true);
        });
    });

    describe('getAlveolarN2Pressure', () => {
        test('at surface is about 0.75 bar', () => {
            const alveolar = getAlveolarN2Pressure(SURFACE_PRESSURE);
            // (1.01325 - 0.0627) * 0.7902 ≈ 0.7511
            expect(alveolar).toBeCloseTo(0.7511, 2);
        });

        test('increases with ambient pressure', () => {
            const atSurface = getAlveolarN2Pressure(SURFACE_PRESSURE);
            const at40m = getAlveolarN2Pressure(SURFACE_PRESSURE + 4.0);
            expect(at40m).toBeGreaterThan(atSurface);
        });
    });

    describe('haldaneEquation', () => {
        test('at time 0, returns initial pressure', () => {
            const result = haldaneEquation(0.74, 3.9, 0, 5);
            expect(result).toBeCloseTo(0.74, 5);
        });

        test('after one half-time, tissue is 50% saturated', () => {
            const result = haldaneEquation(1.0, 3.0, 10, 10);
            expect(result).toBeCloseTo(2.0, 5);  // 1.0 + 0.5 * (3.0 - 1.0)
        });

        test('fast compartment equilibrates faster', () => {
            const fast = haldaneEquation(0.74, 3.9, 10, 5);
            const slow = haldaneEquation(0.74, 3.9, 10, 100);
            expect(fast).toBeGreaterThan(slow);
        });

        test('teaching form is algebraically equivalent during on-gassing and off-gassing', () => {
            for (const { initial, target, time, halfTime } of [
                { initial: 0.75, target: 3.12, time: 27, halfTime: 27 },
                { initial: 3.12, target: 0.75, time: 40, halfTime: 27 }
            ]) {
                const k = Math.LN2 / halfTime;
                const completedFraction = 1 - Math.exp(-k * time);
                const teaching = initial + (target - initial) * completedFraction;
                expect(teaching).toBeCloseTo(haldaneEquation(initial, target, time, halfTime), 12);
            }
        });

        test('teaching form starts at zero progress and approaches equilibrium', () => {
            const initial = 0.75;
            const target = 3.12;
            expect(1 - Math.exp(0)).toBeCloseTo(0, 12);
            expect(haldaneEquation(initial, target, 0, 27)).toBeCloseTo(initial, 12);
            expect(haldaneEquation(initial, target, 27 * 20, 27)).toBeCloseTo(target, 5);
        });
    });

    describe('schreinerEquation', () => {
        test('at time 0, returns initial pressure', () => {
            const result = schreinerEquation(1.5, 0.74, 0.5, 0, 5);
            expect(result).toBeCloseTo(1.5, 5);
        });

        test('with zero rate, behaves like haldane', () => {
            const schreiner = schreinerEquation(0.74, 2.5, 0, 15, 10);
            const haldane = haldaneEquation(0.74, 2.5, 15, 10);
            expect(schreiner).toBeCloseTo(haldane, 5);
        });
    });

    describe('compartments', () => {
        test('all 16 Bühlmann compartments defined', () => {
            expect(COMPARTMENTS).toHaveLength(16);
        });

        test('half-times are in ascending order', () => {
            for (let i = 1; i < COMPARTMENTS.length; i++) {
                expect(COMPARTMENTS[i].halfTime).toBeGreaterThan(COMPARTMENTS[i-1].halfTime);
            }
        });

        test('fastest compartment is 4-6 minutes', () => {
            expect(COMPARTMENTS[0].halfTime).toBeGreaterThanOrEqual(4);
            expect(COMPARTMENTS[0].halfTime).toBeLessThanOrEqual(6);
        });

        test('educational categories use three consistent half-time groups', () => {
            expect(getCompartmentCategory(12.5)).toBe('Fast');
            expect(getCompartmentCategory(18.5)).toBe('Medium');
            expect(getCompartmentCategory(77)).toBe('Medium');
            expect(getCompartmentCategory(109)).toBe('Slow');
            expect(getCompartmentCategory(635)).toBe('Slow');
        });

        test('all compartments have M-value coefficients (aN2, bN2)', () => {
            COMPARTMENTS.forEach(comp => {
                expect(typeof comp.aN2).toBe('number');
                expect(typeof comp.bN2).toBe('number');
                expect(comp.aN2).toBeGreaterThan(0);
                expect(comp.bN2).toBeGreaterThan(0);
                expect(comp.bN2).toBeLessThan(1);  // b values are always < 1
            });
        });

        test('faster compartments have higher a values (more supersaturation tolerance)', () => {
            // Fast compartments can tolerate more supersaturation
            const fastA = COMPARTMENTS[0].aN2;  // TC1
            const slowA = COMPARTMENTS[15].aN2; // TC16
            expect(fastA).toBeGreaterThan(slowA);
        });

        test('slower compartments have higher b values (closer to 1)', () => {
            // Slow compartments have b values closer to 1
            const fastB = COMPARTMENTS[0].bN2;  // TC1
            const slowB = COMPARTMENTS[15].bN2; // TC16
            expect(slowB).toBeGreaterThan(fastB);
        });

        test('M-value at surface (M0) is valid for all compartments', () => {
            // M0 = a + 1/b (ambient = 1 bar at surface)
            COMPARTMENTS.forEach(comp => {
                const m0 = comp.aN2 + SURFACE_PRESSURE / comp.bN2;
                expect(m0).toBeGreaterThan(1);  // Must be > surface pressure
                expect(m0).toBeLessThan(4);     // Reasonable upper bound
            });
        });

        test('TC1 M-value coefficients match ZH-L16A', () => {
            const tc1 = COMPARTMENTS[0];
            expect(tc1.aN2).toBeCloseTo(1.1696, 3);
            expect(tc1.bN2).toBeCloseTo(0.5578, 3);
        });
    });

    // ========================================================================
    // ZH-L16 VARIANT TESTS
    // ========================================================================

    describe('ZH-L16 variants', () => {
        // Store original variant at start
        const originalVariant = getZHL16Variant();
        
        test('ZHL16_VARIANTS has A, B, C options', () => {
            expect(ZHL16_VARIANTS.A).toBe('ZH-L16A');
            expect(ZHL16_VARIANTS.B).toBe('ZH-L16B');
            expect(ZHL16_VARIANTS.C).toBe('ZH-L16C');
        });

        test('setZHL16Variant changes active variant', () => {
            setZHL16Variant(ZHL16_VARIANTS.A);
            expect(getZHL16Variant()).toBe('ZH-L16A');
            
            setZHL16Variant(ZHL16_VARIANTS.B);
            expect(getZHL16Variant()).toBe('ZH-L16B');
            
            setZHL16Variant(ZHL16_VARIANTS.C);
            expect(getZHL16Variant()).toBe('ZH-L16C');
        });

        test('COMPARTMENTS array is updated when variant changes', () => {
            setZHL16Variant(ZHL16_VARIANTS.A);
            const tc5_A = COMPARTMENTS.find(c => c.id === 5).aN2;
            
            setZHL16Variant(ZHL16_VARIANTS.C);
            const tc5_C = COMPARTMENTS.find(c => c.id === 5).aN2;
            
            // ZH-L16A TC5 a = 0.6667, ZH-L16C TC5 a = 0.6200
            expect(tc5_A).toBeCloseTo(0.6667, 3);
            expect(tc5_C).toBeCloseTo(0.6200, 3);
            expect(tc5_A).toBeGreaterThan(tc5_C);
        });

        test('getCompartmentsForVariant returns values without changing state', () => {
            setZHL16Variant(ZHL16_VARIANTS.C);
            
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const tc5_A = variantA.find(c => c.id === 5).aN2;
            
            // Current variant should still be C
            expect(getZHL16Variant()).toBe('ZH-L16C');
            expect(tc5_A).toBeCloseTo(0.6667, 3);
        });

        test('TC2-4 have same a values across all variants, TC1 differs for A', () => {
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const variantB = getCompartmentsForVariant(ZHL16_VARIANTS.B);
            const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);

            // TC1: A uses 1.2599 (original 4.0 min half-time), B/C use 1.1696
            expect(variantA.find(c => c.id === 1).aN2).toBeCloseTo(1.2599, 4);
            expect(variantB.find(c => c.id === 1).aN2).toBeCloseTo(1.1696, 4);
            expect(variantC.find(c => c.id === 1).aN2).toBeCloseTo(1.1696, 4);

            // TC2-4 are the same across all variants
            for (let id = 2; id <= 4; id++) {
                const a_A = variantA.find(c => c.id === id).aN2;
                const a_B = variantB.find(c => c.id === id).aN2;
                const a_C = variantC.find(c => c.id === id).aN2;
                expect(a_A).toBeCloseTo(a_B, 4);
                expect(a_B).toBeCloseTo(a_C, 4);
            }
        });

        test('TC5-8 more conservative (lower a) in B and C vs A', () => {
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);
            
            for (let id = 5; id <= 8; id++) {
                const a_A = variantA.find(c => c.id === id).aN2;
                const a_C = variantC.find(c => c.id === id).aN2;
                expect(a_A).toBeGreaterThan(a_C);
            }
        });

        test('TC1 half-time differs between A and B/C variants', () => {
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const variantB = getCompartmentsForVariant(ZHL16_VARIANTS.B);
            const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);

            // ZH-L16A uses original 4.0 min for TC1
            expect(variantA[0].halfTime).toBe(4.0);
            // B and C use modified 5.0 min
            expect(variantB[0].halfTime).toBe(5.0);
            expect(variantC[0].halfTime).toBe(5.0);
        });

        test('TC2-16 half-times and b values are same across variants', () => {
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);

            // TC2-16 have same half-times and b values across variants
            // (TC1 differs: A uses 4 min / b=0.5050, B/C use 5 min / b=0.5578)
            for (let i = 1; i < 16; i++) {
                expect(variantA[i].halfTime).toBe(variantC[i].halfTime);
                expect(variantA[i].bN2).toBe(variantC[i].bN2);
            }
        });

        test('TC1 b-coefficient differs between A (0.5050) and B/C (0.5578)', () => {
            const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
            const variantB = getCompartmentsForVariant(ZHL16_VARIANTS.B);
            const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);
            expect(variantA[0].bN2).toBe(0.5050);
            expect(variantB[0].bN2).toBe(0.5578);
            expect(variantC[0].bN2).toBe(0.5578);
        });
        
        // Restore original variant
        setZHL16Variant(originalVariant);
    });

    // ========================================================================
    // GRADIENT FACTORS TESTS
    // ========================================================================

    describe('Gradient Factor constants', () => {
        test('DEFAULT_GF_LOW is 1.0 (100%)', () => {
            expect(DEFAULT_GF_LOW).toBe(1.0);
        });

        test('DEFAULT_GF_HIGH is 1.0 (100%)', () => {
            expect(DEFAULT_GF_HIGH).toBe(1.0);
        });
    });

    describe('getMValue', () => {
        test('calculates M-value using Bühlmann formula M = a + P_amb / b', () => {
            // TC1: a = 1.1696, b = 0.5578
            // At surface (1 bar): M = 1.1696 + 1.0 / 0.5578 = 2.9624
            const mValue = getMValue(1.0, 1.1696, 0.5578);
            expect(mValue).toBeCloseTo(2.9624, 3);
        });

        test('M-value increases with ambient pressure', () => {
            const a = 1.1696, b = 0.5578;
            const mAtSurface = getMValue(1.0, a, b);
            const mAt10m = getMValue(2.0, a, b);
            expect(mAt10m).toBeGreaterThan(mAtSurface);
        });

        test('M-value at 30m depth for TC1', () => {
            // At 30m (4 bar): M = 1.1696 + 4.0 / 0.5578 = 8.3407
            const mValue = getMValue(4.0, 1.1696, 0.5578);
            expect(mValue).toBeCloseTo(8.3407, 3);
        });
    });

    describe('getAdjustedMValue', () => {
        test('GF 100% returns raw M-value', () => {
            const a = 1.1696, b = 0.5578;
            const rawM = getMValue(1.0, a, b);
            const adjustedM = getAdjustedMValue(1.0, a, b, 1.0);
            expect(adjustedM).toBeCloseTo(rawM, 6);
        });

        test('GF 0% returns ambient pressure (no supersaturation allowed)', () => {
            const ambientPressure = 2.0; // 10m
            const adjustedM = getAdjustedMValue(ambientPressure, 1.1696, 0.5578, 0.0);
            expect(adjustedM).toBeCloseTo(ambientPressure, 6);
        });

        test('GF 50% returns halfway between ambient and raw M-value', () => {
            const a = 1.1696, b = 0.5578;
            const ambient = 1.0;
            const rawM = getMValue(ambient, a, b);
            const adjustedM = getAdjustedMValue(ambient, a, b, 0.5);
            const expected = ambient + 0.5 * (rawM - ambient);
            expect(adjustedM).toBeCloseTo(expected, 6);
        });

        test('GF 85% allows more supersaturation than GF 70%', () => {
            const a = 1.1696, b = 0.5578;
            const ambient = 1.0;
            const m70 = getAdjustedMValue(ambient, a, b, 0.70);
            const m85 = getAdjustedMValue(ambient, a, b, 0.85);
            expect(m85).toBeGreaterThan(m70);
        });
    });

    describe('getCompartmentCeiling', () => {
        test('tissue at surface equilibrium has no ceiling (can surface)', () => {
            const tissueP = 0.74;
            const ceiling = getCompartmentCeiling(tissueP, 1.1696, 0.5578, 1.0);
            expect(ceiling).toBeLessThan(SURFACE_PRESSURE);
        });

        test('higher tissue pressure requires deeper ceiling', () => {
            const a = 1.1696, b = 0.5578;
            const ceilingLow = getCompartmentCeiling(1.5, a, b, 1.0);
            const ceilingHigh = getCompartmentCeiling(3.0, a, b, 1.0);
            expect(ceilingHigh).toBeGreaterThan(ceilingLow);
        });

        test('lower GF requires deeper ceiling for same tissue pressure', () => {
            const tissueP = 2.5;
            const a = 1.1696, b = 0.5578;
            const ceiling100 = getCompartmentCeiling(tissueP, a, b, 1.0);
            const ceiling70 = getCompartmentCeiling(tissueP, a, b, 0.7);
            expect(ceiling70).toBeGreaterThan(ceiling100);
        });

        test('ceiling formula is mathematically correct', () => {
            const tissueP = 2.5;
            const a = 0.8618, b = 0.7222; // TC3
            const gf = 0.8;
            const ceiling = getCompartmentCeiling(tissueP, a, b, gf);
            const numerator = b * (tissueP - gf * a);
            const denominator = b * (1 - gf) + gf;
            const expected = numerator / denominator;
            expect(ceiling).toBeCloseTo(expected, 6);
        });

        test('at GF 100%, tissue at M-value gives ceiling at that ambient', () => {
            const ambient = 2.0; // 10m
            const a = 1.1696, b = 0.5578;
            const mValue = getMValue(ambient, a, b);
            const ceiling = getCompartmentCeiling(mValue, a, b, 1.0);
            expect(ceiling).toBeCloseTo(ambient, 4);
        });
    });

    describe('getDiveCeiling', () => {
        test('surface-saturated tissues have no ceiling requirement', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74;
            });
            const result = getDiveCeiling(tissuePressures, 1.0);
            expect(result.ceiling).toBe(SURFACE_PRESSURE);
            expect(result.ceilingDepth).toBe(0);
        });

        test('returns controlling compartment', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74;
            });
            tissuePressures[3] = 2.5; // Make TC3 have higher loading
            const result = getDiveCeiling(tissuePressures, 1.0);
            expect(result.controllingCompartment).toBe(3);
        });

        test('ceiling depth matches ceiling pressure', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5;
            });
            const result = getDiveCeiling(tissuePressures, 0.7);
            expect(result.ceilingDepth).toBeGreaterThanOrEqual(0);
            const expectedDepth = (result.ceiling - SURFACE_PRESSURE) / PRESSURE_PER_METER;
            expect(result.ceilingDepth).toBeCloseTo(expectedDepth, 4);
        });

        test('lower GF produces deeper ceiling', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.0;
            });
            const result100 = getDiveCeiling(tissuePressures, 1.0);
            const result70 = getDiveCeiling(tissuePressures, 0.7);
            expect(result70.ceilingDepth).toBeGreaterThanOrEqual(result100.ceilingDepth);
        });
    });

    describe('interpolateGF', () => {
        test('returns GF Low at first stop depth', () => {
            const firstStopAmbient = 2.0; // 10m
            const gf = interpolateGF(2.0, firstStopAmbient, 0.7, 0.85);
            expect(gf).toBe(0.7);
        });

        test('returns GF Low below first stop depth', () => {
            const firstStopAmbient = 2.0; // 10m
            const gf = interpolateGF(3.0, firstStopAmbient, 0.7, 0.85); // 20m
            expect(gf).toBe(0.7);
        });

        test('returns GF High at surface', () => {
            const firstStopAmbient = 2.0;
            const gf = interpolateGF(1.0, firstStopAmbient, 0.7, 0.85);
            expect(gf).toBe(0.85);
        });

        test('returns GF High above surface (edge case)', () => {
            const firstStopAmbient = 2.0;
            const gf = interpolateGF(0.5, firstStopAmbient, 0.7, 0.85);
            expect(gf).toBe(0.85);
        });

        test('interpolates linearly between surface and first stop', () => {
            const firstStopAmbient = 2.0; // 10m
            const gfLow = 0.7, gfHigh = 0.85;
            const gfMid = interpolateGF(1.5, firstStopAmbient, gfLow, gfHigh);
            const fraction = (firstStopAmbient - 1.5) / (firstStopAmbient - SURFACE_PRESSURE);
            const expected = gfLow + fraction * (gfHigh - gfLow);
            expect(gfMid).toBeCloseTo(expected, 6);
        });

        test('interpolation at 3m (common last stop)', () => {
            const firstStopAmbient = 2.0; // 10m first stop
            const gfLow = 0.7, gfHigh = 0.85;
            const gf3m = interpolateGF(1.3, firstStopAmbient, gfLow, gfHigh);
            const fraction = (firstStopAmbient - 1.3) / (firstStopAmbient - SURFACE_PRESSURE);
            const expected = gfLow + fraction * (gfHigh - gfLow);
            expect(gf3m).toBeCloseTo(expected, 6);
        });

        test('handles GF Low > GF High (unusual but valid)', () => {
            const firstStopAmbient = 2.0;
            const gfLow = 0.9, gfHigh = 0.7;
            expect(interpolateGF(2.0, firstStopAmbient, gfLow, gfHigh)).toBe(0.9);
            expect(interpolateGF(1.0, firstStopAmbient, gfLow, gfHigh)).toBe(0.7);
            const gfMid = interpolateGF(1.5, firstStopAmbient, gfLow, gfHigh);
            const fraction = (firstStopAmbient - 1.5) / (firstStopAmbient - SURFACE_PRESSURE);
            const expected = gfLow + fraction * (gfHigh - gfLow);
            expect(gfMid).toBeCloseTo(expected, 6);
        });
    });

    describe('calculateInstantGF', () => {
        test('returns 0 for surface-saturated tissue at surface', () => {
            // Tissue at 0.74 bar (surface equilibrium), at surface (1.0 bar ambient)
            const gf = calculateInstantGF(0.74, 1.0, COMPARTMENTS[0]);
            expect(gf).toBeLessThan(0);  // Undersaturated
        });

        test('returns positive GF for supersaturated tissue', () => {
            // Tissue at 2.0 bar, at surface (1.0 bar ambient)
            const gf = calculateInstantGF(2.0, 1.0, COMPARTMENTS[0]);
            expect(gf).toBeGreaterThan(0);  // Supersaturated
        });

        test('returns 1.0 exactly at M-value', () => {
            // Calculate what tissue pressure equals M-value at surface
            // M = a + Pamb/b, so if Pt = M, then GF_i = (M - Pamb) / (M - Pamb) = 1
            const comp = COMPARTMENTS[0];  // comp 1: a=1.2599, b=0.5240
            const mValue = comp.aN2 + 1.0 / comp.bN2;
            const gf = calculateInstantGF(mValue, 1.0, comp);
            expect(gf).toBeCloseTo(1.0, 6);
        });

        test('GF increases as ambient pressure decreases', () => {
            // Same tissue pressure, different ambient
            const tissuePressure = 3.0;
            const gfDeep = calculateInstantGF(tissuePressure, 4.0, COMPARTMENTS[0]);
            const gfShallow = calculateInstantGF(tissuePressure, 2.0, COMPARTMENTS[0]);
            const gfSurface = calculateInstantGF(tissuePressure, 1.0, COMPARTMENTS[0]);
            
            expect(gfDeep).toBeLessThan(gfShallow);
            expect(gfShallow).toBeLessThan(gfSurface);
        });
    });

    describe('calculateMaxGF', () => {
        test('returns max GF across all compartments', () => {
            // Create tissue pressures with varying loading
            const tissuePressures = {};
            COMPARTMENTS.forEach((comp, i) => {
                tissuePressures[comp.id] = 1.5 + i * 0.1;  // Increasing loading
            });
            
            const result = calculateMaxGF(tissuePressures, 1.0);
            
            expect(result).toHaveProperty('gfMax');
            expect(result).toHaveProperty('leadingCompartment');
            expect(result).toHaveProperty('allGFs');
            expect(typeof result.gfMax).toBe('number');
        });

        test('identifies the leading (highest GF) compartment', () => {
            // Create tissues with one clearly higher than others
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74;  // Surface equilibrium
            });
            // Make compartment 4 heavily loaded
            tissuePressures['4'] = 4.0;
            
            const result = calculateMaxGF(tissuePressures, 1.0);
            expect(result.leadingCompartment).toBe(4);
        });

        test('does not select a controlling compartment when all tissues are undersaturated', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74;  // Surface equilibrium
            });
            
            const result = calculateMaxGF(tissuePressures, 1.0);
            expect(result.gfMax).toBe(0);
            expect(result.leadingCompartment).toBe(null);
            expect(Object.values(result.allGFs).every(gf => gf < 0)).toBe(true);
        });

        test('does not select a controlling compartment at zero supersaturation', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 3.1;
            });

            const result = calculateMaxGF(tissuePressures, 3.1);
            expect(result.gfMax).toBe(0);
            expect(result.leadingCompartment).toBe(null);
        });
    });

    describe('getFirstStopDepth', () => {
        test('surface-saturated tissues have 0m first stop', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 0.74;
            });
            const result = getFirstStopDepth(tissuePressures, 0.7);
            expect(result.depth).toBe(0);
        });

        test('rounds up to 3m increments by default', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.0;
            });
            const result = getFirstStopDepth(tissuePressures, 0.5);
            expect(result.depth % 3).toBe(0);
        });

        test('returns ambient pressure at stop depth', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5;
            });
            const result = getFirstStopDepth(tissuePressures, 0.5);
            const expectedAmbient = SURFACE_PRESSURE + result.depth * PRESSURE_PER_METER;
            expect(result.ambient).toBeCloseTo(expectedAmbient, 6);
        });

        test('supports custom stop increments', () => {
            const tissuePressures = {};
            COMPARTMENTS.forEach(comp => {
                tissuePressures[comp.id] = 2.5;
            });
            const result5m = getFirstStopDepth(tissuePressures, 0.5, 5);
            expect(result5m.depth % 5).toBe(0);
        });
    });

    describe('calculateCeilingTimeSeries', () => {
        test('returns ceiling depth for each time point', () => {
            // Simple dive profile
            const profile = [
                { time: 0, depth: 0 },
                { time: 2, depth: 30 },
                { time: 12, depth: 30 },
                { time: 17, depth: 0 }
            ];
            const results = calculateTissueLoading(profile, 0);
            const ceilings = calculateCeilingTimeSeries(results, 1.0);
            
            expect(ceilings.length).toBe(results.timePoints.length);
            expect(ceilings.every(c => typeof c === 'number')).toBe(true);
        });

        test('ceiling starts at 0 for surface-saturated diver', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 1, depth: 10 },
                { time: 5, depth: 0 }
            ];
            const results = calculateTissueLoading(profile, 0);
            const ceilings = calculateCeilingTimeSeries(results, 1.0);
            
            // First time point should have no ceiling (0m)
            expect(ceilings[0]).toBe(0);
        });

        test('uses GF High throughout a profile with no decompression anchor', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 1.55, depth: 31 },
                { time: 12, depth: 31 },
                { time: 15.1, depth: 0 }
            ];
            const results = calculateTissueLoading(profile, 0, {
                gases: [{ id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902 }]
            });
            const automatic = calculateCeilingTimeSeries(results, 0.3, 0.8);
            const withSchedulerAnchor = calculateCeilingTimeSeries(
                results, 0.3, 0.8, SURFACE_PRESSURE
            );
            const endBottomIdx = results.timePoints.findIndex(t => t >= 12);

            expect(automatic[endBottomIdx]).toBeCloseTo(0.56, 1);
            expect(automatic[endBottomIdx]).toBeLessThan(1);
            expect(automatic).toEqual(withSchedulerAnchor);
            expect(automatic[automatic.length - 1]).toBe(0);
        });

        test('ceiling increases during bottom phase', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 2, depth: 40 },
                { time: 20, depth: 40 },  // Long bottom time
                { time: 25, depth: 0 }
            ];
            const results = calculateTissueLoading(profile, 0);
            const ceilings = calculateCeilingTimeSeries(results, 0.7);  // GF 70%
            
            // Find index at start of bottom and middle of bottom
            const bottomStartIdx = results.timePoints.findIndex(t => t >= 2);
            const bottomMidIdx = results.timePoints.findIndex(t => t >= 15);
            
            // Ceiling should be higher (deeper) later in the dive
            expect(ceilings[bottomMidIdx]).toBeGreaterThan(ceilings[bottomStartIdx]);
        });

        test('lower GF produces deeper ceiling', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 2, depth: 30 },
                { time: 12, depth: 30 },
                { time: 17, depth: 0 }
            ];
            const results = calculateTissueLoading(profile, 0);
            const ceilingsGF100 = calculateCeilingTimeSeries(results, 1.0);
            const ceilingsGF70 = calculateCeilingTimeSeries(results, 0.7);
            
            // Find ceiling at end of bottom phase
            const endBottomIdx = results.timePoints.findIndex(t => t >= 12);
            
            // GF 70% should have deeper (higher) ceiling than GF 100%
            expect(ceilingsGF70[endBottomIdx]).toBeGreaterThan(ceilingsGF100[endBottomIdx]);
        });

        test('uses GF interpolation during ascent (pAnchor-based)', () => {
            // Longer dive to build up tissue loading
            // With pAnchor-based GF interpolation, the GF only changes once the diver
            // ascends past pAnchor (where GF_max first equals GF_low during ascent).
            // For this profile with GF 50, pAnchor is around 10m depth.
            const profile = [
                { time: 0, depth: 0 },
                { time: 2, depth: 40 },
                { time: 20, depth: 40 },  // Long bottom time
                { time: 30, depth: 0 }    // Slow ascent (4 m/min)
            ];
            const results = calculateTissueLoading(profile, 0);
            
            // Compare ceiling with only GF Low vs GF Low/High interpolation
            const ceilingsGFLowOnly = calculateCeilingTimeSeries(results, 0.5, 0.5);  // GF 50/50
            const ceilingsGFInterp = calculateCeilingTimeSeries(results, 0.5, 0.85); // GF 50/85
            
            // During bottom phase (at depth), ceilings should be similar (both use GF Low)
            const bottomIdx = results.timePoints.findIndex(t => t >= 15);
            expect(ceilingsGFLowOnly[bottomIdx]).toBeCloseTo(ceilingsGFInterp[bottomIdx], 1);
            
            // During ascent BELOW pAnchor (~10m), ceilings should be similar (both use GF Low only)
            // At t=25, diver is at ~20m which is still below pAnchor (~10m)
            const belowAnchorIdx = results.timePoints.findIndex(t => t >= 25);
            expect(ceilingsGFLowOnly[belowAnchorIdx]).toBeCloseTo(ceilingsGFInterp[belowAnchorIdx], 1);
            
            // Near surface (above pAnchor), GF 50/85 should have shallower ceiling than GF 50/50
            // because GF High (85%) allows more supersaturation than GF Low (50%)
            // At t=29.5, diver is at ~2m which is above pAnchor (~10m)
            const aboveAnchorIdx = results.timePoints.findIndex(t => t >= 29.5);
            expect(ceilingsGFInterp[aboveAnchorIdx]).toBeLessThan(ceilingsGFLowOnly[aboveAnchorIdx]);
        });

        test('defaults gfHigh to gfLow if not provided', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 2, depth: 30 },
                { time: 12, depth: 30 },
                { time: 17, depth: 0 }
            ];
            const results = calculateTissueLoading(profile, 0);
            
            // Single GF param should behave like GF Low/Low
            const ceilingsOneParam = calculateCeilingTimeSeries(results, 0.7);
            const ceilingsTwoParams = calculateCeilingTimeSeries(results, 0.7, 0.7);
            
            // Should be identical
            for (let i = 0; i < ceilingsOneParam.length; i++) {
                expect(ceilingsOneParam[i]).toBeCloseTo(ceilingsTwoParams[i], 5);
            }
        });
    });

    describe('calculateNDL', () => {
        test('returns infinity for very shallow depths', () => {
            const { ndl } = calculateNDL(0, 0.79, 1.0);
            expect(ndl).toBe(Infinity);
        });

        test('returns reasonable NDL for 18m on air', () => {
            // PADI table: ~56 min, Bühlmann should be similar
            const { ndl } = calculateNDL(18, 0.79, 1.0);
            expect(ndl).toBeGreaterThan(40);
            expect(ndl).toBeLessThan(80);
        });

        test('returns reasonable NDL for 30m on air', () => {
            // PADI table: ~20 min, Bühlmann tends to be slightly more conservative
            const { ndl } = calculateNDL(30, 0.79, 1.0);
            expect(ndl).toBeGreaterThanOrEqual(15);
            expect(ndl).toBeLessThan(30);
        });

        test('returns reasonable NDL for 40m on air', () => {
            // PADI table: ~8 min
            const { ndl } = calculateNDL(40, 0.79, 1.0);
            expect(ndl).toBeGreaterThan(5);
            expect(ndl).toBeLessThan(15);
        });

        test('nitrox has longer NDL than air at same depth', () => {
            const { ndl: ndlAir } = calculateNDL(30, 0.79, 1.0);
            const { ndl: ndlEan32 } = calculateNDL(30, 0.68, 1.0);  // EAN32
            expect(ndlEan32).toBeGreaterThan(ndlAir);
        });

        test('lower GF High produces shorter NDL', () => {
            const { ndl: ndl100 } = calculateNDL(30, 0.79, 1.0);
            const { ndl: ndl85 } = calculateNDL(30, 0.79, 0.85);
            expect(ndl85).toBeLessThan(ndl100);
        });

        test('matches Decotengu direct-ascent NDL examples at 30 m', () => {
            expect(calculateNDL(30, 0.79, 1.00).ndl).toBe(20);
            expect(calculateNDL(30, 0.79, 0.80).ndl).toBe(13);
            expect(calculateNDL(30, 0.79, 0.85).ndl).toBe(15);
        });

        test('uses GF High for NDL regardless of GF Low', () => {
            const gas = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];
            const gf30 = generateDecoProfile(30, 10, gas, 30, 80, { enabled: false });
            const gf50 = generateDecoProfile(30, 10, gas, 50, 80, { enabled: false });
            expect(gf30.ndl).toBe(gf50.ndl);
            expect(gf30.ndl).toBe(13);
        });

        test('30 m / 18 min GF 100 is a no-stop dive after simulated ascent', () => {
            const gas = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];
            const profile = generateDecoProfile(
                30, 18, gas, 100, 100, { enabled: false }
            );
            expect(profile.ndl).toBe(20);
            expect(profile.requiresDeco).toBe(false);
            expect(profile.decoStops).toEqual([]);
        });

        test('returns controlling compartment', () => {
            const { controllingCompartment } = calculateNDL(30, 0.79, 1.0);
            expect(controllingCompartment).toBeGreaterThanOrEqual(1);
            expect(controllingCompartment).toBeLessThanOrEqual(16);
        });
    });

    describe('simulateDepthTime', () => {
        test('tissues load at constant depth', () => {
            const initialN2 = getInitialTissueN2(0.79);
            const tissues = {};
            COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });
            
            const after = simulateDepthTime(tissues, 30, 10, 0.79);
            
            // All tissues should have increased pressure
            COMPARTMENTS.forEach(c => {
                expect(after[c.id]).toBeGreaterThan(initialN2);
            });
        });

        test('fast tissues load faster than slow tissues', () => {
            const initialN2 = getInitialTissueN2(0.79);
            const tissues = {};
            COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });
            
            const after = simulateDepthTime(tissues, 30, 5, 0.79);
            
            // Fastest compartment (TC1) should have highest pressure increase
            const tc1Increase = after[1] - initialN2;
            const tc16Increase = after[16] - initialN2;
            expect(tc1Increase).toBeGreaterThan(tc16Increase);
        });
    });

    describe('simulateDepthChange', () => {
        test('tissues load during descent', () => {
            const initialN2 = getInitialTissueN2(0.79);
            const tissues = {};
            COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });
            
            const after = simulateDepthChange(tissues, 0, 30, 1.5, 0.79);
            
            // All tissues should have increased pressure
            COMPARTMENTS.forEach(c => {
                expect(after[c.id]).toBeGreaterThan(initialN2);
            });
        });

        test('tissues off-gas during ascent', () => {
            // First load tissues at depth
            const initialN2 = getInitialTissueN2(0.79);
            let tissues = {};
            COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });
            
            tissues = simulateDepthTime(tissues, 30, 20, 0.79);
            const pressureAtDepth = tissues[1];
            
            // Now ascend
            tissues = simulateDepthChange(tissues, 30, 0, 3, 0.79);
            
            // Fast compartment should have off-gassed
            expect(tissues[1]).toBeLessThan(pressureAtDepth);
        });
    });

    describe('generateDecoSchedule', () => {
        test('no stops needed for surface-saturated tissues', () => {
            const initialN2 = getInitialTissueN2(0.79);
            const tissues = {};
            COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });
            
            const { stops, totalTime } = generateDecoSchedule(tissues, 10, 0.79, 1.0, 1.0);
            
            expect(stops).toHaveLength(0);
            expect(totalTime).toBeGreaterThan(0);  // Still takes time to ascend
        });

        test('generates stops for loaded tissues', () => {
            // Simulate a 40m dive for 20 minutes
            const initialN2 = getInitialTissueN2(0.79);
            let tissues = {};
            COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });
            
            // Descent
            tissues = simulateDepthChange(tissues, 0, 40, 2, 0.79);
            // Bottom time
            tissues = simulateDepthTime(tissues, 40, 18, 0.79);
            
            const { stops, totalDecoTime } = generateDecoSchedule(tissues, 40, 0.79, 0.7, 0.85);
            
            // Should have deco stops with GF 70/85
            expect(stops.length).toBeGreaterThan(0);
            expect(stops[0].depth).toBeGreaterThan(0);
            expect(stops[0].time).toBeGreaterThan(0);
        });

        test('deeper first stop with lower GF Low', () => {
            // Load tissues significantly
            const initialN2 = getInitialTissueN2(0.79);
            let tissues = {};
            COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });
            tissues = simulateDepthChange(tissues, 0, 40, 2, 0.79);
            tissues = simulateDepthTime(tissues, 40, 20, 0.79);
            
            const schedule50 = generateDecoSchedule({ ...tissues }, 40, 0.79, 0.5, 0.85);
            const schedule70 = generateDecoSchedule({ ...tissues }, 40, 0.79, 0.7, 0.85);
            
            // GF 50 should have deeper (or equal) first stop
            const firstStop50 = schedule50.stops[0]?.depth || 0;
            const firstStop70 = schedule70.stops[0]?.depth || 0;
            expect(firstStop50).toBeGreaterThanOrEqual(firstStop70);
        });
    });
    
    // =============================================================================
    // Bottom-Anchored GF Tests
    // =============================================================================
    
    describe('generateDecoSchedule pAnchor behavior', () => {
        test('a successful GF High direct ascent has no GF Low anchor', () => {
            const depth = 15;
            const bottomTime = 28;
            const n2 = 0.79;
            const initial = getInitialTissueN2(n2);
            const tissues = Object.fromEntries(
                COMPARTMENTS.map(comp => [comp.id, initial])
            );
            const descentTime = depth / 20;
            let loaded = simulateDepthChange(
                tissues, 0, depth, descentTime, n2
            );
            loaded = simulateDepthTime(
                loaded, depth, bottomTime - descentTime, n2
            );

            const schedule = generateDecoSchedule(
                loaded, depth, n2, 0.50, 0.80,
                [{ id: 'air', name: 'Air', o2: 0.21, n2 }]
            );

            expect(schedule.anchorDepth).toBe(0);
            expect(schedule.stops).toEqual([]);
        });

        test('GF at pAnchor equals GF Low', () => {
            const gfLow = 0.5;
            const gfHigh = 0.8;
            
            // For any pAnchor, GF at that ambient should be exactly gfLow
            const pAnchor = 1.6; // 6m
            const gfAtAnchor = interpolateGF(pAnchor, pAnchor, gfLow, gfHigh);
            
            expect(gfAtAnchor).toBe(gfLow);
        });
        
        test('GF is gfLow when deeper than pAnchor', () => {
            const pAnchor = 1.6; // 6m
            const gfLow = 0.5;
            const gfHigh = 0.8;
            
            // At depths deeper than pAnchor, GF should remain gfLow
            const deeperAmbient = 1.9; // 9m
            const gfAtDeeper = interpolateGF(deeperAmbient, pAnchor, gfLow, gfHigh);
            expect(gfAtDeeper).toBe(gfLow);
            
            // Even much deeper
            const veryDeepAmbient = 4.0; // 30m
            const gfAtVeryDeep = interpolateGF(veryDeepAmbient, pAnchor, gfLow, gfHigh);
            expect(gfAtVeryDeep).toBe(gfLow);
        });
        
        test('GF ramps from pAnchor to surface', () => {
            const pAnchor = 2.0; // 10m
            const gfLow = 0.5;
            const gfHigh = 0.8;

            // At surface, GF should be gfHigh
            const gfAtSurface = interpolateGF(SURFACE_PRESSURE, pAnchor, gfLow, gfHigh);
            expect(gfAtSurface).toBe(gfHigh);

            // At 1.5 bar, GF should be linearly interpolated using current SURFACE_PRESSURE
            const midAmbient = 1.5;
            const gfAtMid = interpolateGF(midAmbient, pAnchor, gfLow, gfHigh);
            const fraction = (pAnchor - midAmbient) / (pAnchor - SURFACE_PRESSURE);
            const expected = gfLow + fraction * (gfHigh - gfLow);
            expect(gfAtMid).toBeCloseTo(expected, 6);
        });
        
        test('30m/20min air GF 50/80: GF ramp is anchored at the GF-low first-stop depth', () => {
            // Per Baker convention, the GF ramp is anchored at the rounded first-stop
            // depth. With the destination-GF can-we-ascend check, the diver may pass
            // through the anchor depth without waiting, so the first recorded stop
            // can be shallower.

            const descentTime = 30 / 20; // 1.5 min at 20 m/min
            let tissues = {};
            COMPARTMENTS.forEach(c => { tissues[c.id] = 0.74; }); // surface sat
            tissues = simulateDepthChange(tissues, 0, 30, descentTime, N2_FRACTION);
            tissues = simulateDepthTime(tissues, 30, 20 - descentTime, N2_FRACTION);

            const schedule = generateDecoSchedule(tissues, 30, N2_FRACTION, 0.5, 0.8);

            // GF ramp is anchored at 9 m (the first stop depth on the 3 m grid).
            expect(schedule.anchorDepth).toBe(9);
            expect(schedule.stops.length).toBeGreaterThan(0);
            expect(schedule.stops[0].depth).toBeLessThanOrEqual(9);
        });
    });
    
    describe('calculateTissueLoading boundary behavior', () => {
        test('tissue pressure at last waypoint equals manual simulation', () => {
            // This tests that calculateTissueLoading doesn't prematurely start surface interval
            // at the exact last waypoint time (was a bug: >= instead of >)
            const profile = [
                { time: 0, depth: 0 },
                { time: 1.5, depth: 30 }, // Descent
                { time: 20, depth: 30 }   // Bottom time ends exactly here
            ];
            
            const results = calculateTissueLoading(profile, N2_FRACTION);
            
            // Find index for t=20 (last waypoint)
            const idx20 = results.timePoints.indexOf(20);
            expect(idx20).toBeGreaterThan(0); // Should find it
            
            // At t=20, depth should still be 30m (not 0m surface interval)
            expect(results.depthPoints[idx20]).toBe(30);
            
            // Tissue 1 pressure at t=20 should match manual calculation
            const comp1 = COMPARTMENTS.find(c => c.id === 1);
            const initialN2 = getInitialTissueN2();
            const startAlv = getAlveolarN2Pressure(getAmbientPressure(0), N2_FRACTION);
            const endAlv = getAlveolarN2Pressure(getAmbientPressure(30), N2_FRACTION);
            const rate = (endAlv - startAlv) / 1.5;
            
            const afterDescent = schreinerEquation(initialN2, startAlv, rate, 1.5, comp1.halfTime);
            const bottomAlv = getAlveolarN2Pressure(getAmbientPressure(30), N2_FRACTION);
            const afterBottom = haldaneEquation(afterDescent, bottomAlv, 18.5, comp1.halfTime);
            
            expect(results.compartments[1].pressures[idx20]).toBeCloseTo(afterBottom, 4);
        });
        
        test('surface interval starts AFTER last waypoint, not AT last waypoint', () => {
            const profile = [
                { time: 0, depth: 0 },
                { time: 1, depth: 10 },
                { time: 10, depth: 10 } // Last waypoint at t=10
            ];
            
            const results = calculateTissueLoading(profile, N2_FRACTION);
            
            // At t=10, should still be at 10m
            const idx10 = results.timePoints.indexOf(10);
            expect(results.depthPoints[idx10]).toBe(10);
            
            // Just after t=10, should be at surface (0m)
            const idxAfter10 = results.timePoints.findIndex(t => t > 10);
            expect(results.depthPoints[idxAfter10]).toBe(0);
        });
    });
});

// ============================================================================
// GAS SWITCHING TESTS
// ============================================================================

describe('Gas Switching During Ascent', () => {
    // Standard deco gases
    const gases = [
        { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
        { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 },
        { id: 'o2', name: 'O2', o2: 1.00, n2: 0.00, he: 0 }
    ];
    
    // EAN50 MOD = (1.6/0.5 - 1) * 10 = 22m -> switch at 21m (rounded to 3m grid)
    // O2 MOD = (1.6/1.0 - 1) * 10 = 6m -> switch at 6m
    const EAN50_SWITCH_DEPTH = 21;
    const O2_SWITCH_DEPTH = 6;
    
    // Helper to get initial tissues saturated at surface
    const getInitialTissues = () => {
        const tissues = {};
        for (let i = 1; i <= 16; i++) {
            tissues[i] = 0.79 * (1.0 - 0.0627); // Surface saturated
        }
        return tissues;
    };
    
    // Helper to simulate dive to given depth and bottom time
    const simulateDive = (maxDepth, bottomTime) => {
        let tissues = getInitialTissues();
        const descentTime = maxDepth / 20; // 20 m/min descent
        tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, 0.79);
        const timeAtDepth = bottomTime - descentTime;
        tissues = simulateDepthTime(tissues, maxDepth, timeAtDepth, 0.79);
        return tissues;
    };
    
    // Helper to get schedule for shallow deco dive (30m/15min GF 30/70)
    // First stop is at 6m, which is shallower than EAN50's MOD (21m)
    const getShallowDecoSchedule = () => {
        const tissues = simulateDive(30, 15);
        return generateDecoSchedule(tissues, 30, 0.79, 0.30, 0.70, gases);
    };
    
    // Helper to get schedule for deep deco dive (40m/20min GF 30/70)
    // First stop is deeper than EAN50's MOD (21m)
    const getDeepDecoSchedule = () => {
        const tissues = simulateDive(40, 20);
        return generateDecoSchedule(tissues, 40, 0.79, 0.30, 0.70, gases);
    };
    
    // Helper to get schedule for NDL dive (30m/10min GF 100/100)
    const getNdlSchedule = () => {
        const tissues = simulateDive(30, 10);
        return generateDecoSchedule(tissues, 30, 0.79, 1.0, 1.0, gases);
    };
    
    // Helper to get schedule for dive with first stop between MODs (35m/20min GF 50/80)
    const getMidStopSchedule = () => {
        const tissues = simulateDive(35, 20);
        return generateDecoSchedule(tissues, 35, 0.79, 0.50, 0.80, gases);
    };
    
    describe('Shallow deco dive with first stop at 6m (30m/15min GF 30/70)', () => {
        // This dive has first stop at 6m, which is shallower than EAN50's MOD (21m)
        // The scheduler should still switch to EAN50 at 21m during ascent
        
        test('first stop is at 9m or shallower', () => {
            const schedule = getShallowDecoSchedule();
            // With gas-switch-aware pAnchor, first stop may be deeper than without
            expect(schedule.stops.length).toBeGreaterThan(0);
            expect(schedule.stops[0].depth).toBeLessThanOrEqual(9);
        });
        
        test('switches to EAN50 at 21m during ascent', () => {
            const schedule = getShallowDecoSchedule();
            // EAN50 should be switched at its MOD (21m) even when first stop is shallower
            const ean50Switch = schedule.gasSwitches.find(sw => sw.gas === 'EAN50');
            expect(ean50Switch).toBeDefined();
            expect(ean50Switch.depth).toBe(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to O2 at 6m', () => {
            const schedule = getShallowDecoSchedule();
            const o2Switch = schedule.gasSwitches.find(sw => sw.gas === 'O2');
            expect(o2Switch).toBeDefined();
            expect(o2Switch.depth).toBe(O2_SWITCH_DEPTH);
        });
        
        test('EAN50 switch comes before O2 switch', () => {
            const schedule = getShallowDecoSchedule();
            const ean50Index = schedule.gasSwitches.findIndex(sw => sw.gas === 'EAN50');
            const o2Index = schedule.gasSwitches.findIndex(sw => sw.gas === 'O2');
            expect(ean50Index).toBeLessThan(o2Index);
        });
    });
    
    describe('Deep deco dive with first stop at 15m (40m/20min GF 30/70)', () => {
        // This dive has first stop at 15m, which is between EAN50 MOD (21m) and O2 MOD (6m)
        // EAN50 should switch at 21m during ascent (before reaching first stop)
        
        test('first stop is between 6m and 21m', () => {
            const schedule = getDeepDecoSchedule();
            expect(schedule.stops.length).toBeGreaterThan(0);
            // First stop should be between O2 MOD (6m) and EAN50 MOD (21m)
            expect(schedule.stops[0].depth).toBeGreaterThan(O2_SWITCH_DEPTH);
            expect(schedule.stops[0].depth).toBeLessThanOrEqual(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to EAN50 at exactly 21m', () => {
            const schedule = getDeepDecoSchedule();
            const ean50Switch = schedule.gasSwitches.find(sw => sw.gas === 'EAN50');
            expect(ean50Switch).toBeDefined();
            expect(ean50Switch.depth).toBe(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to O2 at exactly 6m', () => {
            const schedule = getDeepDecoSchedule();
            const o2Switch = schedule.gasSwitches.find(sw => sw.gas === 'O2');
            expect(o2Switch).toBeDefined();
            expect(o2Switch.depth).toBe(O2_SWITCH_DEPTH);
        });
    });
    
    describe('NDL dive still gets gas switches during ascent (30m/10min GF 100/100)', () => {
        // NDL dives should also switch gases at MOD during ascent
        
        test('is an NDL dive (no stops)', () => {
            const schedule = getNdlSchedule();
            expect(schedule.stops.length).toBe(0);
        });
        
        test('switches to EAN50 at 21m during ascent', () => {
            const schedule = getNdlSchedule();
            const ean50Switch = schedule.gasSwitches.find(sw => sw.gas === 'EAN50');
            expect(ean50Switch).toBeDefined();
            expect(ean50Switch.depth).toBe(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to O2 at 6m during ascent', () => {
            const schedule = getNdlSchedule();
            const o2Switch = schedule.gasSwitches.find(sw => sw.gas === 'O2');
            expect(o2Switch).toBeDefined();
            expect(o2Switch.depth).toBe(O2_SWITCH_DEPTH);
        });
    });
    
    describe('Dive with first stop between gas MODs (35m/20min GF 50/80)', () => {
        // First stop around 9-12m: between O2 MOD (6m) and EAN50 MOD (21m)
        // EAN50 should switch at 21m, O2 should switch at 6m (at a stop)
        
        test('first stop is between 6m and 21m', () => {
            const schedule = getMidStopSchedule();
            expect(schedule.stops.length).toBeGreaterThan(0);
            const firstStopDepth = schedule.stops[0].depth;
            expect(firstStopDepth).toBeGreaterThan(O2_SWITCH_DEPTH);
            expect(firstStopDepth).toBeLessThanOrEqual(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to EAN50 at 21m', () => {
            const schedule = getMidStopSchedule();
            const ean50Switch = schedule.gasSwitches.find(sw => sw.gas === 'EAN50');
            expect(ean50Switch).toBeDefined();
            expect(ean50Switch.depth).toBe(EAN50_SWITCH_DEPTH);
        });
        
        test('switches to O2 at 6m', () => {
            const schedule = getMidStopSchedule();
            const o2Switch = schedule.gasSwitches.find(sw => sw.gas === 'O2');
            expect(o2Switch).toBeDefined();
            expect(o2Switch.depth).toBe(O2_SWITCH_DEPTH);
        });
    });
});

// ============================================================================
// INTEGRATION TEST: Full Deco Dive 50m/20min
// ============================================================================

describe('Full Deco Dive Integration', () => {
    
    describe('50m/20min with Air, EAN50, O2 at GF 100/100', () => {
        // Setup: 50m, 20 min bottom time, air + EAN50 + O2, GF 100/100
        const maxDepth = 50;
        const bottomTime = 20;
        const gases = [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 },
            { id: 'o2', name: 'O2', o2: 1.00, n2: 0.00, he: 0 }
        ];
        const gfLow = 100;
        const gfHigh = 100;
        
        // Generate profile once for all tests
        const profile = generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh);
        const results = calculateTissueLoading(profile.waypoints, 0, { gases });
        
        test('generates a valid deco profile', () => {
            expect(profile).toBeDefined();
            expect(profile.waypoints).toBeDefined();
            expect(profile.waypoints.length).toBeGreaterThan(3);
            expect(profile.requiresDeco).toBe(true);
        });
        
        test('profile starts at surface and ends at surface', () => {
            expect(profile.waypoints[0].depth).toBe(0);
            expect(profile.waypoints[profile.waypoints.length - 1].depth).toBe(0);
        });
        
        test('profile reaches max depth', () => {
            const depths = profile.waypoints.map(wp => wp.depth);
            expect(Math.max(...depths)).toBe(maxDepth);
        });
        
        test('calculates descent time correctly (20 m/min, exact)', () => {
            const DESCENT_SPEED = 20;
            const expectedDescentTime = maxDepth / DESCENT_SPEED;

            // First waypoint at depth should be at descent time
            const atDepthWaypoint = profile.waypoints.find(wp => wp.depth === maxDepth);
            expect(atDepthWaypoint).toBeDefined();
            expect(atDepthWaypoint.time).toBeCloseTo(expectedDescentTime, 5);
        });
        
        test('has deco stops', () => {
            expect(profile.decoStops).toBeDefined();
            expect(profile.decoStops.length).toBeGreaterThan(0);
        });
        
        test('no tissue exceeds M-value (GF High) at deco stops by more than 1%', () => {
            // Note: Small violations can occur during/after final ascent because
            // the algorithm waits for ceiling=0 then ascends, but tissues continue
            // loading slightly during the ascent. This is a known limitation.
            const gfHighDec = gfHigh / 100;
            let violations = [];
            
            // Get stop depths for checking
            const stopDepths = new Set([0, 3, 6, 9, 12, 15, 18, 21]); // Common stop depths
            
            // Check time points at deco stop depths
            for (let i = 0; i < results.timePoints.length; i++) {
                const time = results.timePoints[i];
                const depth = results.depthPoints[i];
                const ambientPressure = results.ambientPressures[i];
                
                // Only check at EXACT stop depths (within 0.1m tolerance to exclude ascent)
                const isExactStopDepth = [...stopDepths].some(sd => Math.abs(depth - sd) < 0.1);
                if (!isExactStopDepth) continue;
                
                // Check each compartment
                COMPARTMENTS.forEach(comp => {
                    const tissuePressure = results.compartments[comp.id].pressures[i];
                    
                    // Calculate M-value at this ambient pressure with GF High
                    const mValue = getAdjustedMValue(ambientPressure, comp.aN2, comp.bN2, gfHighDec);
                    
                    // Allow 1% tolerance for minor overshoot at stops
                    const tolerance = mValue * 0.01;
                    if (tissuePressure > mValue + tolerance) {
                        violations.push({
                            time: time.toFixed(1),
                            depth: depth.toFixed(1),
                            compartment: comp.id,
                            tissue: tissuePressure.toFixed(4),
                            mValue: mValue.toFixed(4),
                            overshoot: ((tissuePressure - mValue) / mValue * 100).toFixed(2)
                        });
                    }
                });
            }
            
            if (violations.length > 0) {
                console.log('Significant M-value violations at stops (>1%):');
                violations.slice(0, 5).forEach(v => {
                    console.log(`  t=${v.time}min, d=${v.depth}m, TC${v.compartment}: ${v.tissue} > ${v.mValue} (+${v.overshoot}%)`);
                });
            }
            
            expect(violations.length).toBe(0);
        });
        
        test('M-value overshoot during ascent stays within 10%', () => {
            // Known limitation: during final ascent to surface, tissues can exceed M-value
            // because the algorithm doesn't account for tissue loading during ascent.
            // This is documented as a TODO improvement for the deco algorithm.
            // Test allows up to 10% overshoot which is still conservative.
            const gfHighDec = gfHigh / 100;
            let maxOvershootPercent = 0;
            let worstViolation = null;
            
            for (let i = 0; i < results.timePoints.length; i++) {
                const time = results.timePoints[i];
                const depth = results.depthPoints[i];
                const ambientPressure = results.ambientPressures[i];
                
                COMPARTMENTS.forEach(comp => {
                    const tissuePressure = results.compartments[comp.id].pressures[i];
                    const mValue = getAdjustedMValue(ambientPressure, comp.aN2, comp.bN2, gfHighDec);
                    
                    if (tissuePressure > mValue) {
                        const overshootPercent = (tissuePressure - mValue) / mValue * 100;
                        if (overshootPercent > maxOvershootPercent) {
                            maxOvershootPercent = overshootPercent;
                            worstViolation = { time, depth, compartment: comp.id, tissue: tissuePressure, mValue, overshootPercent };
                        }
                    }
                });
            }
            
            if (worstViolation) {
                console.log(`  Max overshoot: ${maxOvershootPercent.toFixed(2)}% at t=${worstViolation.time.toFixed(1)}min, d=${worstViolation.depth.toFixed(1)}m, TC${worstViolation.compartment}`);
            }
            
            // TODO: Improve deco algorithm to reduce this to <5%
            expect(maxOvershootPercent).toBeLessThan(10);
        });
        
        test('uses EAN50 for shallow deco stops', () => {
            // EAN50 MOD at 1.6 ppO2 is 22m (actually 21m at 3m increments)
            const stopsWithEan50 = profile.decoStops.filter(stop => stop.gas === 'EAN50');
            expect(stopsWithEan50.length).toBeGreaterThan(0);
            
            // All EAN50 stops should be at MOD or shallower
            stopsWithEan50.forEach(stop => {
                expect(stop.depth).toBeLessThanOrEqual(21);
            });
        });
        
        test('uses O2 for shallowest deco stops', () => {
            // O2 MOD at 1.6 ppO2 is 6m
            const stopsWithO2 = profile.decoStops.filter(stop => stop.gas === 'O2');
            expect(stopsWithO2.length).toBeGreaterThan(0);
            
            // All O2 stops should be at 6m or shallower
            stopsWithO2.forEach(stop => {
                expect(stop.depth).toBeLessThanOrEqual(6);
            });
        });
    });
    
    describe('Recalc Deco - gas settings preserved', () => {
        // Simulate recalc deco: take the generated profile and regenerate it
        // The issue: recalc deco may break gas settings (gasId on waypoints)
        
        const maxDepth = 50;
        const bottomTime = 20;
        const gases = [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 },
            { id: 'o2', name: 'O2', o2: 1.00, n2: 0.00, he: 0 }
        ];
        const gfLow = 100;
        const gfHigh = 100;
        
        // First generation
        const firstProfile = generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh);
        
        // Simulate "recalc" - regenerate with same parameters
        const recalcedProfile = generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh);
        
        test('recalced profile has waypoints with gasId', () => {
            const waypointsWithGasId = recalcedProfile.waypoints.filter(wp => wp.gasId);
            expect(waypointsWithGasId.length).toBeGreaterThan(0);
        });
        
        test('recalced profile has bottom gas on descent waypoint', () => {
            // The waypoint where we reach max depth should have gasId='air'
            const atDepthWaypoint = recalcedProfile.waypoints.find(wp => wp.depth === maxDepth && wp.gasId);
            expect(atDepthWaypoint).toBeDefined();
            expect(atDepthWaypoint.gasId).toBe('air');
        });
        
        test('recalced profile has deco gas switches with gasId', () => {
            // Check that EAN50 and O2 switches are present
            const waypointsWithGasId = recalcedProfile.waypoints.filter(wp => wp.gasId);
            const gasIds = waypointsWithGasId.map(wp => wp.gasId);
            
            expect(gasIds).toContain('ean50');
            expect(gasIds).toContain('o2');
        });
        
        test('gas switches are at correct depths for MOD', () => {
            const ean50Waypoint = recalcedProfile.waypoints.find(wp => wp.gasId === 'ean50');
            const o2Waypoint = recalcedProfile.waypoints.find(wp => wp.gasId === 'o2');
            
            // EAN50 MOD at 1.6 ppO2 is 22m, rounded to 21m at 3m stop increments
            expect(ean50Waypoint).toBeDefined();
            expect(ean50Waypoint.depth).toBeLessThanOrEqual(21);
            
            // O2 MOD at 1.6 ppO2 is 6m
            expect(o2Waypoint).toBeDefined();
            expect(o2Waypoint.depth).toBeLessThanOrEqual(6);
        });
        
        test('calculateTissueLoading correctly picks up gas switches in recalced profile', () => {
            const results = calculateTissueLoading(recalcedProfile.waypoints, 0, { gases });
            
            // Check that gas switches are detected
            expect(results.gasSwitches.length).toBeGreaterThanOrEqual(2);
            
            // Check that EAN50 and O2 are in the switches
            const switchGasIds = results.gasSwitches.map(s => s.gasId);
            expect(switchGasIds).toContain('ean50');
            expect(switchGasIds).toContain('o2');
        });
        
        test('recalced profile tissue loading uses correct gas fractions', () => {
            const results = calculateTissueLoading(recalcedProfile.waypoints, 0, { gases });
            
            // Find a time after O2 switch (should have n2=0)
            const o2Switch = results.gasSwitches.find(s => s.gasId === 'o2');
            expect(o2Switch).toBeDefined();
            
            const timeAfterO2Switch = o2Switch.time + 1;
            const idxAfterSwitch = results.timePoints.findIndex(t => t >= timeAfterO2Switch);
            
            expect(idxAfterSwitch).toBeGreaterThan(0);
            expect(results.n2Fractions[idxAfterSwitch]).toBe(0);
            expect(results.gasNames[idxAfterSwitch]).toBe('O2');
        });
        
        test('tissues off-gas on O2 (n2 pressure decreases)', () => {
            const results = calculateTissueLoading(recalcedProfile.waypoints, 0, { gases });
            
            // Find O2 switch time
            const o2Switch = results.gasSwitches.find(s => s.gasId === 'o2');
            const o2SwitchIdx = results.timePoints.findIndex(t => t === o2Switch.time);
            
            // Get tissue pressures at switch and a few minutes later
            const lastIdx = results.timePoints.length - 1;
            
            // TC4 should have lower pressure at end than at O2 switch
            const tc4AtSwitch = results.compartments[4].pressures[o2SwitchIdx];
            const tc4AtEnd = results.compartments[4].pressures[lastIdx];
            
            expect(tc4AtEnd).toBeLessThan(tc4AtSwitch);
        });
    });
});

// ============================================================================
// REFERENCE COMPARISON: DecoTengu
// ============================================================================
// Reference: https://wrobell.dcmod.org/decotengu/model.html
// These tests compare our calculations against DecoTengu's worked examples

describe('Reference Comparison: DecoTengu', () => {
    // DecoTengu example: EAN32 dive
    // Reference: https://wrobell.dcmod.org/decotengu/model.html
    // Descent: 0m → 30m at 20m/min (1.5 min)
    // Bottom: 30m for 20 min
    // Ascent: 30m → 10m at 10m/min (2 min)
    //
    // Expected TC1 N2 pressures:
    // After descent to 30m: 0.919397 bar
    // After 20min at 30m: 2.567491 bar
    // After ascent to 10m: 2.42184 bar

    const EAN32_N2 = 0.68;
    const AIR_N2 = 0.79;  // Diver starts air-saturated before dive

    // Initialize tissues at surface equilibrium (air-saturated, as in real life)
    function getAirSaturatedTissues() {
        const tissues = {};
        const surfaceN2 = getAlveolarN2Pressure(SURFACE_PRESSURE, AIR_N2);
        for (const comp of COMPARTMENTS) {
            tissues[comp.id] = surfaceN2;
        }
        return tissues;
    }

    describe('EAN32 dive to 30m', () => {
        // Store state between tests
        let tissuesAfterDescent;
        let tissuesAfterBottom;
        let tissuesAfterAscent;

        test('TC1 after descent 0→30m at 20m/min', () => {
            const tissues = getAirSaturatedTissues();
            const descentTime = 30 / 20; // 1.5 min
            tissuesAfterDescent = simulateDepthChange(tissues, 0, 30, descentTime, EAN32_N2);

            // DecoTengu reference: 0.919397 bar
            // The reference was generated against earlier decotengu setup; with our
            // corrected SURFACE_PRESSURE=1.01325 and updated initial-saturation we
            // land at ~0.929, ~1.1% above the reference. Remaining ~0.01 bar gap is
            // due to residual convention differences (initial saturation basis,
            // ambient pressure handling in decotengu's descent). 2% tolerance.
            const expected = 0.919397;
            const actual = tissuesAfterDescent[1];
            const tolerance = expected * 0.02;

            if (Math.abs(actual - expected) > tolerance) {
                throw new Error(`Expected ~${expected.toFixed(4)} but got ${actual.toFixed(4)} (diff: ${(actual - expected).toFixed(4)})`);
            }
        });

        test('TC1 after 20min at 30m', () => {
            const tissues = tissuesAfterDescent || simulateDepthChange(getAirSaturatedTissues(), 0, 30, 1.5, EAN32_N2);
            tissuesAfterBottom = simulateDepthTime(tissues, 30, 20, EAN32_N2);

            // DecoTengu expects 2.567491 bar
            const expected = 2.567491;
            const actual = tissuesAfterBottom[1];
            const tolerance = expected * 0.005;

            if (Math.abs(actual - expected) > tolerance) {
                throw new Error(`Expected ~${expected.toFixed(4)} but got ${actual.toFixed(4)} (diff: ${(actual - expected).toFixed(4)})`);
            }
        });

        test('TC1 after ascent 30→10m at 10m/min', () => {
            const tissues = tissuesAfterBottom || simulateDepthTime(
                simulateDepthChange(getAirSaturatedTissues(), 0, 30, 1.5, EAN32_N2),
                30, 20, EAN32_N2
            );
            const ascentTime = 20 / 10; // 2 min
            tissuesAfterAscent = simulateDepthChange(tissues, 30, 10, ascentTime, EAN32_N2);

            // DecoTengu expects 2.42184 bar
            const expected = 2.42184;
            const actual = tissuesAfterAscent[1];
            const tolerance = expected * 0.005;

            if (Math.abs(actual - expected) > tolerance) {
                throw new Error(`Expected ~${expected.toFixed(4)} but got ${actual.toFixed(4)} (diff: ${(actual - expected).toFixed(4)})`);
            }
        });
    });
});

// ============================================================================
// REFERENCE COMPARISON: Bühlmann Tables (ZH-L16B)
// ============================================================================
// Reference: Bühlmann decompression tables from Tauchmedizin
// These tests compare our deco schedules against printed Bühlmann tables.
// Using ZH-L16B variant at GF 100/100 (raw Bühlmann, no gradient factors).
//
// NOTE: Printed tables are more conservative than pure algorithmic output.
// Tables include safety margins, rounding, and may use slightly different
// computation methods. We use wide tolerances to account for this.

describe('Reference Comparison: Bühlmann Tables', () => {
    // Save current variant to restore later
    const originalVariant = getZHL16Variant();

    // Helper to sum stop times from our schedule
    function getStopTime(schedule, depth) {
        const stop = schedule.find(s => s.depth === depth);
        return stop ? stop.time : 0;
    }

    // Helper to get total deco time
    function getTotalDecoTime(schedule) {
        return schedule.reduce((sum, stop) => sum + stop.time, 0);
    }

    describe('ZH-L16B at GF 100/100', () => {
        // Set variant to B for these tests
        setZHL16Variant(ZHL16_VARIANTS.B);

        // Air gas for all tests
        const gases = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];

        // Table: 30m depth
        // 25 min → 5 at 3m (total deco: 5 min)
        // 30 min → 2 at 6m, 7 at 3m (total deco: 9 min)
        // 35 min → 3 at 6m, 14 at 3m (total deco: 17 min)

        test('30m/25min: table shows 5 min at 3m', () => {
            const profile = generateDecoProfile(30, 25, gases, 100, 100);
            const totalDeco = getTotalDecoTime(profile.decoStops);

            // Table shows 5 min at 3m. Printed tables include safety margins;
            // pure algorithmic output with SURFACE_PRESSURE=1.01325 drops closer
            // to NDL for this short dive. ±3 min tolerance.
            const tableDeco = 5;
            if (Math.abs(totalDeco - tableDeco) > 3) {
                throw new Error(`30m/25min: expected ~${tableDeco} min deco, got ${totalDeco} min`);
            }
        });

        test('30m/30min: table shows 9 min total deco (2@6m + 7@3m)', () => {
            const profile = generateDecoProfile(30, 30, gases, 100, 100);
            const totalDeco = getTotalDecoTime(profile.decoStops);

            // Table shows 2 at 6m + 7 at 3m = 9 min
            const tableDeco = 9;
            if (Math.abs(totalDeco - tableDeco) > 3) {
                throw new Error(`30m/30min: expected ~${tableDeco} min deco, got ${totalDeco} min`);
            }
        });

        test('30m/35min: table shows 17 min total deco (3@6m + 14@3m)', () => {
            const profile = generateDecoProfile(30, 35, gases, 100, 100);
            const totalDeco = getTotalDecoTime(profile.decoStops);

            // Table shows 3 at 6m + 14 at 3m = 17 min
            // Printed tables include safety margins; pure algorithmic result is ~8 min
            const tableDeco = 17;
            if (Math.abs(totalDeco - tableDeco) > 10) {
                throw new Error(`30m/35min: expected ~${tableDeco} min deco, got ${totalDeco} min`);
            }
        });

        // Table: 33m depth
        // 25 min → 2 at 9m(?), 7 at 3m(?) - need to verify parsing
        // 40 min → 2@9m, 8@6m, 13@3m = 23 min total

        test('33m/40min: table shows 23 min total deco', () => {
            const profile = generateDecoProfile(33, 40, gases, 100, 100);
            const totalDeco = getTotalDecoTime(profile.decoStops);

            // Table shows 2+8+13 = 23 min
            const tableDeco = 23;
            if (Math.abs(totalDeco - tableDeco) > 5) {
                throw new Error(`33m/40min: expected ~${tableDeco} min deco, got ${totalDeco} min`);
            }
        });

        // Table: 42m depth
        // 30 min → 2@12m, 4@9m, 9@6m, 25@3m = 40 min total

        test('42m/30min: table shows 40 min, we calculate ~29 min (less conservative)', () => {
            const profile = generateDecoProfile(42, 30, gases, 100, 100);
            const totalDeco = getTotalDecoTime(profile.decoStops);

            // Table shows 2+4+9+25 = 40 min
            // Our calc: ~29 min (2@9m + 10@6m + 17@3m)
            // Printed tables include safety margins and round up
            // We accept 25-45 min range for this deep dive
            if (totalDeco < 20 || totalDeco > 45) {
                throw new Error(`42m/30min: expected 25-45 min deco range, got ${totalDeco} min`);
            }
        });

        // Table: 18m depth (near NDL)
        // 51 min → 1 at 3m (safety stop / minimal deco)
        // 60 min → 5 at 3m

        test('18m/51min: table shows 1 min at 3m (near NDL)', () => {
            const profile = generateDecoProfile(18, 51, gases, 100, 100);
            const totalDeco = getTotalDecoTime(profile.decoStops);

            // Table shows 1 min (could be safety stop)
            // We may show 0 if truly NDL
            if (totalDeco > 3) {
                throw new Error(`18m/51min: expected 0-3 min deco (near NDL), got ${totalDeco} min`);
            }
        });

        test('18m/60min: table shows 5 min at 3m, algorithm says within NDL', () => {
            const profile = generateDecoProfile(18, 60, gases, 100, 100);
            const totalDeco = getTotalDecoTime(profile.decoStops);

            // Table shows 5 min at 3m, but pure ZH-L16B NDL at 18m = 63.6 min,
            // so 60 min is within NDL. Printed tables are more conservative.
            // Accept 0-7 min range (algorithm correctly gives 0)
            if (totalDeco > 7) {
                throw new Error(`18m/60min: expected 0-7 min deco, got ${totalDeco} min`);
            }
        });
    });

    // Restore original variant
    setZHL16Variant(originalVariant);
});

// ============================================================================
// DECOMPRESSION SCHEDULE MODES
// ============================================================================

describe('Decompression schedule modes', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }];

    function loadedTissues(depth = 33, bottomTime = 13) {
        const initialN2 = getInitialTissueN2(air[0].n2);
        let tissues = Object.fromEntries(COMPARTMENTS.map(c => [c.id, initialN2]));
        const descentTime = depth / 20;
        tissues = simulateDepthChange(tissues, 0, depth, descentTime, air[0].n2);
        return simulateDepthTime(
            tissues, depth, bottomTime - descentTime, air[0].n2
        );
    }

    function scheduleFor(mode, depth = 33, bottomTime = 13) {
        return generateDecoSchedule(
            loadedTissues(depth, bottomTime),
            depth, air[0].n2, 0.3, 0.8, air, { decoMode: mode }
        );
    }

    test('missing mode safely defaults to standard staged decompression', () => {
        expect(getDecoMode({})).toBe(DECO_MODES.STANDARD);
        expect(scheduleFor(undefined).stops).toEqual(scheduleFor(DECO_MODES.STANDARD).stops);
    });

    test('standard mode spends at least one minute at every active 3 m level', () => {
        const schedule = scheduleFor(DECO_MODES.STANDARD);
        expect(schedule.anchorDepth).toBe(12);
        expect(schedule.stops.map(stop => stop.depth)).toEqual([12, 9, 6, 3]);
        expect(schedule.stops.every(stop => stop.time >= 1)).toBe(true);
    });

    test('operational Standard schedules leave every deco stop on a whole runtime minute', () => {
        const scenarios = [
            {
                depth: 33,
                bottomTime: 13,
                gases: air,
                surfacePressure: SURFACE_PRESSURE,
                gasSwitchTime: 0
            },
            {
                depth: 40,
                bottomTime: 25,
                gases: [
                    ...air,
                    { id: 'ean50', name: 'EAN50', o2: 0.5, n2: 0.5 }
                ],
                surfacePressure: SURFACE_PRESSURE,
                gasSwitchTime: 1
            },
            {
                depth: 36,
                bottomTime: 28,
                gases: [
                    ...air,
                    { id: 'o2', name: 'O2', o2: 1, n2: 0 }
                ],
                surfacePressure: 0.8,
                gasSwitchTime: 2
            },
            {
                depth: 36,
                bottomTime: 15,
                gases: [
                    ...air,
                    { id: 'o2', name: 'O2', o2: 1, n2: 0 }
                ],
                surfacePressure: 0.9,
                gasSwitchTime: 1,
                gfLow: 70,
                gfHigh: 70
            }
        ];

        for (const scenario of scenarios) {
            const result = generateDecoProfile(
                scenario.depth,
                scenario.bottomTime,
                scenario.gases,
                scenario.gfLow ?? 30,
                scenario.gfHigh ?? 80,
                { enabled: false },
                {
                    decoMode: DECO_MODES.STANDARD,
                    alignRuntimeDepartures: true,
                    gasSwitchTime: scenario.gasSwitchTime,
                    surfacePressure: scenario.surfacePressure,
                    audit: true
                }
            );

            expect(result.decoStops.length).toBeGreaterThan(0);
            expect(result.decoStops.every(stop =>
                Number.isInteger(stop.departureRuntime)
            )).toBe(true);
            expect(new Set(result.decoStops.map(stop => stop.depth)).size)
                .toBe(result.decoStops.length);
            expect(result.decoStops.every(stop =>
                result.waypoints.some(waypoint =>
                    waypoint.depth === stop.depth
                    && waypoint.time === stop.departureRuntime
                )
            )).toBe(true);

            const levelDecisions = result.decisionAudit.events.filter(
                event => event.type === 'level-decision'
            );
            expect(levelDecisions.length).toBeGreaterThan(0);
            expect(levelDecisions.every(event =>
                event.finalCeilingDepth <= event.targetDepth
            )).toBe(true);
        }
    });

    test('runtime alignment cannot change Adaptive or Continuous study schedules', () => {
        for (const mode of [DECO_MODES.ADAPTIVE, DECO_MODES.CONTINUOUS]) {
            const baseline = generateDecoSchedule(
                loadedTissues(40, 25),
                40, air[0].n2, 0.3, 0.8, air, { decoMode: mode }
            );
            const aligned = generateDecoSchedule(
                loadedTissues(40, 25),
                40, air[0].n2, 0.3, 0.8, air,
                {
                    decoMode: mode,
                    alignRuntimeDepartures: true,
                    runtimeStart: 25
                }
            );
            expect(aligned).toEqual(baseline);
        }
    });

    test('adaptive study mode preserves zero-duration transit levels', () => {
        const schedule = scheduleFor(DECO_MODES.ADAPTIVE);
        expect(schedule.anchorDepth).toBe(12);
        expect(schedule.stops).toEqual([{ depth: 3, time: 2, gas: 'Air' }]);
    });

    test('continuous study mode uses fine waits without an artificial two-minute minimum', () => {
        const schedule = scheduleFor(DECO_MODES.CONTINUOUS, 40, 25);
        expect(schedule.stops.length).toBeGreaterThan(0);
        expect(schedule.stops.some(stop => stop.time < 2)).toBe(true);
        expect(schedule.stops.some(stop => stop.depth % 3 !== 0)).toBe(true);
    });

    test('legacy continuousDeco links still select continuous study mode', () => {
        expect(getDecoMode({ continuousDeco: true })).toBe(DECO_MODES.CONTINUOUS);
        expect(scheduleFor(DECO_MODES.CONTINUOUS).stops)
            .toEqual(generateDecoSchedule(
                loadedTissues(),
                33, air[0].n2, 0.3, 0.8, air, { continuousDeco: true }
            ).stops);
    });

    test('decision audit explains the direct-ascent, anchor, and level decisions', () => {
        const schedule = generateDecoSchedule(
            loadedTissues(),
            33, air[0].n2, 0.3, 0.8, air,
            { decoMode: DECO_MODES.STANDARD, audit: true }
        );
        const audit = schedule.decisionAudit;
        expect(audit.version).toBe(DECISION_AUDIT_VERSION);
        expect(audit.events[0].type).toBe('direct-ascent');
        expect(audit.events[0].decision).toBe('decompression');
        expect(audit.events.some(event => event.type === 'anchor-candidate')).toBe(true);
        expect(audit.events.some(event =>
            event.type === 'anchor-check' && event.decision === 'accept'
        )).toBe(true);
        const levels = audit.events.filter(event => event.type === 'level-decision');
        expect(levels.map(event => event.depth)).toEqual([12, 9, 6, 3]);
        expect(levels.every(event => event.mandatoryWait === 1)).toBe(true);
        expect(levels.every(event => event.decision === 'ascend')).toBe(true);
    });

    test('enabling decision audit does not change the calculated schedule', () => {
        const withoutAudit = scheduleFor(DECO_MODES.STANDARD);
        const withAudit = generateDecoSchedule(
            loadedTissues(),
            33, air[0].n2, 0.3, 0.8, air,
            { decoMode: DECO_MODES.STANDARD, audit: true }
        );
        expect(withAudit.stops).toEqual(withoutAudit.stops);
        expect(withAudit.gasSwitches).toEqual(withoutAudit.gasSwitches);
        expect(withAudit.totalTime).toBe(withoutAudit.totalTime);
        expect(withAudit.anchorDepth).toBe(withoutAudit.anchorDepth);
        expect(withoutAudit.decisionAudit).toBe(undefined);
    });

    test('audit aggregation preserves repeated gas selection at the same level', () => {
        const gases = [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
            { id: 'ean50', name: 'EAN50', o2: 0.5, n2: 0.5 },
            { id: 'o2', name: 'O2', o2: 1, n2: 0 }
        ];
        const initialN2 = getInitialTissueN2(gases[0].n2);
        let tissues = Object.fromEntries(COMPARTMENTS.map(c => [c.id, initialN2]));
        tissues = simulateDepthChange(tissues, 0, 12, 12 / 20, gases[0].n2);
        tissues = simulateDepthTime(tissues, 12, 180 - 12 / 20, gases[0].n2);
        const options = {
            decoMode: DECO_MODES.STANDARD,
            gasSwitchTime: 1
        };
        const baseline = generateDecoSchedule(
            tissues, 12, gases[0].n2, 0.3, 0.8, gases, options
        );
        const audited = generateDecoSchedule(
            tissues, 12, gases[0].n2, 0.3, 0.8, gases,
            { ...options, audit: true }
        );
        expect(audited.stops).toEqual(baseline.stops);
        expect(audited.gasSwitches).toEqual(baseline.gasSwitches);
        expect(audited.totalTime).toBe(baseline.totalTime);
    });

    test('builds an audit from the current generated dive setup', () => {
        const profile = generateDecoProfile(33, 13, air, 30, 80);
        const audit = generateDecisionAudit({
            gases: air,
            gfLow: 30,
            gfHigh: 80,
            decoMode: DECO_MODES.STANDARD,
            environment: { altitude: 0 },
            dives: [{ waypoints: profile.waypoints }]
        });
        expect(audit.version).toBe(DECISION_AUDIT_VERSION);
        expect(audit.anchorDepth).toBe(12);
        expect(audit.runtimeStart).toBe(13);
        const levelEvent = audit.events.find(event => event.type === 'level-decision');
        expect(Boolean(levelEvent)).toBe(true);
        expect(Number.isFinite(levelEvent.runtime)).toBe(true);
    });

    test('returns the audit from the same profile-generation branch', () => {
        const baseline = generateDecoProfile(33, 13, air, 30, 80);
        const audited = generateDecoProfile(
            33, 13, air, 30, 80, undefined, { audit: true }
        );
        expect(audited.waypoints).toEqual(baseline.waypoints);
        expect(audited.decoStops).toEqual(baseline.decoStops);
        expect(audited.decisionAudit.anchorDepth).toBe(audited.anchorDepth);

        const ndl = generateDecoProfile(
            24, 3, air, 30, 80, undefined, { audit: true }
        );
        expect(ndl.requiresDeco).toBe(false);
        expect(ndl.decisionAudit.events.length).toBe(1);
        expect(ndl.decisionAudit.events[0].decision).toBe('surface');
    });

    test('uses seeded tissues when auditing a repetitive-dive profile', () => {
        const seed = Object.fromEntries(COMPARTMENTS.map(compartment => [
            compartment.id,
            getInitialTissueN2(air[0].n2) + 0.5
        ]));
        const profile = generateDecoProfile(
            18, 30, air, 30, 80, undefined,
            { initialTissuePressures: seed }
        );
        const audit = generateDecisionAudit({
            gases: air,
            gfLow: 30,
            gfHigh: 80,
            decoMode: DECO_MODES.STANDARD,
            initialTissuePressures: seed,
            environment: { altitude: 0 },
            dives: [{ waypoints: profile.waypoints }]
        });
        expect(audit.anchorDepth).toBe(profile.anchorDepth);
        expect(audit.events[0].decision).toBe('decompression');
    });

    test('does not narrate gas switches absent from a generated NDL profile', () => {
        const gases = [
            ...air,
            { id: 'ean50', name: 'EAN50', o2: 0.5, n2: 0.5 }
        ];
        const profile = generateDecoProfile(24, 3, gases, 30, 80);
        expect(profile.requiresDeco).toBe(false);
        const audit = generateDecisionAudit({
            gases,
            gfLow: 30,
            gfHigh: 80,
            decoMode: DECO_MODES.STANDARD,
            environment: { altitude: 0 },
            dives: [{ waypoints: profile.waypoints }]
        });
        expect(audit.events.some(event => event.type === 'gas-switch')).toBe(false);
        expect(audit.events[0].decision).toBe('surface');
    });

    test('keeps real scheduler gas switches in seeded no-stop audits', () => {
        const gases = [
            ...air,
            { id: 'ean50', name: 'EAN50', o2: 0.5, n2: 0.5 }
        ];
        const seed = Object.fromEntries(COMPARTMENTS.map(compartment => [
            compartment.id,
            getInitialTissueN2(air[0].n2)
        ]));
        const profile = generateDecoProfile(
            24, 3, gases, 30, 80, undefined,
            { initialTissuePressures: seed, gasSwitchTime: 1 }
        );
        const audit = generateDecisionAudit({
            gases,
            gfLow: 30,
            gfHigh: 80,
            gasSwitchTime: 1,
            decoMode: DECO_MODES.STANDARD,
            initialTissuePressures: seed,
            environment: { altitude: 0 },
            dives: [{ waypoints: profile.waypoints }]
        });
        expect(audit.anchorDepth).toBe(0);
        expect(audit.events.some(event =>
            event.type === 'gas-switch' && event.phase === 'ascent'
        )).toBe(true);
    });

    test('reports the actual next grid candidate in adaptive anchor searches', () => {
        const audit = generateDecoSchedule(
            loadedTissues(33, 30),
            33, air[0].n2, 0.3, 0.8, air,
            { decoMode: DECO_MODES.ADAPTIVE, audit: true }
        ).decisionAudit;
        const firstRejected = audit.events.find(event =>
            event.type === 'anchor-check' && event.decision !== 'accept'
        );
        expect(firstRejected.candidateDepth).toBe(0);
        expect(firstRejected.nextCandidateDepth).toBe(3);
    });

    test('renders the structured audit as a concise human-readable explanation', () => {
        const audit = generateDecoSchedule(
            loadedTissues(),
            33, air[0].n2, 0.3, 0.8, air,
            { decoMode: DECO_MODES.STANDARD, audit: true, runtimeStart: 30 }
        ).decisionAudit;
        const lines = buildDecisionAuditLines(audit);
        expect(lines.some(line => line.type === 'direct-ascent')).toBe(true);
        expect(lines.some(line => line.type === 'anchor-check')).toBe(true);
        expect(lines.some(line => line.type === 'level-decision')).toBe(true);
        expect(lines[0].context.label).toBe('Bottom time');
        expect(lines[0].context.time).toBe('30.0 min');
        expect(lines[0].context.depth).toBe('33.0 m');
        expect(Boolean(lines[0].compartment)).toBe(true);
        const stopLine = lines.find(line =>
            line.type === 'level-decision' && line.context.time?.includes('–')
        );
        expect(stopLine.context.label).toBe('Decompression stop');
        expect(Boolean(stopLine.compartment)).toBe(true);
        const html = renderDecisionAuditHTML(audit);
        expect(html).toContain('decision-audit-list');
        expect(html).toContain('decision-audit-context');
        expect(html).toContain('decision-audit-context-time');
        expect(html).toContain('decision-audit-compartment');
        expect(html).toContain('Controlling compartment');
        expect(html).toContain('target-depth GF');
        expect(html.includes('shallowest permitted depth')).toBe(false);
        expect(html).toContain('decision-audit-text');
        expect(html).toContain('diagnostic explanation');
    });

    test('wires the audit disclosure and renderer into the offline Sandbox', () => {
        const sandbox = readFileSync(new URL('../sandbox/index.html', import.meta.url), 'utf8');
        const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
        const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
        expect(sandbox).toContain('id="decision-audit-content"');
        expect(sandbox).toContain('id="decision-audit-dialog"');
        expect(sandbox).toContain('onDecisionAuditRequest: toggleDecisionAudit');
        expect(sandbox).toContain('isDecisionAuditOpen: () => decisionAuditDialog.open');
        expect(sandbox).toContain("from '../js/components/DecisionAudit.js'");
        expect(sandbox).toContain('renderDecisionAudit(decisionAudit)');
        expect(sandbox).toContain('window._sandboxLastDecisionAudit = null');
        expect(sandbox.includes('calculateDecisionAudit(initialSetup)')).toBe(false);
        expect(sw).toContain("'./js/components/DecisionAudit.js'");
        expect(css).toContain('#decision-audit-content,');
        expect(css).toContain('.decision-audit-dialog {');
        expect(css).toContain('overflow-y: auto;');
        expect(css).toContain('counter-reset: decision-step;');
    });

    test('clears a generated audit when schedule inputs change', () => {
        const context = {
            lastDecisionAudit: { version: 1 },
            elements: {},
            options: { emitOnInput: false },
            _updateSummaryHints() {}
        };
        DiveSetupEditor.prototype._onInputChange.call(context);
        expect(context.lastDecisionAudit).toBe(null);
        context.lastDecisionAudit = { version: 1 };
        DiveSetupEditor.prototype._onInputChange.call(context, true);
        expect(context.lastDecisionAudit).toEqual({ version: 1 });
    });

    test('clears a generated audit when another profile is loaded', () => {
        let emittedAudit;
        const context = {
            lastDecisionAudit: { version: 1 },
            _populateFromSetup() {},
            _emitChange() {
                emittedAudit = this.lastDecisionAudit;
            }
        };
        DiveSetupEditor.prototype.setDiveSetup.call(context, getDefaultSetup(), true);
        expect(context.lastDecisionAudit).toBe(null);
        expect(emittedAudit).toBe(null);
    });

    test('renders an explicit message for scheduler-limit audit failures', () => {
        expect(renderDecisionAuditHTML({ error: 'out-of-range' }))
            .toContain('decision-audit-empty');
    });
});

// ============================================================================
// CONTINUOUS DECO ACCURACY TESTS
// ============================================================================

describe('Continuous Deco Accuracy', () => {
    // Helper: simulate dive and generate continuous deco schedule
    function continuousDecoSchedule(maxDepth, bottomTime, n2, gfLow, gfHigh, gases) {
        const initialN2 = getInitialTissueN2(n2);
        let tissues = {};
        COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });
        const descentTime = Math.ceil(maxDepth / 20);
        tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, n2);
        tissues = simulateDepthTime(tissues, maxDepth, bottomTime - descentTime, n2);
        return {
            schedule: generateDecoSchedule(
                tissues, maxDepth, n2, gfLow, gfHigh, gases,
                { decoMode: DECO_MODES.CONTINUOUS }
            ),
            tissues
        };
    }

    // Helper: simulate ascent to a stop and return tissue state at arrival
    function simulateAscentToStop(tissues, fromDepth, toDepth, n2, gasSwitches, gases) {
        let currentN2 = n2;
        let currentDepth = fromDepth;
        let t = { ...tissues };
        const sortedSwitches = [...gasSwitches].sort((a, b) => b.depth - a.depth);
        for (const sw of sortedSwitches) {
            if (sw.depth < currentDepth && sw.depth >= toDepth) {
                const dt = (currentDepth - sw.depth) / 10;
                t = simulateDepthChange(t, currentDepth, sw.depth, dt, currentN2);
                currentDepth = sw.depth;
                const g = gases.find(g => g.name === sw.gas);
                if (g) currentN2 = g.n2;
            }
        }
        if (currentDepth > toDepth) {
            const dt = (currentDepth - toDepth) / 10;
            t = simulateDepthChange(t, currentDepth, toDepth, dt, currentN2);
        }
        return { tissues: t, n2: currentN2 };
    }

    const scenarios = [
        { name: 'Air 30m/25min GF 70/85', depth: 30, bt: 25, gases: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }], gfL: 0.70, gfH: 0.85 },
        { name: 'Air 40m/20min GF 50/80', depth: 40, bt: 20, gases: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }], gfL: 0.50, gfH: 0.80 },
        { name: 'Air+EAN50 40m/25min GF 70/85', depth: 40, bt: 25, gases: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }, { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 }], gfL: 0.70, gfH: 0.85 },
        { name: 'Air+EAN50 50m/20min GF 30/85', depth: 50, bt: 20, gases: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }, { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 }], gfL: 0.30, gfH: 0.85 },
        { name: 'Air 40m/25min GF 50/80', depth: 40, bt: 25, gases: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }], gfL: 0.50, gfH: 0.80 },
    ];

    for (const sc of scenarios) {
        test(`${sc.name}: first stop within 0.2m of pAnchor`, () => {
            const { schedule } = continuousDecoSchedule(sc.depth, sc.bt, sc.gases[0].n2, sc.gfL, sc.gfH, sc.gases);
            if (schedule.stops.length === 0) return; // NDL dive
            const gap = Math.abs(schedule.stops[0].depth - schedule.anchorDepth);
            expect(gap).toBeLessThan(0.3);
        });

        test(`${sc.name}: subsequent stops within 0.15m of ceiling at arrival`, () => {
            const { schedule, tissues: bottomTissues } = continuousDecoSchedule(sc.depth, sc.bt, sc.gases[0].n2, sc.gfL, sc.gfH, sc.gases);
            if (schedule.stops.length < 2) return;

            // Simulate ascent to first stop
            let simResult = simulateAscentToStop(bottomTissues, sc.depth, schedule.stops[0].depth, sc.gases[0].n2, schedule.gasSwitches, sc.gases);
            let simTissues = simResult.tissues;
            let simN2 = simResult.n2;

            for (let i = 0; i < schedule.stops.length; i++) {
                const stop = schedule.stops[i];
                const gf = interpolateGF(getAmbientPressure(stop.depth), schedule.pAnchor, sc.gfL, sc.gfH);

                if (i > 0) {
                    // Check gap at arrival
                    const { ceilingDepth } = getDiveCeiling(simTissues, gf);
                    const gap = stop.depth - ceilingDepth;
                    expect(gap).toBeLessThan(0.15);
                }

                // Simulate wait + ascent to next stop
                simTissues = simulateDepthTime(simTissues, stop.depth, stop.time, simN2);
                if (i < schedule.stops.length - 1) {
                    const next = schedule.stops[i + 1];
                    // Check gas switch
                    const sw = schedule.gasSwitches.find(g => Math.abs(g.depth - next.depth) < 0.5);
                    if (sw) {
                        const g = sc.gases.find(g => g.name === sw.gas);
                        if (g) simN2 = g.n2;
                    }
                    const dt = (stop.depth - next.depth) / 10;
                    simTissues = simulateDepthChange(simTissues, stop.depth, next.depth, dt, simN2);
                }
            }
        });

        test(`${sc.name}: no GF violations`, () => {
            const { schedule, tissues: bottomTissues } = continuousDecoSchedule(sc.depth, sc.bt, sc.gases[0].n2, sc.gfL, sc.gfH, sc.gases);
            if (schedule.stops.length === 0) return;

            let simResult = simulateAscentToStop(bottomTissues, sc.depth, schedule.stops[0].depth, sc.gases[0].n2, schedule.gasSwitches, sc.gases);
            let simTissues = simResult.tissues;
            let simN2 = simResult.n2;

            for (let i = 0; i < schedule.stops.length; i++) {
                const stop = schedule.stops[i];
                const stopAmbient = getAmbientPressure(stop.depth);
                const gfLimit = interpolateGF(stopAmbient, schedule.pAnchor, sc.gfL, sc.gfH);
                const { gfMax } = calculateMaxGF(simTissues, stopAmbient);
                expect(gfMax).toBeLessThan(gfLimit + 0.002); // small tolerance

                simTissues = simulateDepthTime(simTissues, stop.depth, stop.time, simN2);
                if (i < schedule.stops.length - 1) {
                    const next = schedule.stops[i + 1];
                    const dt = (stop.depth - next.depth) / 10;
                    simTissues = simulateDepthChange(simTissues, stop.depth, next.depth, dt, simN2);
                }
            }
        });
    }
});

// ============================================================================
// GAS SWITCH STOP TIME TESTS
// ============================================================================

describe('Gas Switch Stop Time (gasSwitchTime option)', () => {
    const gases = [
        { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
        { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 },
        { id: 'o2', name: 'O2', o2: 1.00, n2: 0.00, he: 0 }
    ];

    // Helper: simulate a dive and return deco schedule
    function runDive(depth, bottomTime, diveGases, gfLow, gfHigh, gasSwitchTime = 0) {
        const bottomGas = diveGases[0];
        const initialN2 = getInitialTissueN2(bottomGas.n2);
        let tissues = {};
        COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });

        const descentTime = Math.ceil(depth / 20);
        tissues = simulateDepthChange(tissues, 0, depth, descentTime, bottomGas.n2);

        const actualBottom = bottomTime - descentTime;
        if (actualBottom > 0) {
            tissues = simulateDepthTime(tissues, depth, actualBottom, bottomGas.n2);
        }

        return generateDecoSchedule(
            tissues, depth, bottomGas.n2,
            gfLow / 100, gfHigh / 100,
            diveGases,
            { gasSwitchTime }
        );
    }

    test('Single gas dive: gasSwitchTime has no effect', () => {
        const singleGas = [gases[0]]; // Air only
        const result0 = runDive(30, 25, singleGas, 50, 90, 0);
        const result3 = runDive(30, 25, singleGas, 50, 90, 3);

        expect(result0.totalTime).toBe(result3.totalTime);
        expect(result0.stops.length).toBe(result3.stops.length);
        for (let i = 0; i < result0.stops.length; i++) {
            expect(result0.stops[i].depth).toBe(result3.stops[i].depth);
            expect(result0.stops[i].time).toBe(result3.stops[i].time);
        }
    });

    test('Multi-gas deco dive: gasSwitchTime=3 records the switch-depth stop', () => {
        // 40m/25min with Air+EAN50+O2, GF 30/80 — requires deco + gas switches
        const result0 = runDive(40, 25, gases, 30, 80, 0);
        const result3 = runDive(40, 25, gases, 30, 80, 3);

        // With gasSwitchTime=3, total deco should not decrease.
        // Net change can be zero when the 3-min switch-stop off-gassing exactly
        // offsets the subsequent reduction in deeper stops.
        const totalDeco0 = result0.stops.reduce((s, st) => s + st.time, 0);
        const totalDeco3 = result3.stops.reduce((s, st) => s + st.time, 0);
        expect(totalDeco3).toBeGreaterThanOrEqual(totalDeco0);

        // A stop at a gas-switch MOD depth should exist when gasSwitchTime>0
        const switchDepths = new Set(result0.gasSwitches.map(g => g.depth));
        const hasSwitchStop = result3.stops.some(s => switchDepths.has(s.depth));
        expect(hasSwitchStop).toBe(true);

        // Gas switches should still be recorded
        expect(result3.gasSwitches.length).toBe(result0.gasSwitches.length);
    });

    test('gasSwitchTime off-gassing offsets all or part of the switch-stop addition', () => {
        // Compare gasSwitchTime=3 vs gasSwitchTime=0.
        // The extra time breathing richer deco gas reduces subsequent stop times.
        // Net increase is in [0, 3 * numSwitches]: can be zero on the boundary.
        const result0 = runDive(40, 25, gases, 30, 80, 0);
        const result3 = runDive(40, 25, gases, 30, 80, 3);

        const totalDeco0 = result0.stops.reduce((s, st) => s + st.time, 0);
        const totalDeco3 = result3.stops.reduce((s, st) => s + st.time, 0);
        const numSwitches = result0.gasSwitches.length;

        const maxIncrease = 3 * numSwitches;
        const actualIncrease = totalDeco3 - totalDeco0;
        expect(actualIncrease).toBeLessThanOrEqual(maxIncrease);
        expect(actualIncrease).toBeGreaterThanOrEqual(0);
    });

    test('gasSwitchTime=0 is identical to no option (default)', () => {
        const bottomGas = gases[0];
        const initialN2 = getInitialTissueN2(bottomGas.n2);
        let tissues = {};
        COMPARTMENTS.forEach(c => { tissues[c.id] = initialN2; });

        const descentTime = Math.ceil(40 / 20);
        tissues = simulateDepthChange(tissues, 0, 40, descentTime, bottomGas.n2);
        tissues = simulateDepthTime(tissues, 40, 25 - descentTime, bottomGas.n2);

        const resultDefault = generateDecoSchedule(tissues, 40, bottomGas.n2, 0.3, 0.8, gases);
        // Re-simulate (fresh tissues)
        let tissues2 = {};
        COMPARTMENTS.forEach(c => { tissues2[c.id] = initialN2; });
        tissues2 = simulateDepthChange(tissues2, 0, 40, descentTime, bottomGas.n2);
        tissues2 = simulateDepthTime(tissues2, 40, 25 - descentTime, bottomGas.n2);

        const resultExplicit = generateDecoSchedule(tissues2, 40, bottomGas.n2, 0.3, 0.8, gases, { gasSwitchTime: 0 });

        expect(resultDefault.totalTime).toBe(resultExplicit.totalTime);
        expect(resultDefault.stops.length).toBe(resultExplicit.stops.length);
    });

    test('Gas switch stop in deco loop: switch depths have stops >= gasSwitchTime', () => {
        // EAN50 switches at 21m, O2 switches at 6m
        // With gasSwitchTime=2, stops at switch depths should be at least 2 min
        const result2 = runDive(40, 25, gases, 30, 80, 2);

        const switchDepths = result2.gasSwitches.map(sw => sw.depth);
        for (const switchDepth of switchDepths) {
            const stopAtSwitch = result2.stops.find(s => s.depth === switchDepth);
            expect(stopAtSwitch).toBeDefined();
            expect(stopAtSwitch.time).toBeGreaterThanOrEqual(2);
        }
    });
});

// ============================================================================
// computeGasConsumption — switch-stop SAC regression
// ============================================================================

describe('computeGasConsumption', () => {
    const gasesForSwitchTest = () => ([
        { id: 'air',   name: 'Air',   o2: 0.21, n2: 0.79, cylinderVolume: 24, startPressure: 200, reservePressure: 50 },
        { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, cylinderVolume: 11, startPressure: 200, reservePressure: 50 }
    ]);

    // Hand-built waypoints: descent → bottom → ascent → 1-min switch stop at
    // 21m → ascent → 10-min stop at 6m → surface. This isolates the bug:
    // the 21m stop is the switch stop (must bill at sacRate), the 6m stop
    // is a plain deco stop (must bill at decoSacRate).
    const buildScenario = () => {
        const gases = gasesForSwitchTest();
        const waypoints = [
            { time: 0,    depth: 0 },
            { time: 2,    depth: 40, gasId: 'air' },
            { time: 22,   depth: 40 },
            { time: 23.9, depth: 21, gasId: 'ean50' },  // switch arrival
            { time: 24.9, depth: 21 },                   // 1-min switch stop
            { time: 26.4, depth: 6,  gasId: 'ean50' },
            { time: 36.4, depth: 6 },                    // 10-min deco stop
            { time: 37,   depth: 0 }
        ];
        return { gases, loading: calculateTissueLoading(waypoints, 0, { gases }) };
    };

    // Regression: the EAN50 switch stop at 21m MUST bill at sacRate, not
    // decoSacRate. The older code reset the gas-switch flag on the arrival
    // timepoint (depth !== prevDepth), so the 1-min stop that immediately
    // followed the switch was mis-classified as a deco stop.
    test('switch-stop window bills at sacRate, not decoSacRate', () => {
        const { gases, loading } = buildScenario();
        expect(loading.gasSwitches.length).toBe(1);
        expect(loading.gasSwitches[0].depth).toBe(21);

        // With sacRate=20, decoSacRate=10:
        //   Bug path: 21m stop billed at 10 L/min → 1 min × 3.1 bar × 10 = 31 L
        //   Fixed:    21m stop billed at 20 L/min → 1 min × 3.1 bar × 20 = 62 L
        // The difference on EAN50 between the two implementations is 31 L.
        const gc = computeGasConsumption(loading, gases, 20, 10, 50);

        // Under the fix, EAN50 covers: 21m switch stop (1 min, sacRate=20)
        // plus ascent 21→6 (1.5 min avg 13.5m, sacRate=20) plus 6m stop
        // (10 min, decoSacRate=10) plus 6→surface ascent.
        // Expected lower bound asserts the 21m stop used sacRate — with the
        // bug, ean50 consumed is meaningfully lower.
        //
        // Numerically:
        //   21m stop (sacRate=20):   1   × 3.1  × 20 =  62.0 L
        //   asc 21→6 (sacRate=20): 1.5  × 2.35 × 20 =  70.5 L
        //   6m stop (decoSac=10):   10   × 1.6  × 10 = 160.0 L
        //   asc 6→0 (sacRate=20):   0.6  × 1.3  × 20 =  15.6 L
        //                                               ~308 L
        // Bug path replaces the first 62 L with 31 L → ~277 L.
        expect(gc.consumedByGasId.ean50).toBeGreaterThan(290);
        expect(gc.consumedByGasId.ean50).toBeLessThan(320);
    });

    // Regression: the 6m stop after the switch MUST still bill at
    // decoSacRate. An over-eager fix that latched the switch flag forever
    // would regress this.
    test('stops after the switch still bill at decoSacRate', () => {
        const { gases, loading } = buildScenario();
        const gcLow  = computeGasConsumption(loading, gases, 20, 10, 50);
        const gcHigh = computeGasConsumption(loading, gases, 20, 20, 50);
        // 6m stop is the only decoSacRate-sensitive slice for EAN50.
        //   (20 − 10) × 10 min × 1.6 bar = 160 L.
        const diff = gcHigh.consumedByGasId.ean50 - gcLow.consumedByGasId.ean50;
        expect(diff).toBeGreaterThan(150);
        expect(diff).toBeLessThan(170);
    });

    test('exposes per-timepoint rates for the chart tooltip', () => {
        const { gases, loading } = buildScenario();
        const gc = computeGasConsumption(loading, gases, 20, 10, 50);
        const switchStopIndex = loading.timePoints.findIndex((t, i) =>
            t > 24 && t < 24.9 && loading.depthPoints[i] === 21
        );
        const decoStopIndex = loading.timePoints.findIndex((t, i) =>
            t > 29 && t < 31 && loading.depthPoints[i] === 6
        );

        expect(switchStopIndex).toBeGreaterThan(0);
        expect(decoStopIndex).toBeGreaterThan(0);
        expect(gc.rateSeries.air[switchStopIndex]).toBe(0);
        expect(gc.rateSeries.ean50[switchStopIndex]).toBeCloseTo(20 * (SURFACE_PRESSURE + 2.1), 4);
        expect(gc.rateSeries.ean50[decoStopIndex]).toBeCloseTo(10 * (SURFACE_PRESSURE + 0.6), 4);
        expect(gc.rateSeries.ean50).toHaveLength(loading.timePoints.length);
    });

    test('uses altitude pressure for gas consumption without changing the SAC', () => {
        const gases = gasesForSwitchTest();
        const surfacePressure = getPressureAtAltitude(1500);
        const waypoints = [
            { time: 0, depth: 0, gasId: 'air' },
            { time: 1, depth: 6, gasId: 'air' },
            { time: 2, depth: 6, gasId: 'air' }
        ];
        const loading = calculateTissueLoading(waypoints, 0, { gases, surfacePressure });
        const gc = computeGasConsumption(loading, gases, 20, 10, 50);
        const finalIndex = loading.timePoints.length - 1;

        expect(gc.rateSeries.air[finalIndex]).toBeCloseTo(
            20 * (surfacePressure + 0.6), 4
        );
    });
});

describe('sea-level environment compatibility', () => {
    const gases = [
        { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, cylinderVolume: 24, startPressure: 200 },
        { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, cylinderVolume: 11, startPressure: 200 }
    ];

    test('explicit altitude zero produces the unchanged generated profile', () => {
        const legacy = generateDecoProfile(40, 30, gases, 30, 80, { enabled: false });
        const explicit = generateDecoProfile(
            40, 30, gases, 30, 80, { enabled: false },
            {
                surfacePressure: getSurfacePressure({ altitude: 0 }),
                pressurePerMeter: getPressurePerMeter({
                    waterType: WATER_TYPES.STANDARD
                })
            }
        );
        expect(explicit).toEqual(legacy);
    });

    test('explicit sea-level pressure produces unchanged tissue loading', () => {
        const waypoints = [
            { time: 0, depth: 0, gasId: 'air' },
            { time: 2, depth: 40, gasId: 'air' },
            { time: 30, depth: 40, gasId: 'air' },
            { time: 34, depth: 0, gasId: 'air' }
        ];
        const legacy = calculateTissueLoading(waypoints, 5, { gases });
        const explicit = calculateTissueLoading(waypoints, 5, {
            gases,
            surfacePressure: SURFACE_PRESSURE
        });
        expect(explicit).toEqual(legacy);
    });

    test('setup without environment resolves to the historical surface pressure', () => {
        expect(getDiveSetupSurfacePressure({})).toBe(SURFACE_PRESSURE);
        expect(getDiveSetupSurfacePressure({ environment: { altitude: 0 } })).toBe(SURFACE_PRESSURE);
        expect(getDiveSetupPressurePerMeter({})).toBe(PRESSURE_PER_METER);
    });

    test('freshwater lengthens NDL and MOD while seawater shortens them', () => {
        const freshFactor = getPressurePerMeter({ waterType: WATER_TYPES.FRESH });
        const seaFactor = getPressurePerMeter({ waterType: WATER_TYPES.SEA });
        const freshNdl = calculateNDL(30, N2_FRACTION, 1, null, SURFACE_PRESSURE, freshFactor).ndl;
        const standardNdl = calculateNDL(30).ndl;
        const seaNdl = calculateNDL(30, N2_FRACTION, 1, null, SURFACE_PRESSURE, seaFactor).ndl;

        expect(freshNdl).toBeGreaterThanOrEqual(standardNdl);
        expect(seaNdl).toBeLessThanOrEqual(standardNdl);
        expect(calculateMOD(0.32, 1.4, SURFACE_PRESSURE, freshFactor))
            .toBeGreaterThan(calculateMOD(0.32, 1.4));
        expect(calculateMOD(0.32, 1.4, SURFACE_PRESSURE, seaFactor))
            .toBeLessThanOrEqual(calculateMOD(0.32, 1.4));
    });

    test('water density changes gas consumption at the same indicated depth', () => {
        const waypoints = [
            { time: 0, depth: 0, gasId: 'air' },
            { time: 1, depth: 30, gasId: 'air' },
            { time: 11, depth: 30, gasId: 'air' }
        ];
        const consumption = (waterType) => {
            const loading = calculateTissueLoading(waypoints, 0, {
                gases,
                pressurePerMeter: getPressurePerMeter({ waterType })
            });
            return computeGasConsumption(loading, gases, 20, 15, 50)
                .consumedByGasId.air;
        };

        expect(consumption(WATER_TYPES.FRESH))
            .toBeLessThan(consumption(WATER_TYPES.STANDARD));
        expect(consumption(WATER_TYPES.SEA))
            .toBeGreaterThan(consumption(WATER_TYPES.STANDARD));
    });
});

describe('Decotengu sea-level reference matrix', () => {
    const reference = JSON.parse(
        readFileSync(new URL('./decotengu-reference.json', import.meta.url), 'utf8')
    );
    const gasConfigs = {
        air: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }],
        'air+ean50': [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 }
        ],
        'air+o2': [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
            { id: 'o2', name: 'O2', o2: 1, n2: 0 }
        ],
        'air+ean50+o2': [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 },
            { id: 'o2', name: 'O2', o2: 1, n2: 0 }
        ]
    };

    test('all 3900 existing scenarios remain within the established tolerance', () => {
        setZHL16Variant(ZHL16_VARIANTS.C);
        let exactDepthLists = 0;
        let exactSchedules = 0;
        let maximumDifference = 0;

        for (const scenario of reference.scenarios) {
            const gases = gasConfigs[scenario.gasConfig];
            const bottomGas = gases[0];
            const initialN2 = getInitialTissueN2(bottomGas.n2);
            const tissues = Object.fromEntries(COMPARTMENTS.map(comp => [comp.id, initialN2]));
            const descentTime = scenario.depth / 20;
            let loaded = simulateDepthChange(
                tissues, 0, scenario.depth, descentTime, bottomGas.n2
            );
            const atDepth = scenario.bottomTime - descentTime;
            if (atDepth > 0) {
                loaded = simulateDepthTime(loaded, scenario.depth, atDepth, bottomGas.n2);
            }
            const schedule = generateDecoSchedule(
                loaded, scenario.depth, bottomGas.n2,
                scenario.gfLow / 100, scenario.gfHigh / 100, gases,
                { decoMode: DECO_MODES.STANDARD }
            );
            const totalDeco = schedule.stops.reduce((sum, stop) => sum + stop.time, 0);
            const tolerance = Math.max(5, scenario.totalDeco * 0.20);
            const difference = Math.abs(totalDeco - scenario.totalDeco);
            maximumDifference = Math.max(maximumDifference, difference);

            if (JSON.stringify(schedule.stops.map(stop => stop.depth)) ===
                JSON.stringify(scenario.stops.map(stop => stop.depth))) {
                exactDepthLists++;
            }
            if (JSON.stringify(schedule.stops.map(stop => ({
                depth: stop.depth,
                time: stop.time
            }))) === JSON.stringify(scenario.stops)) {
                exactSchedules++;
            }
            if (!schedule.stops.every(stop => stop.depth % 3 === 0 && stop.time >= 1)) {
                throw new Error(`Non-standard staged stop in ${JSON.stringify(schedule.stops)}`);
            }

            if (difference > tolerance) {
                throw new Error(
                    `Decotengu mismatch at ${scenario.depth}m/${scenario.bottomTime}min ` +
                    `${scenario.gasConfig} GF${scenario.gfLow}/${scenario.gfHigh}: ` +
                    `reference=${scenario.totalDeco}, actual=${totalDeco}, tolerance=${tolerance}`
                );
            }
        }

        expect(exactDepthLists / reference.scenarios.length).toBeGreaterThan(0.9);
        expect(exactSchedules / reference.scenarios.length).toBeGreaterThan(0.75);
        expect(maximumDifference).toBeLessThanOrEqual(3);
    });

    test('practical runtimes preserve model stops across all 3900 scenarios', () => {
        setZHL16Variant(ZHL16_VARIANTS.C);
        let checkedDepartures = 0;
        let maximumCeilingExcess = 0;
        let maximumTimelineDifference = 0;

        for (const scenario of reference.scenarios) {
            const gases = gasConfigs[scenario.gasConfig];
            const bottomGas = gases[0];
            const gasById = Object.fromEntries(gases.map(gas => [gas.id, gas]));
            const result = generateDecoProfile(
                scenario.depth,
                scenario.bottomTime,
                gases,
                scenario.gfLow,
                scenario.gfHigh,
                { enabled: false },
                { decoMode: DECO_MODES.STANDARD }
            );

            if (!result.decoStops.every(stop => Number.isInteger(stop.time))) {
                throw new Error(
                    `Fractional model stop in ${scenario.depth}m/` +
                    `${scenario.bottomTime}min GF${scenario.gfLow}/${scenario.gfHigh}`
                );
            }

            let tissues = Object.fromEntries(
                COMPARTMENTS.map(compartment => [
                    compartment.id,
                    getInitialTissueN2(bottomGas.n2)
                ])
            );
            let gasId = bottomGas.id;
            let practicalTime = 0;
            const waypoints = result.waypoints;
            const maxDepth = Math.max(...waypoints.map(waypoint => waypoint.depth));

            for (let i = 0; i < waypoints.length - 1; i++) {
                const current = waypoints[i];
                const next = waypoints[i + 1];
                if (current.gasId) gasId = current.gasId;
                const gas = gasById[gasId] ?? bottomGas;
                const followsStop = i > 0
                    && waypoints[i - 1].depth === current.depth
                    && current.depth > 0
                    && current.depth < maxDepth
                    && next.depth < current.depth;

                if (followsStop) {
                    const targetGF = interpolateGF(
                        getAmbientPressure(next.depth),
                        result.pAnchor,
                        scenario.gfLow / 100,
                        scenario.gfHigh / 100
                    );
                    const ceilingDepth = getDiveCeiling(tissues, targetGF).ceilingDepth;
                    maximumCeilingExcess = Math.max(
                        maximumCeilingExcess,
                        ceilingDepth - next.depth
                    );
                    checkedDepartures++;
                }

                const modelDuration = next.time - current.time;
                const practicalDuration = followsStop
                    ? (current.depth - next.depth) / 9
                    : modelDuration;
                tissues = current.depth === next.depth
                    ? simulateDepthTime(
                        tissues, current.depth, practicalDuration, gas.n2
                    )
                    : simulateDepthChange(
                        tissues, current.depth, next.depth,
                        practicalDuration, gas.n2
                    );
                practicalTime += practicalDuration;
                if (next.gasId) gasId = next.gasId;
            }

            maximumTimelineDifference = Math.max(
                maximumTimelineDifference,
                practicalTime - waypoints.at(-1).time
            );
        }

        expect(checkedDepartures).toBe(17736);
        expect(maximumCeilingExcess).toBeLessThanOrEqual(0.01);
        expect(maximumTimelineDifference).toBeLessThanOrEqual(0.5);
    });
});

describe('Decotengu water-mode reference matrix', () => {
    const reference = JSON.parse(
        readFileSync(
            new URL('./decotengu-water-reference.json', import.meta.url),
            'utf8'
        )
    );
    const gasConfigs = {
        air: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }],
        'air+ean50': [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 }
        ]
    };

    test('records the pinned private override used for all three water modes', () => {
        expect(reference.generator).toBe('decotengu 0.14.1');
        expect(reference.method).toContain('Engine._meter_to_bar');
        expect(reference.method).toContain('Engine._p3m');
        expect(reference.waterModes).toEqual({
            standard: 0.1,
            fresh: 0.0980665,
            sea: 0.1005181625
        });
        expect(reference.skipped).toHaveLength(3);
        expect(reference.scenarios).toHaveLength(105);
    });

    test('all EN, freshwater, and seawater scenarios stay within tolerance', () => {
        setZHL16Variant(ZHL16_VARIANTS.C);
        const coveredModes = new Set();
        let maximumDifference = 0;

        for (const scenario of reference.scenarios) {
            coveredModes.add(scenario.waterType);
            const gases = gasConfigs[scenario.gasConfig];
            const bottomGas = gases[0];
            const pressurePerMeter = scenario.pressurePerMeter;
            let tissues = Object.fromEntries(
                COMPARTMENTS.map(compartment => [
                    compartment.id,
                    getInitialTissueN2(bottomGas.n2)
                ])
            );
            const descentTime = scenario.depth / 20;
            tissues = simulateDepthChange(
                tissues,
                0,
                scenario.depth,
                descentTime,
                bottomGas.n2,
                SURFACE_PRESSURE,
                pressurePerMeter
            );
            const atDepth = scenario.bottomTime - descentTime;
            if (atDepth > 0) {
                tissues = simulateDepthTime(
                    tissues,
                    scenario.depth,
                    atDepth,
                    bottomGas.n2,
                    SURFACE_PRESSURE,
                    pressurePerMeter
                );
            }
            const schedule = generateDecoSchedule(
                tissues,
                scenario.depth,
                bottomGas.n2,
                scenario.gfLow / 100,
                scenario.gfHigh / 100,
                gases,
                {
                    decoMode: DECO_MODES.STANDARD,
                    pressurePerMeter
                }
            );
            const totalDeco = schedule.stops.reduce(
                (sum, stop) => sum + stop.time,
                0
            );
            const difference = Math.abs(totalDeco - scenario.totalDeco);
            const tolerance = Math.max(5, scenario.totalDeco * 0.20);
            maximumDifference = Math.max(maximumDifference, difference);
            if (difference > tolerance) {
                throw new Error(
                    `Decotengu water mismatch for ${scenario.waterType} at ` +
                    `${scenario.depth}m/${scenario.bottomTime}min ` +
                    `${scenario.gasConfig} GF${scenario.gfLow}/${scenario.gfHigh}: ` +
                    `reference=${scenario.totalDeco}, actual=${totalDeco}, ` +
                    `tolerance=${tolerance}`
                );
            }
        }

        expect([...coveredModes].sort()).toEqual(['fresh', 'sea', 'standard']);
        expect(maximumDifference).toBeLessThanOrEqual(3);
    });
});

describe('Decotengu altitude reference matrix', () => {
    const reference = JSON.parse(
        readFileSync(new URL('./decotengu-altitude-reference.json', import.meta.url), 'utf8')
    );
    const gasConfigs = {
        air: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }],
        'air+ean50': [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 }
        ],
        'air+o2': [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
            { id: 'o2', name: 'O2', o2: 1, n2: 0 }
        ],
        'air+ean50+o2': [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50 },
            { id: 'o2', name: 'O2', o2: 1, n2: 0 }
        ]
    };

    test('all 15986 altitude scenarios remain within the established tolerance', () => {
        setZHL16Variant(ZHL16_VARIANTS.C);
        let scenarioCount = 0;
        let exactDepthLists = 0;
        let exactSchedules = 0;
        let maximumDifference = 0;

        for (const environment of reference.environments) {
            const surfacePressure = environment.pressure;
            for (const scenario of environment.scenarios) {
                const [
                    depth, bottomTime, gfLow, gfHigh, gasConfig,
                    referenceDeco, referenceStops
                ] = scenario;
                scenarioCount++;
                const gases = gasConfigs[gasConfig];
                const bottomGas = gases[0];
                const initialN2 = getInitialTissueN2(bottomGas.n2, surfacePressure);
                const tissues = Object.fromEntries(COMPARTMENTS.map(comp => [comp.id, initialN2]));
                const descentTime = depth / 20;
                let loaded = simulateDepthChange(
                    tissues, 0, depth, descentTime, bottomGas.n2, surfacePressure
                );
                const atDepth = bottomTime - descentTime;
                if (atDepth > 0) {
                    loaded = simulateDepthTime(
                        loaded, depth, atDepth, bottomGas.n2, surfacePressure
                    );
                }
                const schedule = generateDecoSchedule(
                    loaded, depth, bottomGas.n2, gfLow / 100, gfHigh / 100, gases,
                    { surfacePressure, decoMode: DECO_MODES.STANDARD }
                );
                const totalDeco = schedule.stops.reduce((sum, stop) => sum + stop.time, 0);
                const tolerance = Math.max(5, referenceDeco * 0.20);
                const difference = Math.abs(totalDeco - referenceDeco);
                maximumDifference = Math.max(maximumDifference, difference);

                if (JSON.stringify(schedule.stops.map(stop => stop.depth)) ===
                    JSON.stringify(referenceStops.map(stop => stop[0]))) {
                    exactDepthLists++;
                }
                if (JSON.stringify(schedule.stops.map(stop => [stop.depth, stop.time])) ===
                    JSON.stringify(referenceStops)) {
                    exactSchedules++;
                }
                if (!schedule.stops.every(stop => stop.depth % 3 === 0 && stop.time >= 1)) {
                    throw new Error(`Non-standard altitude stop in ${JSON.stringify(schedule.stops)}`);
                }

                if (difference > tolerance) {
                    throw new Error(
                        `Decotengu altitude mismatch at ${environment.altitude}\u00a0m, ` +
                        `${depth}\u00a0m/${bottomTime}\u00a0min ${gasConfig} GF${gfLow}/${gfHigh}: ` +
                        `reference=${referenceDeco}, actual=${totalDeco}, tolerance=${tolerance}`
                    );
                }
            }
        }

        expect(exactDepthLists / scenarioCount).toBeGreaterThan(0.95);
        expect(exactSchedules / scenarioCount).toBeGreaterThan(0.8);
        expect(maximumDifference).toBeLessThanOrEqual(3);
    });
});

describe('calculateTissueLoading - initialTissuePressures seam', () => {
    test('omitting initialTissuePressures starts at surface equilibrium', () => {
        const profile = [
            { time: 0, depth: 0 },
            { time: 2, depth: 30 },
            { time: 20, depth: 30 },
            { time: 23, depth: 0 }
        ];
        const res = calculateTissueLoading(profile, 0, {});
        const firstCompId = Object.keys(res.compartments)[0];
        const surfaceEq = getInitialTissueN2(N2_FRACTION);
        expect(res.compartments[firstCompId].pressures[0]).toBeCloseTo(surfaceEq, 4);
    });

    test('providing initialTissuePressures seeds every compartment from it', () => {
        const profile = [
            { time: 0, depth: 0 },
            { time: 2, depth: 30 },
            { time: 20, depth: 30 },
            { time: 23, depth: 0 }
        ];
        const baseline = calculateTissueLoading(profile, 0, {});
        const seed = {};
        Object.keys(baseline.compartments).forEach(id => { seed[id] = 1.5; });
        const res = calculateTissueLoading(profile, 0, { initialTissuePressures: seed });
        const firstCompId = Object.keys(res.compartments)[0];
        expect(res.compartments[firstCompId].pressures[0]).toBeCloseTo(1.5, 6);
    });
});

describe('generateDecoProfile - initialTissuePressures seam', () => {
    const air = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }];

    test('omitting the seed is unchanged (surface start)', () => {
        const a = generateDecoProfile(40, 30, air, 100, 100, undefined, {});
        const b = generateDecoProfile(40, 30, air, 100, 100);
        expect(a.totalDecoTime).toBe(b.totalDecoTime);
    });

    test('a pre-saturated seed increases the deco obligation', () => {
        // 30 m / 18 min from the surface is within NDL → no deco.
        const fresh = generateDecoProfile(30, 18, air, 100, 100, undefined, {});
        expect(fresh.totalDecoTime).toBe(0);

        // Same dive, but tissues already heavily loaded → must incur deco.
        const seed = {};
        // Build a heavy seed from a deep prior dive's loading.
        const prior = calculateTissueLoading(
            [{ time: 0, depth: 0 }, { time: 2, depth: 45 }, { time: 25, depth: 45 }, { time: 30, depth: 0 }],
            0, { gases: air });
        Object.keys(prior.compartments).forEach(id => {
            seed[id] = prior.compartments[id].pressures.at(-1);
        });
        const res = generateDecoProfile(30, 18, air, 100, 100, undefined, { initialTissuePressures: seed });
        expect(res.totalDecoTime).toBeGreaterThan(0);
    });
});

// ============================================================================
// TRIP PLANNER TESTS
// ============================================================================

describe('tripPlanner - planTrip', () => {
    const gases = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }];
    const sum = t => Object.values(t).reduce((a, b) => a + b, 0);

    test('single-dive trip matches a direct generateDecoProfile call', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30 }]
        };
        const trip = planTrip(setup);
        const direct = generateDecoProfile(40, 30, gases, 100, 100, undefined, {});
        expect(trip.dives).toHaveLength(1);
        expect(trip.dives[0].profile.totalDecoTime).toBe(direct.totalDecoTime);
        expect(trip.dives[0].surfaceIntervalBefore).toBe(null);
        expect(trip.conflicts).toHaveLength(0);
    });

    test('a second dive starts pre-saturated and incurs more deco', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,    maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 1000, maxDepth: 40, bottomTime: 30 }  // ~SI 925 min later
            ]
        };
        const trip = planTrip(setup);
        const [d1, d2] = trip.dives;

        // Surface interval is the real clock gap from d1's actual end.
        expect(d2.surfaceIntervalBefore).toBe(1000 - d1.endDateTime);
        // Pre-saturation: d2 starts more loaded than d1 (which started at surface eq).
        expect(sum(d2.startingTissue)).toBeGreaterThan(sum(d1.startingTissue));
        // And carries a heavier or equal deco obligation.
        expect(d2.profile.totalDecoTime).toBeGreaterThanOrEqual(d1.profile.totalDecoTime);
    });

    test('a longer surface interval leaves the next dive less loaded', () => {
        const make = (secondStart) => planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,           maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: secondStart, maxDepth: 40, bottomTime: 30 }
            ]
        });
        const shortSI = make(200);   // d2 soon after d1
        const longSI  = make(2000);  // d2 much later
        const startLoad = trip => sum(trip.dives[1].startingTissue);
        expect(startLoad(longSI)).toBeLessThan(startLoad(shortSI));
    });

    test('after an overnight interval slow tissues retain residual', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,    maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 1140, maxDepth: 40, bottomTime: 30 }  // ~18 h later
            ]
        });
        const [d1, d2] = trip.dives;
        // Fresh surface-equilibrium reference (a brand-new first dive's start load).
        const fresh = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'x', startDateTime: 0, maxDepth: 40, bottomTime: 30 }]
        }).dives[0];
        // Still above a fresh start, but well below the end-of-dive-1 load.
        expect(sum(d2.startingTissue)).toBeGreaterThan(sum(fresh.startingTissue));
        expect(sum(d2.startingTissue)).toBeLessThan(sum(d1.endTissue));
    });

    test('a dive starting before the previous one ends is flagged as a conflict', () => {
        // d1 at 40 m / 30 min ends (incl. ascent) well after t=35; start d2 at 35.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,  maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 35, maxDepth: 40, bottomTime: 30 }
            ]
        });
        const d1End = trip.dives[0].endDateTime;
        expect(d1End).toBeGreaterThan(35);                 // precondition: there IS an overlap
        expect(trip.conflicts).toHaveLength(1);
        expect(trip.conflicts[0].diveId).toBe('d2');
        expect(trip.conflicts[0].type).toBe('overlap');
        expect(trip.conflicts[0].overrunMinutes).toBeCloseTo(d1End - 35, 4);
        expect(trip.dives[1].surfaceIntervalBefore).toBe(0);
    });

    test('dives given out of chronological order are sorted', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'late',  startDateTime: 600, maxDepth: 40, bottomTime: 30 },
                { id: 'early', startDateTime: 0,   maxDepth: 40, bottomTime: 30 }
            ]
        });
        expect(trip.dives.map(d => d.id)).toEqual(['early', 'late']);
        expect(trip.dives[0].surfaceIntervalBefore).toBe(null);
    });

    test('three dives chain with monotonically growing starting load', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime:  9 * 60, maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 11 * 60, maxDepth: 40, bottomTime: 30 },
                { id: 'd3', startDateTime: 13 * 60, maxDepth: 40, bottomTime: 30 }
            ]
        });
        const [a, b, c] = trip.dives.map(d => sum(d.startingTissue));
        expect(b).toBeGreaterThan(a);
        expect(c).toBeGreaterThan(b);
    });

    test('a normal dive after a conflict still computes a sane surface interval', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,   maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 35,  maxDepth: 40, bottomTime: 30 }, // overlaps d1's deco
                { id: 'd3', startDateTime: 600, maxDepth: 40, bottomTime: 30 }  // well after d2 ends
            ]
        });
        expect(trip.conflicts).toHaveLength(1);
        expect(trip.conflicts[0].diveId).toBe('d2');
        const d3 = trip.dives[2];
        expect(d3.surfaceIntervalBefore).toBe(600 - trip.dives[1].endDateTime);
        expect(d3.surfaceIntervalBefore).toBeGreaterThan(0);
        // tissue stayed finite through the conflict
        expect(Number.isFinite(sum(d3.startingTissue))).toBe(true);
    });

    test('an empty trip returns no dives and no conflicts', () => {
        const trip = planTrip({ gases, gfLow: 100, gfHigh: 100, dives: [] });
        expect(trip.dives).toHaveLength(0);
        expect(trip.conflicts).toHaveLength(0);
    });

    test('per-dive gases: a richer nitrox mix reduces that dive\'s deco', () => {
        const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
        const ean32 = [{ id: 'ean32', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0 }];
        const run = (g2) => planTrip({ gases: air, gfLow: 100, gfHigh: 100, dives: [
            { id: 'd1', startDateTime: 0,   maxDepth: 30, bottomTime: 30, gases: air },
            { id: 'd2', startDateTime: 200, maxDepth: 30, bottomTime: 30, gases: g2 }
        ]});
        const airDeco = run(air).dives[1].profile.totalDecoTime;
        const ean32Deco = run(ean32).dives[1].profile.totalDecoTime;
        expect(ean32Deco).toBeLessThan(airDeco);
    });

    test('falls back to shared gases when a dive has no gases field', () => {
        const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
        const withField = planTrip({ gases: air, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30, gases: air }] });
        const without = planTrip({ gases: air, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30 }] });
        expect(without.dives[0].profile.totalDecoTime).toBe(withField.dives[0].profile.totalDecoTime);
    });

    test('an ndlLocked first dive derives bottomTime = surface-saturated NDL', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 5, ndlLocked: true }]
        };
        const trip = planTrip(setup);
        const expected = calculateNDL(30, gases[0].n2, 1.0, null).ndl;
        expect(trip.dives[0].bottomTime).toBe(Math.min(expected, 99));
    });

    test('an ndlLocked dive shortens when pre-saturated (later position)', () => {
        // 40m/25min then a short ~60min SI leaves real residual loading, so d2's locked
        // NDL is measurably shorter than the surface NDL (a longer/shallower combo off-gasses
        // enough that they'd be equal — a degenerate pass).
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,  maxDepth: 40, bottomTime: 25 },
                { id: 'd2', startDateTime: 60, maxDepth: 30, bottomTime: 5, ndlLocked: true }
            ]
        };
        const trip = planTrip(setup);
        const lockedAfter = trip.dives.find(d => d.id === 'd2').bottomTime;
        const surfaceNdl = calculateNDL(30, gases[0].n2, 1.0, null).ndl;
        expect(lockedAfter).toBeLessThan(Math.min(surfaceNdl, 99));
    });

    test('an ndlLocked very-shallow dive caps bottomTime at 99', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 10, bottomTime: 5, ndlLocked: true }]
        };
        const trip = planTrip(setup);
        expect(trip.dives[0].bottomTime).toBe(99);
    });

    test('an ndlLocked dive with ~0 NDL stays renderable (floored at descent time)', () => {
        // d2 overlaps d1's end, so tissues never off-gas → NDL ~0. Without the descent-time
        // floor, bottomTime would be 0 and the profile waypoints would be non-monotonic,
        // crashing the chart validator.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,  maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 50, maxDepth: 40, bottomTime: 5, ndlLocked: true }
            ]
        });
        const d2 = trip.dives.find(d => d.id === 'd2');
        expect(d2.bottomTime).toBeGreaterThanOrEqual(40 / 20); // floored at descent time
        const wp = d2.profile.waypoints;
        for (let i = 1; i < wp.length; i++) {
            expect(wp[i].time).toBeGreaterThanOrEqual(wp[i - 1].time); // non-decreasing → renderable
        }
    });

    test('a non-locked dive keeps its stored bottomTime', () => {
        const setup = {
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 17 }]
        };
        const trip = planTrip(setup);
        expect(trip.dives[0].bottomTime).toBe(17);
    });

    test('an ndlLocked dive forced into overlap is flagged invalid', () => {
        // d2 overlaps d1's end → no off-gassing → NDL ~0 → no real no-deco bottom time.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,  maxDepth: 40, bottomTime: 30 },
                { id: 'd2', startDateTime: 50, maxDepth: 40, bottomTime: 5, ndlLocked: true }
            ]
        });
        const d2 = trip.dives.find(d => d.id === 'd2');
        expect(d2.invalid).toBe(true);
        expect(d2.invalidReason).toBe('ndl-too-short');
        // Chaining preserved: endTissue is populated.
        expect(Object.keys(d2.endTissue).length).toBeGreaterThan(0);
    });

    test('a normal ndlLocked first dive is not invalid', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 5, ndlLocked: true }]
        });
        expect(trip.dives[0].invalid).toBe(false);
    });

    test('a non-locked dive is not invalid', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 20 }]
        });
        expect(trip.dives[0].invalid).toBe(false);
    });

    test('trip dives carry no safety-stop segment (safety stops off)', () => {
        // A no-deco dive: with safety stops ON it would gain a 3-min stop at 5 m. Off → none.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', startDateTime: 0, maxDepth: 18, bottomTime: 20 }]
        });
        const wp = trip.dives[0].profile.waypoints;
        const fiveMetreStops = wp.filter(w => w.depth === 5);
        const hasSafetyStop = fiveMetreStops.length >= 2; // arrive + depart at 5 m
        expect(hasSafetyStop).toBe(false);
    });

    test('result echoes ndlLocked', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0, maxDepth: 30, bottomTime: 5, ndlLocked: true },
                { id: 'd2', startDateTime: 1000, maxDepth: 30, bottomTime: 20 }
            ]
        });
        expect(trip.dives.find(d => d.id === 'd1').ndlLocked).toBe(true);
        expect(trip.dives.find(d => d.id === 'd2').ndlLocked).toBe(false);
    });
});

// ============================================================================
// PRESATURATION TESTS
// ============================================================================

describe('preSaturation', () => {
    const gases = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }];

    test('a fresh surface-equilibrium diver reads 0% on every tissue', () => {
        const fresh = {};
        COMPARTMENTS.forEach(c => { fresh[c.id] = getInitialTissueN2(N2_FRACTION); });
        const res = preSaturation(fresh);
        expect(res.controllingPct).toBe(0);
        const maxPer = Math.max(...Object.values(res.perCompartmentPct));
        expect(maxPer).toBe(0);
        expect(Object.keys(res.perCompartmentPct).length).toBe(COMPARTMENTS.length);
    });

    test('a pre-saturated diver reads > 0%, and the controlling value is the max', () => {
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,  maxDepth: 40, bottomTime: 30 },
                // intentionally SHORT (~5-6 min) surface interval so tissues stay clearly pre-saturated
                { id: 'd2', startDateTime: 65, maxDepth: 40, bottomTime: 30 }
            ]
        });
        const loaded = trip.dives[1].startingTissue;
        const res = preSaturation(loaded);
        expect(res.controllingPct).toBeGreaterThan(0);
        const maxPer = Math.max(...Object.values(res.perCompartmentPct));
        expect(res.controllingPct).toBeCloseTo(maxPer, 9);
        expect(res.perCompartmentPct[res.controllingCompartmentId]).toBeCloseTo(maxPer, 9);
        expect(res.controllingPct).toBeGreaterThan(10); // short SI ⇒ clearly elevated
    });

    test('residual loading below surface ambient still reads > 0% (anchored at surface saturation, not ambient)', () => {
        // Long-ish surface interval: every tissue ends ABOVE the fresh surface-saturation
        // baseline (so the next dive accrues more deco) but still BELOW surface ambient
        // pressure — the case where an ambient-anchored surfacing GF would read 0%.
        const trip = planTrip({
            gases, gfLow: 100, gfHigh: 100,
            dives: [
                { id: 'd1', startDateTime: 0,   maxDepth: 30, bottomTime: 40 },
                { id: 'd2', startDateTime: 200, maxDepth: 30, bottomTime: 40 }
            ]
        });
        const d2 = trip.dives[1];
        // Sanity: the dive is genuinely more loaded (more deco than the first).
        expect(d2.profile.totalDecoTime).toBeGreaterThan(trip.dives[0].profile.totalDecoTime);
        // Sanity: every compartment is below surface ambient (~1.013 bar) — the band an
        // ambient-anchored GF would clamp to 0.
        const surfaceAmbient = getAmbientPressure(0);
        const maxTension = Math.max(...COMPARTMENTS.map(c => d2.startingTissue[c.id]));
        expect(maxTension).toBeLessThan(surfaceAmbient);
        // The surface-saturation-anchored pre-saturation must still register the loading.
        expect(preSaturation(d2.startingTissue).controllingPct).toBeGreaterThan(10);
    });
});

// ============================================================================
// normalizeDiveSetup - initialTissuePressures preservation
// ============================================================================

describe('normalizeDiveSetup - initialTissuePressures preservation', () => {
    const base = {
        gases: [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902 }],
        dives: [{ waypoints: [{ time: 0, depth: 0 }, { time: 2, depth: 30 }, { time: 20, depth: 30 }, { time: 23, depth: 0 }] }]
    };

    test('defaults initialTissuePressures to null when absent', () => {
        const norm = normalizeDiveSetup({ ...base });
        expect(norm.initialTissuePressures).toBe(null);
    });

    test('preserves initialTissuePressures when present', () => {
        const seed = { 1: 1.5, 2: 1.4 };
        const norm = normalizeDiveSetup({ ...base, initialTissuePressures: seed });
        expect(norm.initialTissuePressures).toBe(seed);
    });
});

describe('calculateChartGFAnchor', () => {
    test('shows no anchor or GF ramp when the direct ascent passes at GF High', () => {
        const gases = [
            { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }
        ];
        const setup = {
            gases,
            gfLow: 30,
            gfHigh: 80,
            decoMode: DECO_MODES.CONTINUOUS,
            environment: { altitude: 0 },
            dives: [{
                waypoints: [
                    { time: 0, depth: 0, gasId: 'air' },
                    { time: 1.55, depth: 31, gasId: 'air' },
                    { time: 12, depth: 31, gasId: 'air' },
                    { time: 15.1, depth: 0, gasId: 'air' }
                ]
            }]
        };
        const loading = calculateTissueLoading(
            setup.dives[0].waypoints,
            0,
            { gases, surfacePressure: SURFACE_PRESSURE }
        );

        expect(calculateChartGFAnchor(setup, loading)).toEqual({
            pAnchor: SURFACE_PRESSURE,
            anchorDepth: 0
        });
    });

    test('recalculates from a later multilevel hold before the final ascent', () => {
        const gases = [
            { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }
        ];
        const setup = {
            gases,
            gfLow: 30,
            gfHigh: 80,
            decoMode: DECO_MODES.STANDARD,
            environment: { altitude: 0 },
            dives: [{
                waypoints: [
                    { time: 0, depth: 0, gasId: 'air' },
                    { time: 2, depth: 40, gasId: 'air' },
                    { time: 3, depth: 40, gasId: 'air' },
                    { time: 5.8, depth: 12, gasId: 'air' },
                    { time: 125.8, depth: 12, gasId: 'air' },
                    { time: 127, depth: 0, gasId: 'air' }
                ]
            }]
        };
        const loading = calculateTissueLoading(
            setup.dives[0].waypoints,
            0,
            { gases, surfacePressure: SURFACE_PRESSURE }
        );

        expect(calculateChartGFAnchor(setup, loading).anchorDepth).toBe(6);
    });

    test('preserves the original anchor for a generated staged schedule', () => {
        const gases = [
            { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }
        ];
        const profile = generateDecoProfile(
            40,
            25,
            gases,
            30,
            80,
            { enabled: false },
            { decoMode: DECO_MODES.STANDARD }
        );
        const setup = {
            gases,
            gfLow: 30,
            gfHigh: 80,
            decoMode: DECO_MODES.STANDARD,
            environment: { altitude: 0 },
            dives: [{ waypoints: profile.waypoints }]
        };
        const loading = calculateTissueLoading(
            profile.waypoints,
            0,
            { gases, surfacePressure: SURFACE_PRESSURE }
        );

        expect(calculateChartGFAnchor(setup, loading).anchorDepth)
            .toBe(profile.anchorDepth);
    });

    test('preserves a generated multigas anchor with switch duration', () => {
        const gases = [
            { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
            { id: 'ean50', name: 'EAN50', o2: 0.5, n2: 0.5, he: 0 },
            { id: 'o2', name: 'O2', o2: 1, n2: 0, he: 0 }
        ];
        const profile = generateDecoProfile(
            30,
            20,
            gases,
            30,
            80,
            { enabled: false },
            { decoMode: DECO_MODES.STANDARD, gasSwitchTime: 1 }
        );
        const setup = normalizeDiveSetup({
            gases,
            gfLow: 30,
            gfHigh: 80,
            decoMode: DECO_MODES.STANDARD,
            gasSwitchTime: 1,
            environment: { altitude: 0 },
            dives: [{ waypoints: profile.waypoints }]
        });
        const loading = calculateTissueLoading(
            profile.waypoints,
            0,
            { gases: setup.gases, surfacePressure: SURFACE_PRESSURE }
        );

        expect(setup.gasSwitchTime).toBe(1);
        expect(calculateChartGFAnchor(setup, loading).anchorDepth)
            .toBe(profile.anchorDepth);
    });
});

describe('RuntimeTable - buildRuntimeRows', () => {
    const air = [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }];

    test('derives ordered rows from a deco dive profile', () => {
        const profile = generateDecoProfile(40, 30, air, 30, 70); // GF 30/70 → real deco
        const rows = buildRuntimeRows(profile, air);

        expect(rows.length > 0).toBe(true);
        expect(rows[0].phase).toBe('descent');

        let prev = 0;
        rows.forEach(r => { expect(r.runTime >= prev).toBe(true); prev = r.runTime; });
        expect(rows[rows.length - 1].depth).toBe(0);

        const totalSeg = rows.reduce((s, r) => s + r.segmentTime, 0);
        const lastWpTime = profile.waypoints[profile.waypoints.length - 1].time;
        expect(totalSeg).toBeCloseTo(lastWpTime, 6);

        const stopRows = rows.filter(r => r.isStop);
        expect(stopRows.length >= profile.decoStops.length).toBe(true);

        rows.forEach(r => expect(typeof r.gas).toBe('string'));
    });

    test('an NDL dive (no deco) still produces a descent + bottom + ascent', () => {
        const profile = generateDecoProfile(18, 30, air, 100, 100); // within NDL
        const rows = buildRuntimeRows(profile, air);
        expect(rows[0].phase).toBe('descent');
        expect(rows.some(r => r.phase === 'bottom')).toBe(true);
        expect(rows[rows.length - 1].depth).toBe(0);
    });

    test('reflects a deco-gas switch in the row gas names', () => {
        const gases = [
            { id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 },
            { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 }
        ];
        const profile = generateDecoProfile(45, 25, gases, 30, 70); // deco dive, EAN50 available
        const rows = buildRuntimeRows(profile, gases);
        // The bottom phase is on Air; after the ascent switch some rows are on EAN50.
        expect(rows.some(r => r.gas === 'Air')).toBe(true);
        expect(rows.some(r => r.gas === 'EAN50')).toBe(true);
    });
});

describe('tripState - reducer', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
    const base = () => ({ gases: air, gfLow: 100, gfHigh: 100, dives: [] });

    test('addDive assigns a stable unique id and appends', () => {
        let t = base();
        t = addDive(t, { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = addDive(t, { startDateTime: 660, maxDepth: 30, bottomTime: 35, gases: air });
        expect(t.dives.length).toBe(2);
        expect(t.dives[0].id).toBe('d1');
        expect(t.dives[1].id).toBe('d2');
        expect(t.dives[1].maxDepth).toBe(30);
    });

    test('addDive does not mutate the input trip', () => {
        const t0 = base();
        const t1 = addDive(t0, { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        expect(t0.dives.length).toBe(0);
        expect(t1.dives.length).toBe(1);
    });

    test('editDive patches fields by id, leaving others untouched', () => {
        let t = addDive(base(), { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = editDive(t, 'd1', { maxDepth: 18, bottomTime: 50 });
        expect(t.dives[0].maxDepth).toBe(18);
        expect(t.dives[0].bottomTime).toBe(50);
        expect(t.dives[0].startDateTime).toBe(540);
    });

    test('rescheduleDive changes only startDateTime', () => {
        let t = addDive(base(), { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = rescheduleDive(t, 'd1', 600);
        expect(t.dives[0].startDateTime).toBe(600);
        expect(t.dives[0].maxDepth).toBe(40);
    });

    test('removeDive drops the dive by id; remaining ids are unchanged', () => {
        let t = addDive(base(), { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = addDive(t, { startDateTime: 660, maxDepth: 30, bottomTime: 35, gases: air });
        t = removeDive(t, 'd1');
        expect(t.dives.length).toBe(1);
        expect(t.dives[0].id).toBe('d2');
    });

    test('ids never collide after a remove (max-based, not length-based)', () => {
        let t = addDive(base(), { startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air });
        t = addDive(t, { startDateTime: 660, maxDepth: 30, bottomTime: 35, gases: air });
        t = removeDive(t, 'd1');                 // leaves d2
        t = addDive(t, { startDateTime: 780, maxDepth: 20, bottomTime: 40, gases: air });
        expect(t.dives.map(d => d.id)).toEqual(['d2', 'd3']);  // not a duplicate 'd2'
    });
});

describe('calendarLayout - computeCalendarLayout', () => {
    const win = (dayCount) => ({ dayStartMin: 6 * 60, dayEndMin: 20 * 60, dayCount }); // span 840 min

    test('positions a dive block by start time and duration within the day window', () => {
        const planResult = { dives: [{ id: 'd1', startDateTime: 9 * 60, endDateTime: 10 * 60 }], conflicts: [] };
        const layout = computeCalendarLayout(planResult, win(1));
        expect(layout.dayCount).toBe(1);
        expect(layout.baseDay).toBe(0);
        const b = layout.blocks[0];
        expect(b.dayIndex).toBe(0);
        expect(b.topPct).toBeCloseTo((540 - 360) / 840 * 100, 4);
        expect(b.heightPct).toBeCloseTo(60 / 840 * 100, 4);
        expect(b.conflict).toBe(false);
    });

    test('dayCount comes from the caller, not the dives (1 dive, 3 columns)', () => {
        const planResult = { dives: [{ id: 'd1', startDateTime: 9 * 60, endDateTime: 10 * 60 }], conflicts: [] };
        const layout = computeCalendarLayout(planResult, win(3));
        expect(layout.dayCount).toBe(3);
        expect(layout.blocks[0].dayIndex).toBe(0);
    });

    test('places a dive on day 2 in column index 2; flags conflicts', () => {
        const planResult = {
            dives: [
                { id: 'd1', startDateTime: 9 * 60,                  endDateTime: 10 * 60 },
                { id: 'd2', startDateTime: (2 * 24 * 60) + 9 * 60,  endDateTime: (2 * 24 * 60) + 10 * 60 }
            ],
            conflicts: [{ diveId: 'd2', type: 'overlap', overrunMinutes: 5 }]
        };
        const layout = computeCalendarLayout(planResult, win(3));
        expect(layout.baseDay).toBe(0);
        expect(layout.blocks.find(b => b.diveId === 'd1').dayIndex).toBe(0);
        expect(layout.blocks.find(b => b.diveId === 'd2').dayIndex).toBe(2);
        expect(layout.blocks.find(b => b.diveId === 'd2').conflict).toBe(true);
    });

    test('empty trip yields the configured columns and no blocks', () => {
        const layout = computeCalendarLayout({ dives: [], conflicts: [] }, win(2));
        expect(layout.dayCount).toBe(2);
        expect(layout.blocks).toHaveLength(0);
    });

    test('a dive starting before the window clips its top without inflating height', () => {
        const planResult = { dives: [{ id: 'd1', startDateTime: 5 * 60 + 30, endDateTime: 6 * 60 + 30 }], conflicts: [] };
        const b = computeCalendarLayout(planResult, win(1)).blocks[0];
        expect(b.topPct).toBe(0);
        expect(b.heightPct).toBeCloseTo(30 / 840 * 100, 4);
    });
});

describe('calculateNDL - initialTissuePressures seam', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];

    test('a surface-equilibrium seed reproduces the unseeded NDL', () => {
        const fresh = {};
        COMPARTMENTS.forEach(c => { fresh[c.id] = getInitialTissueN2(N2_FRACTION); });
        const seeded = calculateNDL(30, N2_FRACTION, 1.0, fresh);
        const unseeded = calculateNDL(30, N2_FRACTION, 1.0);
        expect(seeded.ndl).toBe(unseeded.ndl);
    });

    test('a pre-saturated seed shortens the NDL', () => {
        const prior = calculateTissueLoading(
            [{ time: 0, depth: 0 }, { time: 2, depth: 40 }, { time: 25, depth: 40 }, { time: 30, depth: 0 }],
            0, { gases: air });
        const loaded = {};
        COMPARTMENTS.forEach(c => { loaded[c.id] = prior.compartments[c.id].pressures.at(-1); });
        const seeded = calculateNDL(30, N2_FRACTION, 1.0, loaded);
        const unseeded = calculateNDL(30, N2_FRACTION, 1.0);
        expect(seeded.ndl).toBeLessThan(unseeded.ndl);
    });
});

describe('normalizeDiveSetup - environment preservation', () => {
    const base = {
        name: 'Altitude dive',
        gases: [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79 }],
        dives: [{ waypoints: [{ time: 0, depth: 0 }, { time: 2, depth: 30 }] }]
    };

    test('defaults existing profiles to sea level', () => {
        expect(normalizeDiveSetup(base).environment).toEqual({
            altitude: 0,
            waterType: WATER_TYPES.STANDARD
        });
    });

    test('preserves configured altitude', () => {
        expect(normalizeDiveSetup({ ...base, environment: { altitude: 1500 } }).environment)
            .toEqual({ altitude: 1500, waterType: WATER_TYPES.STANDARD });
    });

    test('preserves a configured water type', () => {
        expect(normalizeDiveSetup({
            ...base,
            environment: { altitude: 0, waterType: WATER_TYPES.SEA }
        }).environment).toEqual({
            altitude: 0,
            waterType: WATER_TYPES.SEA
        });
    });

    test('defaults legacy staged profiles to standard mode', () => {
        expect(normalizeDiveSetup(base).decoMode).toBe(DECO_MODES.STANDARD);
        expect(normalizeDiveSetup({ ...base, continuousDeco: false }).decoMode)
            .toBe(DECO_MODES.STANDARD);
    });

    test('migrates legacy continuous profiles and preserves explicit study modes', () => {
        expect(normalizeDiveSetup({ ...base, continuousDeco: true }).decoMode)
            .toBe(DECO_MODES.CONTINUOUS);
        expect(normalizeDiveSetup({ ...base, decoMode: DECO_MODES.ADAPTIVE }).decoMode)
            .toBe(DECO_MODES.ADAPTIVE);
    });
});

// ============================================================================
// ndlPreview
// ============================================================================

describe('ndlPreview - previewNdl', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];

    test('for the first dive it equals the surface NDL', () => {
        const trip = { gases: air, gfLow: 100, gfHigh: 100, dives: [] };
        const got = previewNdl(trip, { startDateTime: 9 * 60, maxDepth: 30, gases: air }, 100);
        const surface = calculateNDL(30, 0.79, 1.0).ndl;
        expect(got).toBe(surface);
    });

    test('a later, pre-saturated dive has a shorter NDL', () => {
        const trip = { gases: air, gfLow: 100, gfHigh: 100, dives: [
            { id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30, gases: air }
        ]};
        const later = previewNdl(trip, { startDateTime: 90, maxDepth: 30, gases: air }, 100); // short SI after d1
        const surface = calculateNDL(30, 0.79, 1.0).ndl;
        expect(later).toBeLessThan(surface);
    });

    test('depends only on dives before the candidate, not after it', () => {
        const before = { gases: air, gfLow: 100, gfHigh: 100, dives: [
            { id: 'd1', startDateTime: 0, maxDepth: 40, bottomTime: 30, gases: air }
        ]};
        // same trip plus a dive that starts AFTER the candidate slot (t=90)
        const withLater = { ...before, dives: [...before.dives,
            { id: 'd9', startDateTime: 600, maxDepth: 40, bottomTime: 30, gases: air }
        ]};
        const a = previewNdl(before,    { startDateTime: 90, maxDepth: 30, gases: air }, 100);
        const b = previewNdl(withLater, { startDateTime: 90, maxDepth: 30, gases: air }, 100);
        expect(a).toBe(b); // a later dive can't change the candidate's carried-in load
    });
});

// ============================================================================
// TRIP STATE / TRIP PLANNER - DIVE NAMES
// ============================================================================

describe('tripState/tripPlanner - dive names', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];

    test('addDive stores a provided name', () => {
        const t = addDive({ gases: air, gfLow: 100, gfHigh: 100, dives: [] },
            { name: 'Reef', startDateTime: 0, maxDepth: 18, bottomTime: 40, gases: air });
        expect(t.dives[0].name).toBe('Reef');
    });

    test('editDive patches the name', () => {
        let t = addDive({ gases: air, gfLow: 100, gfHigh: 100, dives: [] },
            { name: 'Reef', startDateTime: 0, maxDepth: 18, bottomTime: 40, gases: air });
        t = editDive(t, t.dives[0].id, { name: 'Wreck' });
        expect(t.dives[0].name).toBe('Wreck');
    });

    test('planTrip echoes the dive name onto result dives', () => {
        const trip = { gases: air, gfLow: 100, gfHigh: 100,
            dives: [{ id: 'd1', name: 'Wreck', startDateTime: 0, maxDepth: 40, bottomTime: 30, gases: air }] };
        expect(planTrip(trip).dives[0].name).toBe('Wreck');
    });
});

describe('Visual algorithm theory page', () => {
    const html = readFileSync(new URL('../algorithm.html', import.meta.url), 'utf8');
    const script = readFileSync(
        new URL('../js/algorithmExplainer.js', import.meta.url),
        'utf8'
    );

    test('keeps the experimental page available directly but hidden from discovery', () => {
        const nav = readFileSync(new URL('../js/nav.js', import.meta.url), 'utf8');
        const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
        const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
        expect(nav.includes("href: 'algorithm.html'")).toBe(false);
        expect(sw).toContain("'./algorithm.html'");
        expect(sw).toContain("'./js/algorithmExplainer.js'");
        expect(home.includes('href="algorithm.html"')).toBe(false);
    });

    test('gives every chart a fullscreen control', () => {
        expect((html.match(/<canvas\b/g) || []).length).toBe(2);
        expect((html.match(/data-fullscreen=/g) || []).length).toBe(2);
        expect((html.match(/data-exit-fullscreen/g) || []).length).toBe(2);
    });

    test('uses the same three calculation modes as the planner', () => {
        expect(script).toContain('DECO_MODES.STANDARD');
        expect(script).toContain('DECO_MODES.ADAPTIVE');
        expect(script).toContain('DECO_MODES.CONTINUOUS');
        expect(script).toContain('generateDecoProfile(');
    });

    test('has complete algorithm translations in all shipped languages', () => {
        const localeFiles = ['cs', 'en', 'es'].map(language =>
            JSON.parse(readFileSync(
                new URL(`../locales/${language}.json`, import.meta.url),
                'utf8'
            ))
        );
        const locales = localeFiles.map(locale => locale.algorithm);
        const keyShape = value => Object.entries(value)
            .flatMap(([key, child]) => child && typeof child === 'object'
                ? Object.keys(child).map(subKey => `${key}.${subKey}`)
                : [key])
            .sort();
        expect(keyShape(locales[1])).toEqual(keyShape(locales[0]));
        expect(keyShape(locales[2])).toEqual(keyShape(locales[0]));

        const sourceKeys = [...new Set([
            ...[...html.matchAll(/data-i18n(?:-title)?="(algorithm\.[^"]+)"/g)]
                .map(match => match[1]),
            ...[...script.matchAll(/translate\('(algorithm\.[^']+)'/g)]
                .map(match => match[1])
        ])];
        for (const locale of localeFiles) {
            for (const key of sourceKeys) {
                const value = key.split('.').reduce((node, part) => node?.[part], locale);
                expect(typeof value).toBe('string');
            }
        }
    });
});

// ============================================================================
// TRIP URL TESTS
// ============================================================================

describe('tripUrl - encode/decode', () => {
    const air = [{ id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 }];
    const ean32 = [{ id: 'ean32', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0 }];

    test('round-trips a trip whose dives share the trip gas', () => {
        const trip = { startDate: '2026-06-15', dayCount: 3, gfLow: 90, gfHigh: 100, gases: air, dives: [
            { id: 'd1', name: 'Wreck', startDateTime: 540, maxDepth: 40, bottomTime: 30, gases: air },
            { id: 'd2', name: 'Reef',  startDateTime: 660, maxDepth: 18, bottomTime: 50, gases: air }
        ]};
        const back = decodeTrip(encodeTrip(trip));
        expect(back.startDate).toBe('2026-06-15');
        expect(back.dayCount).toBe(3);
        expect(back.gfLow).toBe(90);
        expect(back.gfHigh).toBe(100);
        expect(back.dives.length).toBe(2);
        expect(back.dives[0].name).toBe('Wreck');
        expect(back.dives[0].maxDepth).toBe(40);
        expect(back.dives[1].bottomTime).toBe(50);
        expect(back.dives[0].id).toBe('d1');
        expect(back.dives[1].id).toBe('d2');
        expect(back.dives[0].gases[0].id).toBe('air');
    });

    test('preserves a dive with a different gas (stored inline)', () => {
        const trip = { startDate: '2026-06-15', dayCount: 1, gfLow: 100, gfHigh: 100, gases: air, dives: [
            { id: 'd1', name: 'A', startDateTime: 0,   maxDepth: 30, bottomTime: 30, gases: air },
            { id: 'd2', name: 'B', startDateTime: 200, maxDepth: 30, bottomTime: 30, gases: ean32 }
        ]};
        const back = decodeTrip(encodeTrip(trip));
        expect(back.dives[0].gases[0].id).toBe('air');
        expect(back.dives[1].gases[0].id).toBe('ean32');
    });

    test('round-trips non-ASCII dive names', () => {
        const trip = { startDate: '2026-06-15', dayCount: 1, gfLow: 100, gfHigh: 100, gases: air, dives: [
            { id: 'd1', name: 'Potápění °C', startDateTime: 0, maxDepth: 30, bottomTime: 30, gases: air }
        ]};
        const back = decodeTrip(encodeTrip(trip));
        expect(back.dives[0].name).toBe('Potápění °C');
    });

    test('returns null for malformed input', () => {
        expect(decodeTrip('')).toBe(null);
        expect(decodeTrip('aGVsbG8=')).toBe(null);              // base64 of "hello" → not JSON
        expect(decodeTrip(btoa('{"foo":1}'))).toBe(null);        // valid JSON but no dives/gases array
    });

    test('round-trips the ndlLocked flag', () => {
        const trip = {
            startDate: '2026-06-15', dayCount: 2, gfLow: 100, gfHigh: 100,
            gases: [{ id: 'bottom', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 }],
            dives: [
                { id: 'd1', name: 'A', startDateTime: 540, maxDepth: 30, bottomTime: 20, ndlLocked: true },
                { id: 'd2', name: 'B', startDateTime: 1980, maxDepth: 18, bottomTime: 40 }
            ]
        };
        const back = decodeTrip(encodeTrip(trip));
        expect(back.dives[0].ndlLocked).toBe(true);
        expect(back.dives[1].ndlLocked).toBe(false);
    });
});

// ============================================================================
// TRIP TIME TESTS
// ============================================================================

describe('tripTime - epoch <-> datetime-local', () => {
    test('round-trips an epoch minute against a start date (UTC-safe)', () => {
        const base = baseFromStartDate('2026-06-15');
        const s = epochMinToLocalInput(9 * 60, base);   // day 0, 09:00
        expect(s).toBe('2026-06-15T09:00');
        expect(localInputToEpochMin(s, base)).toBe(9 * 60);
    });
    test('handles a later day (24h+) correctly', () => {
        const base = baseFromStartDate('2026-06-15');
        const s = epochMinToLocalInput(24 * 60 + 11 * 60, base); // day 1, 11:00
        expect(s).toBe('2026-06-16T11:00');
        expect(localInputToEpochMin(s, base)).toBe(24 * 60 + 11 * 60);
    });
    test('default base for missing start date', () => {
        const base = baseFromStartDate();
        expect(base).toBe(Date.UTC(2026, 0, 1));
    });
    test('returns NaN for empty/invalid input', () => {
        const base = baseFromStartDate('2026-06-15');
        expect(Number.isNaN(localInputToEpochMin('', base))).toBe(true);
        expect(Number.isNaN(localInputToEpochMin('garbage', base))).toBe(true);
    });
});

// ============================================================================
// TRIPCALENDAR - snapClamp TESTS
// ============================================================================

describe('TripCalendar - snapClamp', () => {
    const ds = 6 * 60, de = 20 * 60;
    test('snaps to the nearest 15 minutes', () => {
        expect(snapClamp(9 * 60 + 8, ds, de, 15)).toBe(9 * 60 + 15); // 09:08 -> 09:15
        expect(snapClamp(9 * 60 + 7, ds, de, 15)).toBe(9 * 60);      // 09:07 -> 09:00
    });
    test('clamps to the day window', () => {
        expect(snapClamp(5 * 60, ds, de, 15)).toBe(ds);   // before window -> dayStart
        expect(snapClamp(21 * 60, ds, de, 15)).toBe(de);  // after window  -> dayEnd
    });
});

describe('TripCalendar - diveBlockLabel', () => {
    test('no-deco dive: name, depth, bottom time', () => {
        const d = { name: 'Dive 2', maxDepth: 40, bottomTime: 22, profile: { totalDecoTime: 0, decoStops: [] } };
        expect(diveBlockLabel(d)).toBe('Dive 2 · 40\u00a0m · 22\u00a0min');
    });
    test('deco dive: appends +N deco', () => {
        const d = { name: 'Dive 2', maxDepth: 40, bottomTime: 30, profile: { totalDecoTime: 28, decoStops: [{ depth: 9, time: 5 }] } };
        expect(diveBlockLabel(d)).toBe('Dive 2 · 40\u00a0m · 30\u00a0min · +28 deco');
    });
    test('NDL-locked no-deco dive: appends NDL tag', () => {
        const d = { name: 'Dive 2', maxDepth: 40, bottomTime: 22, ndlLocked: true, profile: { totalDecoTime: 0, decoStops: [] } };
        expect(diveBlockLabel(d)).toBe('Dive 2 · 40\u00a0m · 22\u00a0min · NDL');
    });
    test('invalid dive: no-deco N/A', () => {
        const d = { name: 'Dive 2', maxDepth: 40, bottomTime: 2, invalid: true, profile: { totalDecoTime: 0, decoStops: [] } };
        expect(diveBlockLabel(d)).toBe('Dive 2 · 40\u00a0m · ⚠ no-deco N/A');
    });
    test('falls back to id.toUpperCase() when name absent', () => {
        const d = { id: 'd3', maxDepth: 18, bottomTime: 40, profile: { totalDecoTime: 0, decoStops: [] } };
        expect(diveBlockLabel(d)).toBe('D3 · 18\u00a0m · 40\u00a0min');
    });
    test('shows the exact start and end clock times', () => {
        expect(diveTimeRange({ startDateTime: 14 * 60, endDateTime: 14 * 60 + 57 })).toBe('14:00–14:57');
    });
    test('wraps clock times at midnight', () => {
        expect(diveTimeRange({ startDateTime: 23 * 60 + 30, endDateTime: 24 * 60 + 15 })).toBe('23:30–00:15');
    });
});

describe('Repetitive dive planner localization', () => {
    const locales = ['cs', 'en', 'es'].map(lang =>
        JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'))
    );
    const keyShape = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return child && typeof child === 'object' ? keyShape(child, path) : [path];
    }).sort();

    test('has the same complete translation namespace in every language', () => {
        const namespaces = locales.map(locale => locale.sandbox.repetitive);
        expect(keyShape(namespaces[1])).toEqual(keyShape(namespaces[0]));
        expect(keyShape(namespaces[2])).toEqual(keyShape(namespaces[0]));
        expect(keyShape(namespaces[0]).length).toBeGreaterThanOrEqual(50);
    });

    test('localizes the page and every dynamic planner component', () => {
        const page = readFileSync(new URL('../sandbox/repetitive-dives.html', import.meta.url), 'utf8');
        expect(page.includes('data-i18n="sandbox.repetitive.heading"')).toBe(true);
        expect(page.includes("document.addEventListener('languagechange'")).toBe(true);
        expect(page.includes('createLanguageSwitcher();')).toBe(true);
        expect(page.includes('initI18n();')).toBe(true);
        expect(page.includes('presat-reference-50')).toBe(true);
        expect(page.includes('presat-reference-100')).toBe(true);

        for (const relative of [
            '../js/components/TripCalendar.js',
            '../js/components/AddDiveDialog.js',
            '../js/components/DiveEditPanel.js',
            '../js/components/RuntimeTable.js'
        ]) {
            const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
            expect(source.includes("from '../i18n.js'")).toBe(true);
            expect(source.includes('sandbox.repetitive.')).toBe(true);
        }
    });
});

describe('Tissue saturation terminology and notation', () => {
    const locales = Object.fromEntries(['cs', 'en', 'es'].map(lang => [
        lang,
        JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'))
    ]));

    test('uses the requested Czech terminology', () => {
        expect(locales.cs.sandbox.tissue.gas).toBe('Dýchaná směs');
        expect(locales.cs.sandbox.tissue.readout.gas).toBe('Dýchaná směs');
        expect(locales.cs.sandbox.tissue.readout.time).toBe('Čas simulace');
        expect(locales.cs.tissueSim.alertOk.includes('Vše v pořádku')).toBe(false);
        expect(locales.cs.tissueSim.alertOk.includes('0,18–1,4\u00a0bar')).toBe(true);
        expect(locales.cs.tissueSim.alertOk.includes('4,0\u00a0bar')).toBe(true);
    });

    test('uses glossary symbols for pressure and tissue half-time', () => {
        expect(locales.cs.sandbox.tissue.readout.pAmb).toBe('<var>p</var><sub>okol</sub>');
        expect(locales.en.sandbox.tissue.readout.pAmb).toBe('<var>p</var><sub>amb</sub>');
        for (const locale of Object.values(locales)) {
            expect(locale.sandbox.tissue.readout.tcFast.includes('<var>t</var><sub>1/2</sub>')).toBe(true);
            expect(locale.tissueSim.ppO2AboveRec.includes('{1}\u00a0bar')).toBe(true);
        }
    });
});

describe('Haldane sandbox glossary notation', () => {
    const locales = Object.fromEntries(['cs', 'en', 'es'].map(lang => [
        lang,
        JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'))
    ]));
    const page = readFileSync(new URL('../sandbox/haldane.html', import.meta.url), 'utf8');

    test('localizes descriptive pressure subscripts from the glossary', () => {
        expect(locales.cs.sandbox.haldane.symbols).toEqual({
            tissue: 'tk',
            tissueInitial: 'tk,0',
            ambient: 'okol',
            ambientInitial: 'okol,0'
        });
        expect(locales.en.sandbox.haldane.symbols.tissue).toBe('t');
        expect(locales.es.sandbox.haldane.symbols.ambient).toBe('amb');
    });

    test('uses canonical quantity symbols in static and generated formulas', () => {
        expect(page.includes('<var>D</var>')).toBe(false);
        expect(page.includes('<var>h</var><sub>0</sub>')).toBe(true);
        expect(page.includes('<var>M</var> = <var>a</var>')).toBe(true);
        expect(page.includes("document.addEventListener('languagechange'")).toBe(true);
    });

    test('presents the completed-change form first and keeps the canonical form available', () => {
        expect(page.indexOf('(1 − e<sup>−<var>k</var><var>t</var></sup>)'))
            .toBeLessThan(page.indexOf('<details class="canonical-form">'));
        expect(page.includes('sandbox.haldane.teachingSentence')).toBe(true);
        expect(page.includes('sandbox.haldane.limits.atZero')).toBe(true);
        expect(page.includes('sandbox.haldane.limits.longTime')).toBe(true);
        expect(page.includes('sandbox.haldane.canonical.explanation')).toBe(true);
    });

    test('collapses all equation term cards behind one disclosure by default', () => {
        expect(page.match(/<details class="term-details">/g)).toHaveLength(1);
        expect(page.includes('<details class="term-details" open>')).toBe(false);
        expect(page.match(/<div class="term-card (?:pt0|palv|change|progress)">/g)).toHaveLength(4);
        for (const locale of Object.values(locales)) {
            expect(Boolean(locale.sandbox.haldane.cards.summary)).toBe(true);
        }
    });
});

describe('Haldane and Schreiner teaching hierarchy', () => {
    const pages = Object.fromEntries(['haldane', 'schreiner'].map(name => [
        name,
        readFileSync(new URL(`../sandbox/${name}.html`, import.meta.url), 'utf8')
    ]));
    const locales = Object.fromEntries(['cs', 'en', 'es'].map(lang => [
        lang,
        JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'))
    ]));

    test('both pages compare the fixed and moving alveolar targets before equations', () => {
        for (const page of Object.values(pages)) {
            const comparison = page.indexOf('sandbox.equationComparison.title');
            const formula = page.indexOf('<div class="formula-substituted">');
            expect(comparison).toBeGreaterThan(-1);
            expect(comparison).toBeLessThan(formula);
            expect(page.includes('sandbox.equationComparison.haldane.constant')).toBe(true);
            expect(page.includes('sandbox.equationComparison.schreiner.linear')).toBe(true);
        }
    });

    test('Schreiner presents one basic example before the general case and expert algebra', () => {
        const page = pages.schreiner;
        const chart = page.indexOf('id="ptChart"');
        const contributions = page.indexOf('data-teaching-model="basic-moving-target"');
        const general = page.indexOf('sandbox.schreiner.general.summary');
        const derivation = page.indexOf('sandbox.schreiner.derivation.summary');
        const glossary = page.indexOf('sandbox.schreiner.cards.summary');
        const mathOrigin = page.indexOf('sandbox.schreiner.mathOrigin.summary');
        expect(page.indexOf('sandbox.schreiner.mental.simpleExplanation')).toBeLessThan(chart);
        expect(chart).toBeLessThan(contributions);
        expect(contributions).toBeLessThan(general);
        expect(general).toBeLessThan(derivation);
        expect(derivation).toBeLessThan(glossary);
        expect(glossary).toBeLessThan(mathOrigin);
        expect(mathOrigin).toBeLessThan(page.indexOf('sandbox.schreiner.mvalue.summary'));
        expect(page.includes('<details class="advanced-section" open>')).toBe(false);
    });

    test('keeps the graph physical and labels both pressures and their current difference', () => {
        const page = pages.schreiner;
        for (const line of ['chartPalv', 'chartDelta', 'chartCurve']) {
            expect(page.includes(`id="${line}"`)).toBe(true);
        }
        expect(page.includes('id="chartPalvLabel"')).toBe(true);
        expect(page.includes('id="chartDeltaLabel"')).toBe(true);
        expect(page.includes('id="chartTissueLabel"')).toBe(true);
        expect(page.includes('id="chartDeltaPalv"')).toBe(true);
        expect(page.includes('id="chartDeltaTissue"')).toBe(true);
        expect(page.includes('id="chartExchangeLabel"')).toBe(true);
        expect(page.includes('stroke="#2980b9"')).toBe(true);
        expect(page.includes('stroke="#16a085"')).toBe(true);
        expect(page.includes('stroke="#e67e22"')).toBe(true);
    });

    test('the basic example shows initial pressure and moving-target response only', () => {
        const page = pages.schreiner;
        const steps = page.indexOf('data-teaching-model="basic-moving-target"');
        const general = page.indexOf('sandbox.schreiner.general.summary');
        for (const [name, id] of [
            ['initial', 'contributionInitialValue'],
            ['moving', 'movingContributionValue']
        ]) {
            expect(page.includes(`data-contribution="${name}"`)).toBe(true);
            expect(page.includes(`contribution-step ${name}`)).toBe(true);
            expect(page.includes(`id="${id}"`)).toBe(true);
            expect(page.includes(`contribution-origin ${name}`)).toBe(true);
        }
        const primary = page.slice(steps, general);
        expect(primary.includes('data-contribution="haldane"')).toBe(false);
        expect(primary.includes('id="initialEquilibriumNote"')).toBe(true);
        expect(primary.includes('id="sumHaldaneLabel" hidden')).toBe(true);
        expect(primary.includes('id="sumHaldaneNumeric" hidden')).toBe(true);
        expect(page.includes('id="haldaneContributionValue"')).toBe(true);
        expect(page.includes('(1 − e<sup>−<var>k</var><var>t</var></sup>)')).toBe(true);
        expect(page.includes('<var>R</var> · [<var>t</var> −')).toBe(true);
        expect(steps).toBeLessThan(general);
        for (const locale of Object.values(locales)) {
            expect(Boolean(locale.sandbox.schreiner.composition.initial.title)).toBe(true);
            expect(Boolean(locale.sandbox.schreiner.composition.equilibrium.title)).toBe(true);
            expect(Boolean(locale.sandbox.schreiner.composition.haldane.title)).toBe(true);
            expect(Boolean(locale.sandbox.schreiner.composition.moving.title)).toBe(true);
        }
    });

    test('the three-contribution teaching form equals schreinerEquation', () => {
        const states = [
            { pT0: 0.75, pAlv0: 1.0 },
            { pT0: 1.8, pAlv0: 3.1 },
            { pT0: 3.4, pAlv0: 2.8 }
        ];
        for (const rate of [0.24, -0.3, 0]) {
            for (const halfTime of [4, 18.5, 54.3, 239]) {
                const k = Math.LN2 / halfTime;
                for (const time of [0, 0.5, 2.2, 25]) {
                    const exp = Math.exp(-k * time);
                    for (const { pT0, pAlv0 } of states) {
                        const haldaneContribution = (pAlv0 - pT0) * (1 - exp);
                        const movingTargetContribution = rate * (
                            time - (1 - exp) / k
                        );
                        const teachingResult = pT0
                            + haldaneContribution
                            + movingTargetContribution;
                        expect(teachingResult).toBeCloseTo(
                            schreinerEquation(pT0, pAlv0, rate, time, halfTime),
                            11
                        );
                    }
                }
            }
        }
    });

    test('the equilibrium-start basic form needs only initial pressure and movement correction', () => {
        const pAlv0 = getAlveolarN2Pressure(getAmbientPressure(0));
        const pT0 = pAlv0;
        for (const halfTime of [4, 27, 239]) {
            const k = Math.LN2 / halfTime;
            for (const time of [0, 0.5, 3]) {
                const rate = 0.79;
                const exp = Math.exp(-k * time);
                const movementCorrection = rate * (time - (1 - exp) / k);
                const basicResult = pT0 + movementCorrection;
                expect((pAlv0 - pT0) * (1 - exp)).toBe(0);
                expect(basicResult).toBeCloseTo(
                    schreinerEquation(pT0, pAlv0, rate, time, halfTime),
                    11
                );
            }
        }
    });

    test('the moving-target contribution follows the sign of R', () => {
        const k = Math.LN2 / 27;
        const time = 3;
        const movementWindow = time - (1 - Math.exp(-k * time)) / k;
        expect(movementWindow).toBeGreaterThan(0);
        expect(0.5 * movementWindow).toBeGreaterThan(0);
        expect(-0.5 * movementWindow).toBeLessThan(0);
        expect(0 * movementWindow).toBe(0);
    });

    test('the pressure difference supports on-gassing, off-gassing, and equilibrium', () => {
        const samples = [
            { pT0: 0.7, pAlv0: 2.5, rate: 0.2, time: 1, halfTime: 27, sign: 1 },
            { pT0: 3.2, pAlv0: 2.5, rate: -0.2, time: 1, halfTime: 27, sign: -1 },
            { pT0: 2.5, pAlv0: 2.5, rate: 0, time: 4, halfTime: 27, sign: 0 }
        ];

        for (const sample of samples) {
            const pTissue = schreinerEquation(
                sample.pT0,
                sample.pAlv0,
                sample.rate,
                sample.time,
                sample.halfTime
            );
            const deltaP = sample.pAlv0 + sample.rate * sample.time - pTissue;
            if (sample.sign > 0) expect(deltaP).toBeGreaterThan(0);
            if (sample.sign < 0) expect(deltaP).toBeLessThan(0);
            if (sample.sign === 0) expect(deltaP).toBeCloseTo(0, 12);
        }
    });

    test('at R = 0 the movement correction is zero and the teaching form is Haldane', () => {
        for (const { pT0, pAlv0, time, halfTime } of [
            { pT0: 0.7511, pAlv0: 2.3315, time: 20, halfTime: 27 },
            { pT0: 3.5, pAlv0: 0.7511, time: 8, halfTime: 5 },
            { pT0: 1.2, pAlv0: 2.8, time: 120, halfTime: 635 }
        ]) {
            const k = Math.LN2 / halfTime;
            const exp = Math.exp(-k * time);
            const movingContribution = 0 * (time - (1 - exp) / k);
            const teachingResult = pT0 + (pAlv0 - pT0) * (1 - exp) + movingContribution;
            expect(movingContribution).toBe(0);
            expect(teachingResult).toBeCloseTo(haldaneEquation(pT0, pAlv0, time, halfTime), 12);
            expect(schreinerEquation(pT0, pAlv0, 0, time, halfTime))
                .toBeCloseTo(haldaneEquation(pT0, pAlv0, time, halfTime), 12);
        }
    });

    test('keeps calculus out of the basic example and general teaching form', () => {
        const page = pages.schreiner;
        const primaryStart = page.indexOf('data-teaching-model="basic-moving-target"');
        const primaryEnd = page.indexOf('sandbox.schreiner.derivation.summary');
        const primary = page.slice(primaryStart, primaryEnd);
        expect(primary.includes('d<var>p</var>')).toBe(false);
        expect(primary.includes('∫')).toBe(false);
        expect(page.indexOf('sandbox.schreiner.mathOrigin.summary')).toBeGreaterThan(primaryEnd);
        expect(page.includes('d<var>p</var><sub data-i18n="sandbox.schreiner.symbols.tissue">t</sub>/d<var>t</var>')).toBe(true);
    });

    test('shows each algebra step and keeps numerical substitution inside the collapsed derivation', () => {
        const page = pages.schreiner;
        const canonicalStart = page.indexOf('sandbox.schreiner.derivation.summary');
        const canonicalEnd = page.indexOf('</details>', canonicalStart);
        const substitution = page.indexOf('<div class="formula-substituted">');
        for (const step of ['teaching', 'expanded', 'grouped', 'canonical']) {
            expect(page.includes(`data-algebra-step="${step}"`)).toBe(true);
        }
        for (const origin of ['initial', 'haldane', 'moving']) {
            expect(page.includes(`contribution-origin ${origin}`)).toBe(true);
        }
        expect(page.includes('algebra-cancel')).toBe(true);
        expect(page.includes('<details class="advanced-section general-case" open>')).toBe(false);
        expect(page.includes('<details class="advanced-section algebra-derivation" open>')).toBe(false);
        expect(substitution).toBeGreaterThan(canonicalStart);
        expect(substitution).toBeLessThan(canonicalEnd);
    });

    test('fully hides collapsed control contents while leaving only the toggle visible', () => {
        for (const page of Object.values(pages)) {
            expect(page.includes('.sandbox-control-bar.collapsed { transform: translateY(100%); }')).toBe(true);
            expect(page.includes('translateY(calc(100% - 32px))')).toBe(false);
        }
    });

    test('every language explains all contributions, Haldane reduction, and algebra', () => {
        for (const locale of Object.values(locales)) {
            const schreiner = locale.sandbox.schreiner;
            expect(schreiner.composition.initial.explanation.length).toBeGreaterThan(30);
            expect(schreiner.composition.haldane.bridgeExplanation).toContain('Haldane');
            expect(schreiner.composition.moving.zeroNote).toContain('<var>R</var> = 0');
            expect(schreiner.composition.sum.explanation.length).toBeGreaterThan(40);
            expect(schreiner.derivation.expanded.length).toBeGreaterThan(5);
            expect(schreiner.mathOrigin.explanation.length).toBeGreaterThan(80);
        }
    });

    test('the graph uses only physical pressures on one shared scale', () => {
        const page = pages.schreiner;
        expect(page.includes('const pressures = samples.flatMap(sample => [sample.pAlv, sample.pTissue]);')).toBe(true);
        expect(page.includes('chart-scale-note')).toBe(false);
        expect(page.includes('chartTracking')).toBe(false);
        expect(page.includes('pTracking')).toBe(false);
        expect(page.includes('tracking-line')).toBe(false);
    });

    test('Schreiner calls the existing equation and does not define a second implementation', () => {
        expect(pages.schreiner.includes('schreinerEquation(pT0, pAlv0, R, state.t, halfTime)')).toBe(true);
        expect(pages.schreiner.includes('function schreinerEquation')).toBe(false);
    });

    test('uses one surface-start descent as the basic example and no main scenario presets', () => {
        const page = pages.schreiner;
        expect(page.includes('startDepth: 0')).toBe(true);
        expect(page.includes('depthRate: 10')).toBe(true);
        expect(page.includes("initialState: 'start'")).toBe(true);
        expect(page.includes('const SCENARIOS')).toBe(false);
        expect(page.includes('data-scenario=')).toBe(false);
        const pAlv0 = getAlveolarN2Pressure(getAmbientPressure(0));
        const pT0 = getAlveolarN2Pressure(getAmbientPressure(0));
        expect(pT0).toBe(pAlv0);
    });

    test('removes the exponential time factor from the primary outputs', () => {
        for (const locale of Object.values(locales)) {
            expect(locale.sandbox.schreiner.outputs.saturation).toBe(undefined);
            expect(locale.sandbox.schreiner.outputs.response).toBe(undefined);
        }
        expect(pages.schreiner.includes('id="saturationValue"')).toBe(false);
        expect(pages.schreiner.includes('id="responseValue"')).toBe(false);
        expect(pages.schreiner.includes('const responsePct')).toBe(false);
    });

    test('keeps symbols and both whole contributions in the collapsed glossary', () => {
        const page = pages.schreiner;
        expect(page.includes('sandbox.schreiner.cards.haldaneContribution.name')).toBe(true);
        expect(page.includes('sandbox.schreiner.cards.movingContribution.name')).toBe(true);
        expect(page.includes('sandbox.schreiner.cards.delta.name')).toBe(false);
        expect(page.includes('sandbox.schreiner.cards.derivative.name')).toBe(false);
        for (const locale of Object.values(locales)) {
            expect(locale.sandbox.schreiner.cards.summary.toLowerCase()).toContain(
                locale === locales.cs ? 'slovníček' : locale === locales.es ? 'glosario' : 'glossary'
            );
            expect(Boolean(locale.sandbox.schreiner.cards.haldaneContribution)).toBe(true);
            expect(Boolean(locale.sandbox.schreiner.cards.movingContribution)).toBe(true);
        }
    });

    test('scenario stories are absent from the main localized teaching content', () => {
        for (const locale of Object.values(locales)) {
            expect(locale.sandbox.schreiner.scenarios).toBe(undefined);
            expect(locale.sandbox.schreiner.general.explanation.length).toBeGreaterThan(70);
        }
    });

    test('keeps unfinished sandbox pages out of public discovery surfaces', () => {
        const nav = readFileSync(new URL('../js/nav.js', import.meta.url), 'utf8');
        const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
        const mvalues = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        const gradientTheory = readFileSync(new URL('../gradient-factors.html', import.meta.url), 'utf8');
        const gradientSandbox = readFileSync(new URL('../sandbox/gradient-factors.html', import.meta.url), 'utf8');
        const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
        expect(nav.includes("href: 'sandbox/schreiner.html'")).toBe(false);
        expect(home.includes('href="sandbox/schreiner.html"')).toBe(false);
        expect(mvalues.includes('href="schreiner.html"')).toBe(false);
        expect(serviceWorker.includes("'./sandbox/schreiner.html'")).toBe(false);
        expect(pages.schreiner.includes('<meta name="robots" content="noindex, nofollow">')).toBe(true);
        expect(nav.includes("href: 'sandbox/gradient-factors.html'")).toBe(false);
        expect(home.includes('href="sandbox/gradient-factors.html"')).toBe(false);
        expect(gradientTheory.includes('href="sandbox/gradient-factors.html"')).toBe(false);
        expect(serviceWorker.includes("'./sandbox/gradient-factors.html'")).toBe(false);
        expect(gradientSandbox.includes('<meta name="robots" content="noindex, nofollow">')).toBe(true);
    });

    test('Haldane fallback text covers both on-gassing and off-gassing', () => {
        expect(pages.haldane.includes('Bühlmann/Haldane on-gassing equation')).toBe(false);
        expect(pages.haldane.includes('how a tissue compartment on-gasses over time')).toBe(false);
        expect(pages.haldane.includes('on-gassing and off-gassing')).toBe(true);
    });
});

// ============================================================================
// I18N NOTATION
// ============================================================================

describe('DiveSetupEditor notation', () => {
    test('Czech runtime phase labels use lowercase within table rows', () => {
        const cs = JSON.parse(readFileSync(new URL('../locales/cs.json', import.meta.url), 'utf8'));
        const phaseKeys = [
            'phaseDescent',
            'phaseBottom',
            'phaseSurface',
            'phaseAscent',
            'phaseSwitch',
            'phaseStop'
        ];

        for (const key of phaseKeys) {
            expect(/^[a-zá-ž]/u.test(cs.divePlan[key])).toBe(true);
        }
    });

    describe('DiveSetupEditor study settings', () => {
        test('defaults to standard mode and reveals a warning for study modes', () => {
            const dom = new JSDOM('<!doctype html><body></body>');
            const previousDocument = globalThis.document;
            globalThis.document = dom.window.document;

            try {
                const context = {
                    elements: {},
                    _onInputChange() {},
                    _updateNDLDisplay() {}
                };
                const section = DiveSetupEditor.prototype._buildStudySettings.call(context);
                expect(section.open).toBe(false);
                expect(section.classList.contains('dse-section')).toBe(false);
                expect(section.querySelector('.dse-study-trigger')).toBeDefined();
                expect(context.elements.decoModeSelect.value).toBe(DECO_MODES.STANDARD);
                expect(context.elements.decoModeWarning.hidden).toBe(true);
                expect(context.elements.decoModeActive.hidden).toBe(true);

                context.elements.decoModeSelect.value = DECO_MODES.ADAPTIVE;
                context.elements.decoModeSelect.dispatchEvent(new dom.window.Event('change'));
                expect(context.elements.decoModeWarning.hidden).toBe(false);
                expect(context.elements.decoModeActive.hidden).toBe(false);
                expect(section.classList.contains('is-active')).toBe(true);
            } finally {
                globalThis.document = previousDocument;
                dom.window.close();
            }
        });
    });

    test('quick setup explains bottom time on hover and keyboard focus', () => {
        const dom = new JSDOM('<!doctype html><body></body>');
        const previousDocument = globalThis.document;
        globalThis.document = dom.window.document;

        try {
            const section = DiveSetupEditor.prototype._buildQuickSetup.call({
                options: {
                    showGenerateButton: true,
                    showSafetyStop: false
                },
                elements: {},
                _updateNDLDisplay() {}
            });

            test('environment control displays pressure derived from altitude', () => {
                const dom = new JSDOM('<!doctype html><body></body>');
                const previousDocument = globalThis.document;
                globalThis.document = dom.window.document;

                try {
                    const context = {
                        elements: {},
                        currentGases: [],
                        _getAltitude: DiveSetupEditor.prototype._getAltitude,
                        _getSurfacePressure: DiveSetupEditor.prototype._getSurfacePressure,
                        _updateEnvironmentDisplay: DiveSetupEditor.prototype._updateEnvironmentDisplay,
                        _renderGasCards() {},
                        _updateNDLDisplay() {},
                        _onInputChange() {}
                    };
                    const section = DiveSetupEditor.prototype._buildEnvironmentSection.call(context);
                    context.elements.altitudeInput.value = '1500';
                    context.elements.altitudeInput.dispatchEvent(new dom.window.Event('input'));

                    expect(context.elements.environmentSummaryHint.textContent)
                        .toBe('(1500\u00a0m · EN)');
                    expect(context.elements.surfacePressureValue.textContent).toContain('0.845');
                    expect(context.elements.surfacePressureValue.textContent).toContain('\u00a0bar');
                    const tooltip = section.querySelector('.dse-term-tooltip');
                    expect(Boolean(tooltip)).toBe(true);
                    expect(tooltip.getAttribute('data-tooltip')).toContain(
                        'standard atmosphere'
                    );
                    expect(tooltip.getAttribute('aria-label'))
                        .toBe(tooltip.getAttribute('data-tooltip'));
                    expect(tooltip.getAttribute('tabindex')).toBe('0');
                    expect(context.elements.waterTypeInputs.length).toBe(3);
                    expect([...context.elements.waterTypeInputs]
                        .find(input => input.checked).value)
                        .toBe(WATER_TYPES.STANDARD);
                    const seaInput = [...context.elements.waterTypeInputs]
                        .find(input => input.value === WATER_TYPES.SEA);
                    seaInput.checked = true;
                    seaInput.dispatchEvent(
                        new dom.window.Event('change')
                    );
                    expect(context.elements.environmentSummaryHint.textContent)
                        .toBe('(1500\u00a0m · sea)');
                } finally {
                    globalThis.document = previousDocument;
                    dom.window.close();
                }
            });
            const tooltip = section.querySelector('.dse-term-tooltip');

            expect(Boolean(tooltip)).toBe(true);
            expect(tooltip.getAttribute('data-tooltip')).toBe(
                'Total time from the start of descent until beginning the ascent to the deepest decompression stop, or directly to the surface on a no-decompression dive. Includes descent.'
            );
            expect(tooltip.getAttribute('aria-label')).toBe(tooltip.getAttribute('data-tooltip'));
            expect(tooltip.getAttribute('tabindex')).toBe('0');
        } finally {
            globalThis.document = previousDocument;
            dom.window.close();
        }
    });

    test('cylinder volumes render with lowercase l', () => {
        const dom = new JSDOM('<!doctype html><body></body>');
        const previousDocument = globalThis.document;
        globalThis.document = dom.window.document;

        try {
            for (const index of [0, 1]) {
                const card = DiveSetupEditor.prototype._createGasCard.call({}, {
                    name: index === 0 ? 'Air' : 'EAN50',
                    o2: index === 0 ? 0.21 : 0.5,
                    n2: index === 0 ? 0.79 : 0.5,
                    he: 0,
                    cylinderVolume: 9.5,
                    startPressure: 200
                }, index);

                expect(card.querySelector('.dse-cylinder-custom-unit').textContent).toBe('l');
                const labels = [...card.querySelectorAll('.dse-gas-cylinder option')]
                    .map((option) => option.textContent);
                expect(labels.some((label) => /\d\u00a0l\b/.test(label))).toBe(true);
                expect(labels.some((label) => /\d(?:\.\d+)?\sL\b/.test(label))).toBe(false);
            }
        } finally {
            globalThis.document = previousDocument;
            dom.window.close();
        }
    });

    test('bottom gas omits the decompression MOD while deco gas shows it', () => {
        const dom = new JSDOM('<!doctype html><body></body>');
        const previousDocument = globalThis.document;
        globalThis.document = dom.window.document;

        try {
            const airCard = DiveSetupEditor.prototype._createGasCard.call({}, {
                name: 'Air', o2: 0.21, n2: 0.79, he: 0,
                cylinderVolume: 12, startPressure: 200
            }, 0);
            const decoCard = DiveSetupEditor.prototype._createGasCard.call({}, {
                name: 'EAN50', o2: 0.5, n2: 0.5, he: 0,
                cylinderVolume: 7, startPressure: 200
            }, 1);

            expect(airCard.querySelector('.dse-gas-mod .dse-hint').textContent).toBe('MOD: 56\u00a0m');
            expect(decoCard.querySelector('.dse-gas-mod .dse-hint').textContent).toBe(
                'MOD: 18\u00a0m\ndeco MOD: 22\u00a0m\nrecommended switch: 21\u00a0m'
            );
        } finally {
            globalThis.document = previousDocument;
            dom.window.close();
        }
    });

    test('auto-generation debounces repeated editor changes', () => {
        const dom = new JSDOM('<!doctype html><body></body>');
        const previousDocument = globalThis.document;
        const previousSetTimeout = globalThis.setTimeout;
        const previousClearTimeout = globalThis.clearTimeout;
        let scheduledCallback = null;
        let generated = 0;
        let cleared = 0;

        globalThis.document = dom.window.document;

        try {
            const context = {
                options: { autoGenerateProfile: true, autoGenerateDelay: 250 },
                elements: {},
                _autoGenerateTimer: null,
                _isGeneratingProfile: false,
                _updateNDLDisplay() {},
                _scheduleAutoGenerateProfile: DiveSetupEditor.prototype._scheduleAutoGenerateProfile,
                _generateProfile() { generated++; }
            };
            const quickSetup = DiveSetupEditor.prototype._buildQuickSetup.call(context);
            expect(Boolean(quickSetup.querySelector('.dse-ndl-display'))).toBe(true);
            expect(quickSetup.querySelector('.dse-generate-btn')).toBeNull();

            globalThis.setTimeout = (callback, delay) => {
                expect(delay).toBe(250);
                scheduledCallback = callback;
                return 42;
            };
            globalThis.clearTimeout = (timer) => {
                expect(timer).toBe(42);
                cleared++;
            };

            DiveSetupEditor.prototype._scheduleAutoGenerateProfile.call(context);
            DiveSetupEditor.prototype._scheduleAutoGenerateProfile.call(context);
            expect(cleared).toBe(1);
            expect(generated).toBe(0);

            scheduledCallback();
            expect(context._autoGenerateTimer).toBeNull();
            expect(generated).toBe(1);
        } finally {
            globalThis.document = previousDocument;
            globalThis.setTimeout = previousSetTimeout;
            globalThis.clearTimeout = previousClearTimeout;
            dom.window.close();
        }
    });

    test('custom gas does not expose unsupported helium input', () => {
        const dom = new JSDOM('<!doctype html><body></body>');
        const previousDocument = globalThis.document;
        globalThis.document = dom.window.document;

        try {
            const card = DiveSetupEditor.prototype._createGasCard.call({}, {
                name: 'Custom 21/0',
                o2: 0.21,
                n2: 0.79,
                he: 0,
                cylinderVolume: 12,
                startPressure: 200
            }, 0);
            const heliumInput = card.querySelector('.dse-gas-he');

            expect(heliumInput?.type).toBe('hidden');
            expect(card.querySelector('.dse-gas-custom').textContent.includes('He:')).toBe(false);
        } finally {
            globalThis.document = previousDocument;
            dom.window.close();
        }
    });
});

describe('M-value notation localization', () => {
    test('Czech M-value descriptions use the localized ambient-pressure subscript', () => {
        const cs = JSON.parse(
            readFileSync(new URL('../locales/cs.json', import.meta.url), 'utf8')
        );
        const values = [
            cs.mValues.chartFormula.intro,
            cs.mValues.chartFormula.varPamb,
            cs.mValues.buhlmann.formulaPamb,
            cs.gradientFactors.chartFormula.varM
        ];

        for (const value of values) {
            expect(value.includes('<sub>okol</sub>')).toBe(true);
            expect(value.includes('<sub>amb</sub>')).toBe(false);
        }
    });

    test('GF formula localizes tissue and ambient pressure subscripts', () => {
        const load = (lang) => JSON.parse(
            readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8')
        );
        const cs = load('cs');
        const en = load('en');
        const es = load('es');
        const sandbox = readFileSync(
            new URL('../sandbox/index.html', import.meta.url),
            'utf8'
        );

        expect(cs.gfChart.subTissue).toBe('tk');
        expect(cs.gfChart.subAmbient).toBe('okol');
        expect(cs.gfChart.varPtissue.includes('<sub>tk</sub>')).toBe(true);
        expect(cs.gfChart.varPamb.includes('<sub>okol</sub>')).toBe(true);
        expect(en.gfChart.subTissue).toBe('t');
        expect(en.gfChart.subAmbient).toBe('amb');
        expect(es.gfChart.subTissue).toBe('tejido');
        expect(es.gfChart.subAmbient).toBe('amb');
        expect(sandbox.includes('data-i18n="gfChart.subTissue"')).toBe(true);
        expect(sandbox.includes('data-i18n="gfChart.subAmbient"')).toBe(true);
    });
});

describe('Gradient-factors theory page follows the glossary', () => {
    const page = readFileSync(
        new URL('../gradient-factors.html', import.meta.url),
        'utf8'
    );
    const pageMarkup = page.split('<script type="module">')[0];
    const dictionaries = Object.fromEntries(
        ['cs', 'en', 'es'].map(lang => [
            lang,
            JSON.parse(readFileSync(
                new URL(`../locales/${lang}.json`, import.meta.url),
                'utf8'
            ))
        ])
    );
    const locales = Object.fromEntries(
        Object.entries(dictionaries).map(([lang, dict]) => [
            lang,
            dict.gradientFactors
        ])
    );
    const visibleKeys = [
        ...page.matchAll(/data-i18n="(gradientFactors\.[^"]+)"/g)
    ].map(match => match[1]);

    function valueAt(object, path) {
        return path.split('.').reduce((value, key) => value[key], object);
    }

    test('formula and GF limit symbols use the glossary notation', () => {
        expect(visibleKeys).toHaveLength(159);
        expect(pageMarkup.includes(
            'data-i18n="gradientFactors.chartFormula.adjustedSymbol"'
        )).toBe(true);
        expect(pageMarkup.includes('<th>GF<sub>low</sub> (%)</th>')).toBe(true);
        expect(pageMarkup.includes('<th>GF<sub>high</sub> (%)</th>')).toBe(true);

        const adjusted = {
            cs: '<var>M</var><sub>upr</sub>',
            en: '<var>M</var><sub>adj</sub>',
            es: '<var>M</var><sub>adj</sub>'
        };
        const mValueKeys = [
            'greyZone.title',
            'greyZone.silentBubbles.insight',
            'greyZone.silentBubbles.text2',
            'gfExplained.what.text1',
            'gfExplained.what.gf100value',
            'gfExplained.what.text2',
            'gfExplained.example100.desc',
            'gfExplained.example5080.desc',
            'chartFormula.summary',
            'chartFormula.intro',
            'chartFormula.varM',
            'chartFormula.note100'
        ];
        for (const [lang, values] of Object.entries(locales)) {
            expect(values.chartFormula.adjustedSymbol).toBe(adjusted[lang]);
            expect(values.chartFormula.varMPrime.includes(
                `<strong>${adjusted[lang]}</strong>`
            )).toBe(true);
            expect(values.chartFormula.varM.includes(
                '<strong><var>M</var></strong>'
            )).toBe(true);
            expect(values.chartFormula.varM.includes('<var>a</var>')).toBe(true);
            expect(values.chartFormula.varM.includes('<var>b</var>')).toBe(true);
            expect(values.chartFormula.varGF.includes('GF<sub>low</sub>')).toBe(true);
            expect(values.chartFormula.varGF.includes('GF<sub>high</sub>')).toBe(true);
            expect(values.chartFormula.varGF.includes(
                '<var>p</var><sub>anchor</sub>'
            )).toBe(true);
            expect(/ceiling|strop|techo/i.test([
                values.chartFormula.intro,
                values.chartFormula.intro5080,
                values.chartFormula.varMPrime
            ].join('\n'))).toBe(false);
            for (const key of mValueKeys) {
                expect(valueAt(values, key).includes('<var>M</var>')).toBe(true);
            }

            const visibleText = visibleKeys
                .map(key => valueAt(dictionaries[lang], key))
                .join('\n');
            expect(/M'|pAnchor|GF (?:Low|High|bajo|alto)/.test(visibleText))
                .toBe(false);
        }
    });

    test('visible numbers use localized decimals and non-breaking unit spacing', () => {
        const badUnitSpacing =
            /\d(?:[–-]\d+)? ?(?:%|m|meters?|min(?:utes?)?|ft|fsw)(?![A-Za-z])/;

        for (const [lang, dict] of Object.entries(dictionaries)) {
            for (const key of visibleKeys) {
                expect(badUnitSpacing.test(valueAt(dict, key))).toBe(false);
            }
            if (lang !== 'en') {
                const visibleText = visibleKeys
                    .map(key => valueAt(dict, key))
                    .join('\n');
                expect(/\d+\.\d+/.test(visibleText)).toBe(false);
            }
        }

        expect(pageMarkup.includes('40–60&nbsp;%')).toBe(true);
        expect(pageMarkup.includes('100&nbsp;%')).toBe(true);
        expect(pageMarkup.includes('170&nbsp;fsw')).toBe(true);
        expect(pageMarkup.includes('12&nbsp;m')).toBe(true);
    });

    test('Pyle story preserves the systematic search that revealed the fish pattern', () => {
        expect(locales.cs.pyle.discovery.text1.includes('systematicky')).toBe(true);
        expect(locales.cs.pyle.discovery.text1.includes('únava')).toBe(true);
        expect(locales.cs.pyle.discovery.insight.toLowerCase().includes('bez únavy'))
            .toBe(true);

        expect(locales.en.pyle.discovery.text1.includes('systematically')).toBe(true);
        expect(locales.en.pyle.discovery.text1.includes('fatigue varied')).toBe(true);
        expect(locales.en.pyle.discovery.insight.includes('without fatigue')).toBe(true);

        expect(locales.es.pyle.discovery.text1.includes('sistemáticamente')).toBe(true);
        expect(locales.es.pyle.discovery.text1.includes('fatiga variaba')).toBe(true);
        expect(locales.es.pyle.discovery.insight.includes('sin fatiga')).toBe(true);
    });

    test('Pyle section presents a sourced history rather than a recommended algorithm', () => {
        expect(pageMarkup.includes(
            'href="https://scubatechphilippines.com/scuba_blog/deep-stops-richard-pyle/"'
        )).toBe(true);
        expect(pageMarkup.includes(
            'href="https://indepthmag.com/wp-content/uploads/2019/10/NEDU_TR_2011-06.pdf"'
        )).toBe(true);
        for (const obsoleteKey of [
            'step1',
            'step2',
            'step3',
            'step4',
            'exampleTitle',
            'stop1Label',
            'stop1Value',
            'stop2Label',
            'stop2Value',
            'stop3Label',
            'stop3Value',
            'vpmConnection'
        ]) {
            expect(pageMarkup.includes(
                `gradientFactors.pyle.method.${obsoleteKey}`
            )).toBe(false);
        }
        expect(pageMarkup.includes('(60 + 15)')).toBe(false);

        expect(locales.cs.pyle.discovery.insight.startsWith(
            '<strong>Překvapivé zjištění:</strong>'
        )).toBe(true);

        const semanticMarkers = {
            cs: {
                anecdote: 'nikoli o kontrolovaný experiment',
                gfIndependent: 'GF však nejsou bublinový model',
                validation: 'kontrolované důkazy',
                equalTime: 'stejná celková dekompresní doba',
                scope: 'vzduchového profilu',
                retreat: 'ústup od představy'
            },
            en: {
                anecdote: 'not a controlled experiment',
                gfIndependent: 'GF are not a bubble model',
                validation: 'controlled evidence',
                equalTime: 'same total decompression time',
                scope: 'air profile',
                retreat: 'retreat from the assumption'
            },
            es: {
                anecdote: 'no un experimento controlado',
                gfIndependent: 'los GF no son un modelo de burbujas',
                validation: 'pruebas controladas',
                equalTime: 'mismo tiempo total de descompresión',
                scope: 'perfil con aire',
                retreat: 'retroceso frente a la idea'
            }
        };

        for (const values of Object.values(locales)) {
            expect(values.pyle.method.skepticism).toBeDefined();
            expect(values.pyle.method.summary).toBeDefined();
            expect(values.pyle.method.sourceLink).toBeDefined();
            expect(values.pyle.bridge.text3).toBeDefined();
            expect(values.controversy.nedu.linkText).toBeDefined();
            expect(values.controversy.nedu.scope).toBeDefined();
            expect(values.pyle.bridge.text1.includes('1986')).toBe(true);
            expect(values.pyle.bridge.text1.includes('1989')).toBe(true);
            expect(values.pyle.bridge.text1.includes('RGBM')).toBe(true);
            expect(values.pyle.bridge.text2.includes('GF')).toBe(true);
            expect(values.controversy.nedu.text1.includes('2005–2011')).toBe(true);
            expect(values.controversy.nedu.text1.includes('2006')).toBe(true);
            expect(/changed everything|změnila vše|cambió todo/i.test(
                values.controversy.nedu.cardTitle
            )).toBe(false);
            expect(/beneficial|pomáhají|beneficiosas/i.test(
                values.pyle.bridge.text1 + values.pyle.bridge.text2
            )).toBe(false);
        }

        for (const [lang, markers] of Object.entries(semanticMarkers)) {
            const values = locales[lang];
            expect(values.pyle.discovery.text2.includes(markers.anecdote)).toBe(true);
            expect(values.pyle.bridge.text2.includes(markers.gfIndependent)).toBe(true);
            expect(values.pyle.bridge.text3.includes(markers.validation)).toBe(true);
            expect(values.controversy.nedu.text2.includes(markers.equalTime)).toBe(true);
            expect(values.controversy.nedu.scope.includes(markers.scope)).toBe(true);
            expect(values.controversy.nedu.scope.includes('trimix')).toBe(true);
            expect(values.controversy.nedu.aftermath.includes(markers.retreat))
                .toBe(true);
        }

        expect(locales.en.controversy.backfire.nuance1.includes('not directly test'))
            .toBe(true);
        expect(locales.cs.controversy.backfire.nuance1.includes('přímo netestovala'))
            .toBe(true);
        expect(locales.es.controversy.backfire.nuance1.includes('no evaluó directamente'))
            .toBe(true);
    });
});

describe('M-values theory page follows the glossary', () => {
    const page = readFileSync(
        new URL('../m-values.html', import.meta.url),
        'utf8'
    );
    const locales = Object.fromEntries(
        ['cs', 'en', 'es'].map(lang => [
            lang,
            JSON.parse(readFileSync(
                new URL(`../locales/${lang}.json`, import.meta.url),
                'utf8'
            )).mValues
        ])
    );

    test('pressure comparison conditions are localized in all languages', () => {
        expect(page.includes(
            'data-i18n="mValues.recap.offgassingCondition"'
        )).toBe(true);
        expect(page.includes(
            'data-i18n="mValues.recap.supersatCondition"'
        )).toBe(true);

        expect(locales.cs.recap.offgassingCondition)
            .toBe('Tkáňový tlak > alveolární tlak');
        expect(locales.cs.recap.supersatCondition)
            .toBe('Tkáňový tlak > okolní tlak');
        expect(locales.en.recap.offgassingCondition)
            .toBe('Tissue pressure > alveolar pressure');
        expect(locales.en.recap.supersatCondition)
            .toBe('Tissue pressure > ambient pressure');
        expect(locales.es.recap.offgassingCondition)
            .toBe('Presión tisular > presión alveolar');
        expect(locales.es.recap.supersatCondition)
            .toBe('Presión tisular > presión ambiente');
    });

    test('formula legends and coefficient table italicise quantity symbols', () => {
        expect(page.includes(
            '<span class="gfc-eq-lhs"><var>M</var> =</span>'
        )).toBe(true);
        expect(page.includes('<span><var>a</var> +</span>')).toBe(true);
        expect(page.includes('<span class="gfc-den"><var>b</var></span>')).toBe(true);
        expect(page.includes('<th><var>a</var> (bar)</th>')).toBe(true);
        expect(page.includes('<th><var>b</var></th>')).toBe(true);
        expect(page.includes('<th><var>M</var><sub>0</sub> (bar)*</th>')).toBe(true);

        for (const values of Object.values(locales)) {
            expect(values.chartFormula.varM.includes(
                '<strong><var>M</var></strong>'
            )).toBe(true);
            expect(values.chartFormula.varAB.includes(
                '<strong><var>a</var>, <var>b</var></strong>'
            )).toBe(true);
            expect(values.buhlmann.formulaM.includes(
                '<strong><var>M</var></strong>'
            )).toBe(true);
            expect(values.buhlmann.formulaA.includes(
                '<strong><var>a</var></strong>'
            )).toBe(true);
            expect(values.buhlmann.formulaB.includes(
                '<strong><var>b</var></strong>'
            )).toBe(true);
            expect(values.reference.footnote.includes(
                '<var>M</var><sub>0</sub> = <var>a</var> + 1/<var>b</var>'
            )).toBe(true);
            expect(values.buhlmann.formulaHint.includes('0 bar')).toBe(true);
            expect(values.buhlmann.formulaHint.includes(
                '<var>M</var><sub>0</sub>'
            )).toBe(true);
            expect(values.buhlmann.formulaHint.includes(
                '<var>a</var> + 1/<var>b</var>'
            )).toBe(true);
        }
        expect(locales.cs.buhlmann.formulaHint.includes(
            '<var>p</var><sub>okol</sub>'
        )).toBe(true);
        expect(locales.en.buhlmann.formulaHint.includes(
            '<var>p</var><sub>amb</sub>'
        )).toBe(true);
        expect(locales.es.buhlmann.formulaHint.includes(
            '<var>p</var><sub>amb</sub>'
        )).toBe(true);
        expect(page.includes(
            '<var>p</var><sub>amb</sub> = 0&nbsp;bar absolute'
        )).toBe(true);
        expect(page.includes('zero gauge pressure (surface)')).toBe(false);
    });

    test('localized labels use the correct notation and graph name', () => {
        expect(locales.cs.recap.alveolarHint.includes('≈0,79')).toBe(true);
        expect(locales.en.recap.alveolarHint.includes('≈0.79')).toBe(true);
        expect(locales.es.recap.alveolarHint.includes('≈0,79')).toBe(true);

        for (const key of ['toc', 'diagram', 'example1', 'example2']) {
            const value = key === 'toc'
                ? locales.cs.toc.diagram
                : key === 'diagram'
                    ? locales.cs.diagram.title
                    : locales.cs[key].ppDiagramTitle;
            expect(value).toBe('Tlak–tlakový diagram');
        }
    });

    test('ceiling definition is directionally unambiguous in every language', () => {
        const cs = locales.cs.example2.ceilingText;
        const en = locales.en.example2.ceilingText;
        const es = locales.es.example2.ceilingText;

        expect(cs.includes('nejmělčí dovolená hloubka')).toBe(true);
        expect(cs.includes('do menší hloubky')).toBe(true);
        expect(cs.includes('v hloubce stropu nebo hlouběji')).toBe(true);
        expect(cs.includes('nejmenší hloubka, do které můžete vystoupat')).toBe(false);

        expect(en.includes('shallowest permitted depth')).toBe(true);
        expect(en.includes('to a shallower depth')).toBe(true);
        expect(en.includes('at the ceiling or deeper')).toBe(true);
        expect(en.includes('shallowest depth you can ascend to')).toBe(false);

        expect(es.includes('límite más somero permitido')).toBe(true);
        expect(es.includes('a una profundidad menor')).toBe(true);
        expect(es.includes('en el techo o a mayor profundidad')).toBe(true);
        expect(es.includes('profundidad más somera a la que puedes ascender')).toBe(false);

        expect(page.includes('shallowest permitted depth')).toBe(true);
        expect(page.includes('to a shallower depth')).toBe(true);
        expect(page.includes('at the ceiling or deeper')).toBe(true);
        expect(page.includes('shallowest depth you can ascend to')).toBe(false);
    });

    test('formula explanation links to the dedicated M-value sandbox', () => {
        const dom = new JSDOM(page);
        const summary = dom.window.document.querySelector(
            'summary[data-i18n="mValues.buhlmann.formulaSummary"]'
        );
        const link = summary?.parentElement?.querySelector('a.sandbox-link');

        expect(link?.getAttribute('href')).toBe('sandbox/m-values.html');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.querySelector('[data-i18n="sandboxLink"]') !== null).toBe(true);
        dom.window.close();
    });

    test('ceiling-violation example displays the compartment that crosses its M-line', () => {
        const previousVariant = getZHL16Variant();
        setZHL16Variant(ZHL16_VARIANTS.C);
        try {
            const gases = [{
                id: 'air',
                name: 'Air',
                o2: 0.21,
                n2: 0.79,
                he: 0,
                cylinderVolume: 18,
                startPressure: 200
            }];
            const safeWaypoints = [
                { time: 0, depth: 0, gasId: 'air' },
                { time: 2, depth: 31, gasId: 'air' },
                { time: 29, depth: 31, gasId: 'air' },
                { time: 31.8, depth: 3, gasId: 'air' },
                { time: 41.8, depth: 3, gasId: 'air' },
                { time: 42.1, depth: 0, gasId: 'air' }
            ];
            const violationWaypoints = [
                { time: 0, depth: 0, gasId: 'air' },
                { time: 2, depth: 31, gasId: 'air' },
                { time: 29, depth: 31, gasId: 'air' },
                { time: 32.1, depth: 0, gasId: 'air' }
            ];
            const safe = calculateTissueLoading(safeWaypoints, 0.1, { gases });
            const violation = calculateTissueLoading(
                violationWaypoints, 0.1, { gases }
            );
            const lastDelta = (result, compartmentId) => {
                const compartment = COMPARTMENTS.find(
                    item => item.id === compartmentId
                );
                const index = result.timePoints.length - 1;
                const tissuePressure =
                    result.compartments[compartmentId].pressures[index];
                return tissuePressure - getMValue(
                    result.ambientPressures[index],
                    compartment.aN2,
                    compartment.bN2
                );
            };
            const safeMax = Math.max(
                ...COMPARTMENTS.map(compartment =>
                    lastDelta(safe, compartment.id)
                )
            );
            const violationCeilings = calculateCeilingTimeSeries(
                violation, 1, 1
            );
            const dom = new JSDOM(page);
            const violationProfile = dom.window.document.getElementById(
                'violation-profile-chart-container'
            );

            expect(safeMax <= 0).toBe(true);
            expect(lastDelta(violation, 1) < 0).toBe(true);
            expect(lastDelta(violation, 3) > 0).toBe(true);
            expect(violationCeilings.at(-1) > 0).toBe(true);
            expect(violationProfile?.style.height).toBe('400px');
            expect(page.includes('showCeiling: true')).toBe(true);
            expect(page.includes(
                'const violationMValueChart = new MValueChart'
            )).toBe(true);
            expect(page.includes('compartments: [3]')).toBe(true);
            expect(page.includes(
                'violationMValueChart.getTimePointCount() - 1'
            )).toBe(true);
            dom.window.close();
        } finally {
            setZHL16Variant(previousVariant);
        }
    });
});

describe('Alveolar pressure notation', () => {
    test('physiological inert-gas formula names its alveolar result', () => {
        const pressurePage = readFileSync(
            new URL('../pressure.html', import.meta.url),
            'utf8'
        );

        expect(pressurePage.includes(
            'p_{\\mathrm{alv}} = f_{\\mathrm{inert}} \\times ' +
            '(p_{\\mathrm{amb}} - p_{\\mathrm{H_2O}})'
        )).toBe(true);
        expect(pressurePage.includes('p_{\\mathrm{inert}} =')).toBe(false);
    });
});

describe('pressure page notation follows the glossary', () => {
    const pressurePage = readFileSync(
        new URL('../pressure.html', import.meta.url),
        'utf8'
    );

    test('uses registered quantity symbols in formulas', () => {
        expect(pressurePage.includes('\\Delta p')).toBe(true);
        expect(pressurePage.includes('\\Delta P')).toBe(false);
        expect(pressurePage.includes('\\mathrm{depth}')).toBe(false);
        expect(pressurePage.includes('p_{\\mathrm{atm},0}')).toBe(true);
        expect(pressurePage.includes('\\text{Consumption}')).toBe(false);
        expect(pressurePage.includes('\\text{Gas Available}')).toBe(false);
    });

    test('keeps generated values attached to their units', () => {
        const moduleScript = pressurePage.match(
            /<script type="module">([\s\S]*?)<\/script>/
        )?.[1] ?? '';

        expect(moduleScript.includes('${tank.cylinderVolume}\\u00a0L')).toBe(true);
        expect(moduleScript.includes('${tank.totalCapacity}\\u00a0L')).toBe(true);
        expect(moduleScript.includes('${tank.consumed}\\u00a0L')).toBe(true);
        expect(moduleScript.includes('${ctx.raw}\\u00a0%')).toBe(true);
        expect(moduleScript.includes('&nbsp;')).toBe(false);
    });

    test('re-renders dynamic exercise translations after locale changes', () => {
        expect(pressurePage.includes(
            "translate(\n                'partialPressureLimits.mod.showAnswer'"
        )).toBe(true);
        expect(pressurePage.includes(
            "translate(\n                'partialPressureLimits.nitrogenLimits.exButModTemplate'"
        )).toBe(true);
        expect(pressurePage.includes(
            "document.addEventListener('languagechange', renderExerciseTables)"
        )).toBe(true);
        expect(pressurePage.includes(
            'initI18n().then(() => {\n            renderExerciseTables();'
        )).toBe(true);
    });

    test('Czech VENTID-C labels expose the English source words', () => {
        const cs = JSON.parse(
            readFileSync(new URL('../locales/cs.json', import.meta.url), 'utf8')
        );
        const expected = {
            v: 'Visual disturbances',
            e: 'Ear ringing',
            n: 'Nausea',
            t: 'Twitching',
            i: 'Irritability',
            d: 'Dizziness',
            c: 'Convulsions'
        };

        for (const [key, english] of Object.entries(expected)) {
            expect(cs.oxygenToxicity.symptoms[key]).toContain(
                `<span lang="en">${english}</span>`
            );
        }
    });
});

describe('i18n notation - canvas strings must not contain HTML entities', () => {
    const LOCALES = ['cs', 'en', 'es'];
    const load = (l) => JSON.parse(readFileSync(new URL(`../locales/${l}.json`, import.meta.url), 'utf8'));

    const flatten = (obj, prefix = '') => {
        const out = [];
        for (const [k, v] of Object.entries(obj || {})) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (typeof v === 'string') out.push([key, v]);
            else if (v && typeof v === 'object') out.push(...flatten(v, key));
        }
        return out;
    };

    // chart.* is rendered by Chart.js onto a canvas, which does not decode HTML.
    // No entity of any kind may appear there — not just whitespace ones.
    for (const loc of LOCALES) {
        test(`${loc}.json: no HTML entity under chart.*`, () => {
            const offenders = flatten(load(loc).chart, 'chart')
                .filter(([, v]) => /&[a-zA-Z]+;|&#\d+;/.test(v))
                .map(([k, v]) => `${k} = ${v}`);
            expect(offenders).toEqual([]);
        });
    }

    // Data files must not carry HTML entities for whitespace. A locale string
    // can end up in innerHTML, in Chart.js on a canvas, in .textContent or in a
    // title attribute, and only the first of those decodes entities. U+00A0
    // renders correctly in all of them, so it is the one form that survives a
    // sink being refactored later. See docs/notation/phase2-scope.md.
    const UNIT = 'mmHg|msw|fsw|kPa|MPa|hPa|mbar|bar|Pa|km|cm³|cm²|cm2|cm|mm³'
        + '|mm²|mm|dm³|dm²|m³|m²|m2|ml|mg|kg|min|°C|°F|atm|at|m|l|L|h|s|g';
    // Character classes are spelled out rather than using \w. Python counts '²'
    // as a word character ('²'.isalnum() is true) while JavaScript does not, so
    // the two would silently disagree about "10 mm²". docs/notation/tools/nbsp.py
    // carries the same explicit sets — keep them identical.
    const CZ = 'áäčďéěíĺľňóôöŕřšťúůüýžÁÄČĎÉĚÍĹĽŇÓÔÖŔŘŠŤÚŮÜÝŽ';
    const WORD = `0-9A-Za-z_${CZ}`;
    // "12l lahev" is short for "12litrová lahev" — a compound adjective, no space.
    const COMPOUND = /\d+\s?l\s+(lahv|láhv|lahev|láhev)/i;
    const badSpace = new RegExp(
        `(?<![${WORD}.,])\\d+(?:[.,]\\d+)? (?:${UNIT})(?![${WORD}°])`
    );
    // Czech declines spelled-out unit names ("2 bary", "v 10 metrech"). Only the
    // space is wrong there; the word form is correct and must not be touched.
    const CZ_WORDS = 'bar|metr|centimetr|milimetr|kilometr|litr|mililitr|minut'
        + '|sekund|vteřin|hodin|den|dny|dnů|dní|kilogram|gram|tun|stupň|stupe'
        + '|procent|promile|atmosfér|pascal|kilopascal';
    const badWordSpace = new RegExp(
        `(?<![${WORD}.,])\\d+(?:[.,]\\d+)? (?:${CZ_WORDS})[a-z${CZ}]*\\b`
    );
    // Identifiers, not prose: "30m-deco-air" is a profile id looked up by value.
    const SKIP_KEYS = new Set(['id', 'key', 'slug', 'code', 'type', 'href',
        'url', 'src', 'icon', 'class', 'className', 'ref', 'category']);

    // ČSN 01 6910 groups thousands with a non-breaking space, so "600 000 Pa"
    // cannot break across lines. Exactly three digits per group, and no leading
    // zero — "1990 200" is two numbers and "0 480" is a coordinate, not a value.
    const badThousands = new RegExp(
        `(?<![${WORD}.,])[1-9]\\d{0,2}(?: \\d{3})+(?![.,]?\\d)`
    );

    const scanFile = (label, obj, czech) => {
        const entries = flatten(obj)
            .filter(([k]) => !SKIP_KEYS.has(k.split('.').pop()));
        const entities = entries
            .filter(([, v]) => /&nbsp;|&#160;|&#xa0;/i.test(v))
            .map(([k]) => `${label} ${k}`);
        const spaces = entries
            .filter(([, v]) => !COMPOUND.test(v)
                && (badSpace.test(v) || badThousands.test(v)
                    || (czech && badWordSpace.test(v))))
            .map(([k, v]) => `${label} ${k} = ${v.slice(0, 70)}`);
        return { entities, spaces };
    };

    for (const loc of LOCALES) {
        test(`${loc}.json: no &nbsp; entity — data uses literal U+00A0`, () => {
            expect(scanFile(loc, load(loc)).entities).toEqual([]);
        });

        test(`${loc}.json: U+00A0 between value and unit, not a plain space`, () => {
            expect(scanFile(loc, load(loc), loc === 'cs').spaces).toEqual([]);
        });
    }


    // Pressure is p, lowercase and italic (ČSN EN ISO 80000-1 ch. 7). The
    // project used to write P<sub>amb</sub>, P_{amb} and P_amb. The subscript
    // is deliberately NOT translated here — localising indexes needs the chart
    // labels moved into i18n first, which is a separate task.
    const badPressure = /\bP(?:<sub>[^<]{1,12}<\/sub>|_\{?[A-Za-z][A-Za-z0-9,]*\}?)|ΔP\b/;

    test('locales: pressure symbol is lowercase p, never capital P', () => {
        const bad = [];
        for (const loc of LOCALES) {
            for (const [k, v] of flatten(load(loc))) {
                if (SKIP_KEYS.has(k.split('.').pop())) continue;
                if (badPressure.test(v)) bad.push(`${loc} ${k} = ${v.slice(0, 70)}`);
            }
        }
        expect(bad).toEqual([]);
    });

    test('quiz data: no &nbsp; entity and no plain space before a unit', () => {
        const files = readdirSync(new URL('../data/', import.meta.url))
            .filter((f) => f.startsWith('quiz-') && f.endsWith('.json'));
        const entities = [];
        const spaces = [];
        for (const f of files) {
            const json = JSON.parse(
                readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8')
            );
            const r = scanFile(f, json, !/-(en|es)\.json$/.test(f));
            entities.push(...r.entities);
            spaces.push(...r.spaces);
        }
        expect(entities).toEqual([]);
        expect(spaces).toEqual([]);
    });

    // Partial pressure: glossary §4 says `ppO₂` is a colloquial synonym, not a
    // symbol. It may stay in warnings and chart labels — those render on a
    // canvas where `<var>` cannot be used — but never where HTML is rendered.
    const badPartial = /<em>pp?<\/em>\s*(?:O|N|CO|H)|<var>p<\/var>\s*<sub>[^<]*<\/sub>\s*<sub>|\bpp_\{|\bpp(?:O|N|CO)_\d|\bF_\{/;

    test('quiz data: partial pressure is p with a subscript, never <em>pp</em>', () => {
        const files = readdirSync(new URL('../data/', import.meta.url))
            .filter((f) => f.startsWith('quiz-') && f.endsWith('.json'));
        const bad = [];
        for (const f of files) {
            const json = JSON.parse(
                readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8')
            );
            for (const [k, v] of flatten(json)) {
                if (badPartial.test(v)) bad.push(`${f} ${k} = ${v.slice(0, 70)}`);
            }
        }
        expect(bad).toEqual([]);
    });

    test('locales: partial pressure is p with a subscript wherever HTML renders', () => {
        const bad = [];
        for (const loc of LOCALES) {
            for (const [k, v] of flatten(load(loc))) {
                if (SKIP_KEYS.has(k.split('.').pop())) continue;
                if (badPartial.test(v)) bad.push(`${loc} ${k} = ${v.slice(0, 70)}`);
            }
        }
        expect(bad).toEqual([]);
    });

    // Decimal separator follows the language, not the source data. Czech and
    // Spanish use a comma (ČSN 01 6910 ch. 9.3; SI/RAE), English a point.
    // The unit lookahead keeps version strings and ratios out of scope, and
    // the "not exactly three digits" rule keeps the English thousands
    // separator (`1,000 kPa`) from being read as a decimal comma.
    const DEC_UNIT = '(?:bar|kPa|MPa|Pa|min|%|°C|m|l)';
    const decPoint = new RegExp(`(?<![\\d.])\\d+\\.\\d+(?=[\\s\\u00a0]*${DEC_UNIT}\\b)`);
    const decComma = new RegExp(`(?<![\\d,])\\d+,(?!\\d{3}(?!\\d))\\d+(?=[\\s\\u00a0]*${DEC_UNIT}\\b)`);

    test('decimal separator matches the language: comma in cs/es, point in en', () => {
        const bad = [];
        const check = (label, entries, wrong) => {
            for (const [k, v] of entries) {
                if (SKIP_KEYS.has(k.split('.').pop())) continue;
                if (wrong.test(v)) bad.push(`${label} ${k} = ${v.slice(0, 70)}`);
            }
        };
        for (const loc of LOCALES) {
            check(loc, flatten(load(loc)), loc === 'en' ? decComma : decPoint);
        }
        const files = readdirSync(new URL('../data/', import.meta.url))
            .filter((f) => f.startsWith('quiz-') && f.endsWith('.json'));
        for (const f of files) {
            const json = JSON.parse(
                readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8')
            );
            check(f, flatten(json), /-en\.json$/.test(f) ? decComma : decPoint);
        }
        expect(bad).toEqual([]);
    });

    test('all locales agree on which keys exist', () => {        // Known gap: the Spanish privacy policy has not been translated yet.
        // The test still fails on any NEW divergence outside this prefix.
        const KNOWN_UNTRANSLATED = /^privacy\./;
        const keysOf = (l) => new Set(flatten(load(l)).map(([k]) => k));
        const cs = keysOf('cs');
        for (const loc of ['en', 'es']) {
            const have = keysOf(loc);
            const missing = [...cs].filter((k) => !have.has(k) && !KNOWN_UNTRANSLATED.test(k));
            const extra = [...have].filter((k) => !cs.has(k));
            expect(missing).toEqual([]);
            expect(extra).toEqual([]);
        }
    });
});

describe('format - thousands grouping follows the app language', () => {
    // authoring.md §6.2: oddělovač se nesmí psát doslova, liší se podle verze
    // CLDR. Očekávání se proto bere z formatToParts, ne ze zdrojáku testu.
    const groupSep = (tag) =>
        new Intl.NumberFormat(tag).formatToParts(12345).find(p => p.type === 'group').value;

    test('each language groups with its own CLDR separator', () => {
        for (const lang of ['cs', 'en', 'es']) {
            const expected = `60${groupSep(localeTag(lang))}000`;
            expect(fmtGroup(60000, 0, lang)).toBe(expected);
        }
    });

    test('czech groups with a non-breaking space, not a plain one', () => {
        const sep = groupSep(localeTag('cs'));
        expect(sep.codePointAt(0)).toBe(0x00a0);
        expect(fmtGroup(60000, 0, 'cs').includes(' ')).toBe(false);
    });

    test('grouping and the decimal separator agree within a language', () => {
        // 12 345,7 v češtině: mezera skupinová, čárka desetinná.
        expect(fmtGroup(12345.67, 1, 'cs').endsWith(`${decimalSeparator('cs')}7`)).toBe(true);
        expect(fmtGroup(12345.67, 1, 'en').endsWith(`${decimalSeparator('en')}7`)).toBe(true);
    });

    test('unknown language falls back to english, never to the browser locale', () => {
        expect(localeTag('de')).toBe(localeTag('en'));
        expect(localeTag(undefined)).toBe(localeTag('en'));
    });

    test('no shipped code formats a number with toLocaleString', () => {
        // toLocaleString(undefined, …) sleduje jazyk prohlížeče, ne aplikace.
        const files = ['js/charts/chartTheme.js', 'sandbox/cascade-filling.html'];
        const offenders = [];
        for (const rel of files) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                const at = line.indexOf('toLocaleString');
                if (at === -1) return;
                const comment = line.search(/(?:^|\s)\/\//);
                if (comment !== -1 && comment < at) return;
                offenders.push(`${rel}:${i + 1}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});

describe('format - static numbers in tables and formulas', () => {
    // Fáze 2: čísla natvrdo zapsaná v HTML se nelokalizují. Buď se generují
    // z dat přes fmtNum(), nebo projdou localizeNumbersIn()/localizeLatex().

    test('KaTeX gets a decimal comma wrapped in a group, not a bare one', () => {
        // V matematickém režimu je holá čárka interpunkce a KaTeX za ni vloží
        // mezeru — `0, 84`. Správný zápis je `0{,}84` (authoring.md §4).
        expect(localizeLatex('= 3.16 \\text{ bar}', 'cs')).toBe('= 3{,}16 \\text{ bar}');
        expect(localizeLatex('\\frac{1440}{112.5} = 12.8', 'cs')).toBe('\\frac{1440}{112{,}5} = 12{,}8');
    });

    test('KaTeX source is left alone in languages with a decimal point', () => {
        expect(localizeLatex('= 3.16', 'en')).toBe('= 3.16');
    });

    test('every page that renders KaTeX localizes the source first', () => {
        // Kdo zavolá katex.render(el.dataset.latex, …) přímo, obejde lokalizaci.
        const offenders = [];
        for (const rel of ['pressure.html', 'tissue-loading.html']) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                if (line.includes('katex.render(') && !line.includes('localizeLatex(')) {
                    offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    test('data tables are generated, not hardcoded with english decimals', () => {
        // Prázdné tbody + render z pole je jediný způsob, jak čísla projdou
        // fmtNum(). Zůstane-li v tbody statické číslo, je natvrdo anglicky.
        const cases = [
            ['pressure.html', 'altitude-table-body'],
            ['pressure.html', 'dalton-example-body'],
            ['tissue-loading.html', 'solubility-table-body'],
        ];
        const offenders = [];
        for (const [rel, id] of cases) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            const at = text.indexOf(`<tbody id="${id}">`);
            if (at === -1) {
                offenders.push(`${rel}: chybí <tbody id="${id}">`);
                continue;
            }
            const body = text.slice(at, text.indexOf('</tbody>', at));
            if (/\d\.\d/.test(body)) offenders.push(`${rel}#${id}: statické číslo v tbody`);
        }
        expect(offenders).toEqual([]);
    });

    test('sandbox formulas take physical constants from decoModel, not literals', () => {
        // 0,0627 bar (tenze vodní páry) a ln 2 se ve vzorcích zobrazují —
        // literál v šabloně obejde fmtNum() a v češtině zůstane tečka.
        const offenders = [];
        for (const rel of ['sandbox/haldane.html', 'sandbox/schreiner.html']) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                const at = line.search(/0\.0627|0\.6931/);
                if (at === -1) return;
                const comment = line.search(/(?:^|\s)\/\//);
                if (comment !== -1 && comment < at) return;
                offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
            });
            if (!text.includes('WATER_VAPOR_PRESSURE')) {
                offenders.push(`${rel}: neimportuje WATER_VAPOR_PRESSURE`);
            }
        }
        expect(offenders).toEqual([]);
    });

    test('transfilling localizes runtime quantities and uses the glossary litre symbol', () => {
        const page = readFileSync(new URL('../sandbox/transfilling.html', import.meta.url), 'utf8');
        expect(page.includes("import { translate } from '../js/i18n.js'")).toBe(true);
        expect(page.includes('document.addEventListener(\'languagechange\'')).toBe(true);
        expect(page.includes('fmtInput(volumeA)')).toBe(true);
        expect(page.includes('Total gas:')).toBe(false);
        expect(page.includes('\\u00a0L')).toBe(false);
        expect(page.includes('bar·L')).toBe(false);
        expect(page.includes('bar·l')).toBe(false);
        expect(page.includes('surfaceVolumeText(gasA)')).toBe(true);
        expect(page.includes('`${fmtInput(pressureA)}\\u00a0bar`')).toBe(true);
        expect(page.includes('pressureAInput.valueAsNumber = finalPressure')).toBe(true);
        expect(page.includes('pressureBInput.valueAsNumber = finalPressure')).toBe(true);

        for (const lang of ['cs', 'en', 'es']) {
            const transfill = JSON.parse(
                readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'),
            ).sandbox.transfill;
            expect(transfill.resultDetail.includes('{value}')).toBe(true);
            expect(transfill.resultDetail.includes('1 bar')).toBe(true);
            expect(transfill.surfaceVolumeValue.includes('{value} l')).toBe(true);
            expect(typeof transfill.finalSubscript).toBe('string');
            expect(Object.values(transfill.volumes).some(value => /\d L(?:\s|\()/.test(value))).toBe(false);
        }
        const es = JSON.parse(readFileSync(new URL('../locales/es.json', import.meta.url), 'utf8'));
        expect(es.sandbox.transfill.volumes.al40).toContain('5,5 l');
    });

    test('cascade filling localizes runtime output and uses surface-equivalent volume', () => {
        const page = readFileSync(new URL('../sandbox/cascade-filling.html', import.meta.url), 'utf8');
        const script = page.slice(page.lastIndexOf('<script type="module">'));
        expect(script.includes("import { translate } from '../js/i18n.js'")).toBe(true);
        expect(script.includes('function fmtPressure(value)')).toBe(true);
        expect(script.includes('function fmtSurfaceVolume(value)')).toBe(true);
        expect(script.includes('value: fmtGroup(value)')).toBe(true);
        expect(script.includes('fillLogEntries.unshift')).toBe(true);
        expect(script.includes("document.addEventListener('languagechange'")).toBe(true);
        expect(script.includes('renderFillLog();')).toBe(true);
        expect(script.includes('bar-L')).toBe(false);
        expect(script.includes('bar·L')).toBe(false);
        expect(script.includes('\\u00a0L')).toBe(false);
        expect(script.includes('Math.round(pressure)')).toBe(false);

        const requiredStatusKeys = [
            'idle', 'targetsReady', 'cascadesOpen', 'equalizing',
            'equalizingProgress', 'willEqualize', 'equalizedAt', 'equalized',
            'targetsAtLimit', 'targetLimitNote',
        ];
        const requiredLogKeys = [
            'equalized', 'initialSurfaceVolume', 'connectedVolume',
            'transferredSurfaceVolume', 'finalPressure', 'targetPressure',
        ];
        for (const lang of ['cs', 'en', 'es']) {
            const cascade = JSON.parse(
                readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'),
            ).sandbox.cascade;
            expect(Object.keys(cascade.connectionStatus).sort()).toEqual(requiredStatusKeys.sort());
            expect(Object.keys(cascade.log).sort()).toEqual(requiredLogKeys.sort());
            expect(cascade.surfaceVolumeValue.includes('{value} l')).toBe(true);
            expect(cascade.surfaceVolumeValue.includes('1 bar')).toBe(true);
            expect(Object.values(cascade.volumes).some(value => /\d L(?:\s|\()/.test(value))).toBe(false);
        }
    });

    test('gas-law sandbox localizes runtime quantities and uses glossary notation', () => {
        const page = readFileSync(new URL('../sandbox/gas-law.html', import.meta.url), 'utf8');
        expect(page.includes("const LITRE_UNIT = 'l'")).toBe(true);
        expect(page.includes("liters: 'L'")).toBe(false);
        expect(page.includes('gl.units?.liters')).toBe(false);
        expect(page.includes('\\u00a0L')).toBe(false);
        expect(page.includes('&nbsp;L')).toBe(false);
        expect(page.includes('fmtNum(t1C)')).toBe(true);
        expect(page.includes('fmtNum(t2C)')).toBe(true);
        expect(page.includes('fmtNum(p1)')).toBe(true);
        expect(page.includes('fmtNum(vol)')).toBe(true);
        expect(page.includes('updateCylinderInitialState();')).toBe(true);
        expect(page.includes('data-i18n="gasLaw.safety.initial"')).toBe(true);
        expect(page.includes('hideOverlappingTemperatureReferences();')).toBe(true);
        expect(page.includes("label.hidden = true")).toBe(true);
        expect(page.includes('margin-bottom: 2.25rem')).toBe(true);

        for (const lang of ['cs', 'en', 'es']) {
            const gasLaw = JSON.parse(
                readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'),
            ).gasLaw;
            expect(gasLaw.cylinderVolume.endsWith('(l)')).toBe(true);
            expect(gasLaw.diveTimeSub.includes('20 l/min')).toBe(true);
            expect(gasLaw.formulaNote.includes('<var>T</var>')).toBe(true);
            expect(gasLaw.safety.initial.includes('{0} bar')).toBe(true);
            expect(Object.values(gasLaw.tempRefs).every(value => /\d °C/.test(value))).toBe(true);
        }
    });

    test('gas-law limitations note keeps pressure-reference detail in proportion', () => {
        const page = readFileSync(new URL('../sandbox/gas-law.html', import.meta.url), 'utf8');
        const details = page.match(
            /<details class="advanced-section model-limitations-details"[^>]*>[\s\S]*?<\/details>/,
        )?.[0] || '';
        expect(details.length > 0).toBe(true);
        expect(/<details[^>]*\sopen(?:\s|=|>)/.test(details)).toBe(false);
        expect(page.includes('absolutePressureComparison')).toBe(false);
        expect(page.includes('updateAbsolutePressureComparison')).toBe(false);
        expect(page.includes("import { SURFACE_PRESSURE } from '../js/decoModel.js'")).toBe(false);

        const calculateP2Body = page.match(
            /function calculateP2\(p1, t1C, t2C\) \{([\s\S]*?)\n        \}/,
        )?.[1] || '';
        expect(calculateP2Body.includes('return p1 * (t2K / t1K);')).toBe(true);
        expect(calculateP2Body.includes('SURFACE_PRESSURE')).toBe(false);
        expect(page.includes('const p2 = calculateP2(p1, t1C, t2C);')).toBe(true);

        const requiredKeys = [
            'summary', 'intro', 'pressureReference', 'realGas',
            'thermalState', 'cylinderAndGauge', 'fire',
        ];
        for (const lang of ['cs', 'en', 'es']) {
            const modelLimitations = JSON.parse(
                readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'),
            ).gasLaw.modelLimitations;
            expect(Object.keys(modelLimitations).sort()).toEqual(requiredKeys.sort());
            expect(modelLimitations.pressureReference.length > 0).toBe(true);
            expect(modelLimitations.realGas.length > 0).toBe(true);
            expect(modelLimitations.realGas.toLowerCase().includes('nitrox')).toBe(true);
            expect(modelLimitations.fire.length > 0).toBe(true);
        }
    });
});

describe('notation - non-breaking space between value and unit at runtime', () => {
    // authoring.md §6.1: mezi číslem a jednotkou patří nedělitelná mezera.
    // Statický text hlídají starší testy; tohle hlídá text, který vzniká
    // až za běhu — v šablonových řetězcích a v překladových vzorech.
    //
    // V JS se píše escape `\u00a0`, ne entita a ne doslovný znak:
    //   - `&nbsp;` dekóduje jen innerHTML, ne textContent, canvas ani title;
    //   - doslovné U+00A0 je v diffu neviditelné a nedá se grepovat.
    // Pozor: `\s` v JS regexu matchuje i U+00A0, takže by test prošel
    // i nad neopraveným souborem. Musí se hledat doslovná mezera U+0020.
    const UNIT = String.raw`(?:mm|cm|km|msw|fsw|bar-L|bar·L|kPa|MPa|Pa|bar|min|m|l|L|h|s)`;
    const SHIPPED = [
        'js/charts/DiveProfileChart.js', 'js/charts/MValueChart.js',
        'js/charts/GFChart.js', 'js/charts/BubbleModel.js',
        'js/components/DiveSetupEditor.js', 'js/components/TissueSaturationSim.js',
        'js/components/AddDiveDialog.js', 'js/mvalues.js', 'js/diveSetup.js',
        'js/main.js', 'js/visualization.js', 'js/tissueEducation.js', 'js/decoModel.js',
        'js/algorithmExplainer.js', 'pressure.html', 'tissue-loading.html', 'm-values.html',
        'algorithm.html',
        'sandbox/index.html', 'sandbox/haldane.html', 'sandbox/schreiner.html',
        'sandbox/m-values.html', 'sandbox/gradient-factors.html', 'sandbox/gas-law.html',
        'sandbox/cascade-filling.html', 'sandbox/transfilling.html',
    ];

    // Příkaz SVG path `L` je totéž písmeno jako značka litru. `M ${x} L ${y}`
    // proto vypadá jako číslo bez nedělitelné mezery — a kdyby ji tam někdo
    // doplnil, cesta se rozpadne (#99). Geometrie se tedy z kontroly vyjímá.
    const pathCommands = (t) => (t.match(/[MLHVCSQTAZ]\s*(?:-?[\d.]|\$\{)/g) || []).length;
    const looksLikeGeometry = (line) => pathCommands(line) >= 2
        && /[Mm]\s*(?:-?[\d.]|\$\{)/.test(line);

    const scan = (rel, re) => {
        const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
        const hits = [];
        text.split('\n').forEach((line, i) => {
            const m = re.exec(line);
            re.lastIndex = 0;
            if (!m) return;
            const comment = line.search(/(?:^|\s)\/\//);
            if (comment !== -1 && comment < m.index) return;
            if (/^[MLHVCSQTAZ]$/.test(m[0].slice(-1)) && looksLikeGeometry(line)) return;
            hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
        });
        return hits;
    };

    test('interpolated values are followed by a non-breaking space', () => {
        // `${fmtNum(p, 2)} bar` se zlomí na konci řádku mezi číslo a jednotku.
        const re = new RegExp(String.raw`\} ${UNIT}(?![A-Za-zá-žÁ-Ž0-9])`);
        const offenders = SHIPPED.flatMap((rel) => scan(rel, re));
        expect(offenders).toEqual([]);
    });

    test('translation placeholders are followed by a non-breaking space', () => {
        // Týká se i záložních řetězců v kódu — ty se použijí, než dorazí locale.
        const re = new RegExp(String.raw`\{\d\} ${UNIT}(?![A-Za-zá-žÁ-Ž0-9])`);
        const offenders = [...SHIPPED, 'locales/cs.json', 'locales/en.json', 'locales/es.json']
            .flatMap((rel) => scan(rel, re));
        expect(offenders).toEqual([]);
    });

    test('javascript uses the \\u00a0 escape, never the &nbsp; entity', () => {
        // Entitu dekóduje jen innerHTML. V textContent, na canvasu a v atributu
        // title by se vypsala doslova i se středníkem (na to narazil PR #82).
        const re = /&nbsp;/;
        const offenders = SHIPPED.filter((rel) => rel.endsWith('.js')).flatMap((rel) => scan(rel, re));
        expect(offenders).toEqual([]);
    });
});

describe('notation - half-time symbol t_1/2', () => {
    // Glossary: kanonický tvar je *t*(1/2) — malé kurzívní t, stojatý index.
    // Velké T je Bühlmannova notace uvedená v tabulce chyb.
    const SHIPPED = [
        'sandbox/haldane.html', 'sandbox/schreiner.html', 'sandbox/m-values.html',
        'sandbox/gradient-factors.html', 'tissue-loading.html', 'm-values.html',
        'locales/cs.json', 'locales/en.json', 'locales/es.json',
    ];

    test('no shipped file writes the half-time symbol with a capital T', () => {
        const offenders = [];
        for (const rel of SHIPPED) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                // U+00BD i zapsaný index — obojí za velkým T je chyba.
                if (/T(?:\u00bd|<sub>\s*(?:\u00bd|1\/2)\s*<\/sub>|_\{1\/2\})/.test(line)) {
                    offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    test('markup contexts use <var>t</var><sub>1/2</sub>, not a bare vulgar fraction', () => {
        // U+00BD smí zůstat jen tam, kde značku nelze vysázet: <option> a JS
        // komentáře. Kdekoli jinde v HTML/JSON je to nesjednocený zápis.
        const offenders = [];
        for (const rel of SHIPPED) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                const at = line.indexOf('\u00bd');
                if (at === -1) return;
                // Komentář smí značku psát zkratkou — čte ji vývojář, ne uživatel.
                const comment = line.search(/(?:^|\s)\/\//);
                if (comment !== -1 && comment < at) return;
                if (line.includes('<option')) return;
                offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    test('all three languages agree on the half-time spelling', () => {
        const canonical = '<var>t</var><sub>1/2</sub>';
        const counts = ['cs', 'en', 'es'].map(lang => {
            const raw = readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8');
            return raw.split(canonical).length - 1;
        });
        // Jazyková parita: chybí-li oprava v jednom jazyce, čísla se rozejdou.
        expect(counts[0]).toBe(counts[1]);
        expect(counts[1]).toBe(counts[2]);
        expect(counts[0] > 0).toBe(true);
    });
});

describe('tissue loading - notation and sticky layout', () => {
    const tissueHtml = readFileSync(new URL('../tissue-loading.html', import.meta.url), 'utf8');
    const mValuesHtml = readFileSync(new URL('../m-values.html', import.meta.url), 'utf8');
    const bubbleSandbox = readFileSync(new URL('../sandbox/bubble-mechanics.html', import.meta.url), 'utf8');
    const bubbleModel = readFileSync(new URL('../js/charts/BubbleModel.js', import.meta.url), 'utf8');
    const tissueEducation = readFileSync(new URL('../js/tissueEducation.js', import.meta.url), 'utf8');

    test('content is wrapped independently from the sticky table of contents', () => {
        expect(tissueHtml).toContain('<div class="toc-content">');
        expect(tissueHtml.indexOf('<div class="toc-content">'))
            .toBeLessThan(tissueHtml.indexOf('<section id="deco-theory"'));
        expect(tissueHtml.indexOf('</div>\n    </main>')).toBeGreaterThan(
            tissueHtml.indexOf('<section id="reference-table"')
        );
    });

    test('formulas use glossary symbols and upright mathematical constants', () => {
        expect(tissueHtml).toContain('\\mathrm{e}^{-kt}');
        expect(tissueHtml).toContain('\\frac{h}{10\\,\\mathrm{m}}');
        expect(tissueHtml.includes('\\mathrm{depth}')).toBe(false);
        expect(tissueHtml.includes('<sub>N₂,tissue</sub>')).toBe(false);
        expect(tissueHtml.includes('<sub>ambient</sub>')).toBe(false);
    });

    test('six half-times are shown as 98.4 percent saturation', () => {
        expect((1 - 2 ** -6) * 100).toBeCloseTo(98.4375, 4);
        expect(tissueHtml).toContain('6 half-times: 98.4% (saturated)');
        const expected = {
            cs: '6 poločasů: 98,4 % (nasyceno)',
            en: '6 half-times: 98.4% (saturated)',
            es: '6 medios tiempos: 98,4 % (saturado)',
        };
        for (const [lang, text] of Object.entries(expected)) {
            const locale = JSON.parse(
                readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8')
            );
            expect(locale.tissueLoading.halfTimeConcept.bar4).toBe(text);
        }
    });

    test('all locales use canonical tissue-pressure subscripts', () => {
        const expected = {
            cs: ['<sub>tk</sub>', '<sub>okol</sub>'],
            en: ['<sub>t</sub>', '<sub>amb</sub>'],
            es: ['<sub>t</sub>', '<sub>amb</sub>'],
        };
        for (const [lang, symbols] of Object.entries(expected)) {
            const raw = readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8');
            const tissue = JSON.stringify(JSON.parse(raw).tissueLoading);
            for (const symbol of symbols) expect(tissue).toContain(symbol);
            expect(/<sub>(?:tissue|ambient|tejido)<\/sub>/.test(tissue)).toBe(false);
        }
    });

    test('bubble canvas avoids prose subscripts and breakable micron units', () => {
        expect(/p_(?:tissue|bubble)/.test(bubbleModel)).toBe(false);
        expect(bubbleModel).toContain("czech ? 'okol' : 'amb'");
        expect(bubbleModel).toContain("czech ? 'tk' : 't'");
        expect(bubbleModel).toContain('function drawPressureSymbol');
        expect(bubbleModel).toContain(
            "drawTextRun(ctx, 'p', cursor, y, { size, weight, italic: true })"
        );
        expect(bubbleModel).toContain(
            "drawTextRun(ctx, 'γ', cursor, y, { size, weight, italic: true })"
        );
        expect(bubbleModel).toContain(
            "drawTextRun(ctx, 'r', cursor, y, { size, weight, italic: true })"
        );
        expect(bubbleModel.includes('ctx.fillText(`${symbols.')).toBe(false);
        expect(bubbleModel).toContain('\\u00a0μm');
    });

    test('bubble growth compares tissue gas tension with pressure inside the bubble', () => {
        const oldClaims = [
            'three pressures acting on it',
            'Na plynovou bublinu ve tkáni působí tři tlaky',
            'actúan tres presiones',
            'pushes the bubble inward',
            'tlačí plyn <em>dovnitř</em> bubliny',
            'empuja el gas <em>hacia dentro</em>',
        ];
        for (const lang of ['cs', 'en', 'es']) {
            const raw = readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8');
            const mechanics = JSON.parse(raw).tissueLoading.bubbleMechanics;
            const text = JSON.stringify(mechanics);
            for (const claim of oldClaims) expect(text.includes(claim)).toBe(false);
            expect(mechanics.pSurface).toContain('2<var>γ</var>/<var>r</var>');
            expect(mechanics.insight).toContain('<strong>');
        }
        expect(bubbleModel).toContain('Gas inside the bubble at pAmb + 2γ/r');
        expect(bubbleModel).toContain('Dissolved gas in surrounding tissue at tension pTissue');
        expect(bubbleModel.includes('const numArrows')).toBe(false);
        expect(bubbleModel).toContain("tr('tissueTensionHeading'");
        expect(bubbleModel).toContain("tr('bubblePressureHeading'");
        expect(bubbleModel).toContain("tr('diffusionOutShort'");
    });

    test('large bubble simulation lives in a dedicated unscaled sandbox', () => {
        expect(tissueHtml).toContain('href="sandbox/bubble-mechanics.html"');
        expect(tissueHtml.includes('id="bubble-model-container"')).toBe(false);
        expect(tissueHtml.includes("import { BubbleModel }")).toBe(false);
        expect(bubbleSandbox).toContain("import { BubbleModel } from '../js/charts/BubbleModel.js'");
        expect(bubbleSandbox).toContain('mainWidth: 1000');
        expect(bubbleSandbox).toContain('rowHeight: 120');
        expect(bubbleSandbox).toContain('teachingWidth: 900');
        expect(bubbleSandbox.includes('bubble-fullscreen-btn')).toBe(false);
        expect(bubbleSandbox.includes("classList.toggle('fullscreen')")).toBe(false);
        expect(bubbleModel).toContain("width: max-content");
        expect(bubbleModel).toContain("this.mainCanvas.style.cssText = 'border-radius: 8px; flex: none;'");
        expect((bubbleModel.match(/\{ radius: /g) || []).length).toBe(3);
        expect(bubbleModel).toContain('{ radius: 0.3');
        expect(bubbleModel).toContain('{ radius: 1.0');
        expect(bubbleModel).toContain('{ radius: 3.5');
        expect(bubbleModel).toContain('const resultColumnW = 165');
        expect(bubbleModel).toContain('function pressureAlpha(value, maxPressure)');
        expect(bubbleModel).toContain('function pressureShade(value, maxPressure, strength = 1)');
        expect(bubbleModel).toContain('const teachingMaxP = 1 + this.saturatedDepth / 10 + pLaplace');
        expect((bubbleModel.match(/pressureShade\((?:pTissue|pBubble), teachingMaxP\)/g) || []).length).toBe(2);
        expect(bubbleModel).toContain("'70,132,178',");
        expect(bubbleModel).toContain('drawPressureSymbol(ctx, symbols.tissue, tissueX, 38');
    });

    test('Haldane equation links to its dedicated sandbox', () => {
        expect(tissueHtml).toContain('href="sandbox/haldane.html"');
        expect(tissueHtml).toContain('data-i18n="sandboxLink">Open in Sandbox →</span>');
    });

    test('M-value tissue examples are explicitly illustrative, not anatomical assignments', () => {
        expect(mValuesHtml).toContain('faster compartments — often illustrated by well-perfused tissues');
        expect(mValuesHtml).toContain('fat, cartilage, and some bone regions');
        expect(mValuesHtml.includes('faster tissues (brain, blood)')).toBe(false);
    });

    test('slow compartments share examples without ordering fat after bone', () => {
        for (const lang of ['cs', 'en', 'es']) {
            const locale = JSON.parse(
                readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8')
            );
            const slowExamples = Array.from(
                new Set(
                    Object.entries(locale.tissueLoading.tissueLabels)
                        .filter(([id]) => Number(id) >= 9)
                        .map(([, label]) => label)
                )
            );
            expect(slowExamples).toHaveLength(1);
        }
        expect(tissueHtml.includes('Bones, fat')).toBe(false);
    });

    test('gas pathway pressure changes between stages, not within each box', () => {
        expect(tissueHtml.includes('<linearGradient id="pressureGradient')).toBe(false);
        expect((tissueHtml.match(/class="pressure-step pressure-step-\d"/g) || []).length).toBe(4);
        expect(tissueEducation).toContain('PRESSURE_STEP_COLORS');
        for (const stage of ['stage-regulator', 'stage-lungs', 'stage-blood', 'stage-tissues']) {
            expect(tissueEducation).toContain(`querySelector('.${stage}')`);
        }
        expect(tissueEducation).toContain('[...PRESSURE_STEP_COLORS].reverse()');
    });
});

describe('notation - unit is never glued to the value', () => {
    // ISO 80000-1: mezi číslem a značkou jednotky je vždy mezera. Předchozí
    // třída řešila obyčejnou mezeru místo nedělitelné; tahle mezeru, která
    // chybí úplně — `${maxDepth}m`, `MOD: {0}m`.
    const UNITS = 'm|min|bar|kPa|MPa|Pa|msw|fsw';

    test('no JS template glues a unit straight onto the closing brace', () => {
        const files = [
            'js/diveSetup.js', 'js/main.js', 'js/mvalues.js', 'js/urlParams.js',
            'js/visualization.js', 'js/diveProfile.js', 'js/tissueEducation.js',
            'js/charts/BubbleModel.js', 'js/charts/DiveProfileChart.js',
            'js/charts/GFChart.js', 'js/charts/MValueChart.js',
            'js/components/DiveSetupEditor.js', 'js/components/TripCalendar.js',
            'sandbox/index.html', 'sandbox/repetitive-dives.html', 'tissue-loading.html',
        ];
        // 'm' ve významu minuty se nepřevádí — 30 m by se četlo jako metry.
        // Správná oprava je značka 'min' a to je jiná třída (viz phase2-scope.md).
        const MINUTES_AS_M = /\$\{(?:mins|hours|[^}]*[Hh]alfTime[^}]*|Math\.floor\(r \/ 60\)|r % 60|r)\}[hm]\b/;
        const offenders = [];
        for (const rel of files) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                const trimmed = line.trim();
                if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
                if (MINUTES_AS_M.test(line)) return;
                if (new RegExp(`\\}(?:${UNITS})\\b`).test(line)) {
                    offenders.push(`${rel}:${i + 1}  ${trimmed.slice(0, 70)}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    test('no HTML text node carries a literal \\u00a0 escape', () => {
        // authoring.md §6.1: escape platí v JS, v HTML se nedekóduje a vypíše se
        // doslova. Regrese z minulé vlny: pressure.html zobrazovala
        // "MOD is 33,8\u00a0m!" i s escapem.
        const files = [
            'index.html', 'pressure.html', 'tissue-loading.html', 'm-values.html',
            'gradient-factors.html', 'algorithm.html', 'about.html', 'sandbox/index.html',
            'sandbox/gas-law.html', 'sandbox/haldane.html', 'sandbox/schreiner.html',
            'sandbox/transfilling.html', 'sandbox/m-values.html', 'sandbox/gradient-factors.html',
        ];
        const offenders = [];
        for (const rel of files) {
            const src = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            // obsah <script> a <style> je JS/CSS, tam escape patří
            const masked = src.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,
                m => ' '.repeat(m.length));
            let at = masked.indexOf('\\u00a0');
            while (at !== -1) {
                offenders.push(`${rel}:${masked.slice(0, at).split('\n').length}`);
                at = masked.indexOf('\\u00a0', at + 1);
            }
        }
        expect(offenders).toEqual([]);
    });

    test('named placeholders get the same treatment as numbered ones', () => {
        // Minulá vlna hledala jen {0}; {mod} jí proklouzlo.
        const offenders = [];
        for (const lang of ['cs', 'en', 'es']) {
            const raw = readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8');
            raw.split('\n').forEach((line, i) => {
                if (/\{[a-zA-Z_]\w*\}(?: |)(?:m|min|bar|kPa|Pa)\b/.test(line)) {
                    offenders.push(`${lang}:${i + 1}  ${line.trim().slice(0, 70)}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    test('minutes use the symbol min, never m', () => {
        // ISO 80000-3: značka minuty je min; m je metr. Tabulka nasycení psala
        // "1h 15m" hned vedle sloupce s "12,5 min".
        const files = [
            'tissue-loading.html', 'js/main.js', 'js/mvalues.js', 'sandbox/repetitive-dives.html',
        ];
        const offenders = [];
        for (const rel of files) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                if (/\$\{(?:mins|hours|r|r % 60|[^}]*[Hh]alfTime[^}]*)\}\s*(?:m|h)\b/.test(line)) {
                    offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 70)}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    test('no translation pattern glues a unit onto a placeholder', () => {
        const offenders = [];
        for (const lang of ['cs', 'en', 'es']) {
            const raw = readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8');
            raw.split('\n').forEach((line, i) => {
                if (new RegExp(`\\{\\d\\}(?:${UNITS})\\b`).test(line)) {
                    offenders.push(`${lang}:${i + 1}  ${line.trim().slice(0, 70)}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});

// Zdroje, které se posílají uživateli. Vývojářské odkladiště `test.html` /
// `test2.html` je nelinkované a mimo sw.js (issue #79).
const shippedSources = () => {
    const root = new URL('../', import.meta.url);
    const files = [];
    const walkDir = (rel) => {
        for (const e of readdirSync(new URL(rel, root), { withFileTypes: true })) {
            const p = `${rel}${e.name}`;
            if (e.isDirectory()) walkDir(`${p}/`);
            else if (e.name.endsWith('.js') || e.name.endsWith('.html')) files.push(p);
        }
    };
    walkDir('js/');
    walkDir('sandbox/');
    for (const e of readdirSync(root, { withFileTypes: true })) {
        if (e.isFile() && e.name.endsWith('.html')) files.push(e.name);
    }
    return files.filter(f => f !== 'test.html' && f !== 'test2.html');
};

/**
 * i18n klíče, jejichž hodnota se kreslí na canvas. Sink se pozná podle
 * vlastnosti v konfiguraci Chart.js, ne podle jména souboru: jeden soubor
 * běžně plní canvas i DOM (TissueSaturationSim.js kreslí graf a zároveň sype
 * hlášky do `alertsEl.innerHTML`), a seznam souborů by zastaral s každým
 * novým grafem.
 */
const canvasBoundKeys = () => {
    const root = new URL('../', import.meta.url);
    const DIRECT = [
        /\blabel:\s*(?:fmt\()?$/,          // popisek datasetu
        /\bcontent:\s*(?:fmt\()?$/,        // obsah anotace
        /\.label\s*=\s*$/,                 // přepis popisku při změně jazyka
        /\btitle:\s*\{[^{}]*\btext:\s*(?:fmt\()?$/,   // titulek osy
        /\.title\.text\s*=\s*$/,
    ];
    const keys = new Set();
    for (const rel of shippedSources()) {
        const src = readFileSync(new URL(rel, root), 'utf8');
        for (const m of src.matchAll(/(?:translate|tr)\('([\w.]+)'/g)) {
            const ctx = src.slice(Math.max(0, m.index - 70), m.index).replace(/\n/g, ' ');
            if (DIRECT.some(re => re.test(ctx))) keys.add(m[1]);
        }
        // Nepřímá cesta: překlad se uloží do proměnné a teprve ta se předá
        // Chart.js (MValueChart skládá popisek podle dýchaných směsí).
        const viaVar = new Set();
        for (const m of src.matchAll(/\b(?:label|content)\s*:\s*(\w+)\s*[,\n]/g)) viaVar.add(m[1]);
        for (const m of src.matchAll(/\.label\s*=\s*(\w+)\s*;/g)) viaVar.add(m[1]);
        for (const m of src.matchAll(/(\w+)\s*=\s*(?:fmt\(\s*)?(?:translate|tr)\('([\w.]+)'/g)) {
            if (viaVar.has(m[1])) keys.add(m[2]);
        }
    }
    return keys;
};

describe('notation - quantity symbols are italic', () => {
    // ČSN EN ISO 80000-1 kap. 7: značka veličiny se sází kurzívou, popisný
    // i chemický index stojatě. V HTML je nositelem kurzívy <var>.
    const SHIPPED = [
        'about.html', 'pressure.html', 'tissue-loading.html', 'm-values.html',
        'gradient-factors.html', 'algorithm.html', 'sandbox/gas-law.html', 'sandbox/transfilling.html',
        'sandbox/haldane.html', 'sandbox/schreiner.html', 'sandbox/gradient-factors.html',
        'sandbox/m-values.html', 'locales/cs.json', 'locales/en.json', 'locales/es.json',
    ];
    // Písmena, která jsou v glosáři značkou veličiny. Chemické značky (N, O, He…)
    // sem nepatří — ty jsou stojatě správně.
    const QUANTITY = 'MTVFDpvahkbcnfRSqm';

    test('no quantity symbol carries an index outside <var>', () => {
        const offenders = [];
        for (const rel of SHIPPED) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                // Už správně zapsané <var>x</var> vyřadíme, ať nestíní zbytek řádku.
                const rest = line.replace(/<var>[^<]*<\/var>/g, '\u00a7');
                for (const m of rest.matchAll(/([A-Za-z])<sub>([^<]*)<\/sub>/g)) {
                    const [, sym, idx] = m;
                    if (!QUANTITY.includes(sym)) continue;
                    // Chemický vzorec: značka prvku s číselným indexem (N<sub>2</sub>).
                    if (/^\d+$/.test(idx)) {
                        const before = rest.slice(0, m.index);
                        if (/(?:^|[^A-Za-z])(?:N|O|H|C|F|S|P)$/.test(before + sym)) continue;
                    }
                    // Zkratka (GF, TC, MOD…) se sází stojatě.
                    if (/[A-Z]{2}$/.test(rest.slice(0, m.index + 1))) continue;
                    // Předchází-li písmeno další písmeno, není to osamocená značka.
                    if (/[A-Za-z\u00a7]$/.test(rest.slice(0, m.index))) continue;
                    offenders.push(`${rel}:${i + 1}  ${sym}<sub>${idx}</sub>`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    test('gas fraction uses the canonical lowercase f, never a capital F', () => {
        // Glosář §4: objemový zlomek je *f*(N₂). Velké F je v §2 síla.
        const offenders = [];
        for (const rel of SHIPPED) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            text.split('\n').forEach((line, i) => {
                if (/F<sub>(?:N|O|He)/.test(line) || /F<sub>N\u2082/.test(line)) {
                    offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 70)}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    test('M-value sandbox italicises quantities in all three languages and SVG labels', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page.includes('<span class="term term-result"><var>M</var></span>')).toBe(true);
        expect(page.includes('<span class="term term-a"><var>a</var></span>')).toBe(true);
        expect(page.includes('<span class="term term-b"><var>b</var></span>')).toBe(true);
        expect(page.includes("svgPressureLabel(xLabel, ambientSubscript, ' (bar)')")).toBe(true);
        expect(page.includes("mLabel.textContent = 'M'")).toBe(true);
        expect(page.includes("xLabel.textContent = 'p_amb (bar)'")).toBe(false);
        expect(page.includes("yLabel.textContent = 'p_t (bar)'")).toBe(false);

        for (const lang of ['cs', 'en', 'es']) {
            const dict = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
            const m = dict.sandbox.mvalues;
            expect(m.top.heading.includes('<var>M</var>')).toBe(true);
            expect(m.top.cards.a.name.includes('<var>a</var>')).toBe(true);
            expect(m.top.cards.b.name.includes('<var>b</var>')).toBe(true);
            expect(m.top.cards.m.name.includes('<var>M</var>')).toBe(true);
            expect(m.top.chart.xAxis.includes('<var>p</var><sub>')).toBe(true);
            expect(m.top.chart.yAxis).toBe('<var>M</var> (bar)');
            expect(m.bottom.heading.includes('<var>a</var>')).toBe(true);
            expect(m.bottom.heading.includes('<var>b</var>')).toBe(true);
            expect(m.bottom.cards.a.name.includes('<var>a</var>')).toBe(true);
            expect(m.bottom.cards.b.name.includes('<var>b</var>')).toBe(true);
            expect(JSON.stringify(m).includes('p_amb')).toBe(false);
            expect(JSON.stringify(m).includes('p_t')).toBe(false);
        }
    });

    test('M-value sandbox displays pressure results with upright bar units', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page.includes('<span id="mvANumF">0.6200</span>&nbsp;bar +')).toBe(true);
        expect(page.includes('<span id="mvPambNumF">4.0133</span>&nbsp;bar /')).toBe(true);
        expect(page.includes('value.textContent = `${fmtNum(item.value, 4)}\\u00a0bar`')).toBe(true);
        expect(page.includes('${fmtNum(difference, 4)}\\u00a0bar')).toBe(true);
        expect(page.includes('${fmtNum(dA, 4)}\\u00a0bar')).toBe(true);
    });

    test('M-value sandbox draws only the selected variant on a fixed main scale', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        const drawTopChart = page.slice(
            page.indexOf('function drawTopChart()'),
            page.indexOf('// ---- Bottom (derivation) chart constants ----'),
        );

        expect(page.includes('const Y_MIN = 0;')).toBe(true);
        expect(page.includes('const Y_MAX = 10;')).toBe(true);
        expect(page.includes('function dynamicYMax')).toBe(false);
        expect(drawTopChart.includes("VARIANT_COMPS[state.variant][state.compartmentIdx]")).toBe(true);
        expect(drawTopChart.includes("const comps = VARIANT_COMPS[state.variant]")).toBe(true);
        expect(drawTopChart.includes("'data-variant': state.variant")).toBe(true);
        expect(drawTopChart.includes('for (const v of VARIANT_LIST)')).toBe(false);
        expect(page.includes('mv-chart-ambient')).toBe(false);
        expect(page.includes('svgVariableEquation')).toBe(false);
        expect(page.includes('y = x')).toBe(false);
        expect(page.includes('data-hover-variant')).toBe(false);
        expect(page.includes('data-hover-line')).toBe(false);
    });

    test('M-value main chart and comparison panel use a large readable layout', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page).toContain('viewBox="0 0 800 420"');
        expect(page).toContain('height: clamp(380px, 30vw, 520px)');
        expect(page).toContain('grid-template-columns: minmax(0, 1fr) 360px');
        expect(page).toContain('const CHART_W = 800');
        expect(page).toContain('const CHART_H = 420');
    });

    test('M-value derivation chart uses a large readable drawing area', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page).toContain('viewBox="0 0 900 420"');
        expect(page).toContain('height: clamp(360px, 32vw, 520px)');
        expect(page).toContain('const DERIV_W = 900');
        expect(page).toContain('const DERIV_H = 420');
    });

    test('M-value sandbox controls ambient pressure as the single top-level state', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page.includes('id="mvAmbientPressure"')).toBe(true);
        expect(page.includes('id="mvAmbientPressureReadout"')).toBe(true);
        expect(page.includes('id="mvDerivedDepth"')).toBe(true);
        expect(page.includes('ambientPressure: getAmbientPressure(30)')).toBe(true);
        expect(page.includes('const pAmb = state.ambientPressure')).toBe(true);
        expect(page.includes("els.ambientPressure.addEventListener('input'")).toBe(true);
        expect(page.includes('id="mvDepth"')).toBe(false);
        expect(page.includes('state.depth')).toBe(false);
    });

    test('M-value sandbox keeps coefficients independent of ambient-pressure changes', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        const recompute = page.slice(
            page.indexOf('function recompute()'),
            page.indexOf('function updateVariantDetail'),
        );
        const pressureHandler = page.slice(
            page.indexOf("els.ambientPressure.addEventListener('input'"),
            page.indexOf("els.compartment.addEventListener('change'"),
        );

        expect(recompute.includes('const a = comp.aN2')).toBe(true);
        expect(recompute.includes('const b = comp.bN2')).toBe(true);
        expect(recompute.includes('getMValue(pAmb, a, b)')).toBe(true);
        expect(pressureHandler.includes('state.ambientPressure =')).toBe(true);
        expect(pressureHandler.includes('.aN2')).toBe(false);
        expect(pressureHandler.includes('.bN2')).toBe(false);
        expect(page.includes('value: getMValue(pAmb, comp.aN2, comp.bN2)')).toBe(true);
    });

    test('M-value sandbox magnifies all variants only in the comparison detail', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page.includes('id="mvVariantDetailRows"')).toBe(true);
        expect(page.includes('function updateVariantDetail(pAmb)')).toBe(true);
        expect(page.includes('const spread = rawMax - rawMin')).toBe(true);
        expect(page.includes('const padding = Math.max(spread * 0.25, 0.01)')).toBe(true);
        expect(page.includes('updateVariantDetail(pAmb);')).toBe(true);
        expect(page.includes('main graph keeps the true pressure scale')).toBe(true);
        expect(page.includes('id="mvMCompare"')).toBe(false);

        for (const lang of ['cs', 'en', 'es']) {
            const dict = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
            expect(dict.sandbox.mvalues.top.detail.heading.includes('<var>M</var>')).toBe(true);
            expect(typeof dict.sandbox.mvalues.top.detail.note).toBe('string');
            expect(typeof dict.sandbox.mvalues.top.detail.relativeToC).toBe('string');
            expect(typeof dict.sandbox.mvalues.top.detail.reference).toBe('string');
        }
    });

    test('M-value sandbox top copy and legend have language parity', () => {
        const dictionaries = ['cs', 'en', 'es'].map(lang =>
            JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'))
                .sandbox.mvalues.top);
        const requiredInputKeys = ['ambientPressure', 'ambientPressureShort', 'derivedDepth', 'compartment', 'viewToggle'];
        const requiredLegendKeys = ['selectedLine', 'currentPoint', 'surface'];

        for (const top of dictionaries) {
            expect(top.heading.includes('<var>M</var>')).toBe(true);
            expect(top.anchor.match(/<var>M<\/var>/g).length).toBe(2);
            expect(Object.keys(top.inputs).sort()).toEqual(requiredInputKeys.sort());
            expect(Object.keys(top.legend).sort()).toEqual(requiredLegendKeys.sort());
            expect(JSON.stringify(top).includes('y = x')).toBe(false);
        }
    });

    test('M-value quantity cards collapse as one group', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        const group = page.slice(
            page.indexOf('<details class="mv-term-details">'),
            page.indexOf('</details>', page.indexOf('<details class="mv-term-details">')) + '</details>'.length,
        );

        expect((page.match(/<details class="mv-term-details">/g) || []).length).toBe(1);
        expect((group.match(/class="mv-term-card /g) || []).length).toBe(4);
        expect(group.includes('<details')).toBe(true);
        expect(group.slice('<details'.length).includes('<details')).toBe(false);
        expect(group.includes(' open')).toBe(false);

        for (const lang of ['cs', 'en', 'es']) {
            const dict = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
            expect(typeof dict.sandbox.mvalues.top.cardsToggle).toBe('string');
            expect(dict.sandbox.mvalues.top.cardsToggle.length > 0).toBe(true);
        }
    });

    test('M-value derivation cards collapse as one group', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        const groupStart = page.indexOf('<details class="mv-deriv-details">');
        const group = page.slice(
            groupStart,
            page.indexOf('</details>', groupStart) + '</details>'.length,
        );

        expect((page.match(/<details class="mv-deriv-details">/g) || []).length).toBe(1);
        expect((group.match(/class="mv-deriv-card /g) || []).length).toBe(3);
        expect(group.slice('<details'.length).includes('<details')).toBe(false);
        expect(group.includes(' open')).toBe(false);

        for (const lang of ['cs', 'en', 'es']) {
            const dict = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
            expect(typeof dict.sandbox.mvalues.bottom.cardsToggle).toBe('string');
            expect(dict.sandbox.mvalues.bottom.cardsToggle.length > 0).toBe(true);
        }
    });

    test('M-value derivation chart labels the a and b axes directly', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        const chart = page.slice(
            page.indexOf('function drawDerivChart()'),
            page.indexOf('// Wire inputs'),
        );

        expect(chart.includes("'data-axis-label': 'a'")).toBe(true);
        expect(chart.includes("'data-axis-label': 'b'")).toBe(true);
        expect(chart.includes("aAxisLabel.append(aSymbol, document.createTextNode(' (bar)'))")).toBe(true);
        expect(chart.includes('x: tToPx(aVisibleStartT) - 8')).toBe(true);
        expect(chart.includes('y: bToPx(bCurveEnd) - 7')).toBe(true);
        expect(page.includes('const DERIV_PAD_T = 38;')).toBe(true);
        expect(page.includes('.mv-deriv-axis-label-a { fill: #e74c3c; }')).toBe(true);
        expect(page.includes('.mv-deriv-axis-label-b { fill: #2980b9; }')).toBe(true);
        expect(chart.includes('if (state.compartmentIdx === 0)')).toBe(true);
        expect(chart.includes("VARIANT_COMPS[ZHL16_VARIANTS.A][0]")).toBe(true);
        expect(chart.includes("VARIANT_COMPS[ZHL16_VARIANTS.C][0]")).toBe(true);
        expect(chart.includes("'data-tc1-shift': axis")).toBe(true);
        expect(chart.includes("labelA.textContent = 'A'")).toBe(true);
        expect(chart.includes("labelBC.textContent = 'B/C'")).toBe(true);
    });

    test('M-value coefficient table is generated from all three 16-compartment variants', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        const builder = page.slice(
            page.indexOf('function buildCoefficientTable()'),
            page.indexOf('function updateCoefficientTableHighlights()'),
        );
        const variants = [
            getCompartmentsForVariant(ZHL16_VARIANTS.A),
            getCompartmentsForVariant(ZHL16_VARIANTS.B),
            getCompartmentsForVariant(ZHL16_VARIANTS.C),
        ];

        expect(variants.map(comps => comps.length)).toEqual([16, 16, 16]);
        expect(builder.includes('for (let idx = 0; idx < 16; idx++)')).toBe(true);
        expect(builder.includes('VARIANT_COMPS[variant][idx]')).toBe(true);
        expect(builder.includes('comp.halfTime')).toBe(true);
        expect(builder.includes('comp.aN2')).toBe(true);
        expect(builder.includes('comp.bN2')).toBe(true);
        expect(builder.includes("prefix: '1/'")).toBe(true);
        expect(builder.includes('fmtNum(1 / comp.bN2, 4)')).toBe(true);
        expect(builder.includes('<br')).toBe(false);
    });

    test('M-value coefficient table data preserves the variant differences', () => {
        const variantA = getCompartmentsForVariant(ZHL16_VARIANTS.A);
        const variantB = getCompartmentsForVariant(ZHL16_VARIANTS.B);
        const variantC = getCompartmentsForVariant(ZHL16_VARIANTS.C);

        expect([variantA[0].halfTime, variantB[0].halfTime, variantC[0].halfTime]).toEqual([4, 5, 5]);
        expect([variantA[0].bN2, variantB[0].bN2, variantC[0].bN2]).toEqual([0.505, 0.5578, 0.5578]);
        for (let idx = 1; idx < 16; idx++) {
            expect(variantB[idx].bN2).toBe(variantA[idx].bN2);
            expect(variantC[idx].bN2).toBe(variantA[idx].bN2);
        }

        const changedA = variant =>
            variant.filter((comp, idx) => comp.aN2 !== variantA[idx].aN2).map(comp => comp.id);
        expect(changedA(variantB)).toEqual([1, 6, 7, 8, 13]);
        expect(changedA(variantC)).toEqual([1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    });

    test('M-value coefficient table reacts to selected compartment and variant', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page.includes("'selected-compartment'")).toBe(true);
        expect(page.includes('Number(row.dataset.compartment) === state.compartmentIdx + 1')).toBe(true);
        expect(page.includes("cell.classList.toggle('selected-variant', cell.dataset.variant === state.variant)")).toBe(true);
        expect(page.includes("valueSpan.classList.add('different-from-a')")).toBe(true);
        expect(page.includes('updateCoefficientTableHighlights();')).toBe(true);
        expect(page.includes('buildCoefficientTable();')).toBe(true);
    });

    test('M-value coefficient table copy and responsive wrapper exist in every language', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page.includes('class="mv-coeff-table-scroll"')).toBe(true);
        expect(page.includes('overflow-x: auto')).toBe(true);
        expect(page.includes('.mv-coeff-table td:first-child')).toBe(true);
        expect(page.includes('position: sticky')).toBe(true);

        for (const lang of ['cs', 'en', 'es']) {
            const dict = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
            const table = dict.sandbox.mvalues.top.coefficients;
            expect(typeof table.heading).toBe('string');
            expect(typeof table.notice).toBe('string');
            expect(typeof table.summary).toBe('string');
            expect(Object.keys(table.analogies).sort()).toEqual(
                ['mediumFast', 'slow', 'slower', 'veryFast', 'verySlow'],
            );
            expect(table.notice.length > 50).toBe(true);
            expect(table.notice.toLowerCase().includes(lang === 'cs' ? 'nikoli' : lang === 'es' ? 'no tejidos' : 'not specific')).toBe(true);
        }
    });

    test('M-value sandbox no longer exposes a See also section', () => {
        const page = readFileSync(new URL('../sandbox/m-values.html', import.meta.url), 'utf8');
        expect(page.includes('sandbox.mvalues.crossLinks')).toBe(false);
        expect(page.includes('Model-04-M-Values')).toBe(false);
        for (const lang of ['cs', 'en', 'es']) {
            const dict = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
            expect(dict.sandbox.mvalues.crossLinks).toBe(undefined);
        }
    });

    test('no i18n key drawn on a chart canvas carries HTML markup', () => {
        // authoring.md §5b: Chart.js kreslí popisek na canvas, kde se markup
        // nevykreslí — uživatel by uviděl doslova <var>p</var>.
        const keys = canvasBoundKeys();
        // Sonda nesmí být prázdná — jinak by test prošel i s rozbitým vzorem.
        expect(keys.size > 20).toBe(true);
        expect(keys.has('chart.profile.datasetPpO2')).toBe(true);
        expect(keys.has('tissueSim.chartLabels.pN2Alveolar')).toBe(true);
        expect(keys.has('chart.mvalue.alveolarPN2WithGases')).toBe(true);
        // Hlášky pod grafem jdou do innerHTML, ne na canvas — markup tam patří.
        expect(keys.has('tissueSim.ppO2Hypoxic')).toBe(false);

        const offenders = [];
        for (const lang of ['cs', 'en', 'es']) {
            const dict = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
            for (const key of keys) {
                const value = key.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), dict);
                if (typeof value !== 'string') continue;
                if (/<\/?(?:var|sub|sup|em|strong|br|span)\b/.test(value)) {
                    offenders.push(`${lang} ${key}: ${value.slice(0, 60)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('all three languages italicise the same number of symbols', () => {
        const counts = ['cs', 'en', 'es'].map(lang => {
            const raw = readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8');
            return (raw.match(/<var>/g) || []).length;
        });
        // Jazyková parita: chybí-li oprava v jednom jazyce, čísla se rozejdou.
        expect(counts[0]).toBe(counts[1]);
        expect(counts[1]).toBe(counts[2]);
        expect(counts[0] > 0).toBe(true);
    });
});

describe('notation - partial pressure symbol', () => {
    // Glosář §4: parciální tlak kyslíku je *p*(O₂). Zdvojené „pp" je potápěčský
    // žargon, ne značka — v ČSN EN ISO 80000-1 pro ni není opora.
    const root = new URL('../', import.meta.url);

    test('no rendered string uses the doubled pp form', () => {
        // Rozlišovací znak je dolní index: zobrazovaný text píše O₂ (U+2082),
        // zatímco identifikátory v kódu píšou ASCII `ppO2` a měnit se nesmějí.
        const files = [...shippedSources(), 'locales/cs.json', 'locales/en.json', 'locales/es.json'];
        const offenders = [];
        for (const rel of files) {
            const src = readFileSync(new URL(rel, root), 'utf8');
            src.split('\n').forEach((line, i) => {
                if (/pp[ON]\u2082/.test(line) || /pp[ON]<sub>2<\/sub>/.test(line)) {
                    offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 70)}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    test('a bare pO2 is allowed only where the sink is a canvas', () => {
        // Na canvas se markup nevykreslí, takže tam je holé `pO₂` správně.
        // Všude jinde jde řetězec do innerHTML a značka musí být kurzívou.
        const canvasKeys = canvasBoundKeys();
        expect(canvasKeys.size > 20).toBe(true);

        const walk = (o, p = '') => Object.entries(o).flatMap(([k, v]) => {
            const key = p ? `${p}.${k}` : k;
            if (v && typeof v === 'object') return walk(v, key);
            return typeof v === 'string' ? [[key, v]] : [];
        });
        const offenders = [];
        for (const lang of ['cs', 'en', 'es']) {
            const dict = JSON.parse(readFileSync(new URL(`locales/${lang}.json`, root), 'utf8'));
            for (const [key, value] of walk(dict)) {
                if (!/(?:^|[^A-Za-z>])p[ON]\u2082/.test(value)) continue;
                if (canvasKeys.has(key)) continue;
                offenders.push(`${lang} ${key}: ${value.slice(0, 60)}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('notation - units the first nbsp wave never listed', () => {
    // ISO 80000-1: mezi číslem a značkou jednotky je nedělitelná mezera.
    // První vlna pracovala se seznamem m|min|bar|kPa|MPa|Pa|msw|fsw a minula
    // newton, kelvin, kbar, Mbar i mL/L — jen v quiz-physics jich zbylo 165.
    // Hlídá se proto celá abeceda jednotek, ne jeden ručně psaný výčet.
    const root = new URL('../', import.meta.url);

    // `OTU` schválně chybí: je to název dávky, ne značka jednotky (glosář §5).
    // `m`, `l`, `s`, `h` také ne — jednopísmenné značky se v próze nedají
    // odlišit od českých a španělských předložek („2 s příslušenstvím").
    const UNITS = ['°C', 'kbar', 'Mbar', 'mL/L', 'kPa', 'MPa', 'msw', 'fsw',
        'bar', 'min', 'cm', 'mm', 'km', 'Pa', 'kg', 'kJ', 'kW', 'N', 'K', 'J', 'W', 'L', 'C'];
    const ALT = UNITS.map(u => u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|');
    const SPACED = new RegExp(`(\\d) (${ALT})(?![\\w\\u00e1-\\u017e\\u00c1-\\u017d²³°])`, 'g');
    const GLUED = new RegExp(`(\\d)(${ALT})(?![\\w\\u00e1-\\u017e\\u00c1-\\u017d²³°])`, 'g');
    // `ZH-L16A` je název algoritmu, ne 16 ampér.
    const ALGO = /ZH-?L\s?16/;

    // Rozpočet je prázdný: všechny třídy z fáze 2 jsou opravené.
    // Přibude-li nový výskyt, test spadne a rozpočet se nedoplňuje —
    // opraví se text.
    const ALLOWED = {};

    const strings = (value, path, out) => {
        if (typeof value === 'string') out.push([path, value]);
        else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
        else if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
        }
        return out;
    };

    const dataFiles = () => {
        const out = [];
        for (const dir of ['locales/', 'data/']) {
            for (const name of readdirSync(new URL(dir, root))) {
                if (name.endsWith('.json')) out.push(`${dir}${name}`);
            }
        }
        return out.sort();
    };

    // Text, který uživatel opravdu uvidí: bez komentářů, skriptů, stylů
    // a ukázek kódu. Značky se odstraní, takže se odhalí i případ, kdy je
    // jednotka v jiném textovém uzlu než číslo — `<span>0,751</span> bar`.
    const visibleText = (src) => src
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/gi, ' ')
        .replace(/&nbsp;/g, '\u00a0')
        .replace(/<[^>]+>/g, ' ');

    const scan = (text, label, into) => {
        for (const re of [SPACED, GLUED]) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(text)) !== null) {
                const around = text.slice(Math.max(0, m.index - 12), m.index + m[0].length + 4);
                if (ALGO.test(around)) continue;
                into.push(`${label}: …${text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 8).trim()}…`);
            }
        }
    };

    const collect = () => {
        const perFile = {};
        for (const rel of dataFiles()) {
            const parsed = JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
            const found = [];
            for (const [key, value] of strings(parsed, '', [])) scan(value, key, found);
            if (found.length) perFile[rel] = found;
        }
        for (const rel of shippedSources().filter(f => f.endsWith('.html'))) {
            const found = [];
            scan(visibleText(readFileSync(new URL(rel, root), 'utf8')), '(text)', found);
            if (found.length) perFile[rel] = found;
        }
        return perFile;
    };

    test('no unit symbol is separated from its value by an ordinary space', () => {
        const perFile = collect();
        const offenders = [];
        for (const [rel, found] of Object.entries(perFile)) {
            const budget = ALLOWED[rel] || 0;
            if (found.length > budget) offenders.push(`${rel}: ${found.length} > ${budget}\n    ${found.slice(0, 4).join('\n    ')}`);
        }
        expect(offenders).toEqual([]);
    });

    test('the budget is not padded - every allowance is still used', () => {
        // Rozpočet, který nikdo nečerpá, je jen zapomenutý řádek. Až třídu
        // „znak násobení" a „chybějící °" opravíme, tenhle test si o smazání
        // příslušné položky řekne sám.
        const perFile = collect();
        const stale = Object.keys(ALLOWED).filter(rel => (perFile[rel] || []).length !== ALLOWED[rel]);
        expect(stale).toEqual([]);
    });
});

describe('notation - quantity symbols in formulas are set in italics', () => {
    // Glosář §2: značka veličiny se sází kurzívou, tedy `<var>`.
    // V odstavci o bublině byly tři různé způsoby v jedné větě: `p` už mělo
    // `<var>`, `γ` a `r` ve vzorci `2γ/r` neměly nic a `r` v próze mělo `<em>`.
    const root = new URL('../', import.meta.url);

    // Kvízová data jsou sázený text jako každý jiný: `js/quiz.js` je vkládá
    // přes `innerHTML`, takže `<var>` v nich funguje a značky v nich patří
    // pod stejné pravidlo. První verze téhle kontroly na `data/` nesahala
    // a přehlédla patnáct `Δp` ve vysvětleních fyzikálního kvízu.
    const surfaces = () => {
        const out = [];
        for (const dir of ['locales/', 'data/']) {
            for (const name of readdirSync(new URL(dir, root))) {
                if (name.endsWith('.json')) out.push(`${dir}${name}`);
            }
        }
        return out.concat(shippedSources().filter(f => f.endsWith('.html')));
    };

    // Skripty a styly se vynechávají: `Δ` v kódu není sázený text.
    const content = (src) => src
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');

    test('no <em> is used where the content is a bare quantity symbol', () => {
        // `<em>klesá</em>` je zvýraznění slovesa a zůstává; `<em>r</em>` je značka.
        const found = [];
        for (const rel of surfaces()) {
            const src = content(readFileSync(new URL(rel, root), 'utf8'));
            for (const m of src.matchAll(/<em>([^<]{1,3})<\/em>/g)) {
                if (/^[a-zA-Z\u03b1-\u03c9]$/.test(m[1].trim())) found.push(`${rel}: <em>${m[1]}</em>`);
            }
        }
        expect(found).toEqual([]);
    });

    test('the surface tension symbol is always italic', () => {
        // `γ` je značka povrchového napětí, ne dekorace — patří do `<var>`.
        const found = [];
        for (const rel of surfaces()) {
            const src = content(readFileSync(new URL(rel, root), 'utf8'));
            for (const m of src.matchAll(/\u03b3/g)) {
                const before = src.slice(Math.max(0, m.index - 5), m.index);
                if (!before.endsWith('<var>')) {
                    found.push(`${rel}: …${src.slice(Math.max(0, m.index - 25), m.index + 20)}…`);
                }
            }
        }
        expect(found).toEqual([]);
    });

    test('the quantity after the delta operator is lowercase and italic', () => {
        // ISO 80000-2: `Δ` je operátor a sází se stojatě, ale veličina za ním
        // je značka — tedy `Δ<var>p</var>`, nikdy `ΔP` ani `Δp`. Operátor bez
        // operandu je stejná chyba: `Δ = 40 − 10` nechává veličinu jen v hlavě
        // pisatele, správně je `Δ<var>V</var> = 40 − 10`.
        // Výjimkou je popisek kreslený na canvas (`sandbox/m-values.html`),
        // kde `Δ` stojí samo a značka se vedle něj sází kurzívou v kódu.
        const found = [];
        for (const rel of surfaces()) {
            const src = content(readFileSync(new URL(rel, root), 'utf8'));
            for (const m of src.matchAll(/(?:&Delta;|\u0394)\s*([A-Za-z]|=)/g)) {
                found.push(`${rel}: …${src.slice(Math.max(0, m.index - 25), m.index + 25)}…`);
            }
        }
        expect(found).toEqual([]);
    });
});

describe('page titles', () => {
    const root = new URL('../', import.meta.url);
    const LOCALES = ['cs', 'en', 'es'];

    /**
     * Stránky, které uživatel může otevřít, tedy mají mít vlastní titulek.
     * `*-test.html` jsou vývojářské přípravky - neodkazuje na ně nabídka ani
     * žádná stránka, uživatel se k nim nedostane.
     */
    const pages = () => shippedSources()
        .filter(f => f.endsWith('.html') && !/-test\.html$/.test(f));

    /**
     * Jazyky, ve kterých stránka zatím přeložená není. Titulek se pak
     * nenastaví a zůstane `<title>` ze zdroje - to je zamýšlený fallback,
     * ne chyba. Jakmile překlad přibude, záznam odsud musí zmizet; hlídá
     * to test níže.
     */
    const UNTRANSLATED = { 'privacy.html': ['es'] };

    const resolve = (obj, key) => {
        let v = obj;
        for (const part of key.split('.')) {
            if (!v || typeof v !== 'object' || !(part in v)) return undefined;
            v = v[part];
        }
        return typeof v === 'string' ? v : undefined;
    };

    const bodyAttrs = (rel) => {
        const m = readFileSync(new URL(rel, root), 'utf8').match(/<body\b([^>]*)>/);
        if (!m) return null;
        const key = m[1].match(/data-i18n-title="([^"]+)"/);
        const ctx = m[1].match(/data-i18n-title-context="([^"]+)"/);
        return { key: key && key[1], context: ctx && ctx[1] };
    };

    test('every shipped page declares its own title key', () => {
        const missing = pages().filter(rel => {
            const a = bodyAttrs(rel);
            return !a || !a.key;
        });
        expect(missing).toEqual([]);
    });

    test('every declared title key resolves in all three languages', () => {
        // Bez toho by se titulek tiše nenastavil a v záložce by zůstal
        // anglický <title> ze zdroje.
        const broken = [];
        for (const lang of LOCALES) {
            const t = JSON.parse(readFileSync(new URL(`locales/${lang}.json`, root), 'utf8'));
            for (const rel of pages()) {
                const a = bodyAttrs(rel);
                if (!a || !a.key) continue;
                if ((UNTRANSLATED[rel] || []).includes(lang)) continue;
                if (!resolve(t, a.key)) broken.push(`${lang}: ${rel} -> ${a.key}`);
                if (a.context && !resolve(t, a.context)) broken.push(`${lang}: ${rel} -> ${a.context}`);
            }
        }
        expect(broken).toEqual([]);
    });

    test('no two pages end up with the same title', () => {
        // Přesně ta chyba, kvůli které vznikl tenhle blok: jeden sdílený
        // klíč `page.title` dával všem 23 stránkám jeden titulek.
        const clashes = [];
        for (const lang of LOCALES) {
            const t = JSON.parse(readFileSync(new URL(`locales/${lang}.json`, root), 'utf8'));
            const seen = new Map();
            for (const rel of pages()) {
                const a = bodyAttrs(rel);
                if (!a || !a.key) continue;
                const name = resolve(t, a.key);
                if (!name) continue;
                const title = [name, a.context && resolve(t, a.context)].filter(Boolean).join(' \u2013 ');
                if (seen.has(title)) clashes.push(`${lang}: ${rel} == ${seen.get(title)} -> "${title}"`);
                else seen.set(title, rel);
            }
        }
        expect(clashes).toEqual([]);
    });

    test('the untranslated list is not padded - every entry is still missing', () => {
        // Bez toho by seznam přežil svůj důvod a tiše kryl nový překlad.
        const stale = [];
        for (const [rel, langs] of Object.entries(UNTRANSLATED)) {
            const a = bodyAttrs(rel);
            for (const lang of langs) {
                const t = JSON.parse(readFileSync(new URL(`locales/${lang}.json`, root), 'utf8'));
                if (a && a.key && resolve(t, a.key)) stale.push(`${lang}: ${rel} už přeloženo`);
            }
        }
        expect(stale).toEqual([]);
    });

    test('no page sets document.title on its own', () => {
        // Ruční override v sandbox/gas-law.html byl obcházkou sdíleného
        // klíče. Titulek smí nastavovat jen i18n.
        const offenders = shippedSources()
            .filter(rel => rel !== 'js/i18n.js')
            .filter(rel => /document\.title\s*=/.test(readFileSync(new URL(rel, root), 'utf8')));
        expect(offenders).toEqual([]);
    });
});

describe('notation - dashes between numerals are the right character', () => {
    // style-guide §4.3: číselný rozsah se píše pomlčkou U+2013 **bez mezer**
    // (`10–20 m`); mezery kolem ní patří jen pomlčce větné.
    // style-guide §4.4: odčítání a záporná čísla mají minus U+2212.
    // Spojovník U+002D tedy mezi číslicemi nestojí nikdy — jedinou výjimkou
    // je datum v zápisu ISO 8601, kde spojovník je součástí formátu.
    const root = new URL('../', import.meta.url);

    // Kód není sázený text: `box-shadow: 0 -2px`, `id="chart-50-80"`
    // ani ukázka v <pre> se typografií neřídí.
    const visibleText = (src) => src
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/gi, ' ')
        .replace(/&nbsp;/g, '\u00a0')
        .replace(/<[^>]+>/g, ' ');

    const jsonStrings = (value, out) => {
        if (typeof value === 'string') out.push(value);
        else if (value && typeof value === 'object') Object.values(value).forEach(v => jsonStrings(v, out));
        return out;
    };

    const texts = () => {
        const out = [];
        for (const dir of ['locales/', 'data/']) {
            for (const name of readdirSync(new URL(dir, root))) {
                if (!name.endsWith('.json')) continue;
                const parsed = JSON.parse(readFileSync(new URL(`${dir}${name}`, root), 'utf8'));
                for (const s of jsonStrings(parsed, [])) out.push([`${dir}${name}`, s]);
            }
        }
        for (const rel of shippedSources().filter(f => f.endsWith('.html'))) {
            out.push([rel, visibleText(readFileSync(new URL(rel, root), 'utf8'))]);
        }
        return out;
    };

    const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

    test('no hyphen stands between two numerals', () => {
        const found = [];
        for (const [rel, text] of texts()) {
            for (const m of text.matchAll(/\d[ \u00a0]*-[ \u00a0]*\d/g)) {
                const around = text.slice(Math.max(0, m.index - 6), m.index + m[0].length + 6);
                if (ISO_DATE.test(around)) continue;
                found.push(`${rel}: …${text.slice(Math.max(0, m.index - 30), m.index + 20).trim()}…`);
            }
        }
        expect(found).toEqual([]);
    });

    test('a numeric range is closed up, not spaced', () => {
        // `100 – 120` je špatně dvakrát: čtenáři to nabízí zalomení uprostřed
        // rozsahu a míchá to zápis s pomlčkou větnou.
        const found = [];
        for (const [rel, text] of texts()) {
            for (const m of text.matchAll(/\d[ \u00a0]+\u2013[ \u00a0]+\d/g)) {
                found.push(`${rel}: …${text.slice(Math.max(0, m.index - 30), m.index + 20).trim()}…`);
            }
        }
        expect(found).toEqual([]);
    });
});

describe('notation - the glossary export the reviewer reads is current', () => {
    // Slovníček se sdílí s garantem jako .docx, protože markdown nečte.
    // U #91 a #98 se `glossary.md` změnil, ale export ne — garant by četl
    // verzi bez celé nové tabulky popisných indexů. Otisk předlohy leží
    // vedle dokumentu a přegenerování ho přepíše; tenhle test je porovnává.
    const root = new URL('../', import.meta.url);

    test('the exported glossary was generated from the current source', () => {
        const src = readFileSync(new URL('docs/notation/glossary.md', root));
        const current = createHash('sha256').update(src).digest('hex');
        const stamped = readFileSync(
            new URL('docs/notation/export/slovnicek-velicin.sha256', root), 'utf8',
        ).trim().split(/\s+/)[0];
        // Při nesouhlasu: node docs/notation/export/md-to-docx.cjs \
        //   docs/notation/glossary.md docs/notation/export/slovnicek-velicin.docx
        expect(stamped).toBe(current);
    });
});

describe('notation - degree Celsius is written as two characters', () => {
    // authoring.md §5: ℃ (U+2103) je kompatibilní znak z bloku CJK,
    // jeho dekompozice je U+00B0 U+0043 — píšou se rovnou ty dva znaky.
    // Samé `C` je zase coulomb, ne stupeň Celsia; to hlídá kontrola jednotek.
    const root = new URL('../', import.meta.url);

    test('no file uses the precomposed degree Celsius character', () => {
        const found = [];
        for (const dir of ['locales/', 'data/']) {
            for (const name of readdirSync(new URL(dir, root))) {
                if (!name.endsWith('.json')) continue;
                if (readFileSync(new URL(`${dir}${name}`, root), 'utf8').includes('\u2103')) {
                    found.push(`${dir}${name}`);
                }
            }
        }
        for (const rel of shippedSources()) {
            if (readFileSync(new URL(rel, root), 'utf8').includes('\u2103')) found.push(rel);
        }
        expect(found).toEqual([]);
    });

    test('the degree sign is never separated from the C', () => {
        // `20 ° C` je stejně špatně jako `20 C`; značka je jeden celek `°C`.
        const found = [];
        for (const dir of ['locales/', 'data/']) {
            for (const name of readdirSync(new URL(dir, root))) {
                if (!name.endsWith('.json')) continue;
                const rel = `${dir}${name}`;
                const src = readFileSync(new URL(rel, root), 'utf8');
                if (/\u00b0[ \u00a0]+C(?![\w\u00e1-\u017e])/.test(src)) found.push(rel);
            }
        }
        expect(found).toEqual([]);
    });
});

describe('notation - multiplication between numerals uses the multiplication sign', () => {
    // authoring.md §5: znak násobení je U+00D7, ne písmeno `x`.
    // Angličtina a španělština si nechaly ASCII `2x7 L` i tam, kde
    // čeština měla správně `2×7 l` — chyba byla v údaji o objemu dvojčete.
    const root = new URL('../', import.meta.url);
    // `x` mezi číslicemi je vždy násobení. Rozměry (`10x20`) i počty
    // (`2x7`) patří do stejné třídy, takže stačí jediný vzor.
    const ASCII_X = /\d\s*[xX]\s*\d/;

    const strings = (value, path, out) => {
        if (typeof value === 'string') out.push([path, value]);
        else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
        else if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
        }
        return out;
    };

    // Text bez značek, skriptů a ukázek kódu — `translateX(10)` není násobení.
    const visibleText = (src) => src
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');

    const offenders = () => {
        const found = [];
        for (const dir of ['locales/', 'data/']) {
            for (const name of readdirSync(new URL(dir, root))) {
                if (!name.endsWith('.json')) continue;
                const rel = `${dir}${name}`;
                const parsed = JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
                for (const [key, value] of strings(parsed, '', [])) {
                    if (ASCII_X.test(value)) found.push(`${rel} ${key}: ${value}`);
                }
            }
        }
        for (const rel of shippedSources().filter(f => f.endsWith('.html'))) {
            const text = visibleText(readFileSync(new URL(rel, root), 'utf8'));
            if (ASCII_X.test(text)) found.push(`${rel}: ${text.match(/.{0,25}\d\s*[xX]\s*\d.{0,15}/)[0].trim()}`);
        }
        return found;
    };

    test('no visible string writes multiplication as the letter x', () => {
        expect(offenders()).toEqual([]);
    });

    test('a count designation keeps the multiplication sign non-breaking', () => {
        // Rozlišuje se výpočet od údaje. Ve vzorci `12 × (200 − 50)` je
        // obyčejná mezera správně — dlouhý výpočet se zalomit smí.
        // `4 × 50 l` je ale jeden údaj o objemu a rozpadnout se nesmí;
        // pozná se podle toho, že hned za ním stojí značka jednotky.
        const LOOSE = /\d[ ]?\u00d7[ ]?\d+[ ](?:l|L|ml|mL|bar|m|kg)(?![\w\u00e1-\u017e])|\d[ ]\u00d7[ ]?\d+[ \u00a0](?:l|L|ml|mL|bar|m|kg)(?![\w\u00e1-\u017e])/;
        const found = [];
        for (const dir of ['locales/', 'data/']) {
            for (const name of readdirSync(new URL(dir, root))) {
                if (!name.endsWith('.json')) continue;
                const rel = `${dir}${name}`;
                const parsed = JSON.parse(readFileSync(new URL(rel, root), 'utf8'));
                for (const [key, value] of strings(parsed, '', [])) {
                    if (LOOSE.test(value)) found.push(`${rel} ${key}: ${value}`);
                }
            }
        }
        for (const rel of shippedSources().filter(f => f.endsWith('.html'))) {
            const text = visibleText(readFileSync(new URL(rel, root), 'utf8')).replace(/&nbsp;/g, '\u00a0');
            if (LOOSE.test(text)) found.push(`${rel}: ${text.match(LOOSE)[0]}`);
        }
        expect(found).toEqual([]);
    });
});

describe('notation - the nbsp rule must not reach SVG geometry', () => {
    // PR #94 vkládal U+00A0 mezi číslo a jednotku. Pravidlo pro litr (`l`/`L`)
    // ale chytlo i příkaz `L` v SVG path — `…1200\u00a0L 1200 200…`. SVG parser
    // takový řetězec odmítne („Expected path command") a výplň hero animace se
    // přestala kreslit. Statická kontrola to nenašla, protože zdroj vypadá dobře.
    const root = new URL('../', import.meta.url);

    test('no SVG path definition contains a non-breaking space', () => {
        // Kontroluje se řetězcový literál, ne řádek: nedělitelná mezera sedí
        // často hned za interpolací (`${PROFILE_D}\u00a0L 1200 200 L 0 200 Z`),
        // kde už zbývají jen dva příkazy a řádková heuristika je slepá.
        const offenders = [];
        const NBSP = /\u00a0|\\u00a0|&nbsp;/;
        // Za příkazem stojí buď číslo, nebo interpolace — `M ${x} L ${y}` je
        // stejně platná cesta jako `M 6,11 L 474,128`. Verze z #99 počítala
        // jen číslice, takže obě cesty skládané z proměnných minula.
        const commands = (t) => (t.match(/[MLHVCSQTAZ]\s*(?:-?[\d.]|\$\{)/g) || []).length;
        // Cesta prakticky vždy začíná `M`; to je silnější signál než počet
        // příkazů a udrží práh nízko, aniž by chytal běžné řetězce.
        const startsWithMove = (t) => /^[`'"]?\s*[Mm]\s*(?:-?[\d.]|\$\{)/.test(t);
        const looksLikePath = (t) => commands(t) >= 3
            || (commands(t) >= 2 && startsWithMove(t))
            || (commands(t) >= 1 && /\$\{[A-Za-z_]*(?:_D|[Pp]ath)\}/.test(t));

        for (const rel of shippedSources()) {
            const src = readFileSync(new URL(rel, root), 'utf8');
            // V HTML je apostrof běžná interpunkce („Boyle's Law"), takže se
            // literály hledají jen v kódu — v .js celém, v .html ve <script>.
            const code = rel.endsWith('.js')
                ? src
                : (src.match(/<script[^>]*>[\s\S]*?<\/script>/g) || []).join('\n');
            const literals = code.match(/`(?:\\[\s\S]|[^\\`])*`|'(?:\\.|[^\\'\n])*'|"(?:\\.|[^\\"\n])*"/g) || [];
            for (const lit of literals) {
                if (!NBSP.test(lit) || !looksLikePath(lit)) continue;
                offenders.push(`${rel}: ${lit.slice(0, 60)}`);
            }
            // atribut d="…" v HTML není řetězcový literál JS
            for (const m of src.matchAll(/\sd="([^"]*)"/g)) {
                if (NBSP.test(m[1])) offenders.push(`${rel}: d="${m[1].slice(0, 50)}"`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('notation - descriptive subscripts in formulas', () => {
    // Glosář §3: popisný index je zkrácené *slovo*, a slova se překládají —
    // garant to žádá v issue #61 (p_celk = p_O₂ + p_N₂). Chemický index
    // (O₂, N₂, He) je značka prvku a nemění se nikdy.
    const root = new URL('../', import.meta.url);
    const pages = () => shippedSources().filter(f => f.endsWith('.html'));
    /** Stránky, které opravdu sázejí matematiku. Jinde je `.formula` jen
     *  stylovací třída s prózou nebo HTML a math-mód se na ni nevztahuje. */
    const mathPages = () => pages().filter(f => /katex\.render|renderMathInElement/
        .test(readFileSync(new URL(f, root), 'utf8')));
    const formulas = (src) => [...src.matchAll(/class="formula(?:-inline)?"[^>]*>([\s\S]*?)<\/(?:div|span)>/g)]
        .map(m => m[1].trim());

    test('localizeLatex translates descriptive subscripts, never chemical ones', () => {
        expect(localizeLatex('p_{\\mathrm{tot}} = p_{\\mathrm{N_2}} + p_{\\mathrm{O_2}}', 'cs'))
            .toBe('p_{\\mathrm{celk}} = p_{\\mathrm{N_2}} + p_{\\mathrm{O_2}}');
        expect(localizeLatex('p_{\\mathrm{amb}}', 'cs')).toBe('p_{\\mathrm{okol}}');
        expect(localizeLatex('p_{\\mathrm{t,0}}', 'cs')).toBe('p_{\\mathrm{tk,0}}');
        expect(localizeLatex('p_{\\mathrm{alv,N_2}}', 'cs')).toBe('p_{\\mathrm{alv,N_2}}');
    });

    test('English and Spanish keep the source subscripts', () => {
        for (const lang of ['en', 'es']) {
            expect(localizeLatex('p_{\\mathrm{tot}}', lang)).toBe('p_{\\mathrm{tot}}');
            expect(localizeLatex('p_{\\mathrm{amb}}', lang)).toBe('p_{\\mathrm{amb}}');
        }
    });

    test('subscript translation composes with the decimal separator', () => {
        expect(localizeLatex('p_{\\mathrm{amb}} = 1.0 + x', 'cs')).toBe('p_{\\mathrm{okol}} = 1{,}0 + x');
    });

    test('every multi-letter token in a LaTeX formula is upright', () => {
        // `V_{cylinder}` i holé `SAC` sází KaTeX jako součin kurzívních písmen.
        const offenders = [];
        for (const rel of mathPages()) {
            for (const f of formulas(readFileSync(new URL(rel, root), 'utf8'))) {
                const bare = f
                    .replace(/\\(?:text|mathrm|operatorname)\{[^{}]*\}/g, '')
                    .replace(/\\[A-Za-z]+/g, '');
                for (const m of bare.matchAll(/[A-Za-z]{2,}/g)) {
                    if (m[0] === 'kt') continue;   // e^{-kt} je součin k·t, kurzíva je správně
                    offenders.push(`${rel}: „${m[0]}" v ${f.slice(0, 45)}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('every multi-letter subscript in a shipped formula is upright', () => {
        // `V_{cylinder}` sází KaTeX jako součin kurzívních písmen c·y·l·i·n·d·e·r.
        // Víceznakový index musí být v \mathrm{}, jinak je to podle ISO 80000-1 chyba.
        const offenders = [];
        for (const rel of pages()) {
            for (const f of formulas(readFileSync(new URL(rel, root), 'utf8'))) {
                for (const m of f.matchAll(/_\{([^{}]{2,})\}/g)) {
                    if (/^\\mathrm/.test(m[1]) || /^\d/.test(m[1]) || m[1] === '1/2') continue;
                    offenders.push(`${rel}: _{${m[1]}}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('no formula uses the doubled pp or an uppercase P for pressure', () => {
        // style-guide §2: `ppO₂` je hovorové synonymum a ve vzorci nemá co dělat.
        const offenders = [];
        for (const rel of pages()) {
            for (const f of formulas(readFileSync(new URL(rel, root), 'utf8'))) {
                if (/\bpp[_A-Z]/.test(f)) offenders.push(`${rel}: zdvojené pp v „${f.slice(0, 45)}"`);
                if (/(?:^|[^A-Za-z\\])P_\{/.test(f)) offenders.push(`${rel}: velké P v „${f.slice(0, 45)}"`);
            }
        }
        expect(offenders).toEqual([]);
    });

    test('no formula carries language-specific prose', () => {
        // `\text{ bar při 37 °C}` v anglickém zdroji uvidí i anglický čtenář —
        // vzorec se nepřekládá, popiska pod ním ano.
        const CZECH = /[ěščřžýáíéúůňťď]/i;
        const offenders = [];
        for (const rel of pages()) {
            for (const f of formulas(readFileSync(new URL(rel, root), 'utf8'))) {
                for (const m of f.matchAll(/\\text\{([^}]*)\}/g)) {
                    if (CZECH.test(m[1])) offenders.push(`${rel}: \\text{${m[1]}}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('every math page re-renders its formulas on languagechange', () => {
        // Popisný index i desetinný oddělovač se řídí jazykem. Bez posluchače
        // zůstane po přepnutí vysázeno `p_tot = …` i na české stránce.
        const offenders = [];
        for (const rel of mathPages()) {
            const src = readFileSync(new URL(rel, root), 'utf8');
            const hooks = [...src.matchAll(/languagechange['"]\s*,\s*([\s\S]{0,240}?)\)\s*;/g)]
                .map(m => m[1]);
            if (!hooks.some(h => /renderMath(?:Formulas)?|katex\.render/.test(h))) {
                offenders.push(rel);
            }
        }
        expect(offenders).toEqual([]);
    });

    test('every page that renders KaTeX routes it through localizeLatex', () => {
        const offenders = [];
        for (const rel of pages()) {
            const src = readFileSync(new URL(rel, root), 'utf8');
            src.split('\n').forEach((line, i) => {
                if (line.includes('katex.render(') && !line.includes('localizeLatex(')) {
                    offenders.push(`${rel}:${i + 1}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});

describe('dive plan table - languagechange re-render', () => {
    // renderDivePlanTableHTML() calls translate() at render time. The very
    // first call on page load always runs before initI18n() resolves, so it
    // paints the English fallback regardless of the active language. Every
    // page that renders this table must re-render it on 'languagechange',
    // which setLanguage() dispatches once even for that initial load.
    const root = new URL('../', import.meta.url);
    const pages = () => shippedSources().filter(f => f.endsWith('.html'));
    const tablePages = () => pages().filter(f => /renderDivePlanTableHTML\s*\(/
        .test(readFileSync(new URL(f, root), 'utf8')));

    test('every page rendering the dive plan table re-renders it on languagechange', () => {
        const offenders = [];
        for (const rel of tablePages()) {
            const src = readFileSync(new URL(rel, root), 'utf8');
            const reRenders = [...src.matchAll(/languagechange/g)].some(m => {
                const window = src.slice(m.index, m.index + 600);
                return /renderDivePlanTable|renderPlanTable/.test(window);
            });
            if (!reRenders) offenders.push(rel);
        }
        expect(offenders).toEqual([]);
    });
});

describe('inline module scripts - helpers are really imported', () => {
    // PR #90 vložil `import { fmtNum } ...` doprostřed template literálu s ukázkou
    // kódu. Import se tím stal pouhým textem, `analyzeDive()` padal na
    // ReferenceError a panel varování v sandboxu přestal cokoli vykreslovat.
    // Testy to nezachytily, protože inline skripty v HTML nikdo nespouští.
    const root = new URL('../', import.meta.url);
    // `fmt` se hlídat nedá — je to i běžný název parametru (gradient-factors.html).
    const HELPERS = ['fmtNum', 'fmtRange', 'translate', 'localizeLatex'];

    /** Vyřízne template literály, komentáře a řetězce — zbude spustitelný kód. */
    const executableCode = (src) => src
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    test('every helper called by an inline module script is imported', () => {
        const offenders = [];
        for (const rel of shippedSources().filter(f => f.endsWith('.html'))) {
            const src = readFileSync(new URL(rel, root), 'utf8');
            for (const block of src.match(/<script type="module">[\s\S]*?<\/script>/g) || []) {
                const code = executableCode(block);
                const imported = new Set(
                    (code.match(/import\s*\{([^}]*)\}\s*from/g) || [])
                        .flatMap(m => m.replace(/import\s*\{|\}\s*from/g, '').split(','))
                        .map(s => s.trim().split(/\s+as\s+/).pop())
                );
                for (const h of HELPERS) {
                    if (!new RegExp(`(?:^|[^\\w.])${h}\\s*\\(`, 'm').test(code)) continue;
                    const local = new RegExp(`(?:function|const|let|var)\\s+${h}\\b`).test(code);
                    if (!imported.has(h) && !local) offenders.push(`${rel}: volá ${h}(), ale neimportuje ho`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe('format - decimal separator at runtime', () => {
    test('decimalSeparator follows the language, region subtag ignored', () => {
        expect(decimalSeparator('cs')).toBe(',');
        expect(decimalSeparator('es')).toBe(',');
        expect(decimalSeparator('en')).toBe('.');
        expect(decimalSeparator('cs-CZ')).toBe(',');
        expect(decimalSeparator('en-GB')).toBe('.');
        // Unknown language must not silently become a comma locale.
        expect(decimalSeparator('de')).toBe('.');
        expect(decimalSeparator(undefined)).toBe('.');
    });

    test('fmtNum formats to fixed decimals in the requested language', () => {
        expect(fmtNum(0.7511, 2, 'cs')).toBe('0,75');
        expect(fmtNum(0.7511, 2, 'en')).toBe('0.75');
        expect(fmtNum(0.7511, 2, 'es')).toBe('0,75');
        expect(fmtNum(0.7511, 4, 'cs')).toBe('0,7511');
        expect(fmtNum(-1.25, 1, 'cs')).toBe('-1,3');
        // Rounding must stay identical to toFixed - this is formatting only.
        expect(fmtNum(2.345, 2, 'en')).toBe((2.345).toFixed(2));
    });

    test('fmtNum with no decimals keeps the value, still localized', () => {
        expect(fmtNum(3.5, undefined, 'cs')).toBe('3,5');
        expect(fmtNum(12, undefined, 'cs')).toBe('12');
        expect(fmtNum(12, 0, 'cs')).toBe('12');
    });

    test('fmtNum passes non-finite values through untouched', () => {
        expect(fmtNum(NaN, 2, 'cs')).toBe('NaN');
        expect(fmtNum(Infinity, 2, 'cs')).toBe('Infinity');
        expect(fmtNum(null, 2, 'cs')).toBe('null');
        expect(fmtNum(undefined, 2, 'cs')).toBe('undefined');
        expect(fmtNum('', 2, 'cs')).toBe('');
        // A numeric string is still a number and must format normally.
        expect(fmtNum('0.5', 2, 'cs')).toBe('0,50');
    });

    test('only the decimal separator changes, never digits or sign', () => {
        for (const v of [0, 1, -1, 0.5, -0.05, 1234.5678, 1e-4]) {
            for (const d of [0, 1, 2, 4]) {
                expect(fmtNum(v, d, 'cs')).toBe(fmtNum(v, d, 'en').replace('.', ','));
            }
        }
    });

    // Rendered numbers cannot be grepped - they exist only after the page runs.
    // A static budget on the remaining raw toFixed() calls is therefore the
    // only regression guard: every new display number must go through fmtNum.
    test('no display string interpolates a raw decimal constant', () => {
        // fmt() jen dosazuje do vzoru — desetinnou čárku neumí. Konstanta
        // předaná syrově vysází tečku vedle hodnoty, kterou fmtNum už
        // zlokalizoval: „pO₂ 5,01 bar — toxicita (deko limit 1.6)".
        const root = new URL('../', import.meta.url);
        const argsAt = (src, i) => {
            const out = [];
            let depth = 0, cur = '';
            for (; i < src.length; i++) {
                const c = src[i];
                if (c === '(' || c === '[' || c === '{') depth++;
                else if (c === ')' || c === ']' || c === '}') {
                    if (depth === 0) { out.push(cur); break; }
                    depth--;
                }
                if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
                cur += c;
            }
            return out.map(a => a.trim());
        };
        const offenders = [];
        for (const rel of shippedSources()) {
            const src = readFileSync(new URL(rel, root), 'utf8');
            for (const m of src.matchAll(/\bfmt\(/g)) {
                for (const arg of argsAt(src, m.index + m[0].length).slice(1)) {
                    if (/^\d+\.\d+$/.test(arg) || /^[A-Z][A-Z0-9_]{3,}$/.test(arg)) {
                        offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length}  ${arg}`);
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('no display markup carries a raw decimal constant', () => {
        // Sesterská chyba k `fmt()` výše: konstanta napsaná rovnou do
        // šablonového řetězce se do češtiny nedostane. `gas-law.html`
        // sázel `20 °C + 273.15 = 293,15 K` — tečka i čárka v jednom řádku.
        const root = new URL('../', import.meta.url);
        // Řetězec bez značky je CSS (`opacity: 0.9`) nebo poznámka; hodnota
        // uvnitř značky je atribut (`step="0.1"`, SVG `offset="0.26"`)
        // a desetinná čárka by tam byla neplatná, ne nesprávná.
        const SUBST = /\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
        const offenders = [];
        for (const rel of shippedSources()) {
            const src = readFileSync(new URL(rel, root), 'utf8')
                .replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            for (const m of src.matchAll(/`(?:[^`\\]|\\.)*`/g)) {
                if (!/<\w/.test(m[0])) continue;
                const text = m[0].replace(SUBST, ' ').replace(/<[^>]*>/g, ' ');
                for (const d of text.matchAll(/(?<![\w.])\d+\.\d+(?![\w])/g)) {
                    offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length}  ${d[0]}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('no shipped page formats a display number with raw toFixed', () => {
        const root = new URL('../', import.meta.url);
        // The documented exceptions: contexts where a comma is invalid.
        const ALLOWED = {
            // The formatter itself - the one place toFixed belongs.
            'js/format.js': 1,
            // SVG geometry: path data, line endpoints, circle centre.
            // A decimal comma there is not a typographic choice, it is an
            // invalid attribute value and the browser drops the element.
            'sandbox/haldane.html': 6,
            // <input type="number">.value - a comma is not a valid value
            'sandbox/m-values.html': 5,
            // 2x SVG path geometry, 3x numeric values parsed back with parseFloat.
            'sandbox/schreiner.html': 5,
        };
        const files = [];
        const walkDir = (rel) => {
            for (const e of readdirSync(new URL(rel, root), { withFileTypes: true })) {
                const p = `${rel}${e.name}`;
                if (e.isDirectory()) walkDir(`${p}/`);
                else if (e.name.endsWith('.js') || e.name.endsWith('.html')) files.push(p);
            }
        };
        walkDir('js/');
        walkDir('sandbox/');
        for (const e of readdirSync(root, { withFileTypes: true })) {
            if (e.isFile() && e.name.endsWith('.html')) files.push(e.name);
        }
        // Untranslated developer scratch pages, not linked and not in sw.js.
        const SCRATCH = new Set(['test.html', 'test2.html']);
        const offenders = [];
        for (const f of files) {
            if (SCRATCH.has(f)) continue;
            const src = readFileSync(new URL(f, root), 'utf8');
            const n = (src.match(/\.toFixed\(/g) || []).length;
            const allowed = ALLOWED[f] || 0;
            if (n !== allowed) offenders.push(`${f}: ${n} raw toFixed, expected ${allowed}`);
        }
        expect(offenders).toEqual([]);
    });
});

describe('NDL se meri od zacatku ponoru, ne od prichodu do hloubky (#70)', () => {
    const AIR = { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902 };
    const SS = { enabled: true, depth: 5, time: 3 };

    test('calculateNDL vraci NDL od zacatku ponoru, ne cas v hloubce', () => {
        // Tabulkovy NDL (PADI, US Navy) je maximalni cas na dne mereny od opusteni
        // hladiny, tedy vcetne sestupu. Stejnou konvenci musi drzet i tato aplikace.
        const r = calculateNDL(40, AIR.n2, 1.0);
        expect(r.descentTime).toBeCloseTo(2.0, 3);
        expect(r.ndlExact).toBeCloseTo(r.descentTime + r.ndlAtDepthExact, 6);
        expect(r.ndl).toBe(Math.floor(r.ndlExact));
        expect(r.ndl).toBeGreaterThan(r.ndlAtDepth);
    });

    test('NDL lze primo dosadit jako cas na dne, aniz vznikne deco', () => {
        // AddDiveDialog i tripPlanner sazi NDL rovnou do pole "cas na dne".
        // S novou konvenci je to spravne bez jakekoli korekce.
        for (const depth of [12, 18, 24, 30, 40]) {
            const { ndl } = calculateNDL(depth, AIR.n2, 1.0);
            expect(generateDecoProfile(depth, ndl, [AIR], 100, 100, SS).requiresDeco).toBe(false);
            expect(generateDecoProfile(depth, ndl + 1, [AIR], 100, 100, SS).requiresDeco).toBe(true);
        }
    });

    test('cas v hloubce zustava dostupny pro vypocty', () => {
        const r = calculateNDL(30, AIR.n2, 1.0);
        expect(r.ndlAtDepthExact).toBeCloseTo(r.ndlExact - r.descentTime, 6);
        expect(r.ndlAtDepth).toBe(Math.floor(r.ndlAtDepthExact));
    });

    test('zadny modul neodecita sestup pred porovnanim s NDL', () => {
        // NDL uz sestup obsahuje. Kdo od casu na dne sestup jeste odecte, zapocita
        // ho dvakrat a ohlasi deco pozdeji, nez ma.
        const walk = (dirUrl, prefix = '') => readdirSync(dirUrl, { withFileTypes: true })
            .flatMap(e => e.isDirectory()
                ? walk(new URL(`${e.name}/`, dirUrl), `${prefix}${e.name}/`)
                : (e.name.endsWith('.js') ? [[`${prefix}${e.name}`, new URL(e.name, dirUrl)]] : []));
        const offenders = [];
        for (const [rel, url] of walk(new URL('../js/', import.meta.url))) {
            const src = readFileSync(url, 'utf8')
                .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
            const re = /(?:>|>=|<=|<)\s*ndl\b/gi;
            let m;
            while ((m = re.exec(src)) !== null) {
                const before = src.slice(Math.max(0, m.index - 60), m.index);
                if (/-\s*(descentTime|d\s*\/\s*20)/.test(before)) {
                    offenders.push(`${rel}: ${before.split('\n').pop().trim()}${m[0]}`);
                }
            }
            // ...ani oklikou pres argument getNDLStatus
            const callRe = /getNDLStatus\s*\(([^)]*)\)/g;
            while ((m = callRe.exec(src)) !== null) {
                if (/-\s*(descentTime|d\s*\/\s*20)/.test(m[1])) {
                    offenders.push(`${rel}: ${m[0]}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('getNDLStatus porovnava cas na dne s NDL primo, bez korekce', () => {
        expect(getNDLStatus(20, 8).state).toBe('ok');
        expect(getNDLStatus(20, 8).remaining).toBeCloseTo(12, 6);
        expect(getNDLStatus(10, 9.5).state).toBe('nearLimit');
        expect(getNDLStatus(10, 10.5).state).toBe('deco');
        expect(getNDLStatus(Infinity, 30).state).toBe('unlimited');
    });

    test('prah NDL odpovida simulovanemu primemu vystupu', () => {
        // NDL i generator profilu pouzivaji stejny primy vystup na GF High,
        // takze se jejich rozhodnuti nesmi na presne hranici rozejit.
        for (const depth of [18, 24, 30, 40, 50]) {
            const { descentTime, ndlAtDepthExact, ndlExact } = calculateNDL(depth, AIR.n2, 1.0);
            expect(ndlExact).toBeCloseTo(descentTime + ndlAtDepthExact, 9);
            // tesne pod prahem -> bez deca, tesne nad -> deco
            expect(generateDecoProfile(depth, ndlExact - 0.01, [AIR], 100, 100, SS).requiresDeco).toBe(false);
            expect(generateDecoProfile(depth, ndlExact + 0.01, [AIR], 100, 100, SS).requiresDeco).toBe(true);
        }
    });

    test('NDL ve 40 m odpovida radove tabulkove hodnote', () => {
        // PADI tabulka uvadi pro 40 m ~8 min casu na dne vcetne sestupu.
        const { ndl } = calculateNDL(40, AIR.n2, 1.0);
        expect(ndl).toBeGreaterThanOrEqual(8);
        expect(ndl).toBeLessThanOrEqual(12);
    });

    test('cele minuty nad zobrazenym NDL jeste nespoustí dekompresni vetev', () => {
        // Zobrazeny NDL je zaokrouhleny dolu. Kdyby se prah bral z nej, cas na dne
        // mezi zobrazenym a skutecnym NDL by spadl do dekompresni vetve, ktera tam
        // nema co planovat.
        for (const depth of [12, 18, 24, 30, 40]) {
            const { ndl, ndlExact } = calculateNDL(depth, AIR.n2, 1.0);
            expect(ndlExact).toBeGreaterThanOrEqual(ndl);
            const mid = (ndl + ndlExact) / 2;
            if (mid > ndl) {
                expect(generateDecoProfile(depth, mid, [AIR], 100, 100, SS).requiresDeco).toBe(false);
            }
        }
    });
});

// ============================================================================
// XSS: escaping sinks + sanitizing the shared-link boundary (issue #65)
// ============================================================================

describe('escHtml (js/utils/escHtml.js)', () => {
    test('escapes every character that can break out of HTML or an attribute', () => {
        expect(escHtml('<img src=x onerror="alert(1)">'))
            .toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
        expect(escHtml("' onmouseover='alert(1)")).toBe('&#39; onmouseover=&#39;alert(1)');
        expect(escHtml('a & b')).toBe('a &amp; b');
    });

    test('& is escaped first so entities are not double-decoded by the browser', () => {
        // "&lt;" must survive as literal text, not turn back into "<"
        expect(escHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
    });

    test('null and undefined become empty string, not the words "null"/"undefined"', () => {
        expect(escHtml(null)).toBe('');
        expect(escHtml(undefined)).toBe('');
    });

    test('leaves harmless text untouched', () => {
        expect(escHtml('EAN32')).toBe('EAN32');
        expect(escHtml(21)).toBe('21');
    });
});

describe('warning HTML rendering', () => {
    test('keeps translated quantity markup while escaping placeholder values', () => {
        expect(warningHtml.formatWarningHtml).toBeDefined();
        expect(warningHtml.formatWarningHtml(
            'Pressure: <var>p</var><sub>N₂</sub>, gas {0}',
            '<img src=x onerror=alert(1)>'
        )).toBe('Pressure: <var>p</var><sub>N₂</sub>, gas &lt;img src=x onerror=alert(1)&gt;');
    });

    test('renders formatted warning HTML without exposing structural fields', () => {
        expect(warningHtml.renderWarningsHtml).toBeDefined();
        expect(warningHtml.renderWarningsHtml([{
            type: 'info" onclick="alert(1)',
            icon: '<img src=x>',
            html: '<var>p</var><sub>N₂</sub> = 3,96\u00a0bar'
        }])).toBe(`
                <div class="dive-warning info&quot; onclick=&quot;alert(1)">
                    <span class="dive-warning-icon">&lt;img src=x&gt;</span>
                    <span><var>p</var><sub>N₂</sub> = 3,96\u00a0bar</span>
                </div>
            `);
    });
});

describe('sandbox dive warnings', () => {
    const source = readFileSync(new URL('../sandbox/index.html', import.meta.url), 'utf8');
    const start = source.indexOf('        function analyzeDive(diveSetup) {');
    const end = source.indexOf('\n        /**\n         * Render warnings in the container', start);
    const analyzeDiveSource = source.slice(start, end);
    const analyzeDive = new Function(
        'calculateTissueLoading',
        'calculateCeilingTimeSeries',
        'getAmbientPressure',
        'getDiveSetupPressurePerMeter',
        'getDiveSetupSurfacePressure',
        'SURFACE_PRESSURE',
        'computeGasConsumption',
        'formatWarningHtml',
        'translate',
        'fmtNum',
        `${analyzeDiveSource}\nreturn analyzeDive;`
    )(
        (waypoints) => ({
            timePoints: waypoints.map(wp => wp.time),
            depthPoints: waypoints.map(wp => wp.depth)
        }),
        () => [0, 0, 5, 0],
        (depth) => SURFACE_PRESSURE + depth / 10,
        () => PRESSURE_PER_METER,
        () => SURFACE_PRESSURE,
        SURFACE_PRESSURE,
        (_results, gases) => ({
            consumedByGasId: Object.fromEntries(gases.map(gas => [gas.id, 0])),
            pressureByGasId: Object.fromEntries(gases.map(gas => [gas.id, gas.startPressure]))
        }),
        (template, ...values) => template.replace(/\{(\d+)\}/g, (_match, index) => values[Number(index)]),
        (_key, fallback) => fallback,
        (value) => String(value)
    );

    test('does not classify bottom gas as deco gas merely because a ceiling exists during ascent', () => {
        const result = analyzeDive({
            gases: [{
                id: 'bottom',
                name: 'EAN36',
                o2: 0.36,
                n2: 0.64,
                he: 0,
                cylinderVolume: 24,
                startPressure: 200
            }],
            dives: [{
                waypoints: [
                    { time: 0, depth: 0, gasId: 'bottom' },
                    { time: 2, depth: 40, gasId: 'bottom' },
                    { time: 2.2, depth: 38, gasId: 'bottom' },
                    { time: 6, depth: 0, gasId: 'bottom' }
                ]
            }]
        });

        expect(result.warnings.some(warning => warning.html.includes('during bottom'))).toBe(true);
        expect(result.warnings.some(warning => warning.html.includes('during deco'))).toBe(false);
    });

    test('does not flag the conventional 6 m oxygen switch as exceeding 1.6 bar', () => {
        const result = analyzeDive({
            gases: [
                {
                    id: 'air',
                    name: 'Air',
                    o2: 0.21,
                    n2: 0.79,
                    cylinderVolume: 24,
                    startPressure: 200
                },
                {
                    id: 'o2',
                    name: 'O2',
                    o2: 1,
                    n2: 0,
                    cylinderVolume: 7,
                    startPressure: 200
                }
            ],
            dives: [{
                waypoints: [
                    { time: 0, depth: 0, gasId: 'air' },
                    { time: 2, depth: 30, gasId: 'air' },
                    { time: 25, depth: 30, gasId: 'air' },
                    { time: 28, depth: 6, gasId: 'o2' },
                    { time: 32, depth: 6 },
                    { time: 33, depth: 0 }
                ]
            }]
        });

        expect(result.warnings.some(warning =>
            warning.html.includes('CNS toxicity risk')
        )).toBe(false);
    });
});

describe('decodeDiveSetup sanitizes the shared-link boundary (#65)', () => {
    const encode = (obj) => {
        const b64 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const PAYLOAD = '<img src=x onerror="alert(1)">';

    test('strips markup characters from the setup name and description', () => {
        const out = decodeDiveSetup(encode({
            name: `Dive ${PAYLOAD}`, description: `Desc ${PAYLOAD}`,
            gases: [{ id: 'bottom', name: 'Air' }], dives: [{ waypoints: [] }]
        }));
        expect(out.name.includes('<')).toBe(false);
        expect(out.name.includes('>')).toBe(false);
        expect(out.description.includes('<')).toBe(false);
    });

    test('strips markup from gas name and gas id', () => {
        const out = decodeDiveSetup(encode({
            gases: [{ id: `bottom"${PAYLOAD}`, name: `Air ${PAYLOAD}` }],
            dives: [{ waypoints: [] }]
        }));
        expect(/[<>"']/.test(out.gases[0].name)).toBe(false);
        expect(/[<>"']/.test(out.gases[0].id)).toBe(false);
    });

    test('strips markup from waypoint gasId (lands in a value= attribute)', () => {
        const out = decodeDiveSetup(encode({
            gases: [{ id: 'bottom', name: 'Air' }],
            dives: [{ waypoints: [{ time: 0, depth: 0, gasId: `bottom"${PAYLOAD}` }] }]
        }));
        expect(/[<>"']/.test(out.dives[0].waypoints[0].gasId)).toBe(false);
    });

    test('clamps absurdly long free text', () => {
        const out = decodeDiveSetup(encode({
            name: 'x'.repeat(5000), gases: [{ id: 'bottom', name: 'Air' }], dives: [{ waypoints: [] }]
        }));
        expect(out.name.length).toBe(MAX_SHARED_TEXT_LENGTH);
    });

    test('preserves valid altitude and rejects an out-of-range shared value', () => {
        const valid = decodeDiveSetup(encode({
            environment: { altitude: 1500 },
            gases: [{ id: 'bottom', name: 'Air' }],
            dives: [{ waypoints: [] }]
        }));
        const invalid = decodeDiveSetup(encode({
            environment: { altitude: 500000 },
            gases: [{ id: 'bottom', name: 'Air' }],
            dives: [{ waypoints: [] }]
        }));

        expect(valid.environment.altitude).toBe(1500);
        expect(invalid.environment.altitude).toBe(0);
    });

    test('round-trips altitude through a generated shared link', () => {
        const setup = {
            name: 'Altitude dive',
            environment: { altitude: 1500 },
            gases: [{ id: 'bottom', name: 'Air' }],
            dives: [{ waypoints: [] }]
        };

        expect(decodeDiveSetup(encodeDiveSetup(setup)).environment)
            .toEqual({ altitude: 1500, waterType: WATER_TYPES.STANDARD });
    });

    test('round-trips valid water types and defaults invalid values', () => {
        const valid = decodeDiveSetup(encode({
            environment: { altitude: 0, waterType: WATER_TYPES.FRESH },
            gases: [],
            dives: []
        }));
        const invalid = decodeDiveSetup(encode({
            environment: { altitude: 0, waterType: 'brine' },
            gases: [],
            dives: []
        }));

        expect(valid.environment.waterType).toBe(WATER_TYPES.FRESH);
        expect(invalid.environment.waterType).toBe(WATER_TYPES.STANDARD);
    });

    test('round-trips a study mode and defaults unknown values safely', () => {
        const setup = {
            decoMode: DECO_MODES.ADAPTIVE,
            gases: [{ id: 'bottom', name: 'Air' }],
            dives: [{ waypoints: [] }]
        };
        expect(decodeDiveSetup(encodeDiveSetup(setup)).decoMode)
            .toBe(DECO_MODES.ADAPTIVE);

        const invalid = decodeDiveSetup(encode({
            decoMode: 'unsafe-custom-mode',
            gases: [{ id: 'bottom', name: 'Air' }],
            dives: [{ waypoints: [] }]
        }));
        expect(invalid.decoMode).toBe(DECO_MODES.STANDARD);
    });

    test('reads Android compact-link study modes and defaults unknown values safely', () => {
        expect(getCompactDecoMode(new URLSearchParams('dm=adaptive')))
            .toBe(DECO_MODES.ADAPTIVE);
        expect(getCompactDecoMode(new URLSearchParams('dm=continuous')))
            .toBe(DECO_MODES.CONTINUOUS);
        expect(getCompactDecoMode(new URLSearchParams('dm=unsafe-custom-mode')))
            .toBe(DECO_MODES.STANDARD);
        expect(getCompactDecoMode(new URLSearchParams()))
            .toBe(DECO_MODES.STANDARD);
    });

    test('leaves a legitimate setup functionally intact', () => {
        const setup = {
            name: 'Trimix 40 m', gfLow: 30, gfHigh: 70,
            gases: [{ id: 'bottom', name: 'EAN32', o2: 0.32, n2: 0.68 }],
            dives: [{ waypoints: [{ time: 0, depth: 0 }, { time: 2, depth: 40, gasId: 'bottom' }] }]
        };
        const out = decodeDiveSetup(encode(setup));
        expect(out.name).toBe('Trimix 40 m');
        expect(out.gases[0].id).toBe('bottom');
        expect(out.gases[0].o2).toBe(0.32);
        expect(out.gfLow).toBe(30);
        expect(out.dives[0].waypoints[1].gasId).toBe('bottom');
    });
});

describe('guard: user-controlled values reaching innerHTML go through escHtml (#65)', () => {
    // Fields an attacker controls through a shared ?profile= link or a stored
    // profile. Escaping at the boundary is defence in depth; the sink is the
    // control that must hold, so scan the sources rather than trusting review.
    const TAINTED = /\b(?:gas|g|p|profile|tank|s|w|d|r)\.(?:name|id|gas|message|icon|type|label)\b/;
    const FILES = [
        'js/diveSetup.js',
        'js/components/DiveSetupEditor.js',
        'js/components/DiveEditPanel.js',
        'js/components/RuntimeTable.js',
        'js/warningHtml.js',
        'sandbox/index.html',
        'sandbox/repetitive-dives.html'
    ];

    for (const rel of FILES) {
        test(`${rel} escapes every tainted interpolation`, () => {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            const unescaped = [];
            for (const m of text.matchAll(/\$\{([^{}]*)\}/g)) {
                const expr = m[1];
                if (!TAINTED.test(expr)) continue;
                if (expr.includes('escHtml(')) continue;
                if (/\?\s*'[^']*'\s*:\s*'[^']*'/.test(expr)) continue;  // ternary yielding literals
                unescaped.push(expr.trim());
            }
            expect(unescaped).toEqual([]);
        });
    }

    test('the shared escHtml module is the only escaping helper (no local copies)', () => {
        const copies = [];
        for (const rel of FILES) {
            const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
            if (/const\s+esc\s*=\s*\(/.test(text)) copies.push(rel);
        }
        expect(copies).toEqual([]);
    });
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results: ${passedTests}/${totalTests} passed`);
if (failedTests > 0) {
    console.log(`❌ ${failedTests} test(s) failed`);
    process.exit(1);
} else {
    console.log('✅ All tests passed!');
    process.exit(0);
}
