/**
 * Supabase implementation of the dive log store (see the DiveStore typedef in
 * docs/superpowers/specs/2026-10-06-dive-log-backend-v1-design.md).
 * The Supabase client is injected; this module never touches the DOM.
 */

import { parseDivesoftDLF, PARSER_VERSION } from '../import/divesoftDlf.js';
import { listSummary } from './sync.js';
import { entryFromRecording, orderRecordingsForNumbering, computerFieldsFromRecording } from '../logbook/entryModel.js';

export const BUCKET = 'dive-logs';
export const TABLE = 'dives';
export const PHOTO_BUCKET = 'dive-photos';
const ENTRIES = 'log_entries';
const SITES = 'sites';
const MEDIA = 'media';
const PHOTO_URL_SECONDS = 3600;
const PAGE = 1000; // PostgREST returns at most this many rows per request
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

    async function listMedia(entryId) {
        const { data, error } = await client.from(MEDIA).select('*').eq('entry_id', entryId).order('created_at');
        if (error) throw fail(error);
        return data;
    }

    return {
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

        async saveEntry(row, id) {
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

        async listSites() {
            const { data, error } = await client.from(SITES).select('*').order('name');
            if (error) throw fail(error);
            return data;
        },

        async saveSite(row, id) {
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

            const freshNext = async () => {
                const { data, error } = await client.from(ENTRIES).select('log_number');
                if (error) throw fail(error);
                return data.reduce((m, e) => Math.max(m, e.log_number ?? 0), 0) + 1;
            };
            let next = linked.data.reduce((m, e) => Math.max(m, e.log_number ?? 0), 0) + 1;
            let created = 0;
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
}
