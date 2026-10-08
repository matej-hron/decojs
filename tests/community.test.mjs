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
    assert.deepEqual(site, { id: 's1', name: 'Lom', country: 'CZ', water: 'fresh', altitude_m: 400, lat: 50.1, lon: 14.2 });
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
    assert.match(preset, /^<span class="tr-avatar" style="--size:32px" role="img" aria-label="&lt;b&gt;">/);
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
        community: 'community', member: 'community', memberDive: 'community', memberAnalysis: 'community',
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

import { feedCardHtml, statsHtml, visualHtml } from '../js/logbook/feedCard.js';

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
