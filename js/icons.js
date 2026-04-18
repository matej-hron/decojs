/**
 * Inline icon helper — returns an <svg> that references the shared sprite.
 *
 * Stroke follows `currentColor`, so icon color is set by the parent's
 * `color` CSS property. Sizing: use `em` units so icons scale with font size,
 * or a `.icon` utility class (in css/styles.css) for explicit dimensions.
 */

const SPRITE = 'icons/sprite.svg';

/**
 * Build the SVG markup for a sprite symbol.
 * Call sites that render via innerHTML should inline this string.
 *
 * @param {string} name       Symbol id inside the sprite (e.g. "flask")
 * @param {string} [cls=""]   Additional CSS classes
 * @param {string} [title=""] Accessible title; empty → aria-hidden
 * @returns {string} SVG markup
 */
export function iconHTML(name, cls = '', title = '') {
    const classes = ['icon', cls].filter(Boolean).join(' ');
    const a11y = title
        ? `role="img" aria-label="${title}"`
        : 'aria-hidden="true" focusable="false"';
    return `<svg class="${classes}" ${a11y}><use href="${SPRITE}#${name}"/></svg>`;
}

/**
 * Build an SVG element node for sprite symbol `name`.
 * Prefer this when appending to the DOM via element APIs.
 *
 * @param {string} name
 * @param {string} [cls]
 * @param {string} [title]
 * @returns {SVGSVGElement}
 */
export function iconElement(name, cls = '', title = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', ['icon', cls].filter(Boolean).join(' '));
    if (title) {
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', title);
    } else {
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
    }
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `${SPRITE}#${name}`);
    svg.appendChild(use);
    return svg;
}
