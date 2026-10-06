# Dive Log Backend v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log in with an email link, upload a `DIVELOG` folder to Supabase once, and have the dive log page load stored dives afterwards, with an export of everything.

**Architecture:** Pure sync logic in `js/backend/sync.js`; a Supabase adapter `js/backend/supabaseStore.js` behind a small `DiveStore` interface obtained from `js/backend/diveStore.js`; the existing page component gains login, upload, export and server-backed loading. The database is one table plus one private bucket, created by a SQL migration the user runs.

**Tech Stack:** Vanilla ES modules; `@supabase/supabase-js@2.117.2` (jsDelivr UMD, global `supabase`); JSZip 3.10.2 (cdnjs, loaded on demand); Node 26 `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-06-dive-log-backend-v1-design.md`

## Global Constraints

- No build step, no npm runtime dependencies. Browser libraries come from CDN `<script>` tags with pinned versions.
- `js/backend/sync.js` and `js/backend/supabaseStore.js` are free of DOM and `node:` imports; the Supabase client is always injected (tests pass a fake).
- No secrets in the repository: `js/backend/config.js` holds only the project URL and the public anon key, and ships **empty** (`''`). Never write a service role key anywhere.
- With an empty config the dive log page must behave exactly as it does today.
- Uniqueness key of a dive: device serial (`'unknown'` if absent) + dive number (`0` if absent) + `start.local`.
- Every row carries `owner` = the logged-in user's id.
- i18n: new strings under `diveLog.backend.*` in `locales/en.json`, `cs.json`, `es.json` (identical key sets). Static text via `data-i18n`, dynamic text via `translate()` and re-render on `languagechange`. Number–unit pairs use ` ` in JS, `fmtNum` for numbers, decimal comma in Czech.
- Code style: 4-space indent, single quotes, JSDoc on exports. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Repo page tests scan every HTML file on disk: never leave extra HTML files in the repo.
- `npm test` (currently `run-tests.mjs` 634/634 plus three node:test suites) must stay green.

## Review Focus

- **Picking the computer's root folder** (`INTERNAL/` with `SAVE/`, `DUMP/`, `SUMMARY.DSM`): only `.dlf` files enter the sync. Test in Task 3.
- **The same `DIVELOG` uploaded twice:** the second run reports everything as already stored and uploads nothing. Test in Task 1 (`planSync`) and Task 2 (adapter).
- **A file upload that fails mid-sync:** the rest continue; the report names the failed file; no row is written for it. Test in Task 2.
- **Backend paused or offline:** listing fails → the page shows the plain-language message and still works locally. Test in Task 3 (store error path) and smoke test.
- **Empty config / Supabase script blocked:** `getDiveStore()` returns `null` and the page is unchanged. Test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `js/import/divesoftDlf.js` (modify) | export `PARSER_VERSION = 1`; add `schema: 1` to RecordedDive |
| `js/backend/sync.js` (create) | `diveKey`, `sha256Hex`, `listSummary`, `planSync` |
| `js/backend/config.js` (create) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (empty) |
| `js/backend/supabaseStore.js` (create) | `createSupabaseStore(client)` implementing DiveStore |
| `js/backend/diveStore.js` (create) | `getDiveStore()` → DiveStore or null |
| `supabase/migrations/0001_dive_log.sql` (create) | table, RLS, bucket, storage policy |
| `supabase/README.md` (create) | the user's one-time setup steps |
| `js/components/RecordedDiveAnalysis.js` (modify) | `loadDiveFiles` items; login/upload/export UI; server mode |
| `lab/dive-log.html` (modify) | supabase-js `<script>`; pass the store |
| `locales/*.json` (modify) | `diveLog.backend.*` |
| `sw.js` (modify) | add `js/backend/*.js` and `js/import/diveChain.js` to `STATIC_ASSETS` |
| `tests/dive-log-backend.test.mjs` (create) | tests for Tasks 1–3 |
| `package.json` (modify) | add the new suite to `npm test` |

Spec deviation (deliberate): `exportAll()` returns `{ files: [{ name, bytes }], dives: RecordedDive[] }` and the **page** builds the zip with JSZip, so the adapter stays DOM- and script-loader-free.

---

### Task 1: Versions and pure sync logic

**Files:** Modify `js/import/divesoftDlf.js`; create `js/backend/sync.js`, `tests/dive-log-backend.test.mjs`; modify `package.json`.

