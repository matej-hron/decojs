/**
 * DecoTrail kudos and comments (migration 0010): the probe, counts, kudos, comments, the comments switch of an
 * own dive and the "New for you" inbox. Helpers are passed in by supabaseStore so this module never imports it.
 */

const QUIET_CODES = /^(PGRST205|PGRST202|42P01|42883)$/;
const COUNT_CHUNK = 200; // social_counts reads at most this many ids per call

export function createSocialApi(client, { requireUser, fail, communityStatus, DiveStoreError }) {
    let state = null; // 'yes' | 'no' once known
    let epoch = 0;

    const rpc = async (name, args) => {
        const { data, error } = await client.rpc(name, args);
        if (error) throw fail(error);
        return data;
    };
    /** A comment refused by the server's rate limit gets its own kind, so the page can say "wait a minute". */
    const commentFail = error => (error?.code === 'P0001' ? new DiveStoreError('rate', error.message ?? 'Too many comments') : fail(error));

    /** 'yes' | 'no' (cached) | 'unknown' (transient, not cached): whether 0010 ran (needs the community feature). */
    async function socialAvailability() {
        if (state) return state;
        const started = epoch;
        if (!await communityStatus()) {
            if (started === epoch) state = 'no';
            return 'no';
        }
        let result = 'unknown';
        try {
            const { error, status: http } = await client.from('kudos').select('entry_id').limit(1);
            if (!error) result = 'yes';
            else if (QUIET_CODES.test(error.code ?? '') || http === 404) {
                result = 'no';
                console.info('Kudos and comments unavailable', error.message ?? error);
            } else {
                console.warn('Kudos probe failed', error.message ?? error);
            }
        } catch (error) {
            result = 'no'; // a client without the table at all (a minimal fake)
            console.info('Kudos and comments unavailable', error?.message ?? error);
        }
        if (result !== 'unknown' && started === epoch) state = result;
        return result;
    }

    return {
        socialAvailability,
        async socialStatus() {
            return (await socialAvailability()) === 'yes';
        },
        resetSocialCache() {
            epoch++;
            state = null;
        },

        /**
         * Kudos and comment counts of the dives the caller may see.
         * @param {string[]} ids
         * @returns {Promise<Map<string, {kudos: number, kudoed: boolean, comments: number, commentsEnabled: boolean}>>}
         */
        async socialCounts(ids) {
            const out = new Map();
            const unique = [...new Set((ids ?? []).filter(Boolean))];
            for (let i = 0; i < unique.length; i += COUNT_CHUNK) {
                const rows = (await rpc('social_counts', { p_entry_ids: unique.slice(i, i + COUNT_CHUNK) })) ?? [];
                for (const r of rows) {
                    out.set(r.entry_id, {
                        kudos: Number(r.kudos_count) || 0, kudoed: r.kudoed === true,
                        comments: Number(r.comment_count) || 0, commentsEnabled: r.comments_enabled !== false,
                    });
                }
            }
            return out;
        },

        /** Give (`on`) or take back the caller's kudos; giving twice is not an error. */
        async setKudos(entryId, on) {
            const user = await requireUser();
            if (on) {
                const { error } = await client.from('kudos').insert({ entry_id: entryId, member_id: user.id });
                if (error && error.code !== '23505') throw fail(error);
                return;
            }
            const { error } = await client.from('kudos').delete().eq('entry_id', entryId).eq('member_id', user.id);
            if (error) throw fail(error);
        },

        /** Who gave kudos, newest first: `{member_id, display_name, avatar_preset, avatar_path, created_at}[]`. */
        async listKudos(entryId) {
            return (await rpc('entry_kudos', { p_entry_id: entryId })) ?? [];
        },

        /** The comments of a dive, oldest first (none while comments are off). */
        async listComments(entryId) {
            return (await rpc('entry_comments', { p_entry_id: entryId })) ?? [];
        },

        async addComment(entryId, body) {
            const user = await requireUser();
            const { data, error } = await client.from('comments').insert({ entry_id: entryId, author_id: user.id, body }).select().single();
            if (error) throw commentFail(error);
            return data;
        },

        async editComment(id, body) {
            const { data, error } = await client.from('comments').update({ body }).eq('id', id).select().single();
            if (error) throw commentFail(error);
            return data;
        },

        async deleteComment(id) {
            const { error } = await client.from('comments').delete().eq('id', id);
            if (error) throw fail(error);
        },

        /** Turn comments of an own dive on or off. */
        async setCommentsEnabled(entryId, on) {
            const { data, error } = await client.from('log_entries')
                .update({ comments_enabled: Boolean(on), updated_at: new Date().toISOString() }).eq('id', entryId).select().single();
            if (error) throw fail(error);
            return data;
        },

        /** "New for you": kudos and comments by others on the caller's dives, newest first. */
        async socialInbox(limit = 50) {
            return (await rpc('social_inbox', { p_limit: limit })) ?? [];
        },

        /** The badge number: events since "New for you" was last opened. */
        async socialUnseenCount() {
            return Number(await rpc('social_unseen_count', {})) || 0;
        },

        async markSocialSeen() {
            return rpc('social_mark_seen', {});
        },

        /**
         * Delete the caller's own kudos and comments everywhere (part of "Delete all my data"; those on the
         * caller's dives go with the dives).
         * @returns {Promise<{kudos: number, comments: number}>}
         */
        async deleteMySocial() {
            const user = await requireUser();
            const del = async (table, column) => {
                const { data, error } = await client.from(table).delete().eq(column, user.id).select(column);
                if (error) throw fail(error);
                return data?.length ?? 0;
            };
            return { kudos: await del('kudos', 'member_id'), comments: await del('comments', 'author_id') };
        },
    };
}
