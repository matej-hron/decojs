/**
 * The page's single entry point to the dive log backend. Returns null when no
 * backend is configured, so the page keeps working without one.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createSupabaseStore } from './supabaseStore.js';

let cached = null;

/** @returns {Object|null} DiveStore, or null when the backend is not configured */
export function getDiveStore() {
    if (cached) return cached;
    const factory = globalThis.supabase?.createClient;
    if (!(SUPABASE_URL && SUPABASE_ANON_KEY && typeof factory === 'function')) return null;
    cached = createSupabaseStore(factory(SUPABASE_URL, SUPABASE_ANON_KEY));
    return cached;
}
