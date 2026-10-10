/**
 * Supabase implementation of the dive log store (see the DiveStore typedef in
 * docs/superpowers/specs/2026-10-06-dive-log-backend-v1-design.md).
 * The Supabase client is injected; this module never touches the DOM.
 */

import { parseDivesoftDLF, PARSER_VERSION } from '../import/divesoftDlf.js';
import { listSummary } from './sync.js';
import { createCommunityApi } from './communityStore.js';
import { visibilityAfterSharing } from '../logbook/share.js';
import { entryFromRecording, orderRecordingsForNumbering, computerFieldsFromRecording, normalizeLogOffset, planRenumber } from '../logbook/entryModel.js';

export const BUCKET = 'dive-logs';
export const TABLE = 'dives';
export const PHOTO_BUCKET = 'dive-photos';
const AVATAR_BUCKET = 'avatars';
const ENTRIES = 'log_entries';
const SITES = 'sites';
const MEDIA = 'media';
const PHOTO_URL_SECONDS = 3600;
const PAGE = 1000; // PostgREST returns at most this many rows per request
const CONFLICT_KEY = 'owner,device_serial,dive_number,start_local';
const MISSING_COLUMN = /^(42703|PGRST204|PGRST205|42P01)$/;
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

/** True for a Postgres unique violation on the named constraint (the name appears in message or details). */
function isUnique(error, constraint) {
    return error?.code === '23505' && `${error.message ?? ''} ${error.details ?? ''}`.includes(constraint);
}
const RECORDING_KEY = 'log_entries_recording_id_key';
const NUMBER_KEY = 'log_entries_owner_log_number_key';

function toSummaryRow(r) {
    return {
        id: r.id, deviceSerial: r.device_serial, diveNumber: r.dive_number, startLocal: r.start_local,
        fileSha256: r.file_sha256, parserVersion: r.parser_version, summary: r.summary,
    };
}