**Interfaces — Produces:**
- `export const PARSER_VERSION = 1` (divesoftDlf.js); every parsed dive has `schema: 1` as its first property.
- `export function diveKey(dive): string`
- `export async function sha256Hex(bytes: Uint8Array): Promise<string>`
- `export function listSummary(dive): { maxDepth, duration, mode, gfLow, gfHigh, waterSetting, warnings }`
- `export function planSync(local: Array<{dive, bytes, sha256}>, existing: Array<{deviceSerial, diveNumber, startLocal, fileSha256}>): { upload: Item[], update: Item[], unchanged: Item[] }`

- [ ] **Step 1: Failing tests.** Create `tests/dive-log-backend.test.mjs`:

```js
/**
 * Dive log backend tests (sync logic, Supabase adapter with a fake client, store factory).
 * Run: node --test tests/dive-log-backend.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF, PARSER_VERSION } from '../js/import/divesoftDlf.js';
import { diveKey, sha256Hex, listSummary, planSync } from '../js/backend/sync.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);
const bytesOf = id => new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES)));
const diveOf = id => parseDivesoftDLF(bytesOf(id), { fileName: `${id}.DLF` });

async function item(id) {
    const bytes = bytesOf(id);
    return { dive: diveOf(id), bytes, sha256: await sha256Hex(bytes) };
}

function row(it) {
    return { deviceSerial: it.dive.device.serial, diveNumber: it.dive.source.diveNumber, startLocal: it.dive.start.local, fileSha256: it.sha256 };
}

describe('versions', () => {
    test('parser and record schema versions', () => {
        assert.equal(PARSER_VERSION, 1);
        assert.equal(diveOf('00000100').schema, 1);
    });
});

describe('diveKey', () => {
    test('serial, number and device start time', () => {
        assert.equal(diveKey(diveOf('00000100')), '7044-00006107|100|2026-09-27T12:01:01');
    });

    test('a clock-reset dive keeps a stable key', () => {
        assert.equal(diveKey(diveOf('00000099')), diveKey(diveOf('00000099')));
        assert.ok(diveKey(diveOf('00000099')).includes('|99|2006-'));
    });

    test('falls back for missing serial and number', () => {
        const d = diveOf('00000100');
        const bare = { ...d, device: { ...d.device, serial: null }, source: { ...d.source, diveNumber: null } };
        assert.equal(diveKey(bare), 'unknown|0|2026-09-27T12:01:01');
    });
});

describe('sha256Hex', () => {
    test('known vector', async () => {
        assert.equal(await sha256Hex(new TextEncoder().encode('abc')),
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});

describe('listSummary', () => {
    test('carries what the dive list shows', () => {
        assert.deepEqual(listSummary(diveOf('00000100')), {
            maxDepth: 38.56, duration: 3109, mode: 'oc', gfLow: 60, gfHigh: 90,
            waterSetting: 'salt', warnings: ['duplicate-seconds:1'],
        });
    });
});

describe('planSync', () => {
    test('an empty server uploads everything', async () => {
        const local = [await item('00000100'), await item('00000101')];
        const plan = planSync(local, []);
        assert.equal(plan.upload.length, 2);
        assert.equal(plan.update.length, 0);
        assert.equal(plan.unchanged.length, 0);
    });

    test('the same folder twice uploads nothing', async () => {
        const local = [await item('00000100'), await item('00000101')];
        const plan = planSync(local, local.map(row));
        assert.equal(plan.upload.length, 0);
        assert.equal(plan.unchanged.length, 2);
    });

    test('a changed file is an update', async () => {
        const local = [await item('00000100')];
        const stored = { ...row(local[0]), fileSha256: 'different' };
        const plan = planSync(local, [stored]);
        assert.deepEqual(plan.update, local);
        assert.equal(plan.upload.length, 0);
    });

    test('duplicate local keys keep the first', async () => {
        const a = await item('00000100');
        const b = { ...a };
        const plan = planSync([a, b], []);
        assert.deepEqual(plan.upload, [a]);
        assert.deepEqual(plan.unchanged, [b]);
    });
});
```

- [ ] **Step 2:** Run `node --test tests/dive-log-backend.test.mjs` → FAIL (`ERR_MODULE_NOT_FOUND` for `js/backend/sync.js`).

- [ ] **Step 3: Implement.**

In `js/import/divesoftDlf.js`: add near the other constants

