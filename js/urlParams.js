/**
 * URL Parameter Utilities for Dive Setup Sharing
 * 
 * Enables encoding dive setups into URL parameters for sharing
 * and linking from theory pages to sandbox.
 * 
 * Usage:
 *   import { encodeDiveSetup, decodeDiveSetup, getSandboxUrl } from './urlParams.js';
 *   
 *   // Encode a setup for URL
 *   const encoded = encodeDiveSetup(mySetup);
 *   
 *   // Decode from URL parameter
 *   const setup = decodeDiveSetup(urlSearchParams.get('profile'));
 *   
 *   // Get full sandbox URL
 *   const url = getSandboxUrl(mySetup);
 */

/**
 * Encode a dive setup object into a URL-safe string
 * Uses base64 encoding of JSON. If the result is too long,
 * we could add compression in the future.
 * 
 * @param {Object} diveSetup - The dive setup to encode
 * @returns {string} URL-safe encoded string
 */
export function encodeDiveSetup(diveSetup) {
    if (!diveSetup) return '';
    
    try {
        // Create a minimal copy without unnecessary properties
        const minimal = {
            id: diveSetup.id,
            name: diveSetup.name,
            gases: diveSetup.gases,
            gfLow: diveSetup.gfLow,
            gfHigh: diveSetup.gfHigh,
            dives: diveSetup.dives
        };
        
        // Only include optional properties if they have meaningful values
        if (diveSetup.description) minimal.description = diveSetup.description;
        if (diveSetup.surfaceInterval) minimal.surfaceInterval = diveSetup.surfaceInterval;
        
        const json = JSON.stringify(minimal);
        
        // Use base64 encoding (URL-safe variant)
        const base64 = btoa(unescape(encodeURIComponent(json)));
        
        // Make URL-safe: replace + with -, / with _, remove padding =
        const urlSafe = base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        
        return urlSafe;
    } catch (error) {
        console.error('Failed to encode dive setup:', error);
        return '';
    }
}

/**
 * Decode a URL parameter string back into a dive setup object
 * 
 * @param {string} encoded - The encoded string from URL
 * @returns {Object|null} Decoded dive setup, or null if invalid
 */
export function decodeDiveSetup(encoded) {
    if (!encoded) return null;
    
    try {
        // Restore base64 padding and special chars
        let base64 = encoded
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        
        // Add back padding if needed
        const padding = (4 - (base64.length % 4)) % 4;
        base64 += '='.repeat(padding);
        
        // Decode base64 to JSON
        const json = decodeURIComponent(escape(atob(base64)));
        const setup = JSON.parse(json);
        
        // Basic validation
        if (!setup.gases || !setup.dives) {
            console.warn('Invalid dive setup: missing required fields');
            return null;
        }
        
        return setup;
    } catch (error) {
        console.error('Failed to decode dive setup:', error);
        return null;
    }
}

/**
 * Generate a full sandbox URL with the dive setup encoded
 * 
 * @param {Object} diveSetup - The dive setup to link to
 * @param {string} [baseUrl] - Optional base URL (defaults to relative path)
 * @returns {string} Full URL to sandbox with profile parameter
 */
export function getSandboxUrl(diveSetup, baseUrl = null) {
    const encoded = encodeDiveSetup(diveSetup);
    if (!encoded) return baseUrl || 'sandbox/';
    
    // Determine base URL
    // If we're in the root, use 'sandbox/', if we're in a subdirectory, use '../sandbox/'
    const base = baseUrl || (window.location.pathname.includes('/sandbox') 
        ? './' 
        : 'sandbox/');
    
    return `${base}?profile=${encoded}`;
}

/**
 * Get the encoded profile from current URL if present
 * 
 * @returns {Object|null} Decoded dive setup from URL, or null if not present
 */
export function getProfileFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('profile');
    return decodeDiveSetup(encoded);
}

/**
 * Update the current URL with a new profile without reloading
 * Useful for updating the URL as the user edits in sandbox
 * 
 * @param {Object} diveSetup - The dive setup to encode into URL
 */
export function updateUrlWithProfile(diveSetup) {
    const encoded = encodeDiveSetup(diveSetup);
    if (!encoded) return;
    
    const url = new URL(window.location);
    url.searchParams.set('profile', encoded);
    
    // Use replaceState to update URL without adding to history
    window.history.replaceState({}, '', url);
}
