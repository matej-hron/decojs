/**
 * The anonymous side of a share link: its own Supabase client without a session that sends the
 * token header on every request, the `get_shared_dive` call, signed photo and avatar URLs, and a
 * read-only adapter for `EntryDetail` and the embedded `RecordedDiveAnalysis`.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { DiveStoreError, PHOTO_BUCKET } from './supabaseStore.js';
import { SHARE_HEADER, isShareToken, sharedDiveParts } from '../logbook/share.js';

const AVATAR_BUCKET = 'avatars';
const URL_SECONDS = 600; // short: a URL signed while the link was on outlives turning it off
const MISSING = /^(PGRST202|42883)$/;

/**
 * @param {string} token
 * @param {{url?: string, key?: string, factory?: Function}} [options] - overrides (tests)
 * @returns {Object|null} the share store, or null without a configured backend
 */
export function createShareStore(token, options = {}) {
    const { url = SUPABASE_URL, key = SUPABASE_ANON_KEY, factory = globalThis.supabase?.createClient } = options;
    if (!(url && key && typeof factory === 'function') || !isShareToken(token)) return null;
    const client = factory(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'decotrail-share' },
        global: { headers: { [SHARE_HEADER]: token } },
    });
    return shareStoreFor(client, token);
}

/** The store over a ready client (exported for tests). */
export function shareStoreFor(client, token) {
    const kind = error => (/fetch|network|timeout|503|502|504/i.test(error?.message ?? '') ? 'unreachable' : 'unknown');

    async function signed(bucket, paths) {
        const urls = new Map();
        if (!paths.length) return urls;
        const { data, error } = await client.storage.from(bucket).createSignedUrls(paths, URL_SECONDS);
        if (error) throw new DiveStoreError('storage', error.message ?? String(error));
        for (const r of data ?? []) if (r.signedUrl) urls.set(r.path, r.signedUrl);
        return urls;
    }

    return {
        /** The parts of the shared dive; null when the link does not work (unknown or revoked token). */
        async loadSharedDive() {
            const { data, error, status } = await client.rpc('get_shared_dive', { p_token: token });
            if (error) {
                if (MISSING.test(error.code ?? '') || status === 404) throw new DiveStoreError('unavailable', error.message ?? 'Sharing is not set up');
                throw new DiveStoreError(kind(error), error.message ?? String(error));
            }
            return sharedDiveParts(data);
        },
        /**
         * Migration 0010's extras of the shared dive: the kudos count (never names) and the author's nickname.
         * @returns {Promise<{kudos: number|null, nickname: string|null}>} nulls when unknown or before 0010
         */
        async socialExtras() {
            const none = { kudos: null, nickname: null };
            const { data, error } = await client.rpc('shared_dive_social', { p_token: token });
            if (error) {
                if (!MISSING.test(error.code ?? '')) console.warn('Kudos count unavailable', error.message ?? error);
                return none;
            }
            if (!data || typeof data !== 'object') return none;
            const n = Number(data.kudos_count);
            const nick = typeof data.author_nickname === 'string' && data.author_nickname.trim() ? data.author_nickname.trim() : null;
            return { kudos: Number.isFinite(n) ? n : null, nickname: nick };
        },
        photoUrls: paths => signed(PHOTO_BUCKET, paths),
        async avatarUrl(path) {
            if (!path) return null;
            return (await signed(AVATAR_BUCKET, [path])).get(path) ?? null;
        },
    };
}

/**
 * Read-only store adapter over the loaded parts: the methods `EntryDetail` and the embedded
 * analysis read through. Nothing writes; earlier dives are not shared, so the list is one dive.
 */
export function sharedDiveAdapter(store, parts) {
    return Object.freeze({
        listSites: async () => (parts.site ? [parts.site] : []),
        listMedia: async () => parts.media,
        photoUrls: paths => store.photoUrls(paths),
        listDives: async () => (parts.recording ? [parts.recording] : []),
        loadDive: async id => {
            if (!parts.record || id !== parts.recording?.id) throw new DiveStoreError('unknown', 'Recording not available');
            return parts.record;
        },
        reparseOutdated: async () => 0,
        onAuthChange: () => () => {},
        currentUser: async () => ({ id: 'shared-link' }), // the analysis reads the server list only for a user
    });
}