```js
/** Version of this parser's output; stored with each saved dive so it can be re-parsed later. */
export const PARSER_VERSION = 1;

/** Version of the RecordedDive shape. */
const RECORD_SCHEMA = 1;
```

and make `schema: RECORD_SCHEMA,` the first property of the returned object (before `source`).

Create `js/backend/sync.js`:

```js
/**
 * Pure sync decisions for the dive log backend: how dives are recognised,
 * what the dive list needs, and what an upload must do.
 */

/**
 * Identity of a recorded dive across uploads: device serial + dive number + device start time.
 * @param {Object} dive - RecordedDive
 * @returns {string}
 */
export function diveKey(dive) {
    return `${dive.device?.serial ?? 'unknown'}|${dive.source?.diveNumber ?? 0}|${dive.start.local}`;
}

/**
 * SHA-256 of a byte array as lowercase hex (Web Crypto; works in browsers and Node).
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The small part of a dive the dive list shows.
 * @param {Object} dive - RecordedDive
 */
export function listSummary(dive) {
    return {
        maxDepth: dive.maxDepth,
        duration: dive.duration,
        mode: dive.mode,
        gfLow: dive.deco?.gfLow ?? null,
        gfHigh: dive.deco?.gfHigh ?? null,
        waterSetting: dive.environment?.waterSetting ?? null,
        warnings: dive.warnings,
    };
}

/**
 * Decide what an upload has to do.
 * @param {Array<{dive: Object, bytes: Uint8Array, sha256: string}>} local - Parsed files from the picked folder
 * @param {Array<{deviceSerial: string, diveNumber: number, startLocal: string, fileSha256: string}>} existing - Rows already stored
 * @returns {{upload: Array, update: Array, unchanged: Array}}
 */
export function planSync(local, existing) {
    const stored = new Map(existing.map(r => [`${r.deviceSerial}|${r.diveNumber}|${r.startLocal}`, r.fileSha256]));
    const seen = new Set();
    const plan = { upload: [], update: [], unchanged: [] };
    for (const it of local) {
        const key = diveKey(it.dive);
        if (seen.has(key)) {
            plan.unchanged.push(it);
            continue;
        }
        seen.add(key);
        if (!stored.has(key)) plan.upload.push(it);
        else if (stored.get(key) !== it.sha256) plan.update.push(it);
        else plan.unchanged.push(it);
    }
    return plan;
}
```

- [ ] **Step 4:** `node --test tests/dive-log-backend.test.mjs` → PASS. Add the suite to `package.json`'s `test` script (append ` tests/dive-log-backend.test.mjs`). `npm test` → green (the divesoft-dlf suite compares whole objects in places; if an assertion there fails only because of the new `schema` property, extend that test's expected object with `schema: 1` — do not remove the property).

- [ ] **Step 5:** Commit `feat(backend): parser/record versions and pure sync decisions`.

---

### Task 2: Supabase adapter, store factory, migration

**Files:** Create `js/backend/config.js`, `js/backend/supabaseStore.js`, `js/backend/diveStore.js`, `supabase/migrations/0001_dive_log.sql`, `supabase/README.md`; modify `tests/dive-log-backend.test.mjs`.

**Interfaces:**
- Consumes: Task 1 exports; `parseDivesoftDLF`, `PARSER_VERSION`.
- Produces:
  - `export function createSupabaseStore(client): DiveStore` with
    `currentUser() → Promise<{id, email}|null>`, `sendLoginLink(email, redirectTo)`, `signOut()`, `onAuthChange(fn) → unsubscribe`,
    `listDives() → Promise<DiveSummaryRow[]>` (`{ id, deviceSerial, diveNumber, startLocal, fileSha256, parserVersion, summary }`, ordered by `start_local`),
    `loadDive(id) → Promise<RecordedDive>`,
    `saveDives(items, onProgress?) → Promise<{ saved, updated, failed: [{fileName, message}] }>` where `items = [{ dive, bytes, sha256, action: 'upload'|'update' }]`,
    `reparseOutdated(rows) → Promise<number>` (re-parses rows with `parserVersion < PARSER_VERSION`, returns how many were updated),
    `exportAll() → Promise<{ files: [{ name, bytes }], dives: RecordedDive[] }>`.
  - `export class DiveStoreError extends Error` with `kind: 'unreachable'|'auth'|'storage'|'unknown'`.
  - `export function getDiveStore(): DiveStore|null` (diveStore.js) — `null` when `SUPABASE_URL`/`SUPABASE_ANON_KEY` are empty or `globalThis.supabase?.createClient` is missing; otherwise a cached `createSupabaseStore(globalThis.supabase.createClient(url, key))`.
  - `BUCKET = 'dive-logs'`, `TABLE = 'dives'`, file path `${userId}/${serial}/${fileName}`.

