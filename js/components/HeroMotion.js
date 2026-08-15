// Animated dive-profile graphic for the landing hero.
// Draws the profile once on mount via stroke-dashoffset, fades in its fill,
// then stays frozen. Respects prefers-reduced-motion.

const SVG_NS = 'http://www.w3.org/2000/svg';

// SVG is a 1200x200 strip anchored to the bottom of the hero so the
// title area above stays clear. y=20 = surface, y=160 = 30m.
const PROFILE_D =
    'M 0 20 L 90 20 L 240 160 L 700 160 L 850 47 L 1000 47 L 1100 20 L 1200 20';
// Pozor: v path `d` musí být obyčejné mezery. Nedělitelnou mezeru SVG parser
// odmítne („Expected path command") a výplň se nevykreslí.
const FILL_D = `${PROFILE_D} L 1200 200 L 0 200 Z`;

function buildSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1200 200');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('hero-motion-svg');

    svg.innerHTML = `
        <defs>
            <linearGradient id="hero-depth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgba(255,255,255,0.26)"/>
                <stop offset="55%" stop-color="rgba(255,255,255,0.10)"/>
                <stop offset="100%" stop-color="rgba(255,255,255,0.00)"/>
            </linearGradient>
        </defs>
        <g class="hero-grid">
            <line x1="0" y1="20"  x2="1200" y2="20"/>
            <line x1="0" y1="90"  x2="1200" y2="90"  stroke-dasharray="2 6"/>
            <line x1="0" y1="160" x2="1200" y2="160" stroke-dasharray="2 6"/>
            <line x1="200"  y1="0" x2="200"  y2="200" stroke-dasharray="2 6"/>
            <line x1="400"  y1="0" x2="400"  y2="200" stroke-dasharray="2 6"/>
            <line x1="600"  y1="0" x2="600"  y2="200" stroke-dasharray="2 6"/>
            <line x1="800"  y1="0" x2="800"  y2="200" stroke-dasharray="2 6"/>
            <line x1="1000" y1="0" x2="1000" y2="200" stroke-dasharray="2 6"/>
        </g>
        <g class="hero-axis">
            <text x="14"   y="35"  class="hero-axis-label">0\u00a0m</text>
            <text x="14"   y="95"  class="hero-axis-label">15\u00a0m</text>
            <text x="14"   y="165" class="hero-axis-label">30\u00a0m</text>
            <text x="1186" y="193" class="hero-axis-label" text-anchor="end">time →</text>
        </g>
        <path class="hero-fill" d="${FILL_D}" fill="url(#hero-depth-fill)"/>
        <path class="hero-line" d="${PROFILE_D}" fill="none"
              stroke-linejoin="round" stroke-linecap="round"/>
        <circle class="hero-dot" cx="1200" cy="20" r="3"/>
    `;
    return svg;
}

function animate(svg) {
    const line = svg.querySelector('.hero-line');
    const fill = svg.querySelector('.hero-fill');
    const dot = svg.querySelector('.hero-dot');
    if (!line) return;

    const len = line.getTotalLength();
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len}`;
    if (fill) fill.style.opacity = '0';
    if (dot) dot.style.opacity = '0';

    // Force layout so the initial state paints before the transition begins.
    line.getBoundingClientRect();

    requestAnimationFrame(() => {
        line.style.transition =
            'stroke-dashoffset 1.9s cubic-bezier(0.22, 1, 0.36, 1)';
        line.style.strokeDashoffset = '0';
        if (fill) {
            fill.style.transition = 'opacity 1.4s ease 0.9s';
            fill.style.opacity = '1';
        }
        if (dot) {
            dot.style.transition = 'opacity 0.5s ease 1.8s';
            dot.style.opacity = '1';
        }
    });
}

export function mountHeroMotion(root) {
    if (!root || root.dataset.mounted === 'true') return;
    root.dataset.mounted = 'true';

    const svg = buildSvg();
    root.appendChild(svg);

    const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;
    if (!reduceMotion) animate(svg);
}

const autoRoot = document.getElementById('hero-motion');
if (autoRoot) mountHeroMotion(autoRoot);
