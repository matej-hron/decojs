/**
 * The page's single entry point to the dive log backend. Returns null when no
 * backend is configured, so the page keeps working without one.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createSupabaseStore } from './supabaseStore.js';

let cached = null;

/**
 * @param {{url?: string, key?: string, factory?: Function}} [options] - Overrides (tests); default to the config and the Supabase script
 * @returns {Object|null} DiveStore, or null when the backend is not configured
 */
export function getDiveStore(options = {}) {
    const isDefault = Object.keys(options).length === 0;
    if (isDefault && cached) return cached;
    const { url = SUPABASE_URL, key = SUPABASE_ANON_KEY, factory = globalThis.supabase?.createClient } = options;
    if (!(url && key && typeof factory === 'function')) return null;
    const store = createSupabaseStore(factory(url, key));
    if (isDefault) cached = store;
    return store;
}