- [ ] **Step 1: Failing tests.** Append to `tests/dive-log-backend.test.mjs` (add imports `createSupabaseStore, DiveStoreError` from `../js/backend/supabaseStore.js` and `getDiveStore` from `../js/backend/diveStore.js`). Build a fake client that records calls:

```js
function fakeClient({ user = { id: 'u1', email: 'me@example.com' }, rows = [], failUpload = new Set(), listError = null } = {}) {
    const calls = [];
    const files = new Map();
    const table = rows.slice();
    const query = (name) => {
        const q = {
            _filters: [], _select: '*',
            select(cols) { this._select = cols; return this; },
            order() { return this; },
            eq(col, val) { this._filters.push([col, val]); return this; },
            single() { this._single = true; return this; },
            async then(resolve) {
                if (listError) return resolve({ data: null, error: listError });
                let data = table.filter(r => this._filters.every(([c, v]) => r[c] === v));
                return resolve({ data: this._single ? data[0] ?? null : data, error: null });
            },
            upsert(row, opts) {
                calls.push(['upsert', name, row, opts]);
                const i = table.findIndex(r => r.owner === row.owner && r.device_serial === row.device_serial && r.dive_number === row.dive_number && r.start_local === row.start_local);
                if (i >= 0) table[i] = { ...table[i], ...row }; else table.push({ id: `id${table.length + 1}`, ...row });
                return Promise.resolve({ data: null, error: null });
            },
            update(patch) {
                const self = this;
                return { eq(col, val) { calls.push(['update', name, patch, val]); const r = table.find(x => x[col] === val); Object.assign(r, patch); return Promise.resolve({ error: null }); } };
            },
        };
        return q;
    };
    return {
        calls, files, table,
        auth: {
            async getUser() { return { data: { user }, error: null }; },
            async signInWithOtp(args) { calls.push(['otp', args]); return { error: null }; },
            async signOut() { calls.push(['signOut']); return { error: null }; },
            onAuthStateChange(fn) { calls.push(['listen']); return { data: { subscription: { unsubscribe() { calls.push(['unlisten']); } } } }; },
        },
        from: query,
        storage: {
            from(bucket) {
                return {
                    async upload(path, body, opts) {
                        calls.push(['upload', bucket, path, opts]);
                        if ([...failUpload].some(f => path.endsWith(f))) return { data: null, error: { message: 'boom' } };
                        files.set(path, body); return { data: { path }, error: null };
                    },
                    async download(path) { return files.has(path) ? { data: new Blob([files.get(path)]), error: null } : { data: null, error: { message: 'missing' } }; },
                };
            },
        },
    };
}

describe('createSupabaseStore', () => {
    test('saveDives uploads the original file, then upserts the row on the dive key', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        const it = await item('00000100');
        const report = await store.saveDives([{ ...it, action: 'upload' }]);
        assert.deepEqual(report, { saved: 1, updated: 0, failed: [] });
        const [up, ups] = client.calls.filter(c => c[0] === 'upload' || c[0] === 'upsert');
        assert.equal(up[0], 'upload');
        assert.equal(up[2], 'u1/7044-00006107/00000100.DLF');
        assert.equal(up[3].upsert, true);
        assert.equal(ups[0], 'upsert');
        assert.equal(ups[3].onConflict, 'owner,device_serial,dive_number,start_local');
        const r = ups[2];
        assert.equal(r.owner, 'u1');
        assert.equal(r.device_serial, '7044-00006107');
        assert.equal(r.dive_number, 100);
        assert.equal(r.start_local, '2026-09-27T12:01:01');
        assert.equal(r.file_path, 'u1/7044-00006107/00000100.DLF');
        assert.equal(r.file_sha256, it.sha256);
        assert.equal(r.parser_version, 1);
        assert.deepEqual(r.summary, listSummary(it.dive));
        assert.equal(r.record.schema, 1);
    });

    test('a failed upload is reported and the rest continue', async () => {
        const client = fakeClient({ failUpload: new Set(['00000100.DLF']) });
        const store = createSupabaseStore(client);
        const items = [{ ...(await item('00000100')), action: 'upload' }, { ...(await item('00000101')), action: 'update' }];
        const report = await store.saveDives(items);
        assert.equal(report.saved, 0);
        assert.equal(report.updated, 1);
        assert.deepEqual(report.failed.map(f => f.fileName), ['00000100.DLF']);
        assert.equal(client.calls.filter(c => c[0] === 'upsert').length, 1);
    });

    test('listDives maps rows to summaries and loadDive returns the record', async () => {
        const it = await item('00000100');
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.saveDives([{ ...it, action: 'upload' }]);
        const [rowOut] = await store.listDives();
        assert.deepEqual(Object.keys(rowOut).sort(), ['deviceSerial', 'diveNumber', 'fileSha256', 'id', 'parserVersion', 'startLocal', 'summary']);
        assert.equal(rowOut.diveNumber, 100);
        const full = await store.loadDive(rowOut.id);
        assert.equal(full.maxDepth, 38.56);
        assert.equal(full.samples.length, it.dive.samples.length);
    });

    test('rows from an older parser are re-parsed from the stored file', async () => {
        const it = await item('00000100');
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.saveDives([{ ...it, action: 'upload' }]);
        client.table[0].parser_version = 0;
        client.table[0].record = { schema: 0 };
        const rows = await store.listDives();
        assert.equal(await store.reparseOutdated(rows), 1);
        assert.equal(client.table[0].parser_version, 1);
        assert.equal(client.table[0].record.schema, 1);
    });

    test('an unreachable backend raises an unreachable error', async () => {
        const store = createSupabaseStore(fakeClient({ listError: { message: 'Failed to fetch' } }));
        await assert.rejects(() => store.listDives(), e => e instanceof DiveStoreError && e.kind === 'unreachable');
    });

    test('login link, current user and sign out', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.sendLoginLink('me@example.com', 'https://decotheory.eu/lab/dive-log.html');
        assert.deepEqual(client.calls.find(c => c[0] === 'otp')[1], {
            email: 'me@example.com', options: { emailRedirectTo: 'https://decotheory.eu/lab/dive-log.html' },
        });
        assert.deepEqual(await store.currentUser(), { id: 'u1', email: 'me@example.com' });
        await store.signOut();
        assert.ok(client.calls.some(c => c[0] === 'signOut'));
    });

    test('exportAll returns the original files and all records', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.saveDives([{ ...(await item('00000100')), action: 'upload' }]);
        const out = await store.exportAll();
        assert.deepEqual(out.files.map(f => f.name), ['00000100.DLF']);
        assert.equal(out.files[0].bytes.length, bytesOf('00000100').length);
        assert.equal(out.dives.length, 1);
    });
});

describe('getDiveStore', () => {
    test('no store while the config is empty', () => {
        assert.equal(getDiveStore(), null);
    });
});
```

