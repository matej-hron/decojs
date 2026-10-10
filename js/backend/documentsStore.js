/**
 * DecoTrail profile documents API: qualifications, medical checks and their scans (migration 0007).
 * Everything here is owner-only; other members get only qualification badges through community_qualifications().
 * Helpers are passed in by supabaseStore so this module never imports it (no circular import).
 */

import { scanPaths } from '../logbook/documents.js';

export const DOCUMENT_BUCKET = 'documents';
const QUALS = 'qualifications';
const MEDICAL = 'medical_checks';
const URL_SECONDS = 300; // a scan is opened right away; health data should not have long-lived links
const PAGE = 1000;
const CHUNK = 100;
const QUAL_KEYS = ['agency', 'agency_other', 'level', 'card_number', 'issued_on', 'instructor', 'notes', 'scan_front', 'scan_back', 'show_on_profile'];
const MEDICAL_KEYS = ['checked_on', 'valid_until', 'doctor', 'notes', 'scan_path'];
const QUIET_CODES = /^(PGRST205|PGRST202|42P01|42883)$/;
const NOT_FOUND = /not.?found|404/i;

const pick = (row, keys) => Object.fromEntries(keys.filter(k => k in row).map(k => [k, row[k]]));

export function createDocumentsApi(client, { requireUser, fail }) {
    let status = null; // 'yes' | 'no' once known
    let epoch = 0;

    /** 'yes' | 'no' (0007 not run, cached) | 'unknown' (transient failure, not cached). */
    async function documentsAvailability() {
        if (status) return status;
        const started = epoch;
        let result = 'unknown';
        try {
            const { error, status: http } = await client.from(QUALS).select('id').limit(1);
            if (!error) result = 'yes';
            else if (QUIET_CODES.test(error.code ?? '') || http === 404) {
                result = 'no';
                console.info('Profile documents unavailable', error.message ?? error);
            } else {
                console.warn('Profile documents probe failed', error.message ?? error);
            }
        } catch (error) {
            result = 'no'; // a client without the table at all (e.g. a minimal fake)
            console.info('Profile documents unavailable', error?.message ?? error);
        }
        if (result !== 'unknown' && started === epoch) status = result;
        return result;
    }

    function resetDocumentsCache() {
        epoch++;
        status = null;
    }

    async function list(table, order) {
        const { data, error } = await client.from(table).select('*').order(order, { ascending: false }).order('created_at', { ascending: false });
        if (error) throw fail(error);
        return data ?? [];
    }

    async function save(table, keys, row, id) {
        const clean = pick(row, keys);
        const q = id
            ? client.from(table).update(clean).eq('id', id)
            : client.from(table).insert(clean);
        const { data, error } = await q.select().single();
        if (error) throw fail(error);
        return data;
    }

    async function removeDocuments(paths) {
        const all = [...new Set((paths ?? []).filter(Boolean))];
        for (let i = 0; i < all.length; i += CHUNK) {
            const { error } = await client.storage.from(DOCUMENT_BUCKET).remove(all.slice(i, i + CHUNK));
            if (error && !NOT_FOUND.test(`${error.message ?? ''} ${error.statusCode ?? ''}`)) throw fail(error, 'storage');
        }
    }

    /** Delete a row: its files first (the user asked for the scans to go), then the row. */
    async function remove(table, row) {
        await removeDocuments(scanPaths(row));
        const { error } = await client.from(table).delete().eq('id', row.id);
        if (error) throw fail(error);
    }

    /** Every file in the user's folder of the bucket, including ones no row points to. */
    async function filesUnder(prefix) {
        const out = [];
        const { data, error } = await client.storage.from(DOCUMENT_BUCKET).list(prefix, { limit: PAGE });
        if (error) throw fail(error, 'storage');
        for (const item of data ?? []) {
            if (item.id) out.push(`${prefix}/${item.name}`);
            else out.push(...await filesUnder(`${prefix}/${item.name}`));
        }
        return out;
    }

    return {
        documentsAvailability,
        async documentsStatus() {
            return (await documentsAvailability()) === 'yes';
        },
        resetDocumentsCache,

        listQualifications: () => list(QUALS, 'issued_on'),
        saveQualification: (row, id = null) => save(QUALS, QUAL_KEYS, row, id),
        deleteQualification: row => remove(QUALS, row),
        listMedicalChecks: () => list(MEDICAL, 'checked_on'),
        saveMedicalCheck: (row, id = null) => save(MEDICAL, MEDICAL_KEYS, row, id),
        deleteMedicalCheck: row => remove(MEDICAL, row),

        /**
         * Upload one scan to the caller's folder.
         * @param {string} path - from documentPath(uid, kind, id, ext)
         * @param {Blob} blob - JPEG or PDF
         */
        async uploadDocument(path, blob) {
            const user = await requireUser();
            if (!path.startsWith(`${user.id}/`)) throw fail(new Error('Document path outside the own folder'), 'storage');
            const contentType = path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
            const { error } = await client.storage.from(DOCUMENT_BUCKET).upload(path, blob, { contentType, upsert: false });
            if (error) throw fail(error, 'storage');
            return path;
        },
        removeDocuments,

        /** Short-lived signed URLs (5 min), path → url. */
        async documentUrls(paths) {
            const urls = new Map();
            const need = [...new Set((paths ?? []).filter(Boolean))];
            if (!need.length) return urls;
            const { data, error } = await client.storage.from(DOCUMENT_BUCKET).createSignedUrls(need, URL_SECONDS);
            if (error) throw fail(error, 'storage');
            for (const r of data ?? []) if (r.signedUrl) urls.set(r.path, r.signedUrl);
            return urls;
        },

        /** Badges another member chose to show: [{agency, agency_other, level}]. [] without 0007. */
        async memberQualifications(owner) {
            const { data, error } = await client.rpc('community_qualifications', { p_owner: owner });
            if (error) {
                if (QUIET_CODES.test(error.code ?? '')) return [];
                throw fail(error);
            }
            return data ?? [];
        },

        /** Valid-until dates of the own medical checks (for the expiry banner); null without 0007. */
        async medicalValidity() {
            if (await documentsAvailability() !== 'yes') return null;
            const { data, error } = await client.from(MEDICAL).select('checked_on, valid_until');
            if (error) throw fail(error);
            return data ?? [];
        },

        /** For the export: both tables and every scan file ({name: path inside the user's folder, bytes}). */
        async exportDocuments() {
            if (await documentsAvailability() !== 'yes') return null;
            const user = await requireUser();
            const qualifications = await list(QUALS, 'issued_on');
            const medical = await list(MEDICAL, 'checked_on');
            const files = [];
            for (const path of [...qualifications, ...medical].flatMap(scanPaths)) {
                const { data, error } = await client.storage.from(DOCUMENT_BUCKET).download(path);
                if (error) throw fail(error, 'storage');
                files.push({ name: path.slice(user.id.length + 1), bytes: new Uint8Array(await data.arrayBuffer()) });
            }
            return { qualifications, medical_checks: medical, files };
        },

        /** Delete every scan file and every row of both tables. @returns {Promise<{files: number, rows: number}>} */
        async deleteAllDocuments() {
            const user = await requireUser();
            const rows = [];
            for (const table of [QUALS, MEDICAL]) {
                const { data, error } = await client.from(table).select('*').eq('owner', user.id);
                if (error) throw fail(error);
                rows.push(...(data ?? []).map(r => ({ table, row: r })));
            }
            const files = new Set([...rows.flatMap(r => scanPaths(r.row)), ...await filesUnder(user.id)]);
            await removeDocuments([...files]);
            let count = 0;
            for (const table of [QUALS, MEDICAL]) {
                const { data, error } = await client.from(table).delete().eq('owner', user.id).select('id');
                if (error) throw fail(error);
                count += data?.length ?? 0;
            }
            return { files: files.size, rows: count };
        },
    };
}
