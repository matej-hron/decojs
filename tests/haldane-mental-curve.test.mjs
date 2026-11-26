// Haldane sandbox: the "target changes once, then stays fixed" illustration must show an
// exponential approach — steepest right after t = 0, then flattening — never an S-curve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../sandbox/haldane.html', import.meta.url), 'utf8');
const doc = new JSDOM(html).window.document;
const path = doc.querySelector('.equation-mental-model path[data-haldane-tissue-curve]');

test('tissue curve exists as a polyline of points', () => {
    assert.ok(path, 'path[data-haldane-tissue-curve] is missing');
    assert.match(path.getAttribute('d'), /^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/);
});

test('tissue curve has no S-shape: rise per step only shrinks', () => {
    const nums = path.getAttribute('d').match(/[\d.]+/g).map(Number);
    const pts = [];
    for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    // SVG y grows downward, so a rising pressure means y decreases.
    const slopes = pts.slice(1).map(([x, y], i) => (pts[i][1] - y) / (x - pts[i][0]));
    slopes.forEach((s, i) => assert.ok(s > 0, `segment ${i} must rise`));
    for (let i = 1; i < slopes.length; i++) {
        assert.ok(slopes[i] < slopes[i - 1], `slope must decrease (segment ${i}: ${slopes[i]} ≥ ${slopes[i - 1]})`);
    }
    const [x0, y0] = pts[0];
    assert.deepEqual([x0, y0], [130, 164], 'curve starts at t = 0 on the original level');
    assert.ok(pts.at(-1)[1] > 48, 'curve approaches but does not reach the new target');
});