- [ ] **Step 2:** Run → FAIL (module not found).

- [ ] **Step 3: Implement.**

`js/backend/config.js`:

```js
/**
 * Dive log backend configuration. Fill in after creating the Supabase project
 * (see supabase/README.md). The anon key is public by design; security comes
 * from the database rules. Never put the service role key here.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
```

`js/backend/supabaseStore.js`:

```js
/**
 * Supabase implementation of the dive log store (see the DiveStore typedef in
 * docs/superpowers/specs/2026-10-06-dive-log-backend-v1-design.md).
 * The Supabase client is injected; this module never touches the DOM.
 */

import { parseDivesoftDLF, PARSER_VERSION } from '../import/divesoftDlf.js';
import { listSummary } from './sync.js';

export const BUCKET = 'dive-logs';
export const TABLE = 'dives';
const CONFLICT_KEY = 'owner,device_serial,dive_number,start_local';
const LIST_COLUMNS = 'id, device_serial, dive_number, start_local, file_sha256, parser_version, summary, file_path';

/** A store failure the page can explain in plain words. */
export class DiveStoreError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = 'DiveStoreError';
        this.kind = kind;
    }
}

function fail(error, fallbackKind = 'unknown') {
    const message = error?.message ?? String(error);
    const kind = /fetch|network|timeout|503|502|504/i.test(message) ? 'unreachable'
        : /jwt|auth|session|401|403/i.test(message) ? 'auth' : fallbackKind;
    return new DiveStoreError(kind, message);
}

function toSummaryRow(r) {
    return {
        id: r.id, deviceSerial: r.device_serial, diveNumber: r.dive_number, startLocal: r.start_local,
        fileSha256: r.file_sha256, parserVersion: r.parser_version, summary: r.summary,
    };
}

/**
 * @param {Object} client - A Supabase client (supabase.createClient(url, anonKey))
 * @returns {Object} DiveStore
 */
export function createSupabaseStore(client) {
    async function requireUser() {
        const { data, error } = await client.auth.getUser();
        if (error || !data?.user) throw new DiveStoreError('auth', error?.message ?? 'Not logged in');
        return data.user;
    }

    async function readFile(path) {
        const { data, error } = await client.storage.from(BUCKET).download(path);
        if (error) throw fail(error, 'storage');
        return new Uint8Array(await data.arrayBuffer());
    }

    return {
        async currentUser() {
            const { data } = await client.auth.getUser();
            return data?.user ? { id: data.user.id, email: data.user.email } : null;
        },

        async sendLoginLink(email, redirectTo) {
            const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
            if (error) throw fail(error, 'auth');
        },

        async signOut() {
            const { error } = await client.auth.signOut();
            if (error) throw fail(error);
        },

        onAuthChange(listener) {
            const { data } = client.auth.onAuthStateChange((_event, session) => {
                listener(session?.user ? { id: session.user.id, email: session.user.email } : null);
            });
            return () => data.subscription.unsubscribe();
        },

        async listDives() {
            const { data, error } = await client.from(TABLE).select(LIST_COLUMNS).order('start_local');
            if (error) throw fail(error);
            return data.map(toSummaryRow);
        },

        async loadDive(id) {
            const { data, error } = await client.from(TABLE).select('record').eq('id', id).single();
            if (error) throw fail(error);
            return data.record;
        },

        async saveDives(items, onProgress = () => {}) {
            const user = await requireUser();
            const report = { saved: 0, updated: 0, failed: [] };
            let done = 0;
            for (const it of items) {
                const fileName = it.dive.source.fileName ?? `${it.dive.source.diveNumber ?? 'dive'}.DLF`;
                const serial = it.dive.device?.serial ?? 'unknown';
                const path = `${user.id}/${serial}/${fileName}`;
                const upload = await client.storage.from(BUCKET).upload(path, it.bytes, {
                    upsert: true, contentType: 'application/octet-stream',
                });
                if (upload.error) {
                    report.failed.push({ fileName, message: upload.error.message });
                } else {
                    const { error } = await client.from(TABLE).upsert({
                        owner: user.id,
                        device_serial: serial,
                        dive_number: it.dive.source.diveNumber ?? 0,
                        start_local: it.dive.start.local,
                        file_path: path,
                        file_sha256: it.sha256,
                        parser_version: PARSER_VERSION,
                        summary: listSummary(it.dive),
                        record: it.dive,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: CONFLICT_KEY });
                    if (error) report.failed.push({ fileName, message: error.message });
                    else if (it.action === 'update') report.updated++;
                    else report.saved++;
                }
                onProgress(++done, items.length);
            }
            return report;
        },

        async reparseOutdated(rows) {
            let count = 0;
            for (const row of rows.filter(r => r.parserVersion < PARSER_VERSION)) {
                const { data, error } = await client.from(TABLE).select('file_path').eq('id', row.id).single();
                if (error) throw fail(error);
                const name = data.file_path.split('/').pop();
                const dive = parseDivesoftDLF(await readFile(data.file_path), { fileName: name });
                const update = await client.from(TABLE).update({
                    record: dive, summary: listSummary(dive), parser_version: PARSER_VERSION, updated_at: new Date().toISOString(),
                }).eq('id', row.id);
                if (update.error) throw fail(update.error);
                count++;
            }
            return count;
        },

        async exportAll() {
            const { data, error } = await client.from(TABLE).select('file_path, record').order('start_local');
            if (error) throw fail(error);
            const files = [];
            for (const r of data) files.push({ name: r.file_path.split('/').pop(), bytes: await readFile(r.file_path) });
            return { files, dives: data.map(r => r.record) };
        },
    };
}
```

