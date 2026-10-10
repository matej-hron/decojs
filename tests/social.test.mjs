/**
 * DecoTrail kudos and comments: pure helpers (social.js) and the store API (socialStore.js) over a fake client.
 * Run: node --test tests/social.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    COMMENT_MAX, normalizeComment, applyKudos, badgeText, relativeTime, socialBarHtml, kudosListHtml, inboxLine,
} from '../js/logbook/social.js';
import { createSocialApi } from '../js/backend/socialStore.js';
import { parseRoute, routeHref } from '../js/logbook/router.js';
import { activeTab, resolveRoute, isCommunityRoute } from '../js/logbook/AppShell.js';

const TEXT = { kudos: 'Kudos', countLabel: '{0} kudos, show who', commentsLabel: '{0} comments' };

test('normalizeComment trims, unifies line breaks and counts code points', () => {
    assert.deepEqual(normalizeComment('  hi\r\nthere \r '), { body: 'hi\nthere', length: 8, empty: false, tooLong: false, ok: true });
    assert.equal(normalizeComment('   \n ').ok, false);
    assert.equal(normalizeComment('   \n ').empty, true);
    assert.equal(normalizeComment(null).empty, true);
    assert.equal(normalizeComment('😀'.repeat(COMMENT_MAX)).ok, true, 'emoji count as one character, like Postgres');
    assert.equal(normalizeComment('x'.repeat(COMMENT_MAX + 1)).tooLong, true);
});

test('applyKudos toggles once and never goes below zero', () => {
    const base = { kudos: 2, kudoed: false, comments: 1, commentsEnabled: true };
    assert.deepEqual(applyKudos(base, true), { ...base, kudos: 3, kudoed: true });
    assert.deepEqual(applyKudos({ ...base, kudoed: true }, true), { ...base, kudoed: true }, 'already given: unchanged');
    assert.deepEqual(applyKudos({ ...base, kudos: 0, kudoed: true }, false), { ...base, kudos: 0, kudoed: false });
    assert.deepEqual(applyKudos(null, true), { kudos: 1, kudoed: true, comments: 0, commentsEnabled: true });
});

test('badgeText', () => {
    assert.equal(badgeText(0), '');
    assert.equal(badgeText(-3), '');
    assert.equal(badgeText('7'), '7');
    assert.equal(badgeText(120), '99+');
});

test('relativeTime: just now, minutes, hours, days, then a date', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    assert.equal(relativeTime('2026-10-10T11:59:40Z', { now }), 'just now');
    assert.equal(relativeTime('2026-10-10T11:55:00Z', { now }), '5 minutes ago');
    assert.equal(relativeTime('2026-10-10T09:00:00Z', { now }), '3 hours ago');
    assert.equal(relativeTime('2026-10-09T10:00:00Z', { now }), 'yesterday');
    assert.equal(relativeTime('2026-10-06T12:00:00Z', { now }), '4 days ago');
    assert.match(relativeTime('2026-09-01T12:00:00Z', { now }), /Sep/);
    assert.match(relativeTime('2025-09-01T12:00:00Z', { now }), /2025/);
    assert.equal(relativeTime('nonsense', { now }), '');
    assert.equal(relativeTime('2026-10-10T11:55:00Z', { now, locale: 'cs' }), 'před 5 minutami');
});

test('socialBarHtml: member dive has a pressed state, own dive only the count', () => {
    const counts = { kudos: 3, kudoed: true, comments: 2, commentsEnabled: true };
    const html = socialBarHtml({ entryId: 'e1', counts, own: false, commentsHref: '#/m/e1', text: TEXT });
    assert.match(html, /class="tr-kudos-btn"[^>]*aria-pressed="true"[^>]*aria-label="Kudos"[^>]*title="Kudos"/);
    assert.match(html, /data-kudos-list="e1" aria-expanded="false" aria-controls="tr-kl-e1" aria-label="3 kudos, show who">3</);
    assert.match(html, /href="#\/m\/e1" aria-label="2 comments"/);
    const own = socialBarHtml({ entryId: 'e1', counts, own: true, text: TEXT });
    assert.ok(!own.includes('tr-kudos-btn'), 'no kudos button on own dives');
    assert.match(own, /tr-kudos-count/);
    assert.ok(!own.includes('tr-comments-link'), 'no comments link without href');
    assert.equal(socialBarHtml({ entryId: 'e1', counts: { ...counts, kudos: 0 }, own: true, text: TEXT }), '', 'own dive, no kudos, no link: nothing');
    const off = socialBarHtml({ entryId: 'e1', counts: { ...counts, commentsEnabled: false }, own: false, commentsHref: '#/m/e1', text: TEXT });
    assert.ok(!off.includes('tr-comments-link'), 'comments off: no comments link');
    const zero = socialBarHtml({ entryId: 'e1', counts: { kudos: 0, kudoed: false, comments: 0, commentsEnabled: true }, own: false, text: TEXT });
    assert.match(zero, /aria-pressed="false"/);
    assert.ok(!zero.includes('tr-kudos-count'), 'no count button at zero');
});

test('socialBarHtml and kudosListHtml escape ids and names', () => {
    const html = socialBarHtml({ entryId: '"><x', counts: null, own: false, text: TEXT });
    assert.ok(!html.includes('"><x'));
    const list = kudosListHtml({
        entryId: 'e1', rows: [{ member_id: 'u2', display_name: '<b>Eve</b>', avatar_preset: 'reef-01', avatar_path: null }],
        nameOf: r => r.display_name, text: { loading: 'Loading', failed: 'Failed', title: 'Kudos from' },
    });
    assert.ok(!list.includes('<b>Eve'));
    assert.match(list, /&lt;b&gt;Eve&lt;\/b&gt;/);
    assert.match(list, /href="#\/member\/u2"/);
    assert.match(list, /id="tr-kl-e1"/);
    assert.match(kudosListHtml({ entryId: 'e1', rows: null, nameOf: () => '', text: { loading: 'Loading', failed: 'F', title: 'T' } }), /Loading/);
    assert.match(kudosListHtml({ entryId: 'e1', rows: 'error', nameOf: () => '', text: { loading: 'L', failed: 'Failed', title: 'T' } }), /role="alert">Failed/);
});

test('inboxLine: kudos and comment templates, excerpt collapsed', () => {
    const t = { name: 'Milan', dive: 'Blue Hole', kudos: '{0} gave kudos to {1}', comment: '{0} commented on {1}' };
    assert.deepEqual(inboxLine({ kind: 'kudos' }, t), { text: 'Milan gave kudos to Blue Hole', excerpt: null });
    assert.deepEqual(inboxLine({ kind: 'comment', excerpt: 'Nice\n\n dive ' }, t), { text: 'Milan commented on Blue Hole', excerpt: 'Nice dive' });
});

test('route: #/activity is a community route without a tab', () => {
    assert.deepEqual(parseRoute('#/activity'), { name: 'activity' });
    assert.equal(routeHref({ name: 'activity' }), '#/activity');
    assert.equal(isCommunityRoute('activity'), true);
    assert.equal(activeTab('activity', true), null);
    assert.deepEqual(resolveRoute({ name: 'activity' }, false), { name: 'list' });
});

// ---- Store ----

function fakeClient({ user = { id: 'u1' }, missing = false, rpcResults = {}, errors = {} } = {}) {
    const calls = [];
    const db = { kudos: [], comments: [], log_entries: [{ id: 'e1', owner: 'u1', comments_enabled: true }] };
    function builder(table) {
        const q = {
            mode: 'select', filters: [], payload: null, single: false,
            select() { calls.push(['select', table]); return q; },
            limit() { return q; },
            eq(col, val) { q.filters.push([col, val]); return q; },
            insert(p) { q.mode = 'insert'; q.payload = p; return q; },
            update(p) { q.mode = 'update'; q.payload = p; return q; },
            delete() { q.mode = 'delete'; return q; },
            single() { q.single = true; return q; },
            then(resolve, reject) { return run().then(resolve, reject); },
        };
        const match = r => q.filters.every(([c, v]) => r[c] === v);
        async function run() {
            if (missing && table === 'kudos' && q.mode === 'select') return { data: null, error: { code: 'PGRST205', message: 'missing' } };
            const err = errors[`${q.mode}:${table}`];
            if (err) { calls.push([q.mode, table, q.payload]); return { data: null, error: err }; }
            if (q.mode === 'insert') {
                const row = { id: `${table}-${db[table].length + 1}`, ...q.payload };
                db[table].push(row);
                calls.push(['insert', table, q.payload]);
                return { data: q.single ? row : [row], error: null };
            }
            if (q.mode === 'update') {
                const rows = db[table].filter(match);
                rows.forEach(r => Object.assign(r, q.payload));
                calls.push(['update', table, q.payload, q.filters]);
                return { data: q.single ? rows[0] : rows, error: null };
            }
            if (q.mode === 'delete') {
                const gone = db[table].filter(match);
                db[table] = db[table].filter(r => !match(r));
                calls.push(['delete', table, q.filters]);
                return { data: gone, error: null };
            }
            return { data: db[table].filter(match), error: null };
        }
        return q;
    }
    return {
        calls, db, from: builder,
        async rpc(name, args) { calls.push(['rpc', name, args]); return { data: rpcResults[name] ?? null, error: errors[`rpc:${name}`] ?? null }; },
        user,
    };
}

class DiveStoreError extends Error { constructor(kind, m) { super(m); this.kind = kind; } }
const api = (client, { community = true } = {}) => createSocialApi(client, {
    requireUser: async () => client.user,
    fail: e => new DiveStoreError('unknown', e.message),
    communityStatus: async () => community,
    DiveStoreError,
});

test('socialStatus: yes with the table, no without (cached), no without community', async () => {
    const c = fakeClient();
    const s = api(c);
    assert.equal(await s.socialStatus(), true);
    assert.equal(await s.socialStatus(), true);
    assert.equal(c.calls.filter(x => x[0] === 'select' && x[1] === 'kudos').length, 1, 'probe cached');
    assert.equal(await api(fakeClient({ missing: true })).socialStatus(), false);
    const nc = fakeClient();
    assert.equal(await api(nc, { community: false }).socialStatus(), false);
    assert.equal(nc.calls.length, 0, 'no probe without community');
});

test('socialStatus: a transient failure is not cached; reset forgets the answer', async () => {
    const c = fakeClient({ errors: { 'select:kudos': { message: 'Failed to fetch' } } });
    const s = api(c);
    assert.equal(await s.socialAvailability(), 'unknown');
    assert.equal(await s.socialAvailability(), 'unknown');
    const ok = fakeClient();
    const s2 = api(ok);
    await s2.socialStatus();
    s2.resetSocialCache();
    await s2.socialStatus();
    assert.equal(ok.calls.filter(x => x[1] === 'kudos').length, 2);
});

test('socialCounts maps rows and chunks ids by 200', async () => {
    const c = fakeClient({ rpcResults: { social_counts: [{ entry_id: 'e1', kudos_count: 3, kudoed: true, comment_count: 2, comments_enabled: true }] } });
    const counts = await api(c).socialCounts(['e1', 'e1', null, ...Array.from({ length: 250 }, (_, i) => `x${i}`)]);
    assert.deepEqual(counts.get('e1'), { kudos: 3, kudoed: true, comments: 2, commentsEnabled: true });
    const rpcs = c.calls.filter(x => x[1] === 'social_counts');
    assert.equal(rpcs.length, 2);
    assert.equal(rpcs[0][2].p_entry_ids.length, 200);
    assert.equal(rpcs[1][2].p_entry_ids.length, 51);
    assert.equal((await api(fakeClient()).socialCounts([])).size, 0);
});

test('setKudos inserts as the caller, a duplicate is fine, undo deletes only own', async () => {
    const c = fakeClient();
    const s = api(c);
    await s.setKudos('e2', true);
    assert.deepEqual(c.db.kudos, [{ id: 'kudos-1', entry_id: 'e2', member_id: 'u1' }]);
    c.db.kudos.push({ entry_id: 'e2', member_id: 'u9' });
    await s.setKudos('e2', false);
    assert.deepEqual(c.db.kudos, [{ entry_id: 'e2', member_id: 'u9' }], 'other members\' kudos stay');
    const dup = fakeClient({ errors: { 'insert:kudos': { code: '23505', message: 'duplicate' } } });
    await api(dup).setKudos('e2', true); // no throw
    const bad = fakeClient({ errors: { 'insert:kudos': { code: '42501', message: 'rls' } } });
    await assert.rejects(api(bad).setKudos('e2', true));
});

test('comments: add, edit, delete; rate limit has its own kind', async () => {
    const c = fakeClient();
    const s = api(c);
    const row = await s.addComment('e2', 'Hello');
    assert.deepEqual(row, { id: 'comments-1', entry_id: 'e2', author_id: 'u1', body: 'Hello' });
    const edited = await s.editComment(row.id, 'Hi');
    assert.equal(edited.body, 'Hi');
    assert.deepEqual(c.calls.find(x => x[0] === 'update')[2], { body: 'Hi' }, 'an edit sends only the body');
    await s.deleteComment(row.id);
    assert.equal(c.db.comments.length, 0);
    const limited = fakeClient({ errors: { 'insert:comments': { code: 'P0001', message: 'Too many comments' } } });
    await assert.rejects(api(limited).addComment('e2', 'x'), e => e.kind === 'rate');
});

test('setCommentsEnabled updates the own entry', async () => {
    const c = fakeClient();
    const saved = await api(c).setCommentsEnabled('e1', false);
    assert.equal(saved.comments_enabled, false);
    assert.equal(c.db.log_entries[0].comments_enabled, false);
});

test('inbox, unseen count and mark seen call the RPCs', async () => {
    const c = fakeClient({ rpcResults: { social_inbox: [{ kind: 'kudos' }], social_unseen_count: 4 } });
    const s = api(c);
    assert.deepEqual(await s.socialInbox(), [{ kind: 'kudos' }]);
    assert.equal(await s.socialUnseenCount(), 4);
    await s.markSocialSeen();
    assert.deepEqual(c.calls.filter(x => x[0] === 'rpc').map(x => x[1]), ['social_inbox', 'social_unseen_count', 'social_mark_seen']);
    assert.deepEqual(c.calls[0][2], { p_limit: 50 });
    assert.equal(await api(fakeClient()).socialUnseenCount(), 0, 'null count -> 0');
});

test('deleteMySocial removes only the caller\'s kudos and comments', async () => {
    const c = fakeClient();
    c.db.kudos.push({ entry_id: 'a', member_id: 'u1' }, { entry_id: 'b', member_id: 'u2' });
    c.db.comments.push({ id: 'c1', author_id: 'u1' }, { id: 'c2', author_id: 'u1' }, { id: 'c3', author_id: 'u2' });
    assert.deepEqual(await api(c).deleteMySocial(), { kudos: 1, comments: 2 });
    assert.deepEqual(c.db.kudos, [{ entry_id: 'b', member_id: 'u2' }]);
    assert.deepEqual(c.db.comments, [{ id: 'c3', author_id: 'u2' }]);
});

// ---- Nickname ----
import { displayName, fullName, buddySuggestions } from '../js/logbook/community.js';
import { shareStoreFor } from '../js/backend/shareStore.js';

test('displayName: nickname, else display name, else Diver', () => {
    const t = () => 'Diver';
    assert.equal(displayName({ nickname: ' Luis ', display_name: 'Jarda Fiala' }, t), 'Luis');
    assert.equal(displayName({ nickname: '  ', display_name: 'Jarda Fiala' }, t), 'Jarda Fiala');
    assert.equal(displayName({ nickname: null, display_name: '' }, t), 'Diver');
    assert.equal(fullName({ display_name: ' Jarda ' }), 'Jarda');
    assert.equal(fullName(null), '');
});

test('buddySuggestions: typed names first, then other members by nickname with the full name as hint', () => {
    const members = [
        { id: 'u1', nickname: 'Me' },
        { id: 'u2', nickname: 'Luis', display_name: 'Jarda Fiala' },
        { id: 'u3', nickname: 'petr', display_name: 'Petr Novák' },
        { id: 'u4', nickname: null, display_name: 'No Nick' },
        { id: 'u5', nickname: 'Same', display_name: 'Same' },
    ];
    assert.deepEqual(buddySuggestions(['Petr', ' Jana '], members, 'u1'), [
        { value: 'Petr' }, { value: 'Jana' }, { value: 'Luis', label: 'Jarda Fiala' }, { value: 'Same' },
    ]);
    assert.deepEqual(buddySuggestions(null, null, 'u1'), []);
});

test('share store: social extras give the count and nickname, nulls before 0010', async () => {
    const client = res => ({ rpc: async (name, args) => { assert.equal(name, 'shared_dive_social'); assert.equal(args.p_token, 'tok'); return res; } });
    assert.deepEqual(await shareStoreFor(client({ data: { kudos_count: 4, author_nickname: ' Luis ' }, error: null }), 'tok').socialExtras(), { kudos: 4, nickname: 'Luis' });
    assert.deepEqual(await shareStoreFor(client({ data: null, error: { code: 'PGRST202', message: 'missing' } }), 'tok').socialExtras(), { kudos: null, nickname: null });
    assert.deepEqual(await shareStoreFor(client({ data: { kudos_count: 0, author_nickname: null }, error: null }), 'tok').socialExtras(), { kudos: 0, nickname: null });
});
