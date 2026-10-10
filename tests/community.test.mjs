/**
 * DecoTrail community helpers: routes, community.js, avatars.js.
 * Run: node --test tests/community.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeHref } from '../js/logbook/router.js';
import {
    VISIBILITIES, OFFERED_VISIBILITIES, displayName, isOwn, chooseCommunityVisual,
    memberStatsView, countryName, COUNTRY_CODES, entryFromCommunityRow,
} from '../js/logbook/community.js';
import { AVATAR_KEYS, AVATARS, fallbackAvatarKey, avatarHtml } from '../js/logbook/avatars.js';
import { SHELL_TABS, shellTabs, activeTab, resolveRoute } from '../js/logbook/AppShell.js';

const NB = ' ';

test('router: home, dives, feed, community, member, memberDive, profile', () => {
    assert.deepEqual(parseRoute(''), { name: 'home' });
    assert.deepEqual(parseRoute('#'), { name: 'home' });
    assert.deepEqual(parseRoute('#/'), { name: 'home' });
    assert.deepEqual(parseRoute('#access_token=x'), { name: 'home' });
    assert.deepEqual(parseRoute('#/dives'), { name: 'list' });
    assert.deepEqual(parseRoute('#/feed'), { name: 'feed' });
    assert.deepEqual(parseRoute('#/community'), { name: 'community' });
    assert.deepEqual(parseRoute('#/member/ab-12'), { name: 'member', id: 'ab-12' });
    assert.deepEqual(parseRoute('#/m/ab-12'), { name: 'memberDive', id: 'ab-12' });
    assert.deepEqual(parseRoute('#/m/ab-12/analysis'), { name: 'memberAnalysis', id: 'ab-12' });
    assert.deepEqual(parseRoute('#/profile'), { name: 'profile' });
    assert.deepEqual(parseRoute('#/member/'), { name: 'notFound' });
    assert.deepEqual(parseRoute('#/m/ab-12/edit'), { name: 'notFound' });
    assert.deepEqual(parseRoute('#/toString'), { name: 'notFound' });
    assert.equal(routeHref({ name: 'home' }), '#/');
    assert.equal(routeHref({ name: 'list' }), '#/dives');
    for (const r of [{ name: 'list' }, { name: 'feed' }, { name: 'community' }, { name: 'member', id: 'x1' }, { name: 'memberDive', id: 'x1' }, { name: 'memberAnalysis', id: 'x1' }, { name: 'profile' }, { name: 'home' }])
        assert.deepEqual(parseRoute(routeHref(r)), r);
});

test('visibilities: link exists but is not offered', () => {
    assert.deepEqual([...VISIBILITIES], ['private', 'members', 'link']);
    assert.deepEqual([...OFFERED_VISIBILITIES], ['private', 'members']);
    assert.ok(Object.isFrozen(VISIBILITIES) && Object.isFrozen(OFFERED_VISIBILITIES));
});

test('displayName falls back to Diver, never email', () => {
    const t = k => ({ 'trail.diver': 'Diver' }[k] ?? k);
    assert.equal(displayName({ display_name: '  ' }, t), 'Diver');
    assert.equal(displayName(null, t), 'Diver');
    assert.equal(displayName({ display_name: ' Petr ' }, t), 'Petr');
    assert.equal(displayName({ display_name: null, email: 'a@b.c' }, t), 'Diver');
});

test('isOwn compares owner, else id', () => {
    assert.equal(isOwn({ owner: 'u1', id: 'e1' }, 'u1'), true);
    assert.equal(isOwn({ owner: 'u2', id: 'u1' }, 'u1'), false);
    assert.equal(isOwn({ id: 'u1' }, 'u1'), true);
    assert.equal(isOwn(null, 'u1'), false);
    assert.equal(isOwn({ id: 'u1' }, null), false);
});

test('chooseCommunityVisual: map only with shared coordinates', () => {
    const e = { site_lat: null, site_lon: null, recording_id: 'r1' };
    assert.equal(chooseCommunityVisual({ entry: e, apiKey: 'k' }).kind, 'profile');
    assert.equal(chooseCommunityVisual({ entry: { ...e, site_lat: 50, site_lon: 14 }, apiKey: 'k' }).kind, 'map');
    assert.equal(chooseCommunityVisual({ entry: { ...e, site_lat: 50, site_lon: 14 }, apiKey: '' }).kind, 'profile');
    assert.equal(chooseCommunityVisual({ photoUrl: 'u', entry: e, apiKey: 'k' }).kind, 'photo');
    assert.equal(chooseCommunityVisual({ entry: { recording_id: null }, apiKey: '' }).kind, 'none');
});

test('entryFromCommunityRow splits site fields and never carries notes', () => {
    const row = {
        id: 'e1', owner: 'u1', dive_date: '2026-09-01', max_depth_m: 30, notes: 'secret', recording_id: 'r1',
        site_id: 's1', site_name: 'Lom', site_country: 'CZ', site_water: 'fresh', site_altitude_m: 400,
        site_lat: 50.1, site_lon: 14.2, photo_path: 'u1/p.jpg', photo_count: 2,
    };
    const { entry, site } = entryFromCommunityRow(row);
    assert.equal(entry.notes, null);
    assert.equal(entry.max_depth_m, 30);
    assert.equal(entry.site_id, 's1');
    for (const k of ['site_name', 'site_country', 'site_lat', 'site_lon', 'photo_path', 'photo_count']) assert.ok(!(k in entry), k);
    assert.deepEqual(site, { id: 's1', name: 'Lom', country: 'CZ', water: 'fresh', altitude_m: 400, lat: 50.1, lon: 14.2, url: null });
    const noCoords = entryFromCommunityRow({ ...row, site_lat: undefined, site_lon: undefined }).site;
    assert.equal(noCoords.lat, null);
    assert.equal(noCoords.lon, null);
    assert.equal(entryFromCommunityRow({ ...row, site_id: null }).site, null);
});

test('memberStatsView uses decimal comma in Czech', () => {
    const num = (v, d) => v.toFixed(d).replace('.', ',');
    const stats = memberStatsView({ dive_count: 42, deepest_m: 38.6, total_s: 3600 * 31.4 }, num);
    assert.deepEqual(stats, [
        { key: 'dives', value: '42', unit: '' },
        { key: 'deepest', value: '38,6', unit: 'm' },
        { key: 'time', value: `31${NB}h`, unit: '' },
    ]);
    assert.deepEqual(memberStatsView({ dive_count: 0, deepest_m: null, total_s: 0 }, num).map(s => s.key), ['dives', 'time']);
});

test('countryName localizes and degrades to the code', () => {
    assert.equal(countryName('', 'en'), '');
    assert.equal(countryName(null, 'en'), '');
    assert.equal(countryName('CZ', 'en'), 'Czechia');
    assert.equal(countryName('ZZZZ', 'en'), 'ZZZZ');
    assert.equal(countryName('CZ', '!!bad'), 'CZ');
});

test('COUNTRY_CODES: all assigned alpha-2 codes, unique and frozen', () => {
    assert.ok(Object.isFrozen(COUNTRY_CODES));
    assert.equal(COUNTRY_CODES.length, 249);
    assert.equal(new Set(COUNTRY_CODES).size, 249);
    for (const c of COUNTRY_CODES) assert.match(c, /^[A-Z]{2}$/);
    for (const c of ['CZ', 'SK', 'ES', 'EG', 'MT', 'HR', 'PH', 'ID', 'MX']) assert.ok(COUNTRY_CODES.includes(c), c);
});

test('avatars: 12 unique keys, safe SVG, deterministic fallback', () => {
    assert.equal(AVATAR_KEYS.length, 12);
    assert.equal(new Set(AVATAR_KEYS).size, 12);
    assert.deepEqual([...AVATAR_KEYS], Array.from({ length: 12 }, (_, i) => `reef-${String(i + 1).padStart(2, '0')}`));
    for (const k of AVATAR_KEYS) {
        const svg = AVATARS[k].svg;
        assert.match(svg, /^<svg [^>]*viewBox="0 0 64 64"/);
        assert.doesNotMatch(svg, /<script|\son\w+=|href=|\sid=|url\(/i);
        assert.ok(AVATARS[k].label.en && AVATARS[k].label.cs && AVATARS[k].label.es);
    }
    assert.equal(new Set(AVATAR_KEYS.map(k => AVATARS[k].svg)).size, 12);
    assert.equal(fallbackAvatarKey('abc'), fallbackAvatarKey('abc'));
    assert.equal(fallbackAvatarKey('abc'), AVATAR_KEYS[(97 + 98 + 99) % 12]);
    assert.ok(AVATAR_KEYS.includes(fallbackAvatarKey('zzz')));
    assert.ok(AVATAR_KEYS.includes(fallbackAvatarKey(undefined)));
});

test('avatarHtml escapes the name and prefers the uploaded url', () => {
    const preset = avatarHtml({ preset: 'reef-03', name: '<b>', size: 32 });
    assert.match(preset, /^<span class="tr-avatar" style="--size:32px" role="img" aria-label="&lt;b&gt;" data-avatar="reef-03">/);
    assert.ok(preset.includes(AVATARS['reef-03'].svg));
    assert.doesNotMatch(preset, /<b>/);
    const photo = avatarHtml({ preset: 'reef-03', url: 'https://x/a.jpg?a=1&b="2"', name: 'Petr' });
    assert.match(photo, /<img src="https:\/\/x\/a\.jpg\?a=1&amp;b=&quot;2&quot;" alt=""/);
    assert.doesNotMatch(photo, /<svg/);
    assert.match(photo, /--size:40px/);
    const unknown = avatarHtml({ preset: 'nope', name: 'abc' });
    assert.ok(unknown.includes(AVATARS[fallbackAvatarKey('abc')].svg));
});

test('avatarHtml: own-property presets only, sane size, label and id fallbacks', () => {
    const proto = avatarHtml({ preset: 'constructor', name: 'abc' });
    assert.doesNotMatch(proto, /undefined/);
    assert.ok(proto.includes(AVATARS[fallbackAvatarKey('abc')].svg));
    for (const size of [0, -5, NaN, Infinity, 'x']) assert.match(avatarHtml({ preset: 'reef-01', size }), /--size:40px/);
    assert.match(avatarHtml({ preset: 'reef-01', size: '48' }), /--size:48px/);
    assert.match(avatarHtml({ preset: 'reef-02', name: '' }), /aria-label="Fin"/);
    assert.match(avatarHtml({ preset: 'reef-02', name: '   ' }), /aria-label="Fin"/);
    const byId = avatarHtml({ preset: null, id: 'user-7', name: 'Petr' });
    assert.ok(byId.includes(AVATARS[fallbackAvatarKey('user-7')].svg));
    const key = fallbackAvatarKey('user-7');
    assert.match(avatarHtml({ id: 'user-7' }), new RegExp(`aria-label="${AVATARS[key].label.en}"`));
});

test('shellTabs and activeTab', () => {
    assert.deepEqual(SHELL_TABS, ['feed', 'list', 'community', 'sites', 'profile']);
    assert.deepEqual(shellTabs(true), ['feed', 'list', 'community', 'sites', 'profile']);
    assert.deepEqual(shellTabs(false), ['list', 'sites']);
    const cases = {
        feed: 'feed', list: 'list', new: 'list', detail: 'list', edit: 'list', analysis: 'list',
        community: 'community', member: 'community', memberDive: 'feed', memberAnalysis: 'feed',
        sites: 'sites', site: 'sites', profile: 'profile',
    };
    for (const [name, tab] of Object.entries(cases)) assert.equal(activeTab(name, true), tab, name);
    assert.equal(activeTab('home', true), 'feed');
    assert.equal(activeTab('home', false), 'list');
    assert.equal(activeTab('home'), 'list');
    assert.equal(activeTab('notFound', true), null);
});

test('resolveRoute: home and community routes depend on the feature', () => {
    assert.deepEqual(resolveRoute({ name: 'home' }, true), { name: 'feed' });
    assert.deepEqual(resolveRoute({ name: 'home' }, false), { name: 'list' });
    for (const name of ['feed', 'community', 'profile']) assert.deepEqual(resolveRoute({ name }, false), { name: 'list' });
    assert.deepEqual(resolveRoute({ name: 'member', id: 'x' }, false), { name: 'list' });
    assert.deepEqual(resolveRoute({ name: 'member', id: 'x' }, true), { name: 'member', id: 'x' });
    assert.deepEqual(resolveRoute({ name: 'detail', id: 'x' }, false), { name: 'detail', id: 'x' });
});

// ---- feedCard.js ----

import { feedCardHtml, statsHtml, visualHtml, ratingHtml } from '../js/logbook/feedCard.js';

const ownCard = extra => feedCardHtml({
    entry: { id: 'e7', log_number: 7 }, href: '#/dive/e7', title: 'Lom Leštinka', whenText: 'Mon, Sep 28, 2026, 10:15',
    numberLabel: '#7', statsHtml: '<dl class="lb-stats"></dl>', visualHtml: '<div class="lb-visual"></div>', ...extra,
});

test('feedCardHtml without an author: the My dives card (link, number badge, when line, no author row)', () => {
    const html = ownCard({ peopleText: 'with Petr', notesText: 'Cold <b>', badgeHtml: '<span class="lb-badge">Add details</span>' });
    assert.match(html, /^<a class="lb-feed-card" href="#\/dive\/e7">/);
    assert.match(html, /<\/a>$/);
    assert.match(html, /<span class="lb-num-badge" aria-hidden="true">7<\/span>/);
    assert.match(html, /<span class="rda-visually-hidden">#7, <\/span><span class="lb-date">Mon, Sep 28, 2026, 10:15<\/span>/);
    assert.match(html, /<p class="lb-feed-people">with Petr<\/p>/);
    assert.match(html, /<p class="lb-feed-notes">Cold &lt;b&gt;<\/p>/);
    assert.ok(html.includes('<span class="lb-badge">Add details</span>'));
    assert.ok(!html.includes('tr-author'));
    assert.ok(html.indexOf('lb-feed-main') < html.indexOf('<div class="lb-visual">'), 'the picture comes last');
});

test('ratingHtml: five stars with a spoken value; nothing without a valid rating', () => {
    const html = ratingHtml(4, 'Rating 4 / 5');
    assert.match(html, /role="img" aria-label="Rating 4 \/ 5"/);
    assert.match(html, /lb-rate-on" aria-hidden="true">★★★★<\/span><span class="lb-rate-off" aria-hidden="true">★<\/span>/);
    for (const bad of [null, 0, 6, 2.5]) assert.equal(ratingHtml(bad, 'x'), '');
    assert.match(ownCard({ ratingHtml: html }), /lb-feed-rating/);
    assert.doesNotMatch(ownCard({}), /lb-feed-rating/);
});

test('feedCardHtml without an author: a missing number shows "–"; select mode is a pickable box', () => {
    assert.match(ownCard({ entry: { id: 'e7', log_number: null } }), /lb-num-badge" aria-hidden="true">–</);
    const picked = ownCard({ pick: { id: 'e7', selected: true }, selectHtml: '<input class="lb-select-box">' });
    assert.match(picked, /^<div class="lb-feed-card lb-selectable lb-selected" data-pick="e7">/);
    assert.match(picked, /<\/div>$/);
    assert.ok(picked.includes('<div class="lb-feed-head"><input class="lb-select-box">'));
    assert.ok(!picked.includes('href='));
});

test('feedCardHtml with an author: author row above the head, title links to the dive', () => {
    const html = feedCardHtml({
        entry: { id: 'o1', log_number: null, owner: 'u2' }, href: '#/m/o1', title: 'Blue <Hole>', whenText: 'Sep 30',
        statsHtml: '', visualHtml: '<div class="lb-visual"></div>',
        author: { name: 'Jana <script>', avatarHtml: '<span class="tr-avatar"></span>', href: '#/member/u2', own: false },
    });
    assert.match(html, /^<article class="lb-feed-card tr-feed-card">/);
    assert.match(html, /<\/article>$/);
    for (const part of html.split('</a>')) assert.ok(part.split('<a ').length <= 2, 'no nested links');
    assert.match(html, /<div class="tr-author"><a class="tr-author-link" href="#\/member\/u2"><span class="tr-avatar"><\/span><span class="tr-author-name">Jana &lt;script&gt;<\/span><\/a>/);
    assert.match(html, /<\/a><span class="tr-author-when">Sep 30<\/span><\/div>/, 'the date is outside the member link');
    assert.match(html, /<a class="tr-feed-link" href="#\/m\/o1">Blue &lt;Hole&gt;<\/a>/);
    assert.ok(html.indexOf('tr-author') < html.indexOf('lb-feed-head'), 'author row comes first');
    assert.ok(!html.includes('lb-num-badge'), 'no number badge when log_number is null');
    assert.ok(!html.includes('lb-feed-when'), 'the date lives in the author row');
});

test('feedCardHtml with an author: own dives keep their number; the own flag marks the card', () => {
    const html = feedCardHtml({
        entry: { id: 'e7', log_number: 7, owner: 'u1' }, href: '#/dive/e7', title: 'Dive #7', untitled: true, whenText: 'Sep 28', numberLabel: '#7',
        author: { name: 'You', avatarHtml: '', href: '#/member/u1', own: true },
    });
    assert.match(html, /^<article class="lb-feed-card tr-feed-card tr-feed-own">/);
    assert.match(html, /<span class="lb-num-badge" aria-hidden="true">7<\/span>/);
    assert.match(html, /<h4 class="lb-feed-title lb-untitled"><a class="tr-feed-link" href="#\/dive\/e7"><span class="rda-visually-hidden">#7, <\/span>Dive #7<\/a><\/h4>/);
});

test('statsHtml and visualHtml escape and keep the units apart', () => {
    assert.equal(statsHtml([], k => k), '');
    const s = statsHtml([{ key: 'depth', value: '12,5', unit: 'm' }, { key: 'gas', value: 'EAN<32>', unit: '' }], k => `L-${k}`);
    assert.ok(s.includes(`<dt>L-depth</dt>`));
    assert.ok(s.includes(`12,5<span class="lb-unit">${NB}m</span>`));
    assert.ok(s.includes('EAN&lt;32&gt;</dd>'));
    const photo = visualHtml({ kind: 'photo', entryId: 'x"1', variant: 'feed', photoUrl: 'data:image/jpeg;base64,AA', more: 2, moreText: '2 more photos' });
    assert.ok(photo.includes('data-entry="x&quot;1"'));
    assert.ok(photo.includes('+2'));
    assert.equal(visualHtml({ kind: 'none', entryId: 'x', variant: 'feed' }), '');
    assert.ok(visualHtml({ kind: 'none', entryId: 'x', variant: 'tile', numberText: '#3' }).includes('<span>#3</span>'));
    const prof = visualHtml({ kind: 'profile', entryId: 'x', variant: 'feed', recordingId: 'r1', profileAlt: 'Depth profile', depthText: `9,1${NB}m` });
    assert.ok(prof.includes('data-rec="r1"') && prof.includes('lb-visual-depth'));
});

// ---- CommunityFeed (jsdom) ----

import { CommunityFeed } from '../js/logbook/CommunityFeed.js';

async function withDom(fn) {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://localhost/lab/dive-log.html#/feed' });
    const saved = {};
    for (const k of ['window', 'document', 'location']) {
        saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
        Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
    }
    try {
        return await fn(dom.window.document.getElementById('host'));
    } finally {
        for (const [k, d] of Object.entries(saved)) {
            if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
        }
    }
}

test('CommunityFeed: author rows, own vs member links, Load more pages by 30', async () => {
    await withDom(async host => {
        const rows = Array.from({ length: 35 }, (_, i) => ({
            id: `d${i}`, owner: i === 0 ? 'me' : i === 1 ? 'ghost' : 'u2', log_number: i === 0 ? 12 : null,
            dive_date: `2026-0${9 - Math.floor(i / 10)}-${String(28 - (i % 10)).padStart(2, '0')}`, max_depth_m: 20, duration_s: 1800,
            site_id: i === 2 ? 's1' : null, site_name: i === 2 ? 'Reef <A>' : null, photo_path: null, photo_count: 0, notes: 'never',
        }));
        const calls = [];
        const store = {
            listMembers: async () => [{ id: 'me', display_name: 'Me' }, { id: 'u2', display_name: 'Jana <i>', avatar_path: 'u2/a.jpg' }],
            listCommunityEntries: async args => { calls.push(args); return rows.slice(args.offset, args.offset + args.limit); },
            photoUrls: async () => new Map(),
            avatarUrls: async paths => new Map(paths.map(p => [p, 'https://example.test/a.jpg'])),
            loadCommunityRecording: async () => null,
        };
        const feed = new CommunityFeed(host, { store, userId: 'me' });
        await new Promise(r => setTimeout(r, 20));
        assert.deepEqual(calls[0], { owner: null, limit: 30, offset: 0 });
        assert.equal(host.querySelectorAll('.tr-feed-card').length, 30);
        const own = host.querySelector('.tr-feed-own');
        assert.equal(own.querySelector('.tr-author-name').textContent, 'You');
        assert.equal(own.querySelector('.tr-feed-link').getAttribute('href'), '#/dive/d0');
        assert.ok(own.querySelector('.lb-num-badge'));
        const ghost = host.querySelector('.tr-feed-link[href="#/m/d1"]').closest('.tr-feed-card');
        assert.equal(ghost.querySelector('.tr-author-name').textContent, 'Diver', 'no profile row → Diver');
        assert.equal(ghost.querySelector('.lb-num-badge'), null);
        assert.equal(ghost.querySelector('.lb-feed-title').textContent, 'Dive');
        assert.equal(ghost.querySelector('.tr-author-link').getAttribute('href'), '#/member/ghost');
        const site = host.querySelector('.tr-feed-link[href="#/m/d2"]');
        assert.equal(site.textContent, 'Reef <A>');
        assert.ok(host.innerHTML.includes('Jana &lt;i&gt;'));
        assert.ok(host.querySelector('.tr-author-av img[src="https://example.test/a.jpg"]'), 'uploaded avatar signed');
        assert.ok(!host.textContent.includes('never'), 'no notes');
        host.querySelector('#tr-feed-more').click();
        await new Promise(r => setTimeout(r, 20));
        assert.deepEqual(calls[1], { owner: null, limit: 30, offset: 30 });
        assert.equal(host.querySelectorAll('.tr-feed-card').length, 35);
        assert.equal(host.querySelector('#tr-feed-more'), null, 'a short page ends the feed');
        feed.destroy();
        assert.equal(host.innerHTML, '');
    });
});

test('CommunityFeed: empty state and a first-page failure go to onError', async () => {
    await withDom(async host => {
        const empty = new CommunityFeed(host, { store: { listMembers: async () => [], listCommunityEntries: async () => [], photoUrls: async () => new Map() }, userId: 'me' });
        await new Promise(r => setTimeout(r, 20));
        assert.match(host.textContent, /No dives from members yet\./);
        empty.destroy();
        let reported = null;
        const failing = new CommunityFeed(host, {
            store: { listMembers: async () => [], listCommunityEntries: async () => { throw new Error('down'); } },
            userId: 'me', onError: e => { reported = e; },
        });
        await new Promise(r => setTimeout(r, 20));
        assert.equal(reported?.message, 'down');
        failing.destroy();
    });
});

test('CommunityFeed: destroy removes the click listener; Load more advances by the fetched page, not the de-duplicated rows', async () => {
    await withDom(async host => {
        // Every page repeats a dive of the previous one (a dive added meanwhile shifts the pages).
        const page = offset => Array.from({ length: 3 }, (_, i) => ({ id: `d${offset + i - (offset ? 1 : 0)}`, owner: 'u2', dive_date: '2026-09-01' }));
        const calls = [];
        const store = {
            listMembers: async () => [],
            listCommunityEntries: async args => { calls.push(args.offset); return args.offset >= 9 ? [] : page(args.offset); },
            photoUrls: async () => new Map(),
        };
        const feed = new CommunityFeed(host, { store, userId: 'me', pageSize: 3 });
        await new Promise(r => setTimeout(r, 20));
        for (let i = 0; i < 3; i++) {
            host.querySelector('#tr-feed-more').click();
            await new Promise(r => setTimeout(r, 20));
        }
        assert.deepEqual(calls, [0, 3, 6, 9], 'never refetches the same offset');
        assert.equal(host.querySelectorAll('.tr-feed-card').length, 8, 'd0…d7, the repeated dive once');
        feed.destroy();
        // A click on a later view in the same host must not reach the destroyed feed.
        host.innerHTML = '<button id="tr-feed-more">x</button>';
        feed.destroyed = false; feed.more = true; // would load if the listener were still attached
        host.querySelector('#tr-feed-more').click();
        await new Promise(r => setTimeout(r, 20));
        assert.deepEqual(calls, [0, 3, 6, 9]);
    });
});

import { avatarImgFallback } from '../js/logbook/avatars.js';

test('avatarImgFallback swaps a failed uploaded avatar for its preset; other images are ignored', async () => {
    await withDom(async host => {
        host.innerHTML = avatarHtml({ preset: 'reef-05', url: 'https://x/expired.jpg', name: 'Jana' }) + '<img class="other" src="https://x/p.jpg">';
        const img = host.querySelector('.tr-avatar img');
        assert.equal(avatarImgFallback({ target: img }), 'https://x/expired.jpg');
        assert.equal(host.querySelector('.tr-avatar img'), null);
        assert.equal(host.querySelector('.tr-avatar svg circle').getAttribute('fill'), '#2d3a86', 'the reef-05 preset');
        assert.equal(avatarImgFallback({ target: host.querySelector('img.other') }), null);
        assert.ok(host.querySelector('img.other'));
        assert.equal(avatarImgFallback({ target: host }), null);
    });
});

test('CommunityFeed: an author avatar that fails to load falls back to the preset and stays so on re-render', async () => {
    await withDom(async host => {
        const store = {
            listMembers: async () => [{ id: 'u2', display_name: 'Jana', avatar_preset: 'reef-02', avatar_path: 'u2/a.jpg' }],
            listCommunityEntries: async () => [{ id: 'd1', owner: 'u2', dive_date: '2026-09-01' }],
            photoUrls: async () => new Map(),
            avatarUrls: async paths => new Map(paths.map(p => [p, 'https://x/expired.jpg'])),
        };
        const feed = new CommunityFeed(host, { store, userId: 'me' });
        await new Promise(r => setTimeout(r, 20));
        const img = host.querySelector('.tr-author-av img');
        assert.ok(img);
        img.dispatchEvent(new window.Event('error'));
        assert.equal(host.querySelector('.tr-author-av img'), null);
        assert.ok(host.querySelector('.tr-author-av svg'));
        feed.relabel();
        assert.equal(host.querySelector('.tr-author-av img'), null, 'the failed URL is not used again');
        feed.destroy();
    });
});

import { memberSummaryParts } from '../js/logbook/community.js';
import { MembersPage, memberSummaryText } from '../js/logbook/MembersPage.js';
import { MemberPage } from '../js/logbook/MemberPage.js';

test('memberSummaryParts: count, deepest with U+00A0 and decimal comma, last dive; missing parts left out', () => {
    const f = {
        count: n => `${n} ponorů`, num: (n, d) => n.toFixed(d).replace('.', ','), date: d => `[${d}]`,
        t: k => ({ deepest: 'nejhlubší {0}', lastDive: 'poslední ponor {0}' })[k],
    };
    assert.deepEqual(memberSummaryParts({ dive_count: 12, deepest_m: 38.61, last_dive_date: '2026-09-30' }, f),
        ['12 ponorů', 'nejhlubší 38,6 m', 'poslední ponor [2026-09-30]']);
    assert.deepEqual(memberSummaryParts({ dive_count: 0, deepest_m: null, last_dive_date: null }, f), ['0 ponorů']);
    assert.deepEqual(memberSummaryParts(null, f), ['0 ponorů']);
    assert.equal(memberSummaryText({ dive_count: 1, deepest_m: 38.6, last_dive_date: '2026-09-30' }, 'en'), '1 dive · deepest 38.6 m · last dive Sep 30, 2026');
});

test('MembersPage: own card first with "You" and the profile link, others link to their page, text escaped', async () => {
    await withDom(async host => {
        const store = {
            listMembers: async () => [
                { id: 'u2', display_name: 'Jana <i>', home_country: 'CZ', dive_count: 3, deepest_m: 27.6, last_dive_date: '2026-09-30', avatar_path: 'u2/a.jpg' },
                { id: 'me', display_name: 'Me', dive_count: 0 },
                { id: 'u3', display_name: null, dive_count: 1 },
            ],
            avatarUrls: async paths => new Map(paths.map(p => [p, 'https://x/a.jpg'])),
        };
        const page = new MembersPage(host, { store, userId: 'me' });
        await new Promise(r => setTimeout(r, 20));
        assert.match(host.querySelector('h2').textContent, /Community/);
        const cards = [...host.querySelectorAll('.tr-member-card')];
        assert.equal(cards.length, 3);
        assert.equal(cards[0].getAttribute('href'), '#/profile');
        assert.ok(cards[0].classList.contains('tr-member-own'));
        assert.equal(cards[0].querySelector('.tr-you-tag').textContent, 'You');
        assert.equal(cards[1].getAttribute('href'), '#/member/u2');
        assert.ok(host.innerHTML.includes('Jana &lt;i&gt;'));
        assert.match(cards[1].querySelector('.tr-member-stats').textContent, /^3 dives · deepest 27\.6 m · last dive /);
        assert.equal(cards[2].querySelector('.tr-member-name-text').textContent, 'Diver');
        assert.ok(cards[1].querySelector('img[src="https://x/a.jpg"]'));
        page.destroy();
        assert.equal(host.innerHTML, '');
    });
});

test('MemberPage: header, tiles, favourite sites, own Edit profile link, owner-filtered feed; not found', async () => {
    await withDom(async host => {
        const calls = [];
        const member = { id: 'me', display_name: 'Me', home_country: 'ES', dive_count: 2, deepest_m: 30, total_s: 7200, top_sites: ['Reef <x>', 'Wall'] };
        const store = {
            getMember: async id => (id === 'me' ? member : null),
            listMembers: async () => [member],
            listCommunityEntries: async args => { calls.push(args); return []; },
            photoUrls: async () => new Map(),
        };
        const page = new MemberPage(host, { store, userId: 'me', memberId: 'me' });
        await new Promise(r => setTimeout(r, 30));
        assert.match(host.querySelector('.tr-member-head-name').textContent, /Me/);
        assert.equal(host.querySelector('.tr-member-edit').getAttribute('href'), '#/profile');
        assert.equal(host.querySelectorAll('.tr-tile').length, 3);
        assert.deepEqual([...host.querySelectorAll('.tr-chip')].map(c => c.textContent), ['Reef <x>', 'Wall']);
        assert.equal(calls[0].owner, 'me');
        assert.equal(host.querySelector('.tr-feed-title'), null, 'no big feed title');
        assert.match(host.textContent, /No dives to show yet\./);
        page.destroy();

        const other = new MemberPage(host, { store: { ...store, getMember: async () => ({ id: 'u2', dive_count: 0, top_sites: [] }) }, userId: 'me', memberId: 'u2' });
        await new Promise(r => setTimeout(r, 30));
        assert.equal(host.querySelector('.tr-member-edit'), null);
        assert.equal(host.querySelector('.tr-member-sites'), null, 'no chips without top sites');
        other.destroy();

        const missing = new MemberPage(host, { store, userId: 'me', memberId: 'nobody' });
        await new Promise(r => setTimeout(r, 30));
        assert.match(host.textContent, /Member not found/);
        assert.equal(host.querySelector('a').getAttribute('href'), '#/community');
        missing.destroy();
    });
});

// ---- Read-only member dive (memberEntryStore, EntryDetail readOnly) ----

import { memberEntryStore } from '../js/logbook/memberEntryStore.js';
import { EntryDetail } from '../js/logbook/EntryDetail.js';

const MEMBER_ROW = Object.freeze({
    id: 'e1', owner: 'u2', log_number: null, dive_date: '2026-09-20', entry_time: '10:15:00', duration_s: 2700, max_depth_m: 31.4,
    site_id: 's1', site_name: 'Blue <Hole>', site_country: 'MT', site_water: 'salt', site_altitude_m: 0, site_lat: null, site_lon: null,
    photo_path: 'u2/p1.jpg', photo_count: 2, recording_id: 'r1', visibility: 'members', notes: 'SECRET NOTE',
});

test('memberEntryStore: entry without notes, only the row site, community calls, no-op reparse', async () => {
    const calls = [];
    const store = {
        listCommunityMedia: async id => { calls.push(['media', id]); return [{ id: 'm1', kind: 'photo', path: 'u2/p1.jpg', lat: null, lon: null }]; },
        photoUrls: async paths => { calls.push(['urls', paths]); return new Map(); },
        communityRecordings: async owner => { calls.push(['recs', owner]); return [{ id: 'r1' }]; },
        loadCommunityRecording: async id => { calls.push(['rec', id]); return { id }; },
        currentUser: async () => ({ id: 'me' }),
        listSites: async () => { throw new Error('own sites must not be read'); },
        reparseOutdated: async () => { throw new Error('must not reparse others'); },
    };
    const { entry, site, adapter } = memberEntryStore(store, MEMBER_ROW);
    assert.equal(entry.notes, null);
    assert.equal(entry.site_id, 's1');
    assert.equal(site.name, 'Blue <Hole>');
    assert.equal(site.lat, null);
    assert.deepEqual(await adapter.listSites(), [site]);
    assert.deepEqual((await adapter.listMedia('e1')).map(m => m.id), ['m1']);
    await adapter.photoUrls(['u2/p1.jpg']);
    assert.deepEqual(await adapter.listDives(), [{ id: 'r1' }]);
    assert.deepEqual(await adapter.loadDive('r1'), { id: 'r1' });
    assert.equal(await adapter.reparseOutdated([{ id: 'r1' }]), 0);
    assert.deepEqual(await adapter.currentUser(), { id: 'me' });
    const off = adapter.onAuthChange(() => {});
    assert.equal(typeof off, 'function');
    off();
    assert.deepEqual(calls, [['media', 'e1'], ['urls', ['u2/p1.jpg']], ['recs', 'u2'], ['rec', 'r1']]);
    assert.deepEqual(await memberEntryStore(store, { ...MEMBER_ROW, site_id: null }).adapter.listSites(), []);
    for (const write of ['addPhoto', 'deleteMedia', 'deleteEntry', 'addVideoLink', 'updateEntry'])
        assert.equal(adapter[write], undefined, `${write} is not offered`);
});

test('EntryDetail readOnly: author row, no edit/delete/upload/notes, photos still open, member analysis link', async () => {
    await withDom(async host => {
        const { adapter, entry } = memberEntryStore({
            listCommunityMedia: async () => [
                { id: 'm1', kind: 'photo', path: 'u2/p1.jpg' },
                { id: 'm2', kind: 'video_link', url: 'https://video.test/x', caption: 'Clip' },
            ],
            photoUrls: async paths => new Map(paths.map(p => [p, `https://img.test/${p}`])),
        }, MEMBER_ROW);
        entry.notes = 'SECRET NOTE'; // even if a caller left notes on the entry, read-only never shows them
        const author = { name: 'Jana <i>', href: '#/member/u2', avatarHtml: '<span class="tr-avatar"></span>' };
        const view = new EntryDetail(host, { store: adapter, entry, readOnly: true, author, backHref: '#/member/u2' });
        await new Promise(r => setTimeout(r, 30));
        assert.doesNotMatch(host.innerHTML, /SECRET/);
        assert.equal(host.querySelector('.lb-d-notes'), null);
        for (const sel of ['.lb-d-edit', '#lb-delete', '#lb-add-photos', '#lb-add-video', '.lb-photo-x', '.lb-chip-x', '[data-remove]', 'input', 'form'])
            assert.equal(host.querySelector(sel), null, `${sel} hidden`);
        const link = host.querySelector('.lb-d-author .tr-author-link');
        assert.equal(link.getAttribute('href'), '#/member/u2');
        assert.equal(link.querySelector('.tr-author-name').textContent, 'Jana <i>');
        assert.equal(host.querySelector('.lb-d-backlink').getAttribute('href'), '#/member/u2');
        const actions = [...host.querySelectorAll('.lb-d-actions a, .lb-d-actions button')];
        assert.deepEqual(actions.map(a => a.getAttribute('href')), ['#/m/e1/analysis']);
        assert.equal(host.querySelector('.lb-d-head').textContent, 'Blue <Hole>');
        assert.doesNotMatch(host.querySelector('.lb-d-sub').textContent, /#/, 'no log number of another diver');
        assert.equal(host.querySelector('.lb-d-map'), null, 'no map without shared coordinates');
        assert.equal(host.querySelector('.lb-d-visibility'), null, 'no visibility line on others\' dives');
        host.querySelector('[data-open="m1"]').click();
        assert.ok(document.querySelector('.lb-viewer img'));
        view.destroy();
    });
});

test('EntryDetail own: visibility line only when the entry has one', async () => {
    await withDom(async host => {
        const store = { listSites: async () => [], listMedia: async () => [], photoUrls: async () => new Map() };
        const base = { id: 'e9', log_number: 4, dive_date: '2026-09-20', site_id: null, recording_id: null };
        for (const [visibility, text] of [['private', 'Private'], ['members', 'Visible to members'], ['link', 'Public link']]) {
            const view = new EntryDetail(host, { store, entry: { ...base, visibility } });
            assert.equal(host.querySelector('.lb-d-visibility')?.textContent.trim(), text);
            assert.ok(host.querySelector('.lb-d-edit'));
            assert.equal(host.querySelector('.lb-d-author'), null);
            view.destroy();
        }
        const plain = new EntryDetail(host, { store, entry: base });
        assert.equal(host.querySelector('.lb-d-visibility'), null);
        assert.equal(host.querySelector('.lb-d-backlink').getAttribute('href'), '#/dives');
        plain.destroy();
    });
});

// ---- Task 8: own profile page, lock badge on private dives ----

import { ProfilePage, countryOptions } from '../js/logbook/ProfilePage.js';
import { lockHtml } from '../js/logbook/feedCard.js';
import { LogbookApp } from '../js/logbook/LogbookApp.js';

const PROFILE_KEYS = ['avatar_preset', 'default_visibility', 'display_name', 'home_country'];

function profileStore(profile, log) {
    let current = { ...profile };
    return {
        getMyProfile: async () => ({ ...current }),
        saveProfile: async patch => { log.push(['save', { ...patch }]); current = { ...current, ...patch }; return { ...current }; },
        removeAvatar: async () => { log.push(['remove']); current = { ...current, avatar_path: null }; return { ...current }; },
        uploadAvatar: async blob => { log.push(['upload', blob]); current = { ...current, avatar_path: 'me/avatar-2.jpg' }; return { ...current }; },
        avatarUrls: async paths => new Map(paths.map(p => [p, `https://example.test/${p}`])),
        signOut: async () => { log.push(['signOut']); },
    };
}
const flush = () => new Promise(r => setTimeout(r, 30));

test('countryOptions: "—" first, then sorted by the localized name', () => {
    const cs = countryOptions('cs');
    assert.deepEqual(cs[0], { code: '', name: '—' });
    assert.equal(cs.length, COUNTRY_CODES.length + 1);
    const names = cs.slice(1).map(o => o.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'cs')));
    assert.equal(cs.find(o => o.code === 'CZ').name, 'Česko');
});

test('ProfilePage: shows the profile, saves only the allowed keys, email only here', async () => {
    await withDom(async host => {
        const log = [];
        const store = profileStore({ id: 'me', display_name: 'Petr <b>', avatar_preset: 'reef-04', avatar_path: null, default_visibility: 'members', home_country: 'CZ', created_at: 'x' }, log);
        const page = new ProfilePage(host, { store, user: { id: 'me', email: 'me<x>@example.com' } });
        await flush();
        assert.equal(host.querySelectorAll('input[name="avatar_preset"]').length, 12);
        assert.equal(host.querySelector('input[name="avatar_preset"]:checked').value, 'reef-04');
        for (const r of host.querySelectorAll('input[name="avatar_preset"]')) assert.ok(r.getAttribute('aria-label'));
        assert.equal(host.querySelector('input[name="display_name"]').value, 'Petr <b>');
        assert.equal(host.querySelector('input[name="display_name"]').maxLength, 60);
        assert.equal(host.querySelector('select[name="home_country"]').value, 'CZ');
        assert.equal(host.querySelector('select[name="home_country"] option').textContent, '—');
        assert.deepEqual([...host.querySelectorAll('input[name="default_visibility"]')].map(r => [r.value, r.checked]), [['private', false], ['members', true]]);
        assert.match(host.textContent, /me<x>@example\.com/);
        assert.ok(!host.innerHTML.includes('me<x>'), 'email escaped');
        assert.match(host.textContent, /Your email is never shown to other members\./);
        assert.equal(host.querySelector('#tr-avatar-remove'), null, 'no Remove photo without a photo');

        host.querySelector('input[name="display_name"]').value = '  Jana  ';
        host.querySelector('input[name="avatar_preset"][value="reef-02"]').checked = true;
        host.querySelector('input[name="default_visibility"][value="private"]').checked = true;
        host.querySelector('select[name="home_country"]').value = 'ES';
        host.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await flush();
        assert.equal(log.length, 1);
        const [kind, patch] = log[0];
        assert.equal(kind, 'save');
        assert.deepEqual(Object.keys(patch).sort(), PROFILE_KEYS);
        assert.deepEqual(patch, { display_name: 'Jana', avatar_preset: 'reef-02', default_visibility: 'private', home_country: 'ES' });
        assert.match(host.querySelector('.tr-profile-status').textContent, /Saved/);

        host.querySelector('input[name="display_name"]').value = '   ';
        host.querySelector('select[name="home_country"]').value = '';
        host.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await flush();
        assert.equal(log[1][1].display_name, null);
        assert.equal(log[1][1].home_country, null);

        host.querySelector('#tr-signout').click();
        await flush();
        assert.deepEqual(log.at(-1), ['signOut']);
        page.destroy();
        assert.equal(host.innerHTML, '');
    });
});

test('ProfilePage: dive numbering card saves the offset and previews before renumbering', async () => {
    await withDom(async host => {
        const log = [];
        const store = {
            ...profileStore({ id: 'me', display_name: 'Me', default_visibility: 'members' }, log),
            getLogOffset: async () => 28,
            setLogOffset: async n => { log.push(['offset', n]); return n; },
            planRenumber: async () => ({ offset: 28, changes: [{ id: 'a', from: 29, to: 1 }, { id: 'b', from: 30, to: 2 }] }),
            renumberByDate: async () => { log.push(['renumber']); return 2; },
        };
        const page = new ProfilePage(host, { store, user: { id: 'me', email: 'me@example.com' } });
        await flush();
        const input = host.querySelector('input[name="log_offset"]');
        assert.equal(input.value, '28');
        input.value = '12';
        host.querySelector('.tr-offset-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await flush();
        assert.deepEqual(log.at(-1), ['offset', 12]);
        host.querySelector('input[name="log_offset"]').value = '-3';
        host.querySelector('.tr-offset-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await flush();
        assert.match(host.querySelector('.tr-numbering-status').textContent, /whole number/);
        assert.equal(log.filter(l => l[0] === 'offset').length, 1, 'invalid input is not saved');

        host.querySelector('#tr-renumber').click();
        await flush();
        assert.match(host.querySelector('.tr-renumber-list').textContent, /#29 → #1/);
        assert.match(host.querySelector('.tr-renumber-list').textContent, /#30 → #2/);
        assert.ok(!log.some(l => l[0] === 'renumber'), 'nothing happens before confirming');
        host.querySelector('#tr-renumber-no').click();
        assert.equal(host.querySelector('.tr-renumber-plan'), null);
        host.querySelector('#tr-renumber').click();
        await flush();
        host.querySelector('#tr-renumber-yes').click();
        await flush();
        assert.deepEqual(log.at(-1), ['renumber']);
        assert.match(host.querySelector('.tr-numbering-status').textContent, /2 dives renumbered/);
        page.destroy();
    });
});

test('ProfilePage: no numbering card when the store has no offset API', async () => {
    await withDom(async host => {
        const page = new ProfilePage(host, { store: profileStore({ id: 'me' }, []), user: { id: 'me' } });
        await flush();
        assert.equal(host.querySelector('.tr-numbering').hidden, true);
        page.destroy();
    });
});

test('ProfilePage: an uploaded photo wins; picking a preset and saving removes it', async () => {
    await withDom(async host => {
        const log = [];
        const store = profileStore({ id: 'me', display_name: 'Me', avatar_preset: 'reef-04', avatar_path: 'me/avatar-1.jpg', default_visibility: 'members', home_country: null }, log);
        const page = new ProfilePage(host, { store, user: { id: 'me', email: 'me@example.com' } });
        await flush();
        assert.ok(host.querySelector('.tr-profile-preview img[src="https://example.test/me/avatar-1.jpg"]'));
        assert.equal(host.querySelector('input[name="avatar_preset"]:checked'), null, 'no preset checked while a photo is used');
        assert.ok(host.querySelector('#tr-avatar-remove'));
        host.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await flush();
        assert.deepEqual(log.map(l => l[0]), ['save'], 'saving without a pick keeps the photo');
        assert.equal(log[0][1].avatar_preset, 'reef-04');

        const pick = host.querySelector('input[name="avatar_preset"][value="reef-07"]');
        pick.checked = true;
        pick.dispatchEvent(new window.Event('change', { bubbles: true }));
        assert.equal(host.querySelector('.tr-profile-preview img'), null, 'the preview shows the preset at once');
        host.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await flush();
        assert.deepEqual(log.map(l => l[0]), ['save', 'save', 'remove']);
        assert.equal(log[1][1].avatar_preset, 'reef-07');
        assert.equal('avatar_path' in log[1][1], false);
        assert.equal(host.querySelector('#tr-avatar-remove'), null);
        page.destroy();
    });
});

test('ProfilePage: Remove photo removes it at once', async () => {
    await withDom(async host => {
        const log = [];
        const store = profileStore({ id: 'me', avatar_preset: null, avatar_path: 'me/a.jpg', default_visibility: 'members' }, log);
        const page = new ProfilePage(host, { store, user: { id: 'me', email: 'me@example.com' } });
        await flush();
        host.querySelector('#tr-avatar-remove').click();
        await flush();
        assert.deepEqual(log.map(l => l[0]), ['remove']);
        assert.equal(host.querySelector('.tr-profile-preview img'), null);
        assert.equal(host.querySelector('#tr-avatar-remove'), null);
        page.destroy();
    });
});

test('lockHtml: a labelled lock; feed cards show it only for private dives', () => {
    const lock = lockHtml('Private');
    assert.match(lock, /class="tr-lock"/);
    assert.match(lock, /aria-label="Private"/);
    assert.match(lock, /title="Private"/);
    const base = { entry: { id: 'e1', log_number: 3 }, href: '#/dive/e1', title: 'Reef' };
    const plain = feedCardHtml(base);
    assert.equal(feedCardHtml({ ...base, lockHtml: '' }), plain, 'no lock: identical markup');
    assert.match(feedCardHtml({ ...base, lockHtml: lock }), /tr-lock/);
    const author = { name: 'You', avatarHtml: '', href: '#/member/me', own: true };
    assert.match(feedCardHtml({ ...base, author, lockHtml: lock }), /tr-lock/);
});

test('CommunityFeed: the lock shows on own private dives only', async () => {
    await withDom(async host => {
        const rows = [
            { id: 'a', owner: 'me', log_number: 1, dive_date: '2026-09-02', visibility: 'private' },
            { id: 'b', owner: 'me', log_number: 2, dive_date: '2026-09-01', visibility: 'members' },
            { id: 'c', owner: 'u2', log_number: null, dive_date: '2026-08-30', visibility: 'private' },
        ];
        const feed = new CommunityFeed(host, { store: { listMembers: async () => [], listCommunityEntries: async () => rows, photoUrls: async () => new Map() }, userId: 'me' });
        await flush();
        const lockOf = id => host.querySelector(`.tr-feed-link[href$="/${id}"]`).closest('.tr-feed-card').querySelector('.tr-lock');
        assert.ok(lockOf('a'));
        assert.equal(lockOf('b'), null);
        assert.equal(lockOf('c'), null);
        feed.destroy();
    });
});

test('LogbookApp My dives: the lock shows on private dives in feed, tiles and table', async () => {
    await withDom(async root => {
        location.hash = '#/dives';
        const entries = [
            { id: 'e2', log_number: 2, dive_date: '2026-09-02', visibility: 'private', site_id: null, buddies: [] },
            { id: 'e1', log_number: 1, dive_date: '2026-09-01', visibility: 'members', site_id: null, buddies: [] },
        ];
        const store = {
            onAuthChange: () => () => {}, currentUser: async () => ({ id: 'me', email: 'me@example.com' }),
            ensureEntries: async () => 0, listEntries: async () => entries, listSites: async () => [],
            listPhotoMedia: async () => [], photoUrls: async () => new Map(), communityAvailability: async () => 'no',
        };
        const app = new LogbookApp(root, { store, shell: null });
        await flush();
        for (const mode of ['feed', 'tiles', 'table']) {
            app._setViewMode(mode);
            const holders = mode === 'feed' ? '.lb-feed-card' : mode === 'tiles' ? '.lb-tile' : '.lb-table tbody tr';
            const locks = [...root.querySelectorAll(holders)].map(el => !!el.querySelector('.tr-lock'));
            assert.deepEqual(locks, [true, false], mode);
            assert.equal(root.querySelector('.tr-lock').getAttribute('aria-label'), 'Private', mode);
        }
        app.destroy();
    });
});

test('LogbookApp edit form: waits for the community probe in flight and offers the visibility fields', async () => {
    await withDom(async root => {
        location.hash = '#/dive/e1/edit';
        const entry = { id: 'e1', log_number: 1, dive_date: '2026-09-01', visibility: 'private', site_id: null, buddies: [], details: {} };
        const store = {
            onAuthChange: () => () => {}, currentUser: async () => ({ id: 'me', email: 'me@example.com' }),
            ensureEntries: async () => 0, listEntries: async () => [entry], getEntry: async () => entry, listSites: async () => [], listBuddies: async () => [],
            listPhotoMedia: async () => [], photoUrls: async () => new Map(), ensureProfile: async () => ({}),
            communityAvailability: () => new Promise(r => setTimeout(() => r('yes'), 60)),
        };
        const app = new LogbookApp(root, { store, shell: null });
        await new Promise(r => setTimeout(r, 150));
        assert.deepEqual([...root.querySelectorAll('input[name="visibility"]')].map(r => [r.value, r.checked]), [['private', true], ['members', false]]);
        app.destroy();
    });
});

test('LogbookApp: an image error inside the Feed does not make the My dives sparks load recordings', async () => {
    await withDom(async root => {
        location.hash = '#/feed';
        const loaded = [];
        const store = {
            onAuthChange: () => () => {}, currentUser: async () => ({ id: 'me', email: 'me@example.com' }),
            ensureEntries: async () => 0, listEntries: async () => [], listSites: async () => [],
            listPhotoMedia: async () => [], communityAvailability: async () => 'yes', ensureProfile: async () => ({}),
            listMembers: async () => [{ id: 'u2', display_name: 'Jana' }],
            listCommunityEntries: async () => [{ id: 'd1', owner: 'u2', recording_id: 'r1', dive_date: '2026-09-01', max_depth_m: 20, duration_s: 1800, site_id: null, photo_path: 'u2/p.jpg', photo_count: 1, notes: '' }],
            photoUrls: async () => new Map([['u2/p.jpg', 'https://example.test/p.jpg']]),
            avatarUrls: async () => new Map(),
            loadCommunityRecording: async () => null,
            loadDive: async id => { loaded.push(id); return null; },
        };
        const app = new LogbookApp(root, { store, shell: null });
        await new Promise(r => setTimeout(r, 60));
        const img = root.querySelector('.tr-feed-card img.lb-visual-img');
        assert.ok(img, 'the feed card has a picture');
        img.dispatchEvent(new window.Event('error'));
        await new Promise(r => setTimeout(r, 40));
        assert.deepEqual(loaded, []);
        app.destroy();
    });
});

test('LogbookApp: a never-answering community probe times out; an explicit community route falls back to the list', async () => {
    await withDom(async root => {
        location.hash = '#/feed';
        const store = {
            onAuthChange: () => () => {}, currentUser: async () => ({ id: 'me', email: 'me@example.com' }),
            ensureEntries: async () => 0, listEntries: async () => [], listSites: async () => [],
            listPhotoMedia: async () => [], photoUrls: async () => new Map(),
            communityAvailability: () => new Promise(() => {}),
        };
        const app = new LogbookApp(root, { store, shell: null, probeTimeoutMs: 30 });
        await new Promise(r => setTimeout(r, 10));
        assert.match(root.textContent, /Loading/);
        await new Promise(r => setTimeout(r, 60));
        assert.doesNotMatch(root.textContent, /Loading/);
        assert.ok(root.querySelector('.lb-list-view'), 'fell back to My dives');
        app.destroy();
    });
});

test('LogbookApp: a direct switch to another user re-probes instead of keeping the previous answer', async () => {
    await withDom(async root => {
        location.hash = '#/dives';
        let notify;
        let asked = 0;
        const store = {
            onAuthChange: cb => { notify = cb; return () => {}; }, currentUser: async () => ({ id: 'a', email: 'a@example.com' }),
            ensureEntries: async () => 0, listEntries: async () => [], listSites: async () => [],
            listPhotoMedia: async () => [], photoUrls: async () => new Map(), ensureProfile: async () => ({}),
            communityAvailability: async () => { asked++; return 'yes'; },
        };
        const app = new LogbookApp(root, { store, shell: null });
        await new Promise(r => setTimeout(r, 20));
        assert.equal(asked, 1);
        assert.equal(app.community, true);
        notify({ id: 'b', email: 'b@example.com' });
        assert.equal(app.community, false, 'previous answer forgotten');
        await new Promise(r => setTimeout(r, 20));
        assert.equal(asked, 2);
        assert.equal(app.community, true);
        app.destroy();
    });
});