Note: the fake's `select(...).eq().single()` row lookup filters on table columns; `LIST_COLUMNS` includes `file_path` for convenience but `toSummaryRow` drops it. Adjust the fake (not the production code) if a test needs more query features.

`js/backend/diveStore.js`:

```js
/**
 * The page's single entry point to the dive log backend. Returns null when no
 * backend is configured, so the page keeps working without one.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createSupabaseStore } from './supabaseStore.js';

let cached;

/** @returns {Object|null} DiveStore, or null when the backend is not configured */
export function getDiveStore() {
    if (cached !== undefined) return cached;
    const factory = globalThis.supabase?.createClient;
    cached = SUPABASE_URL && SUPABASE_ANON_KEY && typeof factory === 'function'
        ? createSupabaseStore(factory(SUPABASE_URL, SUPABASE_ANON_KEY))
        : null;
    return cached;
}
```

`supabase/migrations/0001_dive_log.sql`: exactly the SQL from the spec's "Database" section, preceded by a comment header naming the spec.

`supabase/README.md`: the user's one-time setup, click by click (Supabase → New project → region **Central EU (Frankfurt)** → SQL Editor → paste and run `0001_dive_log.sql` → Authentication → URL Configuration: Site URL and the localhost redirect → Project Settings → API: copy *Project URL* and *anon public* key into `js/backend/config.js` → log in once on the page → Authentication → Sign In / Providers → turn off *Allow new users to sign up*). State plainly: never copy the `service_role` key anywhere. Mention the 7-day pause and how to resume.

