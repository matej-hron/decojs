/**
 * Tap an uploaded avatar → enlarged picture. One delegated listener serves every view: avatars rendered with
 * `avatarHtml({ zoom: true })` carry `data-zoom` (only when a photo exists; presets are SVG and never zoom).
 * Reuses the photo viewer's `.lb-viewer` look. Closes on backdrop / ✕ / Escape / back gesture.
 */

import { translate } from '../i18n.js';
import { escHtml } from '../utils/escHtml.js';

let installed = false;
let open = null; // { el, opener, pushed }

const label = (key, fallback) => translate(key, fallback);

/** Close the lightbox; `fromPop` when the browser already went back. */
function close(fromPop = false) {
    if (!open) return;
    const { el, opener, pushed } = open;
    open = null;
    el.remove();
    if (pushed && !fromPop) history.back();
    if (opener?.isConnected) opener.focus?.({ preventScroll: true });
}

/** Show the viewer for an avatar photo. @param {string} src @param {string} name @param {Element|null} [opener] */
export function openAvatarLightbox(src, name, opener = null) {
    if (!src) return;
    close();
    const v = document.createElement('div');
    v.className = 'lb-viewer lb-viewer-av';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-label', name || label('diveLog.trail.avatarEnlarged', 'Profile picture'));
    v.innerHTML = `<img src="${escHtml(src)}" alt="${escHtml(name)}">
        <button type="button" class="lb-viewer-x" aria-label="${escHtml(label('diveLog.logbook.detail.close', 'Close'))}">×</button>`;
    v.addEventListener('click', e => { if (e.target.tagName !== 'IMG') close(); });
    // Focus trap: the ✕ is the only control.
    v.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); v.querySelector('.lb-viewer-x').focus(); } });
    v.querySelector('img').addEventListener('error', () => close());
    document.body.appendChild(v);
    let pushed = false;
    try { history.pushState({ avatarZoom: true }, ''); pushed = true; } catch { /* no history: other ways to close remain */ }
    open = { el: v, opener, pushed };
    v.querySelector('.lb-viewer-x').focus();
}

/** Wire the page once: delegated click on `[data-zoom]` avatars, Escape and the back gesture. Idempotent. */
export function installAvatarLightbox() {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    // Capture phase: an avatar inside a member link zooms instead of navigating.
    document.addEventListener('click', e => {
        const box = e.target.closest?.('.tr-avatar[data-zoom]') ?? e.target.closest?.('.tr-av-zoom')?.querySelector('.tr-avatar[data-zoom]');
        const img = box?.querySelector('img');
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        const name = box.getAttribute('aria-label') ?? '';
        openAvatarLightbox(img.currentSrc || img.src, name, box.closest('button') ?? box);
    }, true);
    document.addEventListener('keydown', e => { if (open && e.key === 'Escape') close(); });
    window.addEventListener('popstate', () => close(true));
}
