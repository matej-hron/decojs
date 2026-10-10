/**
 * Preset profile avatars for DecoTrail: 12 original flat SVGs.
 *
 * Each is a full circle in its own ocean tint with a bold white motif and at
 * most one dark accent (INK). Where white shapes overlap, a stroke in the
 * background tint "cuts" them apart, so silhouettes stay readable at 32 px.
 * No ids, gradients, external refs or scripts: many avatars can be inlined on
 * one page without collisions.
 */

import { escHtml } from '../utils/escHtml.js';

const W = '#fff';
const INK = '#0d2b3e';

const svg = (bg, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">` +
    `<circle cx="32" cy="32" r="32" fill="${bg}"/>${body}</svg>`;

/** key → [bg tint, label {en, cs, es}, motif(bg) → inner SVG] */
const DEFS = [
    ['reef-01', '#1d7f8f', { en: 'Diving mask', cs: 'Potápěčská maska', es: 'Máscara de buceo' }, bg =>
        `<rect x="5" y="27" width="54" height="6" rx="3" fill="${W}" opacity=".5"/>` +
        `<path d="M21 18h22a9 9 0 0 1 9 9v8a9 9 0 0 1-9 9h-6l-2.6-4.4a2.8 2.8 0 0 0-4.8 0L27 44h-6a9 9 0 0 1-9-9v-8a9 9 0 0 1 9-9z" fill="${W}" stroke="${bg}" stroke-width="2"/>` +
        `<path d="M22 23h8.5v15H23a5 5 0 0 1-5-5v-6a4 4 0 0 1 4-4zM33.5 23H42a4 4 0 0 1 4 4v6a5 5 0 0 1-5 5h-7.5z" fill="${INK}"/>` +
        `<path d="M21 27.5l3.5-2.5M36.5 27.5l3.5-2.5" stroke="${W}" stroke-width="2" stroke-linecap="round" opacity=".7"/>`],
    ['reef-02', '#2a5bc4', { en: 'Fin', cs: 'Ploutev', es: 'Aleta' }, () =>
        `<g transform="rotate(-24 32 32)">` +
        `<path d="M25.5 10h13a4 4 0 0 1 4 4v13l8 21.5a3 3 0 0 1-2.8 4H40l-8-5.5-8 5.5h-7.7a3 3 0 0 1-2.8-4l8-21.5V14a4 4 0 0 1 4-4z" fill="${W}"/>` +
        `<ellipse cx="32" cy="18.5" rx="5.5" ry="5" fill="${INK}"/>` +
        `<path d="M28 31l-3.5 16M36 31l3.5 16" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" opacity=".45"/></g>`],
    ['reef-03', '#e0675a', { en: 'Octopus', cs: 'Chobotnice', es: 'Pulpo' }, () =>
        `<path d="M21.5 34c-1.5 6-6 9-10.5 8.5M27 35c0 7-2.5 11.5-6 13.5M37 35c0 7 2.5 11.5 6 13.5M42.5 34c1.5 6 6 9 10.5 8.5" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M18 29a14 14 0 0 1 28 0v4.5a2.5 2.5 0 0 1-2.5 2.5h-23a2.5 2.5 0 0 1-2.5-2.5z" fill="${W}"/>` +
        `<circle cx="26.5" cy="27.5" r="3" fill="${INK}"/><circle cx="37.5" cy="27.5" r="3" fill="${INK}"/>`],
    ['reef-04', '#3c8c5b', { en: 'Sea turtle', cs: 'Mořská želva', es: 'Tortuga marina' }, bg =>
        `<ellipse cx="19" cy="24" rx="9" ry="3.8" transform="rotate(-35 19 24)" fill="${W}"/>` +
        `<ellipse cx="45" cy="24" rx="9" ry="3.8" transform="rotate(35 45 24)" fill="${W}"/>` +
        `<ellipse cx="22.5" cy="46" rx="5.5" ry="2.8" transform="rotate(40 22.5 46)" fill="${W}"/>` +
        `<ellipse cx="41.5" cy="46" rx="5.5" ry="2.8" transform="rotate(-40 41.5 46)" fill="${W}"/>` +
        `<circle cx="32" cy="14" r="5.5" fill="${W}"/>` +
        `<ellipse cx="32" cy="34" rx="12.5" ry="15" fill="${W}" stroke="${bg}" stroke-width="2.2"/>` +
        `<path d="M32 27l5.5 3.2v6.6L32 40l-5.5-3.2v-6.6z" fill="${INK}" opacity=".85"/>` +
        `<path d="M32 21v6M32 40v7M26.5 30.2l-6-3M37.5 30.2l6-3M26.5 36.8l-6 3M37.5 36.8l6 3" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>`],
    ['reef-05', '#2d3a86', { en: 'Manta ray', cs: 'Manta', es: 'Manta raya' }, () =>
        `<path d="M32 44v13" stroke="${W}" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M28.5 21c-2.5-2-3.6-4.6-2.6-8 2.4 1 3.8 3.4 4.4 6.6zM35.5 21c2.5-2 3.6-4.6 2.6-8-2.4 1-3.8 3.4-4.4 6.6z" fill="${W}"/>` +
        `<path d="M32 18.5c4 0 6 2.8 8 6 4.6 2 12.5 2.6 17 6.5-6.5 2.2-12.5 4.4-16.5 8.4-2.5 3-5.3 5.1-8.5 5.1s-6-2.1-8.5-5.1c-4-4-10-6.2-16.5-8.4 4.5-3.9 12.4-4.5 17-6.5 2-3.2 4-6 8-6z" fill="${W}"/>` +
        `<path d="M28 33.5h8M28.5 37h7" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>`],
    ['reef-06', '#c98a2e', { en: 'Seahorse', cs: 'Mořský koník', es: 'Caballito de mar' }, bg =>
        `<path d="M33.5 42c-.5 5.5-3.5 9.5-7.5 9.5-3 0-4.5-2.8-2.6-4.8 1.8-1.9 4.3-.6 3.6 1.6" fill="none" stroke="${W}" stroke-width="4" stroke-linecap="round"/>` +
        `<path d="M40.5 29l6.5 2.5-6 5z" fill="${W}"/>` +
        `<path d="M30 21.5c6.5-2.5 13 1.5 13 10 0 7-5 11.5-10 12.5-3.5-4-6.5-8.5-6.5-13.5 0-4 1.2-7.2 3.5-9z" fill="${W}"/>` +
        `<path d="M29.5 15.5h-8.5a2.2 2.2 0 0 0 0 4.4h8.5z" fill="${W}"/>` +
        `<path d="M31.5 11l2.5-4.5 2 5.5z" fill="${W}"/>` +
        `<circle cx="34" cy="18" r="6.8" fill="${W}" stroke="${bg}" stroke-width="1.6"/>` +
        `<circle cx="35" cy="17.2" r="2" fill="${INK}"/>` +
        `<path d="M31 29.5h5M31 33.5h5.5M32 37.5h4" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" opacity=".45"/>`],
    ['reef-07', '#8a5cb8', { en: 'Jellyfish', cs: 'Medúza', es: 'Medusa' }, () =>
        `<path d="M22 33c-2.5 5 2.5 9 0 15M28.5 34c-2.5 6 2.5 10 0 18M35.5 34c2.5 6-2.5 10 0 18M42 33c2.5 5-2.5 9 0 15" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M15.5 32a16.5 16 0 0 1 33 0q-4.1 3-8.25 0-4.1 3-8.25 0-4.1 3-8.25 0-4.1 3-8.25 0z" fill="${W}"/>` +
        `<circle cx="25.5" cy="26" r="2.6" fill="${INK}" opacity=".4"/><circle cx="32" cy="22.5" r="2.6" fill="${INK}" opacity=".4"/><circle cx="38.5" cy="26" r="2.6" fill="${INK}" opacity=".4"/>`],
    ['reef-08', '#0e98b0', { en: 'Reef fish', cs: 'Korálová rybka', es: 'Pez de arrecife' }, bg =>
        `<path d="M41 32l11-10.5v21z" fill="${W}"/>` +
        `<path d="M12 32c5.5-11 18-16 30-8.5 1.5 2.5 2 5.5 2 8.5s-.5 6-2 8.5c-12 7.5-24.5 2.5-30-8.5z" fill="${W}" stroke="${bg}" stroke-width="2"/>` +
        `<path d="M26 20.5c3.2 7.5 3.2 15.5 0 23h6c3-7.5 3-15.5 0-23z" fill="${INK}" opacity=".8"/>` +
        `<circle cx="19.5" cy="30" r="2.4" fill="${INK}"/>`],
    ['reef-09', '#c4577b', { en: 'Scallop shell', cs: 'Hřebenatka', es: 'Vieira' }, bg =>
        `<path d="M25 46h14l-2 7h-10z" fill="${W}"/>` +
        `<path d="M32 49L12.5 27C14.5 15.5 22.5 11 32 11s17.5 4.5 19.5 16z" fill="${W}" stroke="${bg}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M32 46L17.5 22M32 46l-7-30M32 46V13.5M32 46l7-30M32 46l14.5-24" stroke="${bg}" stroke-width="1.7" stroke-linecap="round"/>`],
    ['reef-10', '#1f4468', { en: 'Anchor', cs: 'Kotva', es: 'Ancla' }, () =>
        `<g fill="none" stroke="${W}" stroke-width="4" stroke-linecap="round">` +
        `<circle cx="32" cy="14.5" r="4.5"/><path d="M32 19v32M24 25.5h16M16.5 37c1.5 9 8 14 15.5 14s14-5 15.5-14"/></g>` +
        `<path d="M11.5 39.5l5-8.5 5 7.5zM42.5 38.5l5-7.5 5 8.5z" fill="${W}"/>`],
    ['reef-11', '#3a6f9e', { en: 'Whale tail', cs: 'Velrybí ocas', es: 'Cola de ballena' }, () =>
        `<path d="M29 48c-.5-6.5-1-11.5-4.5-15-4-4-9.5-4.5-13.5-10 6.5-.2 12.5 1.3 17 4.5 2 1.4 3.4 3.4 4 5.3.6-1.9 2-3.9 4-5.3 4.5-3.2 10.5-4.7 17-4.5-4 5.5-9.5 6-13.5 10-3.5 3.5-4 8.5-4.5 15z" fill="${W}"/>` +
        `<path d="M8 51q4-3 8 0t8 0 8 0 8 0 8 0 8 0" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M32 33.5v6" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>`],
    ['reef-12', '#12a597', { en: 'Bubbles', cs: 'Bubliny', es: 'Burbujas' }, () =>
        `<g fill="${W}" fill-opacity=".18" stroke="${W}" stroke-width="3.2">` +
        `<circle cx="27" cy="39" r="11"/><circle cx="42.5" cy="22.5" r="6.5"/><circle cx="24" cy="16.5" r="4"/><circle cx="45" cy="41.5" r="3.2"/></g>` +
        `<path d="M20.5 36a7 7 0 0 1 4.5-5M39.5 21a3.6 3.6 0 0 1 2.4-2.6" fill="none" stroke="${W}" stroke-width="2.4" stroke-linecap="round"/>`]
];

/** Preset keys, in display order. */
export const AVATAR_KEYS = Object.freeze(DEFS.map(d => d[0]));

/** key → {label: {en, cs, es}, svg} */
export const AVATARS = Object.freeze(Object.fromEntries(DEFS.map(([key, bg, label, motif]) =>
    [key, Object.freeze({ label: Object.freeze(label), svg: svg(bg, motif(bg)) })])));

/** Deterministic preset for a member without a choice: char-code sum of `id` mod 12. */
export function fallbackAvatarKey(id) {
    const s = String(id ?? '');
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return AVATAR_KEYS[sum % AVATAR_KEYS.length];
}

/**
 * Avatar markup: the uploaded photo when `url`, else the preset SVG (unknown
 * preset → deterministic fallback from `id`, else from `name`). Without a name the
 * accessible label is the preset's English label.
 * @param {{preset?: string, url?: string, name?: string, id?: string, size?: number, zoom?: boolean}} opts
 * `zoom` marks an uploaded photo as tappable (see avatarLightbox.js); presets never zoom.
 */
export function avatarHtml({ preset, url, name, id, size = 40, zoom = false } = {}) {
    const n = Number(size);
    const px = Number.isFinite(n) && n > 0 ? n : 40;
    const key = typeof preset === 'string' && Object.hasOwn(AVATARS, preset) ? preset : fallbackAvatarKey(id ?? name);
    const shown = typeof name === 'string' ? name.trim() : '';
    const label = escHtml(shown || AVATARS[key].label.en);
    const inner = url
        ? `<img src="${escHtml(url)}" alt="" loading="lazy" decoding="async">`
        : AVATARS[key].svg;
    // data-avatar: the preset an uploaded photo falls back to when it fails to load (see avatarImgFallback).
    const z = zoom && url ? ' data-zoom' : '';
    return `<span class="tr-avatar" style="--size:${px}px" role="img" aria-label="${label}" data-avatar="${key}"${z}>${inner}</span>`;
}

/**
 * Shared `error` handler (capture phase: image errors do not bubble) for views that render avatars:
 * an uploaded photo that fails to load (expired or forbidden signed URL) is swapped for the preset SVG.
 * @returns {string|null} the failed photo URL (so the view can forget it), else null when not an avatar photo
 */
export function avatarImgFallback(event) {
    const img = event?.target;
    if (img?.tagName !== 'IMG') return null;
    const box = img.parentElement;
    if (!box?.classList.contains('tr-avatar')) return null;
    const key = Object.hasOwn(AVATARS, box.dataset.avatar ?? '') ? box.dataset.avatar : AVATAR_KEYS[0];
    const failed = img.getAttribute('src');
    box.innerHTML = AVATARS[key].svg;
    return failed;
}
