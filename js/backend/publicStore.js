/**
 * DecoTrail without logging in (migration 0012): the probe and a read-only store for visitors, backed by the
 * public_* RPCs. Its methods carry the names of the community API, so the Feed, member pages, a member's dive,
 * its analysis and the Sites pages read through it unchanged. It has no write methods.
 * Helpers are passed in by supabaseStore so this module never imports it (no circular import).
 */

import { directoryRow } from './sitesStore.js';

const QUIET_CODES = /^(PGRST202|PGRST205|42883|42P01)$/;
const NO_ID = '00000000-0000-0000-0000-000000000000';

export function createPublicApi(client, { fail, toSummaryRow, DiveStoreError, photoUrls, avatarUrls }) {
    let state = null; // 'yes' | 'no' once known
    let reader = null;

    const rpc = async (name, args) => {
        const { data, error } = await client.rpc(name, args);
        if (error) throw fail(error);
        return data;
    };

    /** 'yes' | 'no' (0012 has not run, cached) | 'unknown' (transient failure, not cached). */
    async function publicAvailability() {
        if (state) return state;
        let result = 'unknown';
        try {
            const { error, status } = await client.rpc('public_members', { p_id: NO_ID });
            if (!error) result = 'yes';
            else if (QUIET_CODES.test(error.code ?? '') || status === 404) {
                result = 'no';
                console.info('Public profiles unavailable', error.message ?? error);
            } else {
                console.warn('Public profiles probe failed', error.message ?? error);
            }
        } catch (error) {
            console.warn('Public profiles probe failed', error?.message ?? error);
        }
        if (result !== 'unknown') state = result;
        return result;
    }

    async function listPublicSites() {
        return ((await rpc('public_sites', {})) ?? []).map(r => ({ ...directoryRow(r, null), own: false }));
    }

    /** The read-only store of a visitor (one instance). */
    function publicStore() {
        reader ??= Object.freeze({
            guest: true,
            currentUser: async () => null,
            onAuthChange: () => () => {},
            photoUrls,
            avatarUrls,
            async listMembers() {
                return (await rpc('public_members', { p_id: null })) ?? [];
            },
            async getMember(id) {
                return ((await rpc('public_members', { p_id: id })) ?? [])[0] ?? null;
            },
            async listCommunityEntries({ owner = null, limit = 30, offset = 0 } = {}) {
                return (await rpc('public_entries', { p_owner: owner, p_id: null, p_limit: limit, p_offset: offset })) ?? [];
            },
            async getCommunityEntry(id) {
                return ((await rpc('public_entries', { p_owner: null, p_id: id, p_limit: 1, p_offset: 0 })) ?? [])[0] ?? null;
            },
            async listCommunityMedia(entryId) {
                return (await rpc('public_media', { p_entry_id: entryId })) ?? [];
            },
            async communityRecordings(owner) {
                return ((await rpc('public_recordings', { p_owner: owner })) ?? []).map(toSummaryRow);
            },
            async loadCommunityRecording(id) {
                const data = await rpc('public_recording', { p_id: id });
                if (data == null) throw new DiveStoreError('unknown', 'Recording not available');
                return data;
            },
            listSites: listPublicSites,
            listAllSites: listPublicSites,
            siteUsage: async () => new Map(), // a visitor has no dives of their own
            communitySitesStatus: async () => true,
            async siteStats(id) {
                return (await rpc('public_site_stats', { p_site_id: id })) ?? null;
            },
            async siteVisits(id, { limit = 200, offset = 0 } = {}) {
                return (await rpc('public_site_visits', { p_site_id: id, p_limit: limit, p_offset: offset })) ?? [];
            },
        });
        return reader;
    }

    return { publicAvailability, publicStore };
}
