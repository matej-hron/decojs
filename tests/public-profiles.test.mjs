/**
 * Public profiles and browsing without logging in (migration 0012): routes, the public store, guest views.
 * Run: node --test tests/public-profiles.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeHref } from '../js/logbook/router.js';
import { GUEST_TABS, resolveGuestRoute, resolveRoute, loginHtml } from '../js/logbook/AppShell.js';
import { createPublicApi } from '../js/backend/publicStore.js';
import { DiveStoreError } from '../js/backend/supabaseStore.js';
import { createSupabaseStore } from '../js/backend/supabaseStore.js';

const flush = (ms = 30) => new Promise(r => setTimeout(r, ms));

async function withDom(fn, { hash = '#/', html = '<div id="host"></div>' } = {}) {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: `http://localhost/lab/dive-log.html${hash}` });
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

// ---- Routes ----

test('router: #/login round-trips', () => {
    assert.deepEqual(parseRoute('#/login'), { name: 'login' });
    assert.equal(routeHref({ name: 'login' }), '#/login');
});

test('resolveGuestRoute: home → Feed, public routes stay, member-only routes → login', () => {
    assert.deepEqual(resolveGuestRoute({ name: 'home' }), { name: 'feed' });
    for (const r of [{ name: 'feed' }, { name: 'community' }, { name: 'member', id: 'm' }, { name: 'memberDive', id: 'd' },
        { name: 'memberAnalysis', id: 'd' }, { name: 'sites' }, { name: 'site', id: 's' }, { name: 'login' }, { name: 'notFound' }]) {
        assert.deepEqual(resolveGuestRoute(r), r);
    }
    for (const name of ['list', 'new', 'detail', 'edit', 'analysis', 'profile', 'activity']) {
        assert.deepEqual(resolveGuestRoute({ name, id: 'x' }), { name: 'login' }, name);
    }
    assert.deepEqual([...GUEST_TABS], ['feed', 'community', 'sites']);
});

test('resolveRoute: a logged-in member on #/login lands at home', () => {
    assert.deepEqual(resolveRoute({ name: 'login' }, true), { name: 'feed' });
    assert.deepEqual(resolveRoute({ name: 'login' }, false), { name: 'list' });
});

test('loginHtml: a link to #/login, marked current on the login page', () => {
    assert.match(loginHtml(), /href="#\/login"/);
    assert.match(loginHtml(), />Log in</);
    assert.match(loginHtml({ active: true }), /aria-current="page"/);
});

// ---- Public store ----

function fakeClient({ results = {}, errors = {} } = {}) {
    const calls = [];
    return {
        calls,
        rpc: async (name, args) => {
            calls.push([name, args]);
            if (errors[name]) return { data: null, error: errors[name], status: errors[name].status ?? 400 };
            return { data: typeof results[name] === 'function' ? results[name](args) : results[name] ?? null, error: null };
        },
    };
}

function publicApi(client, extra = {}) {
    return createPublicApi(client, {
        fail: e => new DiveStoreError('unknown', e.message), toSummaryRow: r => ({ id: r.id, deviceSerial: r.device_serial, startLocal: r.start_local }),
        DiveStoreError, photoUrls: async () => new Map(), avatarUrls: async () => new Map(), ...extra,
    });
}

test('publicAvailability: yes when public_members answers, no when it is missing (cached), unknown otherwise', async () => {
    const yes = fakeClient({ results: { public_members: [] } });
    assert.equal(await publicApi(yes).publicAvailability(), 'yes');
    assert.deepEqual(yes.calls[0], ['public_members', { p_id: '00000000-0000-0000-0000-000000000000' }]);

    const no = fakeClient({ errors: { public_members: { code: 'PGRST202', message: 'Could not find the function' } } });
    const api = publicApi(no);
    assert.equal(await api.publicAvailability(), 'no');
    assert.equal(await api.publicAvailability(), 'no');
    assert.equal(no.calls.length, 1, 'cached');

    const flaky = fakeClient({ errors: { public_members: { message: 'Failed to fetch', status: 0 } } });
    const api2 = publicApi(flaky);
    assert.equal(await api2.publicAvailability(), 'unknown');
    await api2.publicAvailability();
    assert.equal(flaky.calls.length, 2, 'a transient failure is asked again');
});

test('publicStore: the community method names call the public RPCs, read-only, no user', async () => {
    const client = fakeClient({
        results: {
            public_entries: args => (args.p_id ? [{ id: args.p_id, owner: 'p' }] : [{ id: 'a' }, { id: 'b' }]),
            public_members: args => (args.p_id ? [{ id: args.p_id }] : [{ id: 'p' }]),
            public_media: [{ id: 'm1' }],
            public_recordings: [{ id: 'r1', device_serial: null, start_local: '2026-09-01T10:00:00' }],
            public_recording: args => (args.p_id === 'r1' ? { samples: [] } : null),
            public_sites: [{ id: 's1', owner: null, name: 'Lom', lat: '50.5', lon: 14.5, visits: '3', temp_min: '10', temp_max: null }],
            public_site_stats: { visits: 3 },
            public_site_visits: [{ id: 'a' }],
        },
    });
    const store = publicApi(client).publicStore();
    assert.equal(store.guest, true);
    assert.equal(await store.currentUser(), null);
    assert.ok(Object.isFrozen(store));
    for (const write of ['saveEntry', 'deleteEntry', 'saveSite', 'saveProfile', 'addPhoto', 'toggleKudos', 'addComment', 'socialStatus', 'shareStatus', 'getMyProfile']) {
        assert.equal(store[write], undefined, write);
    }
    assert.equal((await store.listCommunityEntries({ owner: 'p', limit: 30, offset: 30 })).length, 2);
    assert.deepEqual(client.calls.at(-1), ['public_entries', { p_owner: 'p', p_id: null, p_limit: 30, p_offset: 30 }]);
    assert.equal((await store.getCommunityEntry('x')).id, 'x');
    assert.equal((await store.getMember('p')).id, 'p');
    assert.equal((await store.listMembers()).length, 1);
    assert.equal((await store.listCommunityMedia('a'))[0].id, 'm1');
    assert.deepEqual(await store.communityRecordings('p'), [{ id: 'r1', deviceSerial: null, startLocal: '2026-09-01T10:00:00' }]);
    assert.deepEqual(await store.loadCommunityRecording('r1'), { samples: [] });
    await assert.rejects(store.loadCommunityRecording('nope'), DiveStoreError);
    const [site] = await store.listAllSites();
    assert.equal(site.lat, 50.5);
    assert.equal(site.visits, 3);
    assert.equal(site.temp_min, 10);
    assert.equal(site.own, false, 'a visitor owns no site');
    assert.equal((await store.siteUsage()).size, 0);
    assert.equal(await store.communitySitesStatus(), true);
    assert.deepEqual(await store.siteStats('s1'), { visits: 3 });
    assert.deepEqual(client.calls.at(-1), ['public_site_stats', { p_site_id: 's1' }]);
    assert.equal((await store.siteVisits('s1')).length, 1);
    assert.deepEqual(client.calls.at(-1), ['public_site_visits', { p_site_id: 's1', p_limit: 200, p_offset: 0 }]);
    assert.ok(!client.calls.some(([name]) => name.startsWith('community_') || name === 'site_stats'), 'never a member function');
});

test('supabaseStore exposes the public API; saveProfile sends is_public', async () => {
    const updates = [];
    const client = {
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
        rpc: async () => ({ data: [], error: null }),
        from: () => {
            const b = {
                update(row) { updates.push(row); return b; }, eq() { return b; }, select() { return b; },
                single: async () => ({ data: { id: 'u1', ...updates.at(-1) }, error: null }),
            };
            return b;
        },
    };
    const store = createSupabaseStore(client);
    assert.equal(await store.publicAvailability(), 'yes');
    assert.equal(store.publicStore(), store.publicStore(), 'one read-only store');
    await store.saveProfile({ is_public: true, email: 'never@example.com' });
    assert.equal(updates[0].is_public, true);
    assert.equal('email' in updates[0], false);
});

// ---- Guest app ----

import { LogbookApp } from '../js/logbook/LogbookApp.js';

const SHELL = '<header><nav class="tr-tabs" hidden></nav><span class="tr-bell-slot"></span></header><main><div id="host"></div></main><nav class="tr-bottom" hidden></nav>';

function guestStore({ availability = 'yes', entries = [], members = [], sites = [], loginLog = [] } = {}) {
    const authCbs = new Set();
    const reader = {
        guest: true,
        currentUser: async () => null,
        onAuthChange: () => () => {},
        photoUrls: async () => new Map(),
        avatarUrls: async () => new Map(),
        listMembers: async () => members,
        getMember: async id => members.find(m => m.id === id) ?? null,
        listCommunityEntries: async () => entries,
        getCommunityEntry: async id => entries.find(e => e.id === id) ?? null,
        listCommunityMedia: async () => [],
        communityRecordings: async () => [],
        loadCommunityRecording: async () => null,
        listSites: async () => sites,
        listAllSites: async () => sites,
        siteUsage: async () => new Map(),
        communitySitesStatus: async () => true,
        siteStats: async () => null,
        siteVisits: async () => [],
    };
    return {
        onAuthChange: cb => { authCbs.add(cb); return () => authCbs.delete(cb); },
        currentUser: async () => null,
        publicAvailability: async () => availability,
        publicStore: () => reader,
        listDives: async () => [],
        sendLoginLink: async (email) => { loginLog.push(email); },
        signInWithGoogle: async () => {},
        login: user => { for (const cb of [...authCbs]) cb(user); },
        // A member's store methods: must never be called while browsing as a guest.
        listCommunityEntries: async () => { throw new Error('member function called by a guest'); },
        communityAvailability: async () => { throw new Error('member probe called by a guest'); },
    };
}

const ENTRY = { id: 'd1', owner: 'p', dive_date: '2026-09-01', max_depth_m: 20, duration_s: 1800, site_id: 's1', site_name: 'Lom', photo_path: null, photo_count: 0, buddies: [] };

test('LogbookApp guest: the public Feed with an intro and a Log in button, three tabs, no New dive', async () => {
    await withDom(async (root, window) => {
        const store = guestStore({ entries: [ENTRY], members: [{ id: 'p', display_name: 'Petra' }] });
        const app = new LogbookApp(root, { store });
        await flush(60);
        assert.ok(window.document.body.classList.contains('tr-guest'));
        assert.equal(root.querySelectorAll('.tr-feed-card').length, 1);
        assert.equal(root.querySelector('.tr-author-name').textContent, 'Petra');
        assert.equal(root.querySelector('.tr-feed-link').getAttribute('href'), '#/m/d1');
        assert.ok(root.querySelector('.tr-guest-intro a[href="#/login"]'));
        assert.equal(root.querySelector('a[href="#/new"]'), null);
        assert.deepEqual([...window.document.querySelectorAll('.tr-tabs .tr-tab')].map(a => a.dataset.tab), ['feed', 'community', 'sites']);
        assert.equal(window.document.querySelector('.tr-tabs .tr-tab[aria-current="page"]').dataset.tab, 'feed');
        assert.ok(window.document.querySelector('.tr-bell-slot .tr-login-btn[href="#/login"]'));
        app.destroy();
        assert.ok(!window.document.body.classList.contains('tr-guest'));
    }, { hash: '#/', html: SHELL });
});

test('LogbookApp guest: member-only routes show the login form; a login switches to the logbook', async () => {
    await withDom(async (root, window) => {
        const store = guestStore();
        store.ensureEntries = async () => 0;
        store.listEntries = async () => [];
        store.listSites = async () => [];
        store.listPhotoMedia = async () => [];
        store.photoUrls = async () => new Map();
        store.communityAvailability = async () => 'no';
        const app = new LogbookApp(root, { store });
        await flush(60);
        assert.ok(root.querySelector('.tr-guest-login #rda-login'), 'login form for #/profile');
        assert.equal(window.document.querySelector('.tr-login-btn').getAttribute('aria-current'), 'page');
        window.location.hash = '#/sites';
        await flush(60);
        assert.equal(root.querySelector('.tr-guest-login'), null);
        assert.ok(root.querySelector('.lb-sites-title'));
        store.login({ id: 'me', email: 'me@example.com' });
        await flush(60);
        assert.ok(!window.document.body.classList.contains('tr-guest'));
        assert.equal(app.guest, false);
        assert.equal(window.document.querySelector('.tr-login-btn'), null);
        app.destroy();
    }, { hash: '#/profile', html: SHELL });
});

test('LogbookApp guest: without migration 0012 the page stays the login form alone', async () => {
    await withDom(async (root, window) => {
        const app = new LogbookApp(root, { store: guestStore({ availability: 'no' }) });
        await flush(60);
        assert.ok(root.classList.contains('rda-login-only'));
        assert.equal(app.guest, false);
        assert.ok(!window.document.body.classList.contains('tr-guest'));
        assert.equal(window.document.querySelector('.tr-tabs').hidden, true);
        app.destroy();
    }, { hash: '#/', html: SHELL });
});

test('LogbookApp guest: a public member\'s dive opens read-only, without kudos or comments', async () => {
    await withDom(async root => {
        const store = guestStore({ entries: [ENTRY], members: [{ id: 'p', display_name: 'Petra' }] });
        const app = new LogbookApp(root, { store });
        await flush(80);
        assert.match(root.textContent, /Petra/);
        assert.match(root.textContent, /Lom/);
        assert.equal(root.querySelector('.tr-kudos-btn, .tr-comments'), null);
        assert.equal(root.querySelector('[data-action="edit"], a[href$="/edit"]'), null);
        app.destroy();
    }, { hash: '#/m/d1', html: SHELL });
});

// ---- Guest views ----

import { SitesPage } from '../js/logbook/SitesPage.js';
import { MembersPage } from '../js/logbook/MembersPage.js';
import { ProfilePage } from '../js/logbook/ProfilePage.js';

test('SitesPage guest: the whole directory, no "My sites" switch, no creator, no edit note', async () => {
    await withDom(async host => {
        const sites = [{ id: 's1', owner: null, name: 'Lom', lat: 50.5, lon: 14.5, visibility: 'members', visits: 3, own: false }];
        const reader = guestStore({ sites }).publicStore();
        let page = new SitesPage(host, { store: reader, guest: true });
        await flush();
        assert.equal(host.querySelector('[data-scope]'), null);
        assert.equal(host.querySelectorAll('.lb-site-card').length, 1, 'shown although a visitor owns no site');
        assert.match(host.textContent, /Dive sites of the DecoTrail community/);
        assert.doesNotMatch(host.textContent, /Added by/);
        page.destroy();
        page = new SitesPage(host, { store: reader, siteId: 's1', guest: true });
        await flush();
        assert.match(host.querySelector('.lb-sv-name-h').textContent, /Lom/);
        assert.equal(host.querySelector('.lb-site-readonly'), null);
        assert.equal(host.querySelector('.lb-site-form'), null);
        page.destroy();
    });
});

test('MembersPage guest: its own intro and empty text', async () => {
    await withDom(async host => {
        const page = new MembersPage(host, { store: { listMembers: async () => [] }, userId: null, guest: true });
        await flush();
        assert.match(host.textContent, /made their profile public/);
        assert.match(host.textContent, /No member has a public profile yet/);
        page.destroy();
    });
});

test('ProfilePage: the Public profile switch is off by default and saves is_public; absent without 0012', async () => {
    await withDom(async host => {
        const log = [];
        let current = { id: 'me', display_name: 'Me', default_visibility: 'members', is_public: false };
        const store = {
            getMyProfile: async () => ({ ...current }),
            saveProfile: async patch => { log.push(patch); current = { ...current, ...patch }; return { ...current }; },
            signOut: async () => {},
        };
        let page = new ProfilePage(host, { store, user: { id: 'me', email: 'me@example.com' } });
        await flush();
        const box = host.querySelector('input[name="is_public"]');
        assert.ok(box);
        assert.equal(box.checked, false);
        assert.match(host.querySelector('.tr-profile-public').textContent, /notes, your buddies’ names/);
        box.checked = true;
        host.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await flush();
        assert.equal(log[0].is_public, true);
        assert.equal(host.querySelector('input[name="is_public"]').checked, true, 'stays on after saving');
        page.destroy();

        current = { id: 'me', display_name: 'Me', default_visibility: 'members' };
        log.length = 0;
        page = new ProfilePage(host, { store, user: { id: 'me', email: 'me@example.com' } });
        await flush();
        assert.equal(host.querySelector('input[name="is_public"]'), null);
        host.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await flush();
        assert.equal('is_public' in log[0], false, 'never sent before the migration');
        page.destroy();
    });
});
