/**
 * Community site directory (migration 0011): the probe, the directory, the conditions of one site, its visits and
 * merging. Helpers are passed in by supabaseStore so this module never imports it (no circular import).
 */

const QUIET_CODES = /^(PGRST205|PGRST202|PGRST204|42P01|42703|42883)$/;
/** Custom errors of the 0011 triggers. */
const SITE_ERRORS = { DTS01: 'site-shared', DTS02: 'site-in-use', DTS03: 'site-unavailable' };

const toNum = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** A `community_sites` row with numbers as numbers (PostgREST sends numeric as strings in some setups). */
function directoryRow(r, userId) {
    return {
        ...r,
        lat: toNum(r.lat), lon: toNum(r.lon), altitude_m: toNum(r.altitude_m),
        visits: Number(r.visits) || 0,
        vis_min: toNum(r.vis_min), vis_max: toNum(r.vis_max), temp_min: toNum(r.temp_min), temp_max: toNum(r.temp_max),
        own: r.owner === userId,
    };
}

export function createSitesApi(client, { requireUser, fail, communityAvailability, DiveStoreError }) {
    let state = null; // 'yes' | 'no' once known
    let epoch = 0;

    /** A store error; the 0011 trigger codes get their own kinds. */
    const siteFail = error => {
        const kind = SITE_ERRORS[error?.code];
        return kind ? new DiveStoreError(kind, error.message ?? kind) : fail(error);
    };
    const rpc = async (name, args) => {
        const { data, error } = await client.rpc(name, args);
        if (error) throw siteFail(error);
        return data;
    };

    /** 'yes' | 'no' (cached) | 'unknown' (transient, not cached): whether 0011 ran (needs the community feature). */
    async function sitesAvailability() {
        if (state) return state;
        const started = epoch;
        const community = await communityAvailability();
        if (community !== 'yes') {
            if (community === 'no' && started === epoch) state = 'no';
            return community === 'no' ? 'no' : 'unknown';
        }
        let result = 'unknown';
        try {
            const { error, status: http } = await client.from('sites').select('visibility').limit(1);
            if (!error) result = 'yes';
            else if (QUIET_CODES.test(error.code ?? '') || http === 404 || (http === 400 && /column/i.test(error.message ?? ''))) {
                result = 'no';
                console.info('Community sites unavailable', error.message ?? error);
            } else {
                console.warn('Community sites probe failed', error.message ?? error);
            }
        } catch (error) {
            result = 'no'; // a client without the table at all (a minimal fake)
            console.info('Community sites unavailable', error?.message ?? error);
        }
        if (result !== 'unknown' && started === epoch) state = result;
        return result;
    }

    return {
        sitesAvailability,
        siteFail,
        async communitySitesStatus() {
            return (await sitesAvailability()) === 'yes';
        },
        resetSitesCache() {
            epoch++;
            state = null;
        },

        /** Every site the caller may see (own and members'), without notes, with the visible dives' aggregates. */
        async listCommunitySites() {
            const user = await requireUser();
            return ((await rpc('community_sites', {})) ?? []).map(r => directoryRow(r, user.id));
        },

        /** Conditions at one site (the `site_stats` shape), or null when the site is not visible. */
        async siteStats(id) {
            return (await rpc('site_stats', { p_site_id: id })) ?? null;
        },

        /** Visible dives at one site, newest first. */
        async siteVisits(id, { limit = 200, offset = 0 } = {}) {
            return (await rpc('site_visits', { p_site_id: id, p_limit: limit, p_offset: offset })) ?? [];
        },

        /**
         * Move the user's own dives at own site `fromId` to `intoId` (other members' dives are never touched), then
         * delete `fromId` unless other members' dives still use it.
         * @returns {Promise<{moved: number, deleted: boolean}>}
         */
        async mergeSiteInto(fromId, intoId) {
            if (!fromId || !intoId || fromId === intoId) throw new DiveStoreError('unknown', 'Cannot merge a site into itself');
            const r = (await rpc('merge_site', { p_from: fromId, p_into: intoId })) ?? {};
            return { moved: Number(r.moved) || 0, deleted: r.deleted === true };
        },
    };
}
