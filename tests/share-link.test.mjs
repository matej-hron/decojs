/**
 * DecoTrail public share link (migration 0005): pure helpers, stores, owner card, form and share page.
 * Run: node --test tests/share-link.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isShareToken, parseShareHash, shareUrl, sharedDiveParts, visibilityAfterSharing, SHARE_HEADER } from '../js/logbook/share.js';
import { createShareStore, shareStoreFor, sharedDiveAdapter } from '../js/backend/shareStore.js';
import { createSupabaseStore } from '../js/backend/supabaseStore.js';

const TOKEN = 'ab'.repeat(32);
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

async function withDom(fn, url = 'http://localhost/lab/dive-log.html#/dive/e1') {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url });
    const saved = {};
    for (const k of ['window', 'document', 'location', 'history', 'navigator']) {
        saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
        Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
    }
    try {
        return await fn(dom.window.document.getElementById('host'), dom.window);
    } finally {
        for (const [k, d] of Object.entries(saved)) {
            if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
        }
    }
}

// ---- Pure helpers ----

test('isShareToken: exactly 64 lowercase hex', () => {
    assert.equal(isShareToken(TOKEN), true);
    assert.equal(isShareToken(TOKEN.toUpperCase()), false);
    assert.equal(isShareToken(TOKEN.slice(1)), false);
    assert.equal(isShareToken(`${TOKEN}0`), false);
    assert.equal(isShareToken('%'), false);
    assert.equal(isShareToken(null), false);
});

test('parseShareHash: #s=<token>, tolerant of case and extra params, null for junk', () => {
    assert.equal(parseShareHash(`#s=${TOKEN}`), TOKEN);
    assert.equal(parseShareHash(`#s=${TOKEN.toUpperCase()}`), TOKEN);
    assert.equal(parseShareHash(`#x=1&s=${TOKEN}`), TOKEN);
    assert.equal(parseShareHash('#s=abc'), null);
    assert.equal(parseShareHash(''), null);
    assert.equal(parseShareHash(undefined), null);
    assert.equal(parseShareHash('#/dive/123'), null);
});

test('shareUrl: share page next to the logbook, token in the fragment, no query', () => {
    assert.equal(shareUrl(TOKEN, 'https://decotheory.eu/lab/dive-log.html?x=1#/dive/e1'), `https://decotheory.eu/lab/dive.html#s=${TOKEN}`);
    assert.equal(shareUrl('nope', 'https://decotheory.eu/lab/dive-log.html'), null);
});

test('visibilityAfterSharing: back to private/members, else members', () => {
    assert.equal(visibilityAfterSharing('private'), 'private');
    assert.equal(visibilityAfterSharing('members'), 'members');
    assert.equal(visibilityAfterSharing('link'), 'members');
    assert.equal(visibilityAfterSharing(null), 'members');
});

const PAYLOAD = {
    entry: { id: 'e1', dive_date: '2026-09-10', max_depth_m: 31, buddies: ['Jana'], details: { rating: 4 }, notes: 'SECRET', owner: 'u1', log_number: 7, share_token: TOKEN },
    site: { id: 's1', name: 'Wall', lat: null, lon: null, notes: 'SITE SECRET' },
    author: { display_name: 'Cyril', avatar_preset: 'reef-03', avatar_path: 'u1/a.jpg', email: 'x@y' },
    media: [{ id: 'm1', kind: 'photo', path: 'u1/e1/m1.jpg', owner: 'u1' }],
    recording: { id: 'r1', start_local: '2026-09-10T10:00:00', parser_version: 3, summary: { maxDepth: 31 }, record: { samples: [] } },
};

test('sharedDiveParts: whitelists fields, never carries notes, owner, number or token', () => {
    const p = sharedDiveParts(PAYLOAD);
    assert.equal(p.entry.notes, null);
    assert.equal(p.entry.log_number, null);
    assert.equal(p.entry.visibility, 'link');
    assert.equal('owner' in p.entry, false);
    assert.equal('share_token' in p.entry, false);
    assert.equal(p.entry.site_id, 's1');
    assert.equal(p.entry.recording_id, 'r1');
    assert.equal('notes' in p.site, false);
    assert.equal('email' in p.author, false);
    assert.equal('owner' in p.media[0], false);
    assert.deepEqual(p.recording, { id: 'r1', deviceSerial: null, diveNumber: null, startLocal: '2026-09-10T10:00:00', fileSha256: null, parserVersion: 3, summary: { maxDepth: 31 } });
    assert.deepEqual(p.record, { samples: [] });
    assert.equal(JSON.stringify(p).includes('SECRET'), false);
});

test('sharedDiveParts: null for an unknown token, defaults for missing parts', () => {
    assert.equal(sharedDiveParts(null), null);
    assert.equal(sharedDiveParts({}), null);
    const p = sharedDiveParts({ entry: { id: 'e1', buddies: null, details: null }, site: null, recording: null, media: null });
    assert.deepEqual(p.entry.buddies, []);
    assert.deepEqual(p.entry.details, {});
    assert.equal(p.entry.recording_id, null);
    assert.equal(p.entry.site_id, null);
    assert.deepEqual(p.media, []);
    assert.equal(p.recording, null);
});

// ---- Anonymous share store ----

function fakeShareClient({ data = PAYLOAD, error = null, status = 200 } = {}) {
    const calls = [];
    return {
        calls,
        async rpc(name, args) { calls.push(['rpc', name, args]); return { data, error, status }; },
        storage: { from: bucket => ({
            async createSignedUrls(paths, seconds) {
                calls.push(['sign', bucket, paths, seconds]);
                return { data: paths.map(path => ({ path, signedUrl: `https://cdn.test/${path}` })), error: null };
            },
        }) },
    };
}

test('createShareStore: no session, token header on every request; null for a bad token', () => {
    let seen;
    const store = createShareStore(TOKEN, { url: 'https://x.supabase.co', key: 'k', factory: (...a) => { seen = a; return fakeShareClient(); } });
    assert.ok(store);
    assert.equal(seen[2].auth.persistSession, false);
    assert.equal(seen[2].auth.detectSessionInUrl, false);
    assert.deepEqual(seen[2].global.headers, { [SHARE_HEADER]: TOKEN });
    assert.equal(createShareStore('bad', { url: 'u', key: 'k', factory: () => fakeShareClient() }), null);
});

test('share store: loads the dive, signs photo and avatar URLs, maps a missing RPC to unavailable', async () => {
    const client = fakeShareClient();
    const store = shareStoreFor(client, TOKEN);
    const parts = await store.loadSharedDive();
    assert.deepEqual(client.calls[0], ['rpc', 'get_shared_dive', { p_token: TOKEN }]);
    assert.equal(parts.entry.id, 'e1');
    const urls = await store.photoUrls(['u1/e1/m1.jpg']);
    assert.equal(urls.get('u1/e1/m1.jpg'), 'https://cdn.test/u1/e1/m1.jpg');
    assert.equal(client.calls[1][1], 'dive-photos');
    assert.ok(client.calls[1][3] <= 600, 'short-lived photo URLs');
    assert.equal(await store.avatarUrl('u1/a.jpg'), 'https://cdn.test/u1/a.jpg');
    assert.equal(client.calls[2][1], 'avatars');
    assert.equal(await store.avatarUrl(null), null);

    assert.equal(await shareStoreFor(fakeShareClient({ data: null }), TOKEN).loadSharedDive(), null);
    await assert.rejects(shareStoreFor(fakeShareClient({ data: null, error: { code: 'PGRST202', message: 'no fn' }, status: 404 }), TOKEN).loadSharedDive(),
        e => e.kind === 'unavailable');
    await assert.rejects(shareStoreFor(fakeShareClient({ data: null, error: { message: 'TypeError: Failed to fetch' } }), TOKEN).loadSharedDive(),
        e => e.kind === 'unreachable');
});

test('sharedDiveAdapter: read-only, one recording, no write methods', async () => {
    const parts = sharedDiveParts(PAYLOAD);
    const a = sharedDiveAdapter({ photoUrls: async () => new Map() }, parts);
    assert.deepEqual(await a.listSites(), [parts.site]);
    assert.equal((await a.listDives()).length, 1);
    assert.deepEqual(await a.loadDive('r1'), { samples: [] });
    await assert.rejects(a.loadDive('other'));
    assert.ok(await a.currentUser());
    for (const k of ['saveEntry', 'deleteEntry', 'addPhoto', 'deleteMedia', 'setSharing']) assert.equal(k in a, false, k);
});

// ---- Owner store: shareStatus and setSharing ----

function ownerClient({ rpcError = null, rpcStatus = 200, rows = [] } = {}) {
    const calls = [];
    const user = { id: 'u1' };
    const db = { log_entries: rows };
    const builder = table => {
        const q = {
            _f: [], _upd: null,
            select() { return q; }, limit() { return q; },
            eq(c, v) { q._f.push(r => r[c] === v); return q; },
            update(p) { q._upd = p; calls.push(['update', table, p]); return q; },
            maybeSingle() { return q; }, single() { return q; },
            then(res, rej) {
                if (table === 'profiles') return Promise.resolve({ data: [], error: null }).then(res, rej);
                const hit = db[table].filter(r => q._f.every(f => f(r)));
                if (q._upd) for (const r of hit) {
                    Object.assign(r, q._upd);
                    r.share_token = r.visibility === 'link' ? (r.share_token ?? 'cd'.repeat(32)) : null; // the trigger
                }
                return Promise.resolve({ data: hit[0] ?? null, error: null }).then(res, rej);
            },
        };
        return q;
    };
    return {
        calls,
        auth: { async getUser() { return { data: { user }, error: null }; }, async getSession() { return { data: { session: { user } }, error: null }; } },
        from: builder,
        async rpc(name, args) { calls.push(['rpc', name, args]); return { data: null, error: rpcError, status: rpcStatus }; },
    };
}

test('shareStatus: yes when get_shared_dive exists (cached), no when missing, transient not cached', async () => {
    const yes = ownerClient();
    const s1 = createSupabaseStore(yes);
    assert.equal(await s1.shareStatus(), true);
    assert.equal(await s1.shareStatus(), true);
    assert.equal(yes.calls.filter(c => c[1] === 'get_shared_dive').length, 1);
    assert.match(yes.calls[0][2].p_token, /^0{64}$/);

    const no = createSupabaseStore(ownerClient({ rpcError: { code: 'PGRST202', message: 'Could not find the function' }, rpcStatus: 404 }));
    assert.equal(await no.shareStatus(), false);

    const flaky = ownerClient({ rpcError: { message: 'TypeError: Failed to fetch' }, rpcStatus: 0 });
    const s3 = createSupabaseStore(flaky);
    assert.equal(await s3.shareStatus(), false);
    assert.equal(await s3.shareStatus(), false);
    assert.equal(flaky.calls.filter(c => c[1] === 'get_shared_dive').length, 2, 'a transient failure is asked again');
});

test('setSharing: on → link (token from the server); off → the visibility before, else members', async () => {
    const client = ownerClient({ rows: [{ id: 'e1', owner: 'u1', visibility: 'private', share_token: null }] });
    const store = createSupabaseStore(client);
    const on = await store.setSharing('e1', true, 'private');
    assert.equal(on.visibility, 'link');
    assert.match(on.share_token, /^[0-9a-f]{64}$/);
    const off = await store.setSharing('e1', false, 'private');
    assert.equal(off.visibility, 'private');
    assert.equal(off.share_token, null);
    await store.setSharing('e1', true, null);
    assert.equal((await store.setSharing('e1', false, 'link')).visibility, 'members');
    const sent = client.calls.filter(c => c[0] === 'update').map(c => c[2]);
    assert.ok(sent.every(p => !('share_token' in p)), 'the client never sends a token');
});

// ---- Owner card ----

import { ShareCard } from '../js/logbook/ShareCard.js';

test('ShareCard: switch on shows the link + Copy, off revokes and restores the old visibility', async () => {
    await withDom(async (host, win) => {
        const calls = [];
        let copied = null;
        Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async t => { copied = t; } }, configurable: true });
        const store = {
            async setSharing(id, on, before) {
                calls.push([id, on, before]);
                return on ? { visibility: 'link', share_token: TOKEN } : { visibility: before ?? 'members', share_token: null };
            },
        };
        const changes = [];
        const card = new ShareCard(host, { store, entry: { id: 'e1', visibility: 'private', share_token: null }, onChange: e => changes.push(e) });
        const sw = () => host.querySelector('.lb-switch');
        assert.equal(sw().getAttribute('role'), 'switch');
        assert.equal(sw().getAttribute('aria-checked'), 'false');
        assert.equal(host.querySelector('.lb-share-url'), null);

        sw().click();
        await tick();
        assert.deepEqual(calls[0], ['e1', true, 'private']);
        assert.equal(sw().getAttribute('aria-checked'), 'true');
        assert.equal(host.querySelector('.lb-share-url').value, `http://localhost/lab/dive.html#s=${TOKEN}`);
        assert.equal(host.querySelector('.lb-share-native'), null, 'no share sheet without navigator.share');

        host.querySelector('.lb-share-copy').click();
        await tick();
        assert.equal(copied, `http://localhost/lab/dive.html#s=${TOKEN}`);
        assert.match(host.querySelector('.lb-share-status').textContent, /copied/i);

        sw().click();
        await tick();
        assert.deepEqual(calls[1], ['e1', false, 'private']);
        assert.equal(sw().getAttribute('aria-checked'), 'false');
        assert.equal(host.querySelector('.lb-share-url'), null);
        assert.equal(changes.at(-1).visibility, 'private');
        card.destroy();
    });
});

test('ShareCard: a failed save shows an error and keeps the switch off', async () => {
    await withDom(async host => {
        const store = { async setSharing() { throw Object.assign(new Error('x'), { kind: 'unknown' }); } };
        const orig = console.error;
        console.error = () => {};
        try {
            new ShareCard(host, { store, entry: { id: 'e1', visibility: 'members', share_token: null } });
            host.querySelector('.lb-switch').click();
            await tick();
        } finally {
            console.error = orig;
        }
        assert.equal(host.querySelector('.lb-switch').getAttribute('aria-checked'), 'false');
        assert.ok(host.querySelector('[role="alert"]'));
    });
});

// ---- Detail and form ----

import { EntryDetail } from '../js/logbook/EntryDetail.js';
import { EntryForm } from '../js/logbook/EntryForm.js';

const ownStore = (share) => ({
    listSites: async () => [], listMedia: async () => [], photoUrls: async () => new Map(),
    ...(share === undefined ? {} : { shareStatus: async () => share }),
    setSharing: async () => ({}),
});

test('EntryDetail: the share card only with share links available, never on a read-only dive', async () => {
    await withDom(async host => {
        const entry = { id: 'e1', log_number: 1, dive_date: '2026-09-10', buddies: [], details: {}, visibility: 'members' };
        let d = new EntryDetail(host, { store: ownStore(true), entry });
        await tick();
        assert.ok(host.querySelector('.lb-share .lb-switch'));
        d.destroy();
        d = new EntryDetail(host, { store: ownStore(false), entry });
        await tick();
        assert.equal(host.querySelector('.lb-share'), null);
        d.destroy();
        d = new EntryDetail(host, { store: ownStore(undefined), entry });
        await tick();
        assert.equal(host.querySelector('.lb-share'), null, 'stores without shareStatus (before 0005)');
        d.destroy();
        d = new EntryDetail(host, { store: ownStore(true), entry, readOnly: true, author: { name: 'A', avatarHtml: '', href: null }, backHref: false, analysisHref: false });
        await tick();
        assert.equal(host.querySelector('.lb-share'), null);
        assert.equal(host.querySelector('.lb-d-backlink'), null);
        assert.equal(host.querySelector('a.tr-author-link'), null, 'author without a link');
        assert.equal(host.querySelector('.tr-author-name').textContent, 'A');
        d.destroy();
    });
});

test('EntryForm: "Public link" offered only with share links; an existing link is shown with Copy', async () => {
    await withDom(async host => {
        const store = { listSites: async () => [], listBuddies: async () => [], listEntries: async () => [], listMedia: async () => [], photoUrls: async () => new Map() };
        const entry = { id: 'e1', log_number: 5, dive_date: '2026-10-01', buddies: [], details: {}, visibility: 'members' };
        let f = new EntryForm(host, { store, entry, community: true, onSaved() {}, onCancel() {} });
        assert.equal(host.querySelector('input[name="visibility"][value="link"]'), null);
        f.destroy();
        f = new EntryForm(host, { store, entry, community: true, share: true, onSaved() {}, onCancel() {} });
        assert.ok(host.querySelector('input[name="visibility"][value="link"]'));
        assert.equal(host.querySelector('.lb-vis-share .lb-share-url'), null, 'no link before saving as link');
        f.destroy();
        f = new EntryForm(host, { store, entry: { ...entry, visibility: 'link', share_token: TOKEN }, community: true, share: true, onSaved() {}, onCancel() {} });
        assert.equal(host.querySelector('.lb-vis-share .lb-share-url').value, `http://localhost/lab/dive.html#s=${TOKEN}`);
        assert.ok(host.querySelector('.lb-vis-copy'));
        f.destroy();
        f = new EntryForm(host, { store, entry: { ...entry, visibility: 'link' }, community: true, share: false, onSaved() {}, onCancel() {} });
        assert.ok(host.querySelector('input[name="visibility"][value="link"]:checked'), 'an existing link value is kept before 0005');
        assert.equal(host.querySelector('.lb-vis-share'), null);
        f.destroy();
    });
});

// ---- Share page ----

import { SharedDivePage } from '../js/logbook/SharedDivePage.js';

test('SharedDivePage: missing link, unavailable backend, and a loaded dive without notes or back link', async () => {
    await withDom(async host => {
        let page = new SharedDivePage(host, { store: null });
        assert.ok(host.querySelector('.tr-share-missing'));
        page.destroy();

        page = new SharedDivePage(host, { store: { loadSharedDive: async () => null } });
        await tick();
        assert.ok(host.querySelector('.tr-share-missing'));
        page.destroy();

        const orig = console.error;
        console.error = () => {};
        page = new SharedDivePage(host, { store: { loadSharedDive: async () => { throw Object.assign(new Error('x'), { kind: 'unreachable' }); } } });
        await tick();
        console.error = orig;
        assert.ok(host.querySelector('.tr-share-retry'));
        page.destroy();

        const parts = sharedDiveParts({ ...PAYLOAD, recording: null });
        const store = { loadSharedDive: async () => parts, photoUrls: async () => new Map(), avatarUrl: async () => 'https://cdn.test/a.jpg' };
        page = new SharedDivePage(host, { store });
        await tick(30);
        assert.equal(host.querySelector('.lb-d-head').textContent, 'Wall');
        assert.equal(host.querySelector('.tr-author-name').textContent, 'Cyril');
        assert.equal(host.querySelector('.lb-d-backlink'), null);
        assert.equal(host.querySelector('.lb-d-edit'), null);
        assert.equal(host.querySelector('.lb-share'), null);
        assert.equal(host.textContent.includes('SECRET'), false);
        assert.match(host.textContent, /Jana/);
        page.destroy();
    }, 'http://localhost/lab/dive.html#s=' + TOKEN);
});

// ---- Page and wiring ----

test('lab/dive.html: noindex, origin-only referrer, generic preview title, wired to the share page', () => {
    const html = readFileSync(new URL('../lab/dive.html', import.meta.url), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(html, /<meta name="referrer" content="strict-origin">/);
    assert.match(html, /<title>DecoTrail dive<\/title>/);
    assert.match(html, /property="og:title" content="DecoTrail dive"/);
    assert.match(html, /SharedDivePage/);
    const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
    for (const f of ['./lab/dive.html', './css/trail.css', './js/logbook/share.js', './js/logbook/ShareCard.js', './js/logbook/SharedDivePage.js', './js/backend/shareStore.js']) {
        assert.ok(sw.includes(`'${f}'`), f);
    }
});

test('share strings exist in en, cs and es', () => {
    const keys = ['title', 'helpOff', 'helpOn', 'linkLabel', 'copy', 'share', 'copied', 'copyFailed', 'offNote', 'turnedOff', 'shareTitle',
        'formNew', 'formOffNote', 'pageIntro', 'analysisTitle', 'missingTitle', 'missingText', 'errorTitle', 'errorText', 'retry', 'toDecoTheory'];
    for (const lang of ['en', 'cs', 'es']) {
        const d = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
        for (const k of keys) assert.ok(d.diveLog.trail.share[k], `${lang} ${k}`);
        assert.ok(d.diveLog.trail.form.visibilityHelp.linkUnavailable, `${lang} linkUnavailable`);
        assert.ok(d.diveLog.trail.form.shareLocationAll, `${lang} shareLocationAll`);
        assert.doesNotMatch(d.diveLog.trail.form.visibility.link, /soon|připravujeme|próximamente/i);
    }
});

test('share page fallback avatar is stable per author, not per dive', async () => {
    const { authorKey } = await import('../js/logbook/SharedDivePage.js');
    const { avatarHtml } = await import('../js/logbook/avatars.js');
    const a = sharedDiveParts({ ...PAYLOAD, author: { display_name: 'Cyril', author_key: 'abc123def456' } }).author;
    assert.equal(a.author_key, 'abc123def456');
    assert.equal(authorKey(a, 'Cyril'), 'abc123def456');
    assert.equal(authorKey({ display_name: 'Cyril' }, 'Cyril'), 'Cyril', 'older server: the name');
    assert.equal(authorKey({}, 'Diver'), 'Diver');
    const svgOf = (entryId) => avatarHtml({ preset: null, name: 'Cyril', id: authorKey(a, 'Cyril'), size: 40, entryId });
    assert.equal(svgOf('dive-1'), svgOf('dive-2'));
    assert.equal(sharedDiveParts({ ...PAYLOAD, author: { author_key: 42 } }).author.author_key, null);
});