/** `2026-09-27T12:01:01` becomes `20260927120101` (part of the storage path, so each dive has its own file). */
function compactStart(local) {
    return String(local).replace(/[-:T]/g, '');
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

    // Migration 0006 (log_entries.description, sites.url): 'yes' | 'no' once known, never cached while unknown.
    let extrasState = null;

    /** 'yes' | 'no' (the columns are definitively absent) | 'unknown' (transient failure). */
    async function descriptionAvailability() {
        if (extrasState) return extrasState;
        let result = 'unknown';
        try {
            const { error, status } = await client.from(ENTRIES).select('description').limit(1);
            if (!error) result = 'yes';
            else if (MISSING_COLUMN.test(error.code ?? '') || (status === 400 && /column/i.test(error.message ?? ''))) {
                result = 'no';
                console.info('Dive description and site link unavailable', error.message ?? error);
            } else {
                console.warn('Description probe failed', error.message ?? error);
            }
        } catch (error) {
            console.warn('Description probe failed', error?.message ?? error);
        }
        if (result !== 'unknown') extrasState = result;
        return result;
    }

    /**
     * `row` without the 0006 columns `keys` when the database lacks them. Never guesses: with no answer the
     * save fails (silently dropping text the user typed is worse than a retry).
     */
    async function withoutMissingColumns(row, keys) {
        if (!keys.some(k => k in row)) return row;
        const availability = await descriptionAvailability();
        if (availability === 'unknown') throw new DiveStoreError('unreachable', 'Could not check the database version; nothing was saved');
        if (availability === 'yes') return row;
        const rest = { ...row };
        for (const k of keys) delete rest[k];
        return rest;
    }

    async function listMedia(entryId) {
        const { data, error } = await client.from(MEDIA).select('*').eq('entry_id', entryId).order('created_at');
        if (error) throw fail(error);
        return data;
    }

    const store = {
        async currentUser() {
            // getSession reads local storage (no network), so an unreachable backend is not mistaken for "logged out".
            const { data, error } = await client.auth.getSession();
            if (error) throw fail(error);
            const user = data?.session?.user;
            return user ? { id: user.id, email: user.email } : null;
        },

        async sendLoginLink(email, redirectTo) {
            const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
            if (error) throw fail(error, 'auth');
        },

        async signInWithGoogle(redirectTo) {
            const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
            if (error) throw fail(error, 'auth');
        },

        async signOut() {
            store.resetCommunityCache();
            const { error } = await client.auth.signOut();
            if (error) throw fail(error);
        },

        onAuthChange(listener) {
            let lastId;
            const { data } = client.auth.onAuthStateChange((_event, session) => {
                const id = session?.user?.id ?? null;
                if (lastId !== undefined && id !== lastId) store.resetCommunityCache();
                lastId = id;
                listener(session?.user ? { id: session.user.id, email: session.user.email } : null);
            });
            return () => data.subscription.unsubscribe();
        },

        async listDives() {
            const { data, error } = await client.from(TABLE).select(LIST_COLUMNS).order('dive_number').order('start_local');
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
                const path = `${user.id}/${serial}/${compactStart(it.dive.start.local)}_${fileName}`;
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
            const { data, error } = await client.from(TABLE).select('file_path, start_local, record')
                .order('dive_number').order('start_local');
            if (error) throw fail(error);
            const files = [];
            const used = new Set();
            for (const r of data) {
                let name = r.record?.source?.fileName ?? r.file_path.split('/').pop();
                if (used.has(name)) name = `${compactStart(r.start_local)}_${name}`;
                used.add(name);
                files.push({ name, bytes: await readFile(r.file_path) });
            }
            return { files, dives: data.map(r => r.record) };
        },

        // ---- Logbook (step 4c) ----

        descriptionAvailability,

        /** Whether dives have a description and sites a link (migration 0006). */
        async descriptionStatus() {
            return (await descriptionAvailability()) === 'yes';
        },

        async listEntries() {
            const { data, error } = await client.from(ENTRIES).select('*').order('log_number', { ascending: false });
            if (error) throw fail(error);
            return data;
        },

        async getEntry(id) {
            const { data, error } = await client.from(ENTRIES).select('*').eq('id', id).maybeSingle();
            if (error) throw fail(error);
            return data ?? null;
        },

        async saveEntry(input, id) {
            let row = await withoutMissingColumns(input, ['description']);
            if ('visibility' in input || 'share_location' in input) {
                // Never guess: stripping on a transient probe failure would save a private dive with the DB default.
                const availability = await store.communityAvailability();
                if (availability === 'unknown') throw new DiveStoreError('unreachable', 'Could not check community features; the entry was not saved');
                if (availability === 'no') {
                    const { visibility, share_location, ...rest } = row; // eslint-disable-line no-unused-vars
                    row = rest;
                }
            }
            const q = id
                ? client.from(ENTRIES).update({ ...row, updated_at: new Date().toISOString() }).eq('id', id)
                : client.from(ENTRIES).insert(row);
            const { data, error } = await q.select().single();
            if (error) {
                if (isUnique(error, NUMBER_KEY)) throw new DiveStoreError('duplicate-number', error.message);
                if (isUnique(error, RECORDING_KEY)) throw new DiveStoreError('recording-linked', error.message);
                throw fail(error);
            }
            if (row.recording_id) {
                // Logging a dismissed recording on purpose: it may be listed by ensureEntries again later.
                const { error: flagError } = await client.from(TABLE).update({ logbook_dismissed: false }).eq('id', row.recording_id);
                if (flagError) console.warn('Could not clear logbook_dismissed', flagError);
            }
            return data;
        },

        /**
         * Turn the public link of a dive on (visibility `link`; the database makes a new token) or off
         * (back to `before` when that was private/members, else members; the token is cleared at once).
         * @returns {Promise<Object>} the saved entry, with `share_token` when on
         */
        async setSharing(id, on, before = null) {
            return store.saveEntry({ visibility: on ? 'link' : visibilityAfterSharing(before) }, id);
        },

        async deleteEntry(id) {
            // Dismiss the recording BEFORE deleting the entry: if the dismissal fails nothing is lost and the
            // user can retry; the other order could leave an entry-less, undismissed recording that
            // ensureEntries would recreate on the next login.
            const found = await client.from(ENTRIES).select('recording_id').eq('id', id).maybeSingle();
            if (found.error) throw fail(found.error);
            const entry = found.data;
            if (entry?.recording_id) {
                const { error } = await client.from(TABLE).update({ logbook_dismissed: true }).eq('id', entry.recording_id);
                if (error) throw fail(error);
            }
            const media = await listMedia(id);
            const paths = media.filter(m => m.kind === 'photo' && m.path).map(m => m.path);
            if (paths.length) {
                const { error } = await client.storage.from(PHOTO_BUCKET).remove(paths);
                if (error) throw fail(error, 'storage');
            }
            const { error } = await client.from(ENTRIES).delete().eq('id', id);
            if (error) throw fail(error);
        },

        /**
         * Delete several entries one after another; a failure is recorded and the rest continue.
         * Per entry: deleteEntry first (dismisses the recording, removes photos, deletes the entry), and only
         * then, with `withRecordings`, the recording's file and row, so ensureEntries can never recreate it midway.
         * @param {string[]} ids
         * @param {{withRecordings?: boolean, onProgress?: (done: number, total: number) => void}} [options]
         * @returns {Promise<{deleted: number, failed: {id: string, message: string}[]}>}
         */
        async deleteEntries(ids, { withRecordings = false, onProgress } = {}) {
            const total = ids.length;
            const failed = [];
            let deleted = 0;
            onProgress?.(0, total);
            for (let i = 0; i < total; i++) {
                const id = ids[i];
                try {
                    let recordingId = null;
                    if (withRecordings) {
                        const found = await client.from(ENTRIES).select('recording_id').eq('id', id).maybeSingle();
                        if (found.error) throw fail(found.error);
                        recordingId = found.data?.recording_id ?? null;
                    }
                    await store.deleteEntry(id);
                    if (recordingId) {
                        const rec = await client.from(TABLE).select('file_path').eq('id', recordingId).maybeSingle();
                        if (rec.error) throw fail(rec.error);
                        if (rec.data?.file_path) {
                            const { error } = await client.storage.from(BUCKET).remove([rec.data.file_path]);
                            if (error && !/not.?found|404/i.test(`${error.message ?? ''} ${error.statusCode ?? ''}`)) throw fail(error, 'storage');
                        }
                        const gone = await client.from(TABLE).delete().eq('id', recordingId);
                        if (gone.error) throw fail(gone.error);
                    }
                    deleted++;
                } catch (error) {
                    failed.push({ id, message: error?.message ?? String(error) });
                }
                onProgress?.(i + 1, total);
            }
            return { deleted, failed };
        },

        /**
         * Delete everything the logged-in user owns: photo files and media rows, entries, sites, recording files
         * and rows. Every query is filtered by owner (shared rows of other members may be readable), a failing
         * step is recorded and the others still run. The login itself needs a server key and stays.
         * @param {{onProgress?: (step: 'photos'|'entries'|'sites'|'recordings') => void}} [options]
         * @returns {Promise<{entries: number, sites: number, recordings: number, photos: number, media: number,
         *   failed: {step: string, message: string}[]}>}
         */
        async deleteAllMyData({ onProgress } = {}) {
            const user = await requireUser();
            const report = { entries: 0, sites: 0, recordings: 0, photos: 0, media: 0, failed: [] };
            const CHUNK = 100;

            const idsOf = async (table, column = 'id', filters = []) => {
                const ids = [];
                for (let from = 0; ; from += PAGE) {
                    let q = client.from(table).select(`${column}`);
                    for (const [c, v] of filters) q = q.eq(c, v);
                    const { data, error } = await q.order('id').range(from, from + PAGE - 1);
                    if (error) throw fail(error);
                    ids.push(...data.map(r => r[column]));
                    if (data.length < PAGE) return ids;
                }
            };
            const deleteIn = async (table, column, values) => {
                let count = 0;
                for (let i = 0; i < values.length; i += CHUNK) {
                    const { data, error } = await client.from(table).delete().in(column, values.slice(i, i + CHUNK)).select('id');
                    if (error) throw fail(error);
                    count += data?.length ?? 0;
                }
                return count;
            };
            const removeFiles = async (bucket, paths) => {
                for (let i = 0; i < paths.length; i += CHUNK) {
                    const { error } = await client.storage.from(bucket).remove(paths.slice(i, i + CHUNK));
                    if (error && !/not.?found|404/i.test(`${error.message ?? ''} ${error.statusCode ?? ''}`)) throw fail(error, 'storage');
                }
            };
            /** Every file under the user's own folder, including ones no row points to any more. */
            const filesUnder = async (bucket, prefix) => {
                const out = [];
                const { data, error } = await client.storage.from(bucket).list(prefix, { limit: PAGE });
                if (error) throw fail(error, 'storage');
                for (const item of data ?? []) {
                    if (item.id) out.push(`${prefix}/${item.name}`);
                    else out.push(...await filesUnder(bucket, `${prefix}/${item.name}`));
                }
                return out;
            };
            const step = async (name, fn) => {
                onProgress?.(name);
                try { await fn(); } catch (error) { report.failed.push({ step: name, message: error?.message ?? String(error) }); }
            };

            const entryIds = [];
            await step('photos', async () => {
                const photoPaths = new Set();
                entryIds.push(...await idsOf(ENTRIES, 'id', [['owner', user.id]]));
                for (let i = 0; i < entryIds.length; i += CHUNK) {
                    const { data, error } = await client.from(MEDIA).select('*').in('entry_id', entryIds.slice(i, i + CHUNK));
                    if (error) throw fail(error);
                    const paths = data.filter(m => m.kind === 'photo' && m.path).map(m => m.path);
                    await removeFiles(PHOTO_BUCKET, paths);
                    paths.forEach(path => photoPaths.add(path));
                }
                const leftovers = await filesUnder(PHOTO_BUCKET, user.id);
                await removeFiles(PHOTO_BUCKET, leftovers);
                leftovers.forEach(path => photoPaths.add(path));
                report.photos = photoPaths.size;
                report.media = await deleteIn(MEDIA, 'entry_id', entryIds);
            });
            await step('entries', async () => { report.entries = await deleteIn(ENTRIES, 'id', entryIds); });
            await step('sites', async () => { report.sites = await deleteIn(SITES, 'id', await idsOf(SITES, 'id', [['owner', user.id]])); });
            await step('recordings', async () => {
                const rows = [];
                for (let from = 0; ; from += PAGE) {
                    const { data, error } = await client.from(TABLE).select('id, file_path').eq('owner', user.id).order('id').range(from, from + PAGE - 1);
                    if (error) throw fail(error);
                    rows.push(...data);
                    if (data.length < PAGE) break;
                }
                await removeFiles(BUCKET, [...new Set([...rows.map(r => r.file_path).filter(Boolean), ...await filesUnder(BUCKET, user.id)])]);
                report.recordings = await deleteIn(TABLE, 'id', rows.map(r => r.id));
            });
            // DecoTrail profile: the row itself goes with the account; here it is emptied and the avatar files removed.
            if (await store.communityAvailability?.() === 'yes') {
                await step('profile', async () => {
                    await removeFiles(AVATAR_BUCKET, await filesUnder(AVATAR_BUCKET, user.id));
                    const { error } = await client.from('profiles').update({
                        display_name: null, avatar_preset: null, avatar_path: null, home_country: null, updated_at: new Date().toISOString(),
                    }).eq('id', user.id);
                    if (error) throw fail(error);
                });
            }
            return report;
        },

        async listSites() {
            const { data, error } = await client.from(SITES).select('*').order('name');
            if (error) throw fail(error);
            return data;
        },

        async saveSite(input, id) {
            const row = await withoutMissingColumns(input, ['url']);
            const q = id
                ? client.from(SITES).update({ ...row, updated_at: new Date().toISOString() }).eq('id', id)
                : client.from(SITES).insert(row);
            const { data, error } = await q.select().single();
            if (error) throw fail(error);
            return data;
        },

        /** Map(siteId -> number of dives using it); sites without dives are absent. */
        async siteUsage() {
            const usage = new Map();
            for (let from = 0; ; from += PAGE) { // PostgREST returns at most 1000 rows per request
                const { data, error } = await client.from(ENTRIES).select('site_id').order('id').range(from, from + PAGE - 1);
                if (error) throw fail(error);
                for (const r of data) if (r.site_id) usage.set(r.site_id, (usage.get(r.site_id) ?? 0) + 1);
                if (data.length < PAGE) return usage;
            }
        },

        /** Move every dive of `fromId` to `intoId`, then delete `fromId`. Moving first means a failure never loses the link. */
        async mergeSite(fromId, intoId) {
            if (!fromId || !intoId || fromId === intoId) throw new DiveStoreError('unknown', 'Cannot merge a site into itself');
            const moved = await client.from(ENTRIES).update({ site_id: intoId }).eq('site_id', fromId);
            if (moved.error) throw fail(moved.error);
            const { error } = await client.from(SITES).delete().eq('id', fromId);
            if (error) throw fail(error);
        },

        async deleteSite(id) {
            // Check on the server: the page's count may be stale, and deleting would unlink those dives.
            const used = await client.from(ENTRIES).select('id').eq('site_id', id).range(0, 0);
            if (used.error) throw fail(used.error);
            if (used.data.length) throw new DiveStoreError('site-in-use', 'Dives still use this site');
            const { error } = await client.from(SITES).delete().eq('id', id);
            if (error) throw fail(error);
        },

        async listBuddies() {
            const { data, error } = await client.from(ENTRIES).select('buddies');
            if (error) throw fail(error);
            const groups = new Map(); // normalised key -> { total, spellings: Map(spelling -> count) }
            for (const r of data) {
                for (const raw of r.buddies ?? []) {
                    const name = String(raw).trim().replace(/\s+/g, ' ');
                    if (!name) continue;
                    const key = name.toLocaleLowerCase();
                    const g = groups.get(key) ?? { total: 0, spellings: new Map() };
                    g.total++;
                    g.spellings.set(name, (g.spellings.get(name) ?? 0) + 1);
                    groups.set(key, g);
                }
            }
            const best = g => [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
            return [...groups.values()].map(g => ({ total: g.total, name: best(g) }))
                .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
                .map(g => g.name);
        },

        // ---- Log numbering ----

        /** "Dives logged before DecoTrail": new entries are numbered after it. Kept in the account metadata (no schema needed). */
        async getLogOffset() {
            return normalizeLogOffset((await requireUser()).user_metadata?.log_offset);
        },

        async setLogOffset(value) {
            const offset = normalizeLogOffset(value);
            const { error } = await client.auth.updateUser({ data: { log_offset: offset } });
            if (error) throw fail(error, 'auth');
            return offset;
        },

        /** What "renumber by date" would do for the signed-in user's own entries: { all, changes, offset }. */
        async planRenumber() {
            const user = await requireUser();
            const offset = normalizeLogOffset(user.user_metadata?.log_offset);
            const { data, error } = await client.from(ENTRIES).select('*').eq('owner', user.id);
            if (error) throw fail(error);
            const recordingIds = data.map(e => e.recording_id).filter(Boolean);
            const starts = new Map();
            if (recordingIds.length) {
                const recs = await client.from(TABLE).select('id, start_local').in('id', recordingIds);
                if (recs.error) throw fail(recs.error);
                for (const r of recs.data) starts.set(r.id, r.start_local);
            }
            return { ...planRenumber(data, starts, offset), offset };
        },

        /**
         * Renumber the user's own entries chronologically after the offset. Two phases because
         * (owner, log_number) is unique: changed entries first move to negative temporary numbers, then to
         * their final ones. On failure the original numbers are restored (best effort).
         * @returns {Promise<number>} how many entries changed
         */
        async renumberByDate() {
            const { changes } = await store.planRenumber();
            const set = (id, log_number) => client.from(ENTRIES).update({ log_number }).eq('id', id);
            const run = async (c, number) => { const { error } = await set(c.id, number); if (error) throw error; };
            try {
                for (const [i, c] of changes.entries()) await run(c, -(i + 1));
                for (const c of changes) await run(c, c.to);
            } catch (error) {
                // Park everything that moved on temporaries again, then put the originals back.
                for (const [i, c] of changes.entries()) await set(c.id, -(i + 1));
                for (const c of changes) await set(c.id, c.from);
                throw fail(error);
            }
            return changes.length;
        },

        async ensureEntries() {
            const user = await requireUser();
            const recs = await client.from(TABLE).select('id, dive_number, start_local, logbook_dismissed');
            if (recs.error) throw fail(recs.error);
            const linked = await client.from(ENTRIES).select('recording_id, log_number');
            if (linked.error) throw fail(linked.error);
            const have = new Set(linked.data.map(e => e.recording_id).filter(Boolean));
            const missing = recs.data.filter(r => !have.has(r.id) && !r.logbook_dismissed);
            if (!missing.length) return 0;
            const full = await client.from(TABLE).select('id, record').in('id', missing.map(r => r.id));
            if (full.error) throw fail(full.error);
            const recordOf = new Map(full.data.map(r => [r.id, r.record]));
            const ordered = orderRecordingsForNumbering(missing.map(r => ({ id: r.id, diveNumber: r.dive_number, startLocal: r.start_local })));

            const offset = normalizeLogOffset(user.user_metadata?.log_offset);
            const freshNext = async () => {
                const { data, error } = await client.from(ENTRIES).select('log_number');
                if (error) throw fail(error);
                return data.reduce((m, e) => Math.max(m, e.log_number ?? 0), offset) + 1;
            };
            let next = linked.data.reduce((m, e) => Math.max(m, e.log_number ?? 0), offset) + 1;
            let created = 0;
            let visibility = null;
            try {
                visibility = await store.defaultVisibility();
            } catch (error) {
                console.info('Default visibility unavailable; entries use the database default', error?.message ?? error);
            }
            for (const r of ordered) {
                const record = recordOf.get(r.id);
                if (!record) continue;
                let fields;
                try {
                    fields = entryFromRecording(record);
                } catch {
                    try {
                        fields = entryFromRecording({ ...record, start: { ...record.start, local: r.startLocal } });
                    } catch (error) {
                        console.warn(`Skipping recording ${r.id}: cannot build a logbook entry`, error);
                        continue;
                    }
                }
                const insert = number => client.from(ENTRIES).insert({
                    ...fields, owner: user.id, recording_id: r.id, log_number: number,
                    ...(visibility ? { visibility } : {}),
                });
                let { error } = await insert(next);
                if (isUnique(error, NUMBER_KEY)) {
                    next = await freshNext(); // another session took the number: retry once
                    ({ error } = await insert(next));
                }
                if (error) {
                    if (isUnique(error, RECORDING_KEY)) { next = await freshNext(); continue; } // created by another run
                    throw fail(error);
                }
                created++;
                next++;
            }
            return created;
        },

        /**
         * One-time backfill of the profile-derived `surfaceTempC` / `avgDepthM` for entries linked to a
         * recording. Only missing keys are set; `computerFillVersion` makes later runs skip the entry.
         * Failures are logged, never thrown. Returns the number of entries changed.
         */
        async fillComputerFields() {
            try {
                const entries = await client.from(ENTRIES).select('id, recording_id, details, updated_at');
                if (entries.error) throw fail(entries.error);
                const todo = entries.data.filter(e => {
                    const d = e.details ?? {};
                    return e.recording_id && !(d.computerFillVersion >= 1)
                        && (d.surfaceTempC === undefined || d.surfaceTempC === null || d.avgDepthM === undefined || d.avgDepthM === null);
                });
                if (!todo.length) return 0;
                const recs = await client.from(TABLE).select('id, record').in('id', todo.map(e => e.recording_id));
                if (recs.error) throw fail(recs.error);
                const recordOf = new Map(recs.data.map(r => [r.id, r.record]));
                let changed = 0;
                for (const e of todo) {
                    try {
                        const record = recordOf.get(e.recording_id);
                        if (!record) continue;
                        const derived = computerFieldsFromRecording(record);
                        const details = { ...(e.details ?? {}), computerFillVersion: 1 };
                        let added = false;
                        for (const [k, v] of Object.entries(derived)) {
                            if (details[k] === undefined || details[k] === null) { details[k] = v; added = true; }
                        }
                        const { error } = await client.from(ENTRIES).update({ details, updated_at: new Date().toISOString() })
                            .eq('id', e.id).eq('updated_at', e.updated_at); // skip if edited meanwhile
                        if (error) throw fail(error);
                        if (added) changed++;
                    } catch (error) {
                        console.error('fillComputerFields: entry skipped', error);
                    }
                }
                return changed;
            } catch (error) {
                console.error('fillComputerFields failed', error);
                return 0;
            }
        },

        listMedia,

        /** Photo media rows of all entries, oldest first (for list thumbnails). */
        async listPhotoMedia() {
            const { data, error } = await client.from(MEDIA).select('*').eq('kind', 'photo').order('created_at');
            if (error) throw fail(error);
            return data;
        },

        async addPhoto(entryId, { blob, width, height, takenAt = null, lat = null, lon = null }) {
            const user = await requireUser();
            const id = crypto.randomUUID();
            const path = `${user.id}/${entryId}/${id}.jpg`;
            const up = await client.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
            if (up.error) throw fail(up.error, 'storage');
            const { data, error } = await client.from(MEDIA).insert({
                id, entry_id: entryId, kind: 'photo', path, width, height, taken_at: takenAt, lat, lon,
            }).select().single();
            if (error) {
                await client.storage.from(PHOTO_BUCKET).remove([path]); // do not leave an orphan file
                throw fail(error);
            }
            return data;
        },

        async addVideoLink(entryId, url, caption = null) {
            const { data, error } = await client.from(MEDIA).insert({
                entry_id: entryId, kind: 'video_link', url, caption,
            }).select().single();
            if (error) throw fail(error);
            return data;
        },

        async deleteMedia(media) {
            if (media.kind === 'photo' && media.path) {
                const { error } = await client.storage.from(PHOTO_BUCKET).remove([media.path]);
                if (error) throw fail(error, 'storage');
            }
            const { error } = await client.from(MEDIA).delete().eq('id', media.id);
            if (error) throw fail(error);
        },

        async photoUrls(paths) {
            const urls = new Map();
            if (!paths.length) return urls;
            const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_SECONDS);
            if (error) throw fail(error, 'storage');
            for (const r of data) if (r.signedUrl) urls.set(r.path, r.signedUrl);
            return urls;
        },
    };
    Object.assign(store, createCommunityApi(client, { requireUser, fail, toSummaryRow, DiveStoreError }));
    return store;
}
