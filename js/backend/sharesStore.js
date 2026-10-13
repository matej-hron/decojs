/**
 * Sending a dive to a buddy who is a member (migration 0013): offers, answering them, and copying the photos of an
 * accepted dive into the recipient's own storage. Helpers are passed in by supabaseStore (no circular import).
 */

const QUIET_CODES = /^(PGRST202|PGRST205|42883|42P01)$/;
const PHOTO_BUCKET = 'dive-photos';

export function createSharesApi(client, { fail, communityAvailability, addPhoto, addVideoLink, fetchImpl = (...a) => fetch(...a) }) {
    let state = null; // 'yes' | 'no' once known
    let epoch = 0;

    const rpc = async (name, args) => {
        const { data, error } = await client.rpc(name, args);
        if (error) throw fail(error);
        return data;
    };

    /** 'yes' | 'no' (cached) | 'unknown': whether 0013 ran (needs the community feature). */
    async function sharesAvailability() {
        if (state) return state;
        const started = epoch;
        const community = await communityAvailability();
        if (community !== 'yes') {
            if (community === 'no' && started === epoch) state = 'no';
            return community === 'no' ? 'no' : 'unknown';
        }
        let result = 'unknown';
        try {
            const { error, status } = await client.rpc('incoming_dive_share_count', {});
            if (!error) result = 'yes';
            else if (QUIET_CODES.test(error.code ?? '') || status === 404) {
                result = 'no';
                console.info('Buddy dive sharing unavailable', error.message ?? error);
            } else {
                console.warn('Buddy dive sharing probe failed', error.message ?? error);
            }
        } catch (error) {
            console.warn('Buddy dive sharing probe failed', error?.message ?? error);
        }
        if (result !== 'unknown' && started === epoch) state = result;
        return result;
    }

    return {
        sharesAvailability,
        async sharesStatus() {
            return (await sharesAvailability()) === 'yes';
        },
        resetSharesCache() {
            epoch++;
            state = null;
        },

        /** The offers of one own dive (recipient, status). */
        async listDiveShares(entryId) {
            const { data, error } = await client.from('dive_shares').select('id, recipient, status, result_entry_id').eq('entry_id', entryId);
            if (error) throw fail(error);
            return data ?? [];
        },

        /** Offer an own dive to exactly these members (pending offers of others are withdrawn; answers stay). */
        async setDiveShares(entryId, recipients) {
            return (await rpc('set_dive_shares', { p_entry: entryId, p_recipients: [...new Set(recipients)] })) ?? [];
        },

        async incomingDiveShares() {
            return (await rpc('incoming_dive_shares', {})) ?? [];
        },

        async incomingDiveShareCount() {
            return Number(await rpc('incoming_dive_share_count', {})) || 0;
        },

        /** @returns {Promise<{entryId: string, copied: boolean}>} */
        async acceptDiveShare(shareId, linkEntryId = null) {
            const r = (await rpc('accept_dive_share', { p_share: shareId, p_link_entry: linkEntryId })) ?? {};
            return { entryId: r.entry_id, copied: r.copied === true };
        },

        async declineDiveShare(shareId) {
            await rpc('decline_dive_share', { p_share: shareId });
        },

        /**
         * Copy the photos and video links of an accepted offer into the recipient's dive (their own files).
         * Each item that fails is counted, the others still copy.
         * @returns {Promise<{copied: number, failed: number}>}
         */
        async copySharedMedia(shareId, entryId, onProgress = () => {}) {
            const items = (await rpc('dive_share_media', { p_share: shareId })) ?? [];
            const photos = items.filter(m => m.kind === 'photo' && m.path);
            let urls = new Map();
            if (photos.length) {
                const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrls(photos.map(m => m.path), 600);
                if (error) console.error(error);
                else urls = new Map((data ?? []).filter(r => r.signedUrl).map(r => [r.path, r.signedUrl]));
            }
            let copied = 0;
            let failed = 0;
            for (const m of items) {
                try {
                    if (m.kind === 'photo') {
                        const url = urls.get(m.path);
                        if (!url) throw new Error('No access to the photo');
                        const res = await fetchImpl(url);
                        if (!res.ok) throw new Error(`Photo download failed (${res.status})`);
                        await addPhoto(entryId, {
                            blob: await res.blob(), width: m.width, height: m.height,
                            takenAt: m.taken_at ?? null, lat: m.lat ?? null, lon: m.lon ?? null,
                        });
                    } else if (m.kind === 'video_link' && m.url) {
                        await addVideoLink(entryId, m.url, m.caption ?? null);
                    } else continue;
                    copied++;
                } catch (error) {
                    console.error(error);
                    failed++;
                }
                onProgress(copied + failed, items.length);
            }
            return { copied, failed };
        },
    };
}
