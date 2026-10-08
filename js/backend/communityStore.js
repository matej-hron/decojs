/**
 * DecoTrail community API: profiles, avatars and members-visible reads (Supabase RPCs from migration 0004).
 * Helpers are passed in by supabaseStore so this module never imports it (no circular import).
 */

const AVATAR_BUCKET = 'avatars';
const AVATAR_URL_SECONDS = 3600;
const AVATAR_CACHE_MS = 50 * 60 * 1000;
const PROFILE_KEYS = ['display_name', 'avatar_preset', 'avatar_path', 'default_visibility', 'home_country'];
const QUIET_CODES = /^(PGRST205|PGRST202|42P01|42883)$/;

/** Display name from Google metadata (never the email), trimmed and cut to 60 characters, else null. */
export function nameFromMetadata(user) {
    const meta = user?.user_metadata ?? {};
    const raw = meta.full_name ?? meta.name;
    if (typeof raw !== 'string') return null;
    const name = raw.trim().slice(0, 60).trim();
    return name || null;
}

export function createCommunityApi(client, { requireUser, fail, toSummaryRow, DiveStoreError }) {
    let status = null; // cached Promise<boolean>
    let profile; // undefined = not loaded
    const avatarCache = new Map(); // path -> { url, at }

    const rpc = async (name, args) => {
        const { data, error } = await client.rpc(name, args);
        if (error) throw fail(error);
        return data;
    };

    async function communityStatus() {
        status ??= (async () => {
            try {
                const { error } = await client.from('profiles').select('id').limit(1);
                if (!error) return true;
                const quiet = QUIET_CODES.test(error.code ?? '') || error.status === 404;
                (quiet ? console.info : console.warn)('Community features unavailable', error.message ?? error);
            } catch (error) {
                // A client that has no profiles table at all (e.g. a minimal fake) throws; same as a missing table.
                console.info('Community features unavailable', error?.message ?? error);
            }
            return false;
        })();
        return status;
    }

    async function ensureProfile() {
        if (!await communityStatus()) return null;
        const user = await requireUser();
        const read = () => client.from('profiles').select('*').eq('id', user.id).maybeSingle();
        let { data, error } = await read();
        if (error) throw fail(error);
        if (!data) {
            const ins = await client.from('profiles').insert({ id: user.id, display_name: nameFromMetadata(user) }).select().single();
            if (ins.error && ins.error.code !== '23505') throw fail(ins.error);
            if (ins.error) {
                ({ data, error } = await read());
                if (error) throw fail(error);
            } else {
                data = ins.data;
            }
        }
        profile = data;
        return profile;
    }

    async function getMyProfile() {
        if (profile === undefined) return ensureProfile();
        return profile;
    }

    async function saveProfile(patch) {
        const user = await requireUser();
        const clean = {};
        for (const k of PROFILE_KEYS) if (k in patch) clean[k] = patch[k];
        const { data, error } = await client.from('profiles')
            .update({ ...clean, updated_at: new Date().toISOString() }).eq('id', user.id).select().single();
        if (error) throw fail(error);
        profile = data;
        return profile;
    }

    async function removeAvatarFile(path) {
        if (!path) return;
        try { await client.storage.from(AVATAR_BUCKET).remove([path]); } catch { /* best effort */ }
    }

    async function uploadAvatar(blob) {
        const user = await requireUser();
        const previous = (await getMyProfile())?.avatar_path ?? null;
        const path = `${user.id}/avatar-${Date.now()}.jpg`;
        const up = await client.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw fail(up.error, 'storage');
        const saved = await saveProfile({ avatar_path: path });
        await removeAvatarFile(previous);
        return saved;
    }

    async function removeAvatar() {
        const previous = (await getMyProfile())?.avatar_path ?? null;
        const saved = await saveProfile({ avatar_path: null });
        await removeAvatarFile(previous);
        return saved;
    }

    async function avatarUrls(paths) {
        const urls = new Map();
        const now = Date.now();
        const need = [];
        for (const p of new Set(paths.filter(Boolean))) {
            const hit = avatarCache.get(p);
            if (hit && now - hit.at < AVATAR_CACHE_MS) urls.set(p, hit.url);
            else need.push(p);
        }
        if (!need.length) return urls;
        const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrls(need, AVATAR_URL_SECONDS);
        if (error) throw fail(error, 'storage');
        for (const r of data) {
            if (!r.signedUrl) continue;
            avatarCache.set(r.path, { url: r.signedUrl, at: now });
            urls.set(r.path, r.signedUrl);
        }
        return urls;
    }

    async function defaultVisibility() {
        if (!await communityStatus()) return null;
        const p = await getMyProfile();
        return p?.default_visibility ?? 'members';
    }

    return {
        communityStatus,
        ensureProfile,
        getMyProfile,
        saveProfile,
        uploadAvatar,
        removeAvatar,
        avatarUrls,
        defaultVisibility,
        async listMembers() {
            return (await rpc('community_members', { p_id: null })) ?? [];
        },
        async getMember(id) {
            return ((await rpc('community_members', { p_id: id })) ?? [])[0] ?? null;
        },
        async listCommunityEntries({ owner = null, limit = 30, offset = 0 } = {}) {
            return (await rpc('community_entries', { p_owner: owner, p_id: null, p_limit: limit, p_offset: offset })) ?? [];
        },
        async getCommunityEntry(id) {
            return ((await rpc('community_entries', { p_owner: null, p_id: id, p_limit: 1, p_offset: 0 })) ?? [])[0] ?? null;
        },
        async listCommunityMedia(entryId) {
            return (await rpc('community_media', { p_entry_id: entryId })) ?? [];
        },
        async communityRecordings(owner) {
            return ((await rpc('community_recordings', { p_owner: owner })) ?? []).map(toSummaryRow);
        },
        async loadCommunityRecording(id) {
            const data = await rpc('community_recording', { p_id: id });
            if (data == null) throw new DiveStoreError('unknown', 'Recording not available');
            return data;
        },
    };
}
