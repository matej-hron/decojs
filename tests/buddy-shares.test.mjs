/**
 * Buddy field (own suggestion list, @members) and sending a dive to a member buddy (migration 0013).
 * Run: node --test tests/buddy-shares.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchBuddies, buddyKey, memberBuddyName, sameDiveCandidates } from '../js/logbook/buddies.js';
import { createSharesApi } from '../js/backend/sharesStore.js';
import { ownFile, createSupabaseStore, DiveStoreError } from '../js/backend/supabaseStore.js';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

async function withDom(fn) {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://localhost/lab/dive-log.html#/new', pretendToBeVisual: true });
    const saved = {};
    for (const k of ['window', 'document', 'location', 'navigator', 'HTMLElement', 'Event']) {
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

const MEMBERS = [
    { id: 'me', nickname: 'Matej', display_name: 'Matej Hron' },
    { id: 'k1', nickname: 'Kryštof', display_name: 'Kryštof Novák', avatar_preset: 'reef-02' },
    { id: 'p1', nickname: null, display_name: 'Pavlina Dravecka' },
    { id: 'z1', nickname: null, display_name: null },
];

// ---- Pure helpers ----

test('buddyKey ignores case, diacritics and spaces; memberBuddyName prefers the nickname', () => {
    assert.equal(buddyKey('  Kryštof   Novák '), 'krystof novak');
    assert.equal(memberBuddyName(MEMBERS[1]), 'Kryštof');
    assert.equal(memberBuddyName(MEMBERS[2]), 'Pavlina Dravecka');
    assert.equal(memberBuddyName(MEMBERS[3]), null);
});

test('matchBuddies: "@" lists members only, typed text matches without diacritics, never self or added', () => {
    const o = { names: ['Pepa', 'Krystof'], members: MEMBERS, userId: 'me' };
    assert.deepEqual(matchBuddies('@', o).map(m => [m.name, m.member?.id ?? null]), [['Kryštof', 'k1'], ['Pavlina Dravecka', 'p1']]);
    assert.deepEqual(matchBuddies('@kry', o).map(m => m.name), ['Kryštof']);
    assert.deepEqual(matchBuddies('@novak', o).map(m => m.name), ['Kryštof'], 'the full name matches too');
    // "Krystof" typed before is the member Kryštof: suggested once, as the member.
    assert.deepEqual(matchBuddies('kry', o).map(m => [m.name, m.member?.id ?? null]), [['Krystof', 'k1']]);
    assert.deepEqual(matchBuddies('', o).map(m => m.name), ['Pepa', 'Krystof', 'Pavlina Dravecka']);
    assert.deepEqual(matchBuddies('', { ...o, added: ['pepa', 'Kryštof'] }).map(m => m.name), ['Pavlina Dravecka']);
    assert.deepEqual(matchBuddies('mat', o), [], 'never the user');
    assert.equal(matchBuddies('', { names: Array.from({ length: 20 }, (_, i) => `B${i}`) }).length, 8);
});

test('sameDiveCandidates: same date, start within 90 min (or no time), closest first', () => {
    const own = [
        { id: 'a', dive_date: '2026-10-12', entry_time: '19:00' },
        { id: 'b', dive_date: '2026-10-12', entry_time: '21:20:00' },
        { id: 'c', dive_date: '2026-10-12', entry_time: null },
        { id: 'd', dive_date: '2026-10-11', entry_time: '21:00' },
    ];
    assert.deepEqual(sameDiveCandidates({ dive_date: '2026-10-12', entry_time: '21:00' }, own).map(e => e.id), ['b', 'c']);
    assert.deepEqual(sameDiveCandidates({ dive_date: '2026-10-12', entry_time: null }, own).map(e => e.id), ['a', 'b', 'c']);
    assert.deepEqual(sameDiveCandidates({ dive_date: '2026-10-13' }, own), []);
});

test('ownFile: only paths in the user\'s own folder', () => {
    assert.equal(ownFile('u1/SER/x.DLF', 'u1'), true);
    assert.equal(ownFile('u2/SER/x.DLF', 'u1'), false);
    assert.equal(ownFile('u1x/SER/x.DLF', 'u1'), false);
    assert.equal(ownFile(null, 'u1'), false);
});

// ---- Store ----

function sharesClient({ rpc = {}, signed = [] } = {}) {
    const calls = [];
    return {
        calls,
        rpc: async (name, args) => { calls.push([name, args]); const r = rpc[name]; return typeof r === 'function' ? r(args) : r ?? { data: null, error: null }; },
        from: () => ({ select() { return this; }, eq: async () => ({ data: [{ id: 's1', recipient: 'k1', status: 'pending' }], error: null }) }),
        storage: { from: () => ({ createSignedUrls: async paths => ({ data: signed.filter(s => paths.includes(s.path)), error: null }) }) },
    };
}

test('sharesStore: availability needs the community and the RPC; answers map to camelCase', async () => {
    const fail = e => new DiveStoreError('unknown', e.message);
    const yes = sharesClient({ rpc: { incoming_dive_share_count: { data: 2, error: null }, accept_dive_share: { data: { entry_id: 'e9', copied: true }, error: null } } });
    const api = createSharesApi(yes, { fail, communityAvailability: async () => 'yes', addPhoto: async () => {}, addVideoLink: async () => {} });
    assert.equal(await api.sharesStatus(), true);
    assert.equal(await api.incomingDiveShareCount(), 2);
    assert.deepEqual(await api.acceptDiveShare('s1'), { entryId: 'e9', copied: true });
    assert.deepEqual(yes.calls.at(-1), ['accept_dive_share', { p_share: 's1', p_link_entry: null }]);
    await api.setDiveShares('e1', ['k1', 'k1', 'p1']);
    assert.deepEqual(yes.calls.at(-1), ['set_dive_shares', { p_entry: 'e1', p_recipients: ['k1', 'p1'] }]);
    assert.equal((await api.listDiveShares('e1'))[0].recipient, 'k1');

    const off = createSharesApi(sharesClient(), { fail, communityAvailability: async () => 'no' });
    assert.equal(await off.sharesStatus(), false);
    const missing = sharesClient({ rpc: { incoming_dive_share_count: { data: null, error: { code: 'PGRST202', message: 'missing' } } } });
    assert.equal(await createSharesApi(missing, { fail, communityAvailability: async () => 'yes' }).sharesAvailability(), 'no');
});

test('sharesStore.copySharedMedia: re-uploads photos as the user\'s own, copies video links, counts failures', async () => {
    const added = [];
    const client = sharesClient({
        rpc: { dive_share_media: { data: [
            { kind: 'photo', path: 's/e/p1.jpg', width: 800, height: 600, taken_at: '2026-10-12T21:10:00Z', lat: null, lon: null },
            { kind: 'photo', path: 's/e/p2.jpg', width: 10, height: 10 },
            { kind: 'video_link', url: 'https://youtu.be/x', caption: 'Night' },
        ], error: null } },
        signed: [{ path: 's/e/p1.jpg', signedUrl: 'https://cdn.test/p1' }], // p2 is not signed: it fails alone
    });
    const api = createSharesApi(client, {
        fail: e => e, communityAvailability: async () => 'yes',
        addPhoto: async (id, p) => { added.push(['photo', id, p.width, await p.blob.text(), p.takenAt]); },
        addVideoLink: async (id, url, caption) => { added.push(['video', id, url, caption]); },
        fetchImpl: async url => ({ ok: true, blob: async () => new Blob([`bytes of ${url}`]) }),
    });
    const progress = [];
    const r = await api.copySharedMedia('s1', 'e9', (done, total) => progress.push(`${done}/${total}`));
    assert.deepEqual(r, { copied: 2, failed: 1 });
    assert.deepEqual(added, [['photo', 'e9', 800, 'bytes of https://cdn.test/p1', '2026-10-12T21:10:00Z'], ['video', 'e9', 'https://youtu.be/x', 'Night']]);
    assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
});

test('supabaseStore: a copied recording (buddy\'s file path) is skipped by export and re-parse', async () => {
    const rows = [
        { file_path: 'u1/SER/a.DLF', start_local: '2026-10-01T10:00:00', record: { source: { fileName: 'a.DLF' } } },
        { file_path: 'u2/SER/b.DLF', start_local: '2026-10-02T10:00:00', record: { source: { fileName: 'b.DLF' } } },
    ];
    const downloads = [];
    const q = { select() { return q; }, order() { return q; }, eq() { return q; }, single: async () => ({ data: { file_path: 'u2/SER/b.DLF' }, error: null }),
        then(r) { return Promise.resolve({ data: rows, error: null }).then(r); } };
    const client = {
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
        from: () => q,
        storage: { from: () => ({ download: async path => { downloads.push(path); return { data: new Blob(['x']), error: null }; } }) },
        rpc: async () => ({ data: null, error: null }),
    };
    const store = createSupabaseStore(client);
    const out = await store.exportAll();
    assert.deepEqual(out.files.map(f => f.name), ['a.DLF']);
    assert.equal(out.dives.length, 2, 'the copy\'s samples stay in the export');
    assert.deepEqual(downloads, ['u1/SER/a.DLF']);
    assert.equal(await store.reparseOutdated([{ id: 'r2', parserVersion: 0 }]), 0);
    assert.deepEqual(downloads, ['u1/SER/a.DLF'], 'never downloads the buddy\'s file');
});

// ---- Entry form ----

import { EntryForm } from '../js/logbook/EntryForm.js';

function formStore(log, { shares = [] } = {}) {
    return {
        listSites: async () => [], listBuddies: async () => ['Pepa'], listEntries: async () => [],
        communityStatus: async () => true, currentUser: async () => ({ id: 'me' }), listMembers: async () => MEMBERS,
        sharesStatus: async () => true, listDiveShares: async () => shares,
        saveEntry: async (row, id) => { log.push(['save', row.buddies]); return { id: id ?? 'new1', ...row }; },
        setDiveShares: async (id, recipients) => { log.push(['share', id, recipients]); return []; },
    };
}

test('EntryForm buddy field: its own suggestion list, @ for members, member buddies offered the dive on save', async () => {
    await withDom(async (root, window) => {
        const log = [];
        new EntryForm(root, { store: formStore(log), prefill: { dive_date: '2026-10-12' }, onSaved() {}, onCancel() {} });
        await tick();
        assert.equal(root.querySelector('datalist#lb-buddy-names'), null, 'no datalist (Android shows it only as keyboard chips)');
        const input = root.querySelector('[name="buddy"]');
        assert.equal(input.getAttribute('role'), 'combobox');
        assert.equal(root.querySelector('.lb-buddy-hint').hidden, false);
        input.focus();
        input.dispatchEvent(new window.Event('focus'));
        const list = root.querySelector('#lb-buddy-list');
        assert.equal(list.hidden, false, 'opens on focus');
        assert.deepEqual([...list.querySelectorAll('.lb-suggest-name')].map(n => n.textContent), ['Pepa', '@Kryštof', '@Pavlina Dravecka']);
        input.value = '@kry';
        input.dispatchEvent(new window.Event('input'));
        assert.deepEqual([...list.querySelectorAll('.lb-suggest-name')].map(n => n.textContent), ['@Kryštof']);
        assert.match(list.textContent, /Kryštof Novák/);
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
        assert.equal(input.getAttribute('aria-activedescendant'), 'lb-buddy-opt-0');
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
        const chip = root.querySelector('.lb-chip-member');
        assert.ok(chip, 'a member chip');
        assert.match(chip.textContent, /@Kryštof/);
        assert.match(chip.textContent, /will be offered/);
        // A plain name stays a plain buddy.
        const again = root.querySelector('[name="buddy"]');
        again.value = 'Franta';
        again.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
        // Tapping a suggestion picks it (pointerdown keeps the keyboard open).
        const third = root.querySelector('[name="buddy"]');
        third.focus();
        third.value = 'pavl';
        third.dispatchEvent(new window.Event('input'));
        root.querySelector('#lb-buddy-list [data-pick="0"]').dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
        assert.deepEqual([...root.querySelectorAll('.lb-chip-name')].map(n => n.textContent), ['@Kryštof', 'Franta', '@Pavlina Dravecka']);
        root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await tick();
        assert.deepEqual(log, [['save', ['Kryštof', 'Franta', 'Pavlina Dravecka']], ['share', 'new1', ['k1', 'p1']]]);
    });
});

test('EntryForm buddy field: an existing offer marks its chip; removing a member buddy withdraws the offer', async () => {
    await withDom(async (root, window) => {
        const log = [];
        const entry = { id: 'e1', log_number: 3, dive_date: '2026-10-12', buddies: ['Kryštof', 'Pepa'], details: {} };
        new EntryForm(root, { store: formStore(log, { shares: [{ id: 's1', recipient: 'k1', status: 'accepted' }] }), entry, onSaved() {}, onCancel() {} });
        await tick();
        const chip = root.querySelector('.lb-chip-member');
        assert.match(chip.textContent, /in their log/);
        chip.querySelector('.lb-chip-x').click();
        root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await tick();
        assert.deepEqual(log.at(-1), ['share', 'e1', []]);
    });
});

test('EntryForm without 0013: no hint, nothing offered', async () => {
    await withDom(async (root, window) => {
        const log = [];
        const store = { ...formStore(log), sharesStatus: async () => false };
        new EntryForm(root, { store, prefill: { dive_date: '2026-10-12' }, onSaved() {}, onCancel() {} });
        await tick();
        assert.equal(root.querySelector('.lb-buddy-hint').hidden, true);
        const input = root.querySelector('[name="buddy"]');
        input.value = '@Kryštof';
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
        assert.equal(root.querySelector('.lb-chip-status'), null);
        root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await tick();
        assert.deepEqual(log, [['save', ['Kryštof']]]);
    });
});

// ---- New for you: offers ----

import { ActivityPage } from '../js/logbook/ActivityPage.js';

function activityStore(log, { offers, own = [] }) {
    return {
        socialInbox: async () => [], markSocialSeen: async () => {},
        sharesStatus: async () => true, incomingDiveShares: async () => offers, listEntries: async () => own,
        acceptDiveShare: async (id, link) => { log.push(['accept', id, link]); return { entryId: link ?? 'copy1', copied: !link }; },
        declineDiveShare: async id => { log.push(['decline', id]); },
        copySharedMedia: async (id, entryId, onProgress) => { onProgress(1, 1); log.push(['media', id, entryId]); return { copied: 1, failed: 0 }; },
    };
}

const OFFER = { id: 's1', sender: 'm1', nickname: 'Matej', display_name: 'Matej Hron', dive_date: '2026-10-12', entry_time: '21:00:00',
    max_depth_m: 12.3, duration_s: 2700, site_name: 'Žernovka', description: 'Nocak <b>s</b> Krystofem', has_recording: true, photo_count: 2 };

test('ActivityPage: an offer shows what the dive is; Add copies it with its photos and opens it', async () => {
    await withDom(async host => {
        const log = [];
        const opened = [];
        const seen = [];
        new ActivityPage(host, { store: activityStore(log, { offers: [OFFER] }), onSeen: n => seen.push(n), onOpenDive: id => opened.push(id) });
        await tick();
        const card = host.querySelector('.tr-offer');
        assert.match(card.textContent, /Matej sent you a dive you did together/);
        assert.match(card.textContent, /Žernovka/);
        assert.match(card.textContent, /12\.3 m/);
        assert.match(card.textContent, /2 photos/);
        assert.ok(!card.innerHTML.includes('<b>'), 'the story is escaped');
        assert.deepEqual(seen, [1], 'the badge keeps the waiting offer');
        assert.equal(card.querySelector('[data-offer-link]'), null, 'nothing to link');
        card.querySelector('[data-offer-accept]').click();
        await tick();
        assert.deepEqual(log, [['accept', 's1', null], ['media', 's1', 'copy1']]);
        assert.deepEqual(opened, ['copy1']);
        assert.equal(seen.at(-1), 0);
        assert.equal(host.querySelector('.tr-offer'), null);
    });
});

test('ActivityPage: a dive logged already can be linked; Decline answers without copying', async () => {
    await withDom(async host => {
        const log = [];
        const opened = [];
        const own = [{ id: 'mine', log_number: 41, dive_date: '2026-10-12', entry_time: '21:05', max_depth_m: 12 }];
        new ActivityPage(host, { store: activityStore(log, { offers: [OFFER, { ...OFFER, id: 's2', dive_date: '2026-01-01' }], own }), onOpenDive: id => opened.push(id) });
        await tick();
        const [first, second] = host.querySelectorAll('.tr-offer');
        assert.match(first.textContent, /logged this dive already/);
        assert.match(first.querySelector('[data-offer-accept]').textContent, /Add as a new dive/);
        assert.match(first.querySelector('[data-offer-link]').textContent, /#41 \(21:05, 12\.0 m\)/);
        second.querySelector('[data-offer-decline]').click();
        await tick();
        assert.deepEqual(log, [['decline', 's2']]);
        host.querySelector('[data-offer-link]').click();
        await tick();
        assert.deepEqual(log.at(-1), ['accept', 's1', 'mine']);
        assert.deepEqual(opened, ['mine'], 'linking copies no photos and opens the own dive');
    });
});

test('EntryForm buddy field: "@kr" + Enter takes the first member suggested', async () => {
    await withDom(async (root, window) => {
        const log = [];
        new EntryForm(root, { store: formStore(log), prefill: { dive_date: '2026-10-12' }, onSaved() {}, onCancel() {} });
        await tick();
        const input = root.querySelector('[name="buddy"]');
        input.focus();
        input.value = '@kr';
        input.dispatchEvent(new window.Event('input'));
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
        assert.deepEqual([...root.querySelectorAll('.lb-chip-name')].map(n => n.textContent), ['@Kryštof']);
    });
});