- [ ] **Step 4:** Run the suite → PASS; `npm test` green.

- [ ] **Step 5:** Commit `feat(backend): Supabase dive store, store factory and database migration`.

---

### Task 3: Page integration

**Files:** Modify `js/components/RecordedDiveAnalysis.js`, `lab/dive-log.html`, `locales/en.json`, `cs.json`, `es.json`, `sw.js`, `tests/dive-log-backend.test.mjs`.

**Interfaces:**
- Consumes: everything above; existing `startStateFor(target, dives)`, `CHAIN_MAX_GAP_MIN`.
- Produces:
  - `loadDiveFiles(files)` additionally returns `items: [{ dive, bytes, sha256 }]` aligned with `dives` (same order after sorting).
  - `export function summaryToListDive(row)` → a lightweight dive for the list: `{ id: row.id, source: { diveNumber, fileName: null }, start: { local: row.startLocal }, device: { serial: row.deviceSerial }, maxDepth, duration, mode, deco: { gfLow, gfHigh }, environment: { waterSetting }, warnings, samples: null }`.
  - `export function chainWindow(target, listDives)` → the list dives that started within `CHAIN_MAX_GAP_MIN` minutes before `target` (by `start.local`), excluding dives with `implausible-date`.
  - `RecordedDiveAnalysis` constructor accepts `{ demoFiles, store }` (store may be `null`).

- [ ] **Step 1: Failing tests** (append): `loadDiveFiles` returns `items` whose `sha256` equals `sha256Hex` of the bytes and whose `dive` objects are the same as `dives`; a root folder with `SUMMARY.DSM`, `SAVE/x.SSF` and two `.DLF` files yields 2 items; `summaryToListDive` produces the fields above and `canAnalyze` is false for it (samples null); `chainWindow` picks only dives within 7 days before and drops `implausible-date`.

