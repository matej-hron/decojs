import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    NARROW_CHART_MAX_WIDTH, NARROW_BUTTON_GUTTER_PX, isNarrowChartWidth,
    applyNarrowOverrides, syncNarrowClass, rankingPlacement, narrowChartPlugin,
} from '../js/charts/narrowLayout.js';

const desktopOptions = () => ({
    layout: { padding: { right: 170 } },
    plugins: {
        legend: { labels: { boxWidth: 40, font: { size: 12 } } },
        annotation: { annotations: {
            max: { type: 'line', label: { font: { size: 10, weight: 'bold' }, padding: { top: 3, bottom: 3, left: 6, right: 6 } } },
            descent: { type: 'label', font: { size: 9 }, padding: { top: 3, bottom: 3, left: 6, right: 6 } },
            tiny: { type: 'label', font: { size: 8 } },
            plain: { type: 'box' },
        } },
    },
    scales: { x: { title: { text: 'Time', font: { size: 14 } } }, y: { ticks: {} } },
});

test('width threshold', () => {
    assert.equal(NARROW_CHART_MAX_WIDTH, 600);
    assert.equal(isNarrowChartWidth(390), true);
    assert.equal(isNarrowChartWidth(600), true);
    assert.equal(isNarrowChartWidth(601), false);
    assert.equal(isNarrowChartWidth(0), false, 'hidden host is not narrow');
    assert.equal(isNarrowChartWidth(NaN), false);
    assert.equal(isNarrowChartWidth(undefined), false);
});

test('narrow overrides: gutter, legend, axes, annotations', () => {
    const o = desktopOptions();
    applyNarrowOverrides(o, true, new Map());
    assert.deepEqual(o.layout.padding, { right: 170, top: NARROW_BUTTON_GUTTER_PX });
    assert.equal(o.plugins.legend.labels.boxWidth, 14);
    assert.equal(o.plugins.legend.labels.padding, 6);
    assert.equal(o.plugins.legend.labels.font.size, 11);
    assert.equal(o.scales.x.title.font.size, 11);
    assert.equal(o.scales.y.title.font.size, 11);
    assert.equal(o.scales.y.ticks.font.size, 10);
    const a = o.plugins.annotation.annotations;
    assert.equal(a.max.label.font.size, 9);
    assert.equal(a.max.label.font.weight, 'bold', 'other font keys kept');
    assert.deepEqual(a.max.label.padding, { top: 2, bottom: 2, left: 4, right: 4 });
    assert.equal(a.descent.font.size, 8);
    assert.equal(a.tiny.font.size, 8, 'never below 8 px');
    assert.deepEqual(a.plain, { type: 'box' }, 'annotations without labels untouched');
});

test('re-applying is idempotent (no cumulative shrink)', () => {
    const o = desktopOptions();
    const saved = new Map();
    applyNarrowOverrides(o, true, saved);
    applyNarrowOverrides(o, true, saved);
    applyNarrowOverrides(o, true, saved);
    assert.equal(o.plugins.annotation.annotations.max.label.font.size, 9);
    assert.equal(o.plugins.legend.labels.font.size, 11);
});

test('going wide restores the exact desktop options', () => {
    const o = desktopOptions();
    const saved = new Map();
    applyNarrowOverrides(o, true, saved);
    applyNarrowOverrides(o, false, saved);
    assert.deepEqual(o, desktopOptions());
    assert.equal(saved.size, 0);
});

test('wide with nothing saved is a no-op', () => {
    const o = desktopOptions();
    applyNarrowOverrides(o, false, new Map());
    assert.deepEqual(o, desktopOptions());
});

test('numeric layout.padding keeps its other sides', () => {
    const o = { layout: { padding: 10 } };
    const saved = new Map();
    applyNarrowOverrides(o, true, saved);
    assert.deepEqual(o.layout.padding, { top: 40, right: 10, bottom: 10, left: 10 });
    applyNarrowOverrides(o, false, saved);
    assert.deepEqual(o, { layout: { padding: 10 } });
});

test('missing sections are created on narrow and removed on restore', () => {
    const o = {};
    const saved = new Map();
    applyNarrowOverrides(o, true, saved);
    assert.equal(o.layout.padding.top, 40);
    assert.equal(o.plugins.legend.labels.font.size, 11);
    applyNarrowOverrides(o, false, saved);
    assert.deepEqual(o, {}, 'containers created on narrow are pruned again');
});

test('scriptable (function) fonts are left alone', () => {
    const fn = () => ({ size: 12 });
    const o = { scales: { x: { ticks: { font: fn } } } };
    applyNarrowOverrides(o, true, new Map());
    assert.equal(o.scales.x.ticks.font, fn);
});

test('plugin applies by chart width and restores on widen', () => {
    const options = desktopOptions();
    const chart = { width: 390, config: { options } };
    narrowChartPlugin.beforeUpdate(chart);
    assert.equal(options.layout.padding.top, 40);
    chart.width = 844;
    narrowChartPlugin.beforeUpdate(chart);
    assert.deepEqual(options, desktopOptions());
});

test('syncNarrowClass toggles chart-narrow from clientWidth', () => {
    const classes = new Set();
    const host = { clientWidth: 390, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
    assert.equal(syncNarrowClass(host), true);
    assert.ok(classes.has('chart-narrow'));
    host.clientWidth = 1200;
    assert.equal(syncNarrowClass(host), false);
    assert.ok(!classes.has('chart-narrow'));
});

test('ranking placement', () => {
    assert.equal(rankingPlacement(390), 'below');
    assert.equal(rankingPlacement(700), 'hidden');
    assert.equal(rankingPlacement(800), 'overlay');
    assert.equal(rankingPlacement(0), 'hidden');
});
