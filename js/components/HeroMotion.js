// Animated dive-profile graphic for the landing hero.
// Draws the profile once on mount via stroke-dashoffset, fades in its fill,
// then stays frozen. Respects prefers-reduced-motion.

const SVG_NS = 'http://www.w3.org/2000/svg';

const PROFILE_D =
    'M 0 40 L 90 40 L 240 300 L 700 300 L 850 85 L 1000 85 L 1100 40 L 1200 40';
const FILL_D = `${PROFILE_D} L 1200 400 L 0 400 Z`;

function buildSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1200 400');
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
            <line x1="0" y1="40"  x2="1200" y2="40" />
            <line x1="0" y1="130" x2="1200" y2="130" stroke-dasharray="2 6"/>
            <line x1="0" y1="215" x2="1200" y2="215" stroke-dasharray="2 6"/>
            <line x1="0" y1="300" x2="1200" y2="300" stroke-dasharray="2 6"/>
            <line x1="200"  y1="0" x2="200"  y2="400" stroke-dasharray="2 6"/>
            <line x1="400"  y1="0" x2="400"  y2="400" stroke-dasharray="2 6"/>
            <line x1="600"  y1="0" x2="600"  y2="400" stroke-dasharray="2 6"/>
            <line x1="800"  y1="0" x2="800"  y2="400" stroke-dasharray="2 6"/>
            <line x1="1000" y1="0" x2="1000" y2="400" stroke-dasharray="2 6"/>
        </g>
        <g class="hero-axis">
            <text x="14"   y="55"  class="hero-axis-label">0m</text>
            <text x="14"   y="220" class="hero-axis-label">15m</text>
            <text x="14"   y="315" class="hero-axis-label">30m</text>
            <text x="1186" y="390" class="hero-axis-label" text-anchor="end">time →</text>
        </g>
        <path class="hero-fill" d="${FILL_D}" fill="url(#hero-depth-fill)"/>
        <path class="hero-line" d="${PROFILE_D}" fill="none"
              stroke-linejoin="round" stroke-linecap="round"/>
        <circle class="hero-dot" cx="1200" cy="40" r="4"/>
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