- [ ] **Step 2–3: Implement.**
  - `loadDiveFiles`: keep the bytes (`new Uint8Array(await file.arrayBuffer())`), compute `sha256Hex`, push `{ dive, bytes, sha256 }`, and sort `items` with the same comparator as `dives`.
  - Component state: `this.store` (from config), `this.user`, `this.serverMode` (store and user present), `this.full = new Map()` (id → full RecordedDive).
  - **Account bar** (new section at the top of `_buildDom`, hidden when `store` is null): logged out → email input + "Send login link"; after sending → "Check your email…" + "Send again"; logged in → email, **Upload DIVELOG** (a `webkitdirectory` input styled as a button), **Export**, **Log out**. Use `store.onAuthChange` to switch states and reload.
  - **Server mode:** on login, `listDives()`; map rows with `summaryToListDive` into `this.dives`; call `reparseOutdated(rows)` in the background (errors only to console); render the list. `_select(dive)` loads the full record with `loadDive(dive.id)` if `dive.samples === null` (cache in `this.full`), and before `startStateFor` loads full records for `chainWindow(target, this.dives)`; pass `startStateFor(fullTarget, [...fullWindow, fullTarget])`. Show "Loading…" while fetching.
  - **Upload:** `loadDiveFiles(input.files)` → `listDives()` → `planSync(items, rows)` → `saveDives([...upload.map(i => ({...i, action:'upload'})), ...update.map(i => ({...i, action:'update'}))], progress)` → report in the status line using the report strings → reload the list. Unreadable files from `loadDiveFiles` are added to the report's failures.
  - **Export:** `exportAll()`; load JSZip on demand by appending `<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.2/jszip.min.js">` once; build `DIVELOG/<name>` entries plus `dives.json` (`JSON.stringify(dives, null, 1)`); trigger a download named `dive-log-YYYY-MM-DD.zip`.
  - **Errors:** catch `DiveStoreError`; `kind === 'unreachable'` → the unreachable message (page stays usable in local mode); login link errors in the URL hash (`error_code=otp_expired`) → the expired message with "Send a new link"; other errors → a generic message, details to `console.error`.
  - **Logged out / no store:** behave exactly as today (demo dives, local pickers).
  - `lab/dive-log.html`: add `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>` before the module scripts, import `getDiveStore` and pass `store: getDiveStore()` to the component. Add small `.rda-account` styles in the page `<style>` block.
  - `sw.js` `STATIC_ASSETS`: add `./js/backend/config.js`, `./js/backend/sync.js`, `./js/backend/supabaseStore.js`, `./js/backend/diveStore.js`, `./js/import/diveChain.js`. Do **not** bump `CACHE_NAME` (the controller does it at release).
  - Locales — add `diveLog.backend` with these keys (en / cs / es):

| key | en | cs | es |
|---|---|---|---|
| `loginHeading` | Your dive log | Váš deník ponorů | Tu diario de inmersiones |
| `emailLabel` | Email | E-mail | Correo electrónico |
| `sendLink` | Send login link | Poslat přihlašovací odkaz | Enviar enlace de acceso |
| `linkSent` | Check your email for the login link. | Přihlašovací odkaz najdete v e-mailu. | Revisa tu correo: te hemos enviado el enlace de acceso. |
| `sendAgain` | Send again | Poslat znovu | Enviar de nuevo |
| `loggedInAs` | Logged in as {0} | Přihlášen jako {0} | Sesión iniciada como {0} |
| `upload` | Upload DIVELOG | Nahrát DIVELOG | Subir DIVELOG |
| `export` | Export | Export | Exportar |
| `logout` | Log out | Odhlásit | Cerrar sesión |
| `loading` | Loading… | Načítám… | Cargando… |
| `progress` | Saving {0} / {1}… | Ukládám {0} / {1}… | Guardando {0} / {1}… |
| `reportSaved` | {0} new dives saved | Uloženo nových ponorů: {0} | {0} inmersiones nuevas guardadas |
| `reportUnchanged` | {0} already stored | Již uloženo: {0} | {0} ya guardadas |
| `reportUpdated` | {0} updated | Aktualizováno: {0} | {0} actualizadas |
| `reportFailed` | {0} could not be saved: {1} | Nepodařilo se uložit {0}: {1} | No se pudieron guardar {0}: {1} |
| `unreachable` | Can't reach your dive log. If it hasn't been used for a week, resume the project in the Supabase dashboard. | Deník ponorů není dostupný. Pokud se týden nepoužíval, obnovte projekt v administraci Supabase. | No se puede acceder a tu diario. Si no se ha usado en una semana, reanuda el proyecto en el panel de Supabase. |
| `linkExpired` | This login link has expired. Send a new one. | Platnost odkazu vypršela. Pošlete si nový. | Este enlace ha caducado. Solicita uno nuevo. |
| `cannotLogin` | This email can't log in here. | Tento e-mail se zde nemůže přihlásit. | Este correo no puede iniciar sesión aquí. |
| `genericError` | Something went wrong. Please try again. | Něco se pokazilo. Zkuste to prosím znovu. | Algo ha fallado. Inténtalo de nuevo. |

- [ ] **Step 4:** `node --test tests/dive-log-backend.test.mjs` and `npm test` → green. Browser check with an **empty** config (static server on a port other than 5517, stopped afterwards): the page looks and behaves exactly as before, no console errors. The logged-in flow is smoke-tested by the controller against the user's real project.

- [ ] **Step 5:** Commit `feat(lab): log in, upload and export in the dive log`.
