/**
 * Pure sync decisions for the dive log backend: how dives are recognised,
 * what the dive list needs, and what an upload must do.
 */

/**
 * Identity of a recorded dive across uploads: device serial + dive number + device start time.
 * @param {Object} dive - RecordedDive
 * @returns {string}
 */
export function diveKey(dive) {
    return `${dive.device?.serial ?? 'unknown'}|${dive.source?.diveNumber ?? 0}|${dive.start.local}`;
}

/**
 * SHA-256 of a byte array as lowercase hex (Web Crypto; works in browsers and Node).
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The small part of a dive the dive list shows.
 * @param {Object} dive - RecordedDive
 */
export function listSummary(dive) {
    return {
        maxDepth: dive.maxDepth,
        duration: dive.duration,
        mode: dive.mode,
        gfLow: dive.deco?.gfLow ?? null,
        gfHigh: dive.deco?.gfHigh ?? null,
        waterSetting: dive.environment?.waterSetting ?? null,
        warnings: dive.warnings,
    };
}

/**
 * Decide what an upload has to do.
 * @param {Array<{dive: Object, bytes: Uint8Array, sha256: string}>} local - Parsed files from the picked folder
 * @param {Array<{deviceSerial: string, diveNumber: number, startLocal: string, fileSha256: string}>} existing - Rows already stored
 * @returns {{upload: Array, update: Array, unchanged: Array}}
 */
export function planSync(local, existing) {
    const stored = new Map(existing.map(r => [`${r.deviceSerial}|${r.diveNumber}|${r.startLocal}`, r.fileSha256]));
    const seen = new Set();
    const plan = { upload: [], update: [], unchanged: [] };
    for (const it of local) {
        const key = diveKey(it.dive);
        if (seen.has(key)) {
            plan.unchanged.push(it);
            continue;
        }
        seen.add(key);
        if (!stored.has(key)) plan.upload.push(it);
        else if (stored.get(key) !== it.sha256) plan.update.push(it);
        else plan.unchanged.push(it);
    }
    return plan;
}
