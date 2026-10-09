/**
 * DecoTrail community store tests.
 * Run: node --test tests/community-store.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore } from '../js/backend/supabaseStore.js';
import { nameFromMetadata } from '../js/backend/communityStore.js';

const UNIQUE = {
    log_entries: [
        { name: 'log_entries_recording_id_key', cols: ['recording_id'], skipNull: true },
        { name: 'log_entries_owner_log_number_key', cols: ['owner', 'log_number'] },
    ],
};

function fakeCommunityClient({ user = { id: 'u1', email: 'me@example.com' }, tables = {}, failTables = [], rpcResults = {}, rpcErrors = {}, transient = 0 } = {}) {
    let transientLeft = transient;
    const db = { dives: [], log_entries: [], sites: [], media: [], profiles: [], ...tables };
    const files = new Map();
    const calls = [];
    let seq = 0;

    function violation(table, row, ignoreId) {
        for (const u of UNIQUE[table] ?? []) {
            if (u.skipNull && u.cols.some(c => row[c] == null)) continue;
            const clash = db[table].find(r => r.id !== ignoreId && u.cols.every(c => r[c] === row[c]));
            if (clash) {
                return {
                    code: '23505',
                    message: `duplicate key value violates unique constraint "${u.name}"`,
                    details: `Key (${u.cols.join(', ')})=(${u.cols.map(c => row[c]).join(', ')}) already exists.`,
                };
            }
        }
        return null;
    }

    function builder(table) {
        if (table === 'profiles' && transientLeft > 0) {
            transientLeft--;
            calls.push(['select', table]);
            const err = { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
            const dead = { select() { return dead; }, limit() { return dead; }, then(r, j) { return Promise.resolve(err).then(r, j); } };
            return dead;
        }
        if (failTables.includes(table)) {
            calls.push(['select', table]);
            const err = { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } };
            const dead = { select() { calls.push(['select', table]); return dead; }, limit() { return dead; }, eq() { return dead; }, maybeSingle() { return dead; }, single() { return dead; }, then(r, j) { return Promise.resolve(err).then(r, j); } };
            return dead;
        }
        const q = {
            _mode: 'select', _filters: [], _order: [], _payload: null, _single: null,
            select() { calls.push(['select', table]); return this; },
            limit() { return this; },
            order(col, opts = {}) { this._order.push([col, opts.ascending !== false]); calls.push(['order', table, col, opts.ascending !== false]); return this; },
            eq(col, val) { this._filters.push(r => r[col] === val); return this; },
            in(col, vals) { this._filters.push(r => vals.includes(r[col])); return this; },
            range(from, to) { this._range = [from, to]; return this; },
            single() { this._single = 'single'; return this; },
            maybeSingle() { this._single = 'maybe'; return this; },
            insert(payload) { this._mode = 'insert'; this._payload = payload; return this; },
            update(patch) { this._mode = 'update'; this._payload = patch; return this; },
            delete() { this._mode = 'delete'; return this; },
            then(resolve, reject) { return this._run().then(resolve, reject); },
            async _run() {
                await null; // let concurrent callers interleave
                const shape = rows => {
                    if (!this._single) return { data: rows, error: null };
                    if (rows.length === 1 || (this._single === 'maybe' && rows.length <= 1)) return { data: rows[0] ?? null, error: null };
                    return { data: null, error: { code: this._single === 'single' ? 'PGRST116' : 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
                };
                const match = () => db[table].filter(r => this._filters.every(f => f(r)));
                if (this._mode === 'select') {
                    let rows = match().map(r => ({ ...r }));
                    for (const [col, asc] of this._order.slice().reverse()) {
                        rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
                    }
                    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
                    return shape(rows);
                }
                if (this._mode === 'insert') {
                    const inserted = [];
                    for (const p of [].concat(this._payload)) {
                        const row = { id: `${table}-${++seq}`, owner: user.id, buddies: [], details: {}, ...p };
                        const error = violation(table, row);
                        if (error) { calls.push(['insert-failed', table, row, error.message]); return { data: null, error }; }
                        db[table].push(row);
                        calls.push(['insert', table, row]);
                        inserted.push({ ...row });
                    }
                    return shape(inserted);
                }
                if (this._mode === 'update') {
                    const rows = match();
                    const patched = [];
                    for (const r of rows) {
                        const next = { ...r, ...this._payload };
                        const error = violation(table, next, r.id);
                        if (error) return { data: null, error };
                        Object.assign(r, this._payload);
                        patched.push({ ...r });
                    }
                    calls.push(['update', table, this._payload]);
                    return shape(patched);
                }
                const gone = match();
                db[table] = db[table].filter(r => !gone.includes(r));
                if (table === 'log_entries') db.media = db.media.filter(m => !gone.some(g => g.id === m.entry_id));
                calls.push(['delete', table, gone.map(g => g.id)]);
                return { data: null, error: null };
            },
        };
        return q;
    }

    return {
        calls, files, db,
        auth: {
            async getUser() { return { data: { user }, error: null }; },
            async getSession() { return { data: { session: user ? { user } : null }, error: null }; },
            async updateUser({ data }) { user.user_metadata = { ...user.user_metadata, ...data }; return { data: { user }, error: null }; },
        },
        from: builder,
        async rpc(name, args) {
            calls.push(['rpc', name, args]);
            return { data: name in rpcResults ? rpcResults[name] : [], error: rpcErrors[name] ?? null };
        },
        storage: {
            from(bucket) {
                return {
                    async upload(path, body, opts) { calls.push(['upload', bucket, path, opts]); files.set(`${bucket}/${path}`, body); return { data: { path }, error: null }; },
                    async list(prefix) {
                        const names = new Set();
                        for (const key of files.keys()) {
                            if (!key.startsWith(`${bucket}/${prefix}/`)) continue;
                            names.add(key.slice(bucket.length + prefix.length + 2).split('/')[0]);
                        }
                        return { data: [...names].map(name => ({ name, id: files.has(`${bucket}/${prefix}/${name}`) ? name : null })), error: null };
                    },
                    async remove(paths) { calls.push(['remove', bucket, paths]); paths.forEach(p => files.delete(`${bucket}/${p}`)); return { data: [], error: null }; },
                    async createSignedUrls(paths, seconds) {
                        calls.push(['sign', bucket, paths, seconds]);
                        return { data: paths.map(path => ({ path, signedUrl: `https://signed.example/${bucket}/${path}?t=1`, error: null })), error: null };
                    },
                };
            },
        },
    };
}


const wrap = opts => { const client = fakeCommunityClient(opts); return { client, calls: client.calls, db: client.db }; };
const profileSelects = calls => calls.filter(c => c[0] === 'select' && c[1] === 'profiles').length;

test('communityStatus is false when profiles is missing, and saves never send visibility', async () => {
    const { client, calls } = wrap({ failTables: ['profiles'] });
    const store = createSupabaseStore(client);
    assert.equal(await store.communityStatus(), false);
    await store.saveEntry({ log_number: 1, dive_date: '2026-10-01', visibility: 'private', share_location: true });
    const ins = calls.find(c => c[0] === 'insert' && c[1] === 'log_entries');
    assert.ok(!('visibility' in ins[2]) && !('share_location' in ins[2]));
});

test('communityStatus true when profiles exists, and visibility is sent', async () => {
    const { client, calls } = wrap();
    const store = createSupabaseStore(client);
    await store.saveEntry({ log_number: 1, dive_date: '2026-10-01', visibility: 'private' });
    const ins = calls.find(c => c[0] === 'insert' && c[1] === 'log_entries');
    assert.equal(ins[2].visibility, 'private');
});

test('communityStatus is cached (one probe)', async () => {
    const { client, calls } = wrap();
    const store = createSupabaseStore(client);
    assert.equal(await store.communityStatus(), true);
    assert.equal(await store.communityStatus(), true);
    assert.equal(profileSelects(calls), 1);
});

test('ensureProfile inserts a row named from Google metadata, never the email', async () => {
    const { client, db } = wrap({ user: { id: 'u1', email: 'me@example.com', user_metadata: { full_name: '  Jana Nováková ' } } });
    const store = createSupabaseStore(client);
    const p = await store.ensureProfile();
    assert.equal(p.display_name, 'Jana Nováková');
    assert.equal(db.profiles.length, 1);
    assert.ok(!JSON.stringify(db.profiles).includes('example.com'));
    assert.equal(await store.ensureProfile().then(x => x.id), 'u1');
    assert.equal(db.profiles.length, 1);
});

test('ensureProfile is null without community', async () => {
    const store = createSupabaseStore(fakeCommunityClient({ failTables: ['profiles'] }));
    assert.equal(await store.ensureProfile(), null);
    assert.equal(await store.defaultVisibility(), null);
});

test('nameFromMetadata: no metadata -> null; cut at 60', () => {
    assert.equal(nameFromMetadata({ email: 'a@b.c' }), null);
    assert.equal(nameFromMetadata({ user_metadata: { name: 'x'.repeat(80) } }).length, 60);
});

test('ensureEntries uses the profile default visibility', async () => {
    const record = {
        schemaVersion: 1,
        start: { local: '2026-09-27T12:01:01' },
        dives: [],
    };
    const { client, calls, db } = wrap({
        tables: {
            profiles: [{ id: 'u1', display_name: 'A', default_visibility: 'private' }],
            dives: [{ id: 'r1', owner: 'u1', dive_number: 1, start_local: '2026-09-27T12:01:01', record }],
        },
    });
    const store = createSupabaseStore(client);
    await store.ensureEntries();
    const ins = calls.filter(c => c[0] === 'insert' && c[1] === 'log_entries');
    assert.ok(ins.length >= 1, 'expected an inserted entry');
    assert.ok(ins.every(c => c[2].visibility === 'private'));
    assert.equal(db.log_entries.length, ins.length);
});

test('listCommunityEntries / getCommunityEntry / listCommunityMedia call the RPCs with exact args', async () => {
    const { client, calls } = wrap({ rpcResults: { community_entries: [{ id: 'e9' }] } });
    const store = createSupabaseStore(client);
    await store.listCommunityEntries();
    await store.listCommunityEntries({ owner: 'u2', limit: 5, offset: 10 });
    assert.deepEqual(await store.getCommunityEntry('e9'), { id: 'e9' });
    await store.listCommunityMedia('e9');
    await store.listMembers();
    await store.getMember('u2');
    const rpcs = calls.filter(c => c[0] === 'rpc').map(c => c.slice(1));
    assert.deepEqual(rpcs, [
        ['community_entries', { p_owner: null, p_id: null, p_limit: 30, p_offset: 0 }],
        ['community_entries', { p_owner: 'u2', p_id: null, p_limit: 5, p_offset: 10 }],
        ['community_entries', { p_owner: null, p_id: 'e9', p_limit: 1, p_offset: 0 }],
        ['community_media', { p_entry_id: 'e9' }],
        ['community_members', { p_id: null }],
        ['community_members', { p_id: 'u2' }],
    ]);
});

test('getCommunityEntry / getMember return null when nothing is visible', async () => {
    const store = createSupabaseStore(fakeCommunityClient());
    assert.equal(await store.getCommunityEntry('x'), null);
    assert.equal(await store.getMember('x'), null);
});

test('community recordings map to summary rows; a null recording throws', async () => {
    const { client } = wrap({ rpcResults: {
        community_recordings: [{ id: 'r1', device_serial: 'S', dive_number: 3, start_local: '2026-01-01T10:00:00', summary: { a: 1 } }],
        community_recording: null,
    } });
    const store = createSupabaseStore(client);
    const [row] = await store.communityRecordings('u2');
    assert.equal(row.deviceSerial, 'S');
    assert.equal(row.diveNumber, 3);
    await assert.rejects(store.loadCommunityRecording('r1'), /not available/);
});

test('saveProfile drops unknown keys and updates only the own row', async () => {
    const { client, calls, db } = wrap({ tables: { profiles: [{ id: 'u1' }, { id: 'u2' }] } });
    const store = createSupabaseStore(client);
    await store.saveProfile({ display_name: 'A', id: 'u2', owner: 'x' });
    const up = calls.find(c => c[0] === 'update' && c[1] === 'profiles');
    const allowed = ['display_name', 'avatar_preset', 'avatar_path', 'default_visibility', 'home_country', 'updated_at'];
    assert.ok(Object.keys(up[2]).every(k => allowed.includes(k)));
    assert.equal(db.profiles.find(p => p.id === 'u1').display_name, 'A');
    assert.equal(db.profiles.find(p => p.id === 'u2').display_name, undefined);
});

test('uploadAvatar stores in the own folder and removes the previous file', async () => {
    const { client, calls } = wrap({ tables: { profiles: [{ id: 'u1', avatar_path: 'u1/avatar-old.jpg' }] } });
    const store = createSupabaseStore(client);
    const p = await store.uploadAvatar(new Uint8Array([1]));
    const up = calls.find(c => c[0] === 'upload');
    assert.equal(up[1], 'avatars');
    assert.ok(up[2].startsWith('u1/avatar-'));
    assert.equal(up[3].contentType, 'image/jpeg');
    assert.equal(p.avatar_path, up[2]);
    assert.deepEqual(calls.find(c => c[0] === 'remove')[2], ['u1/avatar-old.jpg']);
    await store.removeAvatar();
    assert.deepEqual(calls.filter(c => c[0] === 'remove').pop()[2], [up[2]]);
});

test('avatarUrls signs once per path within the cache window', async () => {
    const { client, calls } = wrap();
    const store = createSupabaseStore(client);
    const a = await store.avatarUrls(['u1/a.jpg', 'u2/b.jpg']);
    assert.equal(a.size, 2);
    await store.avatarUrls(['u1/a.jpg']);
    assert.equal(calls.filter(c => c[0] === 'sign').length, 1);
    assert.equal(calls.find(c => c[0] === 'sign')[3], 3600);
});

test('a transient probe error is not cached; the next call probes again', async () => {
    const { client, calls } = wrap({ transient: 1 });
    const store = createSupabaseStore(client);
    const warn = console.warn; console.warn = () => {};
    try { assert.equal(await store.communityStatus(), false); } finally { console.warn = warn; }
    assert.equal(await store.communityStatus(), true);
    assert.equal(profileSelects(calls), 2);
});

test('saving with visibility during a transient probe error rejects and inserts nothing', async () => {
    const { client, calls } = wrap({ transient: 2 });
    const store = createSupabaseStore(client);
    const warn = console.warn; console.warn = () => {};
    try {
        await assert.rejects(store.saveEntry({ log_number: 1, dive_date: '2026-10-01', visibility: 'private' }), e => e.kind === 'unreachable');
    } finally { console.warn = warn; }
    assert.ok(!calls.some(c => c[0] === 'insert' && c[1] === 'log_entries'));
});

test('caches reset on sign-out and when the auth user changes', async () => {
    const listeners = [];
    const client = fakeCommunityClient({ tables: { profiles: [{ id: 'u1', display_name: 'A' }] } });
    client.auth.signOut = async () => ({ error: null });
    client.auth.onAuthStateChange = cb => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; };
    const store = createSupabaseStore(client);
    store.onAuthChange(() => {});
    await store.communityStatus();
    await store.getMyProfile();
    await store.signOut();
    await store.communityStatus();
    assert.equal(profileSelects(client.calls), 3, 'status re-probed + profile re-read after sign-out');
    const before = profileSelects(client.calls);
    listeners[0]('SIGNED_IN', { user: { id: 'u1' } });
    listeners[0]('SIGNED_IN', { user: { id: 'u2' } });
    await store.communityStatus();
    assert.equal(profileSelects(client.calls), before + 1);
});

test('uploadAvatar removes the new object when saving the profile fails', async () => {
    const { client, calls } = wrap({ tables: { profiles: [{ id: 'u1' }] } });
    const store = createSupabaseStore(client);
    await store.getMyProfile();
    client.db.profiles.length = 0; // update().single() now finds no row
    await assert.rejects(store.uploadAvatar(new Uint8Array([1])));
    const up = calls.find(c => c[0] === 'upload');
    assert.deepEqual(calls.find(c => c[0] === 'remove')[2], [up[2]]);
});

test('ensureProfile on a 23505 insert race returns the existing row', async () => {
    const { client, db } = wrap();
    const origFrom = client.from;
    let raced = false;
    client.from = table => {
        const b = origFrom(table);
        if (table === 'profiles') {
            const ins = b.insert.bind(b);
            b.insert = payload => {
                if (!raced) { raced = true; db.profiles.push({ id: 'u1', display_name: 'Other tab' }); }
                b._mode = 'insert-conflict';
                b._run = async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } });
                return b;
            };
        }
        return b;
    };
    const p = await createSupabaseStore(client).ensureProfile();
    assert.equal(p.display_name, 'Other tab');
});

test('nameFromMetadata never splits a surrogate pair at the 60 character cut', () => {
    const name = nameFromMetadata({ user_metadata: { name: 'x'.repeat(59) + '\u{1F600}tail' } });
    assert.equal(name, 'x'.repeat(59) + '\u{1F600}');
    assert.doesNotMatch(name, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test('a profile read that resolves after the cache reset is not cached', async () => {
    const client = fakeCommunityClient({ tables: { profiles: [{ id: 'u1', display_name: 'A' }] } });
    const store = createSupabaseStore(client);
    await store.communityStatus();
    let release;
    const gate = new Promise(r => { release = r; });
    const getUser = client.auth.getUser;
    client.auth.getUser = async () => { await gate; return getUser(); };
    const getSession = client.auth.getSession;
    client.auth.getSession = async () => { await gate; return getSession(); };
    const stale = store.ensureProfile();
    await new Promise(r => setTimeout(r, 5));
    store.resetCommunityCache();
    client.auth.getUser = getUser;
    client.auth.getSession = getSession;
    client.db.profiles[0].display_name = 'B';
    release();
    await stale;
    assert.equal((await store.getMyProfile()).display_name, 'B', 'A\'s profile was not cached');
});

test('deleteAllMyData empties the profile and removes avatar files when community is on', async () => {
    const { client, db, calls } = wrap({ tables: { profiles: [{ id: 'u1', display_name: 'Jana', avatar_preset: 'reef-03', avatar_path: 'u1/avatar-1.jpg', home_country: 'CZ' }] } });
    await client.storage.from('avatars').upload('u1/avatar-1.jpg', new Uint8Array(1));
    const steps = [];
    const report = await createSupabaseStore(client).deleteAllMyData({ onProgress: s => steps.push(s) });
    assert.deepEqual(report.failed, []);
    assert.ok(steps.includes('profile'));
    const p = db.profiles[0];
    assert.equal(p.display_name, null);
    assert.equal(p.avatar_preset, null);
    assert.equal(p.avatar_path, null);
    assert.equal(p.home_country, null);
    assert.ok(calls.some(c => c[0] === 'remove' && c[1] === 'avatars' && c[2].includes('u1/avatar-1.jpg')));
});

test('deleteAllMyData skips the profile step without the community backend', async () => {
    const { client } = wrap({ failTables: ['profiles'] });
    const steps = [];
    const report = await createSupabaseStore(client).deleteAllMyData({ onProgress: s => steps.push(s) });
    assert.deepEqual(report.failed, []);
    assert.ok(!steps.includes('profile'));
});


// ---- Log numbering: "dives before DecoTrail" offset and renumber by date ----

const recRow = (id, startLocal) => ({ id, dive_number: null, start_local: startLocal, logbook_dismissed: false, record: { id } });
const numbers = db => Object.fromEntries(db.log_entries.map(e => [e.id, e.log_number]));

test('offset: stored in the account metadata, sanitised, default 0', async () => {
    const { client } = wrap();
    const store = createSupabaseStore(client);
    assert.equal(await store.getLogOffset(), 0);
    assert.equal(await store.setLogOffset('28'), 28);
    assert.equal(await store.getLogOffset(), 28);
    assert.equal(await store.setLogOffset(-4), 0);
    assert.equal(await store.setLogOffset('abc'), 0);
});

test('nextLogNumber: past the offset when the log is below it, past the max otherwise', async () => {
    const { nextLogNumber, normalizeLogOffset } = await import('../js/logbook/entryModel.js');
    assert.equal(nextLogNumber([], 0), 1);
    assert.equal(nextLogNumber([], 28), 29);
    assert.equal(nextLogNumber([{ log_number: 3 }], 28), 29);
    assert.equal(nextLogNumber([{ log_number: 40 }], 28), 41);
    assert.equal(normalizeLogOffset(undefined), 0);
    assert.equal(normalizeLogOffset(2.9), 2);
});

test('renumber plan: date, entry time, then recording start; only changed entries listed', async () => {
    const { planRenumber } = await import('../js/logbook/entryModel.js');
    const entries = [
        { id: 'c', log_number: 1, dive_date: '2026-10-02', entry_time: null, recording_id: 'rc' },
        { id: 'b', log_number: 2, dive_date: '2026-10-01', entry_time: '14:00:00', recording_id: null },
        { id: 'a', log_number: 3, dive_date: '2026-10-01', entry_time: null, recording_id: 'ra' },
    ];
    const starts = new Map([['ra', '2026-10-01T09:00:00'], ['rc', '2026-10-02T08:00:00']]);
    const { all, changes } = planRenumber(entries, starts, 10);
    assert.deepEqual(all.map(c => [c.id, c.to]), [['a', 11], ['b', 12], ['c', 13]]);
    assert.equal(changes.length, 3);
    assert.deepEqual(planRenumber([{ id: 'x', log_number: 1, dive_date: '2026-01-01' }]).changes, []);
});

test('renumberByDate: two-phase under the unique (owner, log_number) constraint, own entries only', async () => {
    const tables = {
        dives: [recRow('r1', '2026-09-01T10:00:00'), recRow('r2', '2026-09-02T10:00:00')],
        log_entries: [
            { id: 'e2', owner: 'u1', log_number: 1, dive_date: '2026-09-02', entry_time: null, recording_id: 'r2' },
            { id: 'e1', owner: 'u1', log_number: 2, dive_date: '2026-09-01', entry_time: null, recording_id: 'r1' },
            { id: 'e0', owner: 'u1', log_number: 3, dive_date: '2026-08-15', entry_time: '09:00:00', recording_id: null },
            { id: 'other', owner: 'u2', log_number: 1, dive_date: '2026-01-01', entry_time: null, recording_id: null },
        ],
    };
    const { client, db, calls } = wrap({ tables });
    const store = createSupabaseStore(client);
    await store.setLogOffset(5);
    const plan = await store.planRenumber();
    assert.deepEqual(plan.changes.map(c => `${c.from}>${c.to}`), ['3>6', '2>7', '1>8']);
    assert.equal(await store.renumberByDate(), 3);
    assert.deepEqual(numbers(db), { e0: 6, e1: 7, e2: 8, other: 1 });
    const temps = calls.filter(c => c[0] === 'update' && c[1] === 'log_entries').map(c => c[2].log_number);
    assert.deepEqual(temps.slice(0, 3).every(n => n < 0), true, 'phase one uses negative temporaries');
    assert.equal(await store.renumberByDate(), 0, 'second run changes nothing');
});

test('renumberByDate: a failure restores the original numbers', async () => {
    const tables = {
        dives: [],
        log_entries: [
            { id: 'e2', owner: 'u1', log_number: 1, dive_date: '2026-09-02', entry_time: null, recording_id: null },
            { id: 'e1', owner: 'u1', log_number: 2, dive_date: '2026-09-01', entry_time: null, recording_id: null },
        ],
    };
    const { client, db } = wrap({ tables });
    const store = createSupabaseStore(client);
    // Make the final write of e1 (to number 1) fail once, after phase one has run.
    const origFrom = client.from;
    let armed = true;
    client.from = table => {
        const q = origFrom(table);
        const upd = q.update.bind(q);
        q.update = patch => {
            if (armed && table === 'log_entries' && patch.log_number === 1) { armed = false; return { eq: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }; }
            return upd(patch);
        };
        return q;
    };
    await assert.rejects(() => store.renumberByDate());
    assert.deepEqual(numbers(db), { e2: 1, e1: 2 });
});

test('ensureEntries numbers new imports after the offset', async () => {
    const tables = { dives: [recRow('r1', '2026-10-01T09:00:00')], log_entries: [] };
    const { client, db } = wrap({ tables, user: { id: 'u1', email: 'me@example.com', user_metadata: { log_offset: 28 } } });
    const store = createSupabaseStore(client);
    await store.ensureEntries();
    assert.equal(db.log_entries.length, 1);
    assert.equal(db.log_entries[0].log_number, 29);
});
