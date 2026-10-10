/**
 * Open-in-maps links and trigger markup.
 * Run: node --test tests/map-links.test.mjs
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLinks, mapLinkButtonHtml } from '../js/logbook/mapLinks.js';
import { siteMapHtml } from '../js/logbook/siteMap.js';
import { visualHtml } from '../js/logbook/feedCard.js';

describe('mapLinks', () => {
    test('exact position: Mapy.com with marker, Google search, navigation', () => {
        const l = mapLinks({ lat: 50.0875, lon: 14.4213, label: 'Lom Barbora' });
        assert.equal(l.mapy, 'https://mapy.com/fnc/v1/showmap?mapset=outdoor&center=14.4213,50.0875&zoom=16&marker=true');
        assert.equal(l.google, 'https://www.google.com/maps/search/?api=1&query=50.0875,14.4213');
        assert.equal(l.navigate, 'https://www.google.com/maps/dir/?api=1&destination=50.0875,14.4213');
        assert.equal(l.geo, null);
    });
    test('approximate area: wider zoom, no marker, no navigation', () => {
        const l = mapLinks({ lat: 50.09, lon: 14.42, exact: false });
        assert.match(l.mapy, /zoom=13&marker=false$/);
        assert.equal(l.navigate, null);
    });
    test('geo: link only on Android, label encoded and stripped of brackets', () => {
        const l = mapLinks({ lat: 1.5, lon: -2.25, label: 'Lom (Báry) č.1', android: true });
        assert.equal(l.geo, `geo:1.5,-2.25?q=1.5,-2.25(${encodeURIComponent('Lom Báry č.1')})`);
        assert.equal(mapLinks({ lat: 1, lon: 2, android: true }).geo, 'geo:1,2?q=1,2');
    });
    test('invalid positions give null', () => {
        for (const p of [null, {}, { lat: NaN, lon: 1 }, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }]) assert.equal(mapLinks(p), null);
    });
});

describe('triggers', () => {
    test('button carries position, exactness and escaped label', () => {
        const h = mapLinkButtonHtml({ lat: 50, lon: 14, label: 'A "b" <c>', exact: false });
        assert.match(h, /^<button type="button"/);
        assert.match(h, /data-exact="false"/);
        assert.ok(!h.includes('<c>'));
        assert.equal(mapLinkButtonHtml({ lat: NaN, lon: 1 }), '');
    });
    test('site map and feed map include a trigger; the card one is a span (cards are links)', () => {
        const area = { lat: 50, lon: 14, exact: true };
        assert.match(siteMapHtml({ area, apiKey: 'k', width: 10, height: 10, alt: 'x', label: 'Lom' }), /data-map-link/);
        const v = visualHtml({ kind: 'map', entryId: 'e', variant: 'feed', map: { src: 's', width: 1, height: 1, alt: 'a', link: { lat: 50, lon: 14, label: 'L' } } });
        assert.match(v, /<span role="button"[^>]*data-map-link/);
    });
});
