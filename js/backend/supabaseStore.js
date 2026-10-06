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
            // getSession reads local storage (no network), so an unreachable backend is not mistaken for "logged out".
            const { data } = await client.auth.getSession();
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
