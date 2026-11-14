/**
 * GasPathway — animované schéma cesty dusíku: lahev → plicní sklípky → krev → tkáně, při sestupu (sycení)
 * a výstupu (vysycování). Jedna definice pro stránku Deco Theory `tissue-loading.html#gas-exchange`
 * a pro překryv v kurzu P1 (Henry, slide 45).
 *
 * Stránka Deco Theory: `renderGasPathway(host)` s výchozím překladačem (jazyk webu) a atributy `data-i18n`,
 * takže přepnutí jazyka text přeloží znovu; `refresh()` po přepnutí přepíše texty, které mění fáze.
 * Kurz: pevný překladač (`createTranslator('cs')`), `i18n: false` a `lang: 'cs'` pro desetinnou čárku.
 *
 * Schéma má pevná id (šipky odkazují na cesty přes `<mpath href="#arrow-path-1">`), na stránce smí být jednou.
 */

import { fmtNum } from '../format.js';
import { translate } from '../i18n.js';

const PRESSURE_STEP_COLORS = ['#78a8ce', '#91b5d2', '#aec9de', '#d0e1ed'];

/** Značky schématu (dřív přímo v tissue-loading.html). Texty s `data-i18n` přeloží `renderGasPathway`. */
const PATHWAY_MARKUP = `
    <div class="gas-pathway-controls">
        <button id="pathway-descent-btn" class="btn btn-small btn-active">⬇️ <span data-i18n="tissueLoading.gasExchange.descentBtn">Descent (On-gassing)</span></button>
        <button id="pathway-ascent-btn" class="btn btn-small">⬆️ <span data-i18n="tissueLoading.gasExchange.ascentBtn">Ascent (Off-gassing)</span></button>
    </div>

    <svg class="gas-pathway-svg" viewBox="0 0 700 220" aria-label="Gas exchange pathway diagram">
        <!-- Regulator -->
        <g class="pathway-stage" transform="translate(30, 60)">
            <rect x="0" y="0" width="100" height="80" rx="8" class="stage-box stage-regulator" />
            <text x="50" y="35" text-anchor="middle" class="stage-icon" style="font-size: 14px; font-weight: 600;" data-i18n="tissueLoading.gasExchange.svg.tank">TANK</text>
            <text x="50" y="55" text-anchor="middle" class="stage-label" data-i18n="tissueLoading.gasExchange.svg.breathingGas">Breathing Gas</text>
            <text x="50" y="72" text-anchor="middle" class="stage-value"><tspan font-style="italic">p</tspan>N₂ = <tspan id="reg-pressure">3,16</tspan></text>
        </g>

        <!-- Arrow 1: Regulator → Alveoli -->
        <g class="pathway-arrow" transform="translate(140, 90)">
            <path d="M 0 10 L 40 10" stroke="#2980b9" stroke-width="3" fill="none" class="arrow-line" />
            <polygon points="40,10 30,5 30,15" class="arrow-head arrow-head-right" />
            <polygon points="0,10 10,5 10,15" class="arrow-head arrow-head-left" style="display:none" />
            <path id="arrow-path-1" d="M 0 10 L 40 10" fill="none" stroke="none" />
            <path id="arrow-path-1-rev" d="M 40 10 L 0 10" fill="none" stroke="none" />
            <!-- Particles for descent -->
            <circle class="gas-particle particle-descent" r="4" fill="#3498db">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                    <mpath href="#arrow-path-1" />
                </animateMotion>
            </circle>
            <circle class="gas-particle particle-descent" r="4" fill="#3498db">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="0.5s">
                    <mpath href="#arrow-path-1" />
                </animateMotion>
            </circle>
            <!-- Particles for ascent (hidden initially) -->
            <circle class="gas-particle particle-ascent" r="4" fill="#3498db" style="display:none">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                    <mpath href="#arrow-path-1-rev" />
                </animateMotion>
            </circle>
            <circle class="gas-particle particle-ascent" r="4" fill="#3498db" style="display:none">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="0.5s">
                    <mpath href="#arrow-path-1-rev" />
                </animateMotion>
            </circle>
        </g>

        <!-- Lungs/Alveoli -->
        <g class="pathway-stage" transform="translate(190, 60)">
            <rect x="0" y="0" width="100" height="80" rx="8" class="stage-box stage-lungs" />
            <text x="50" y="30" text-anchor="middle" class="stage-icon">🫁</text>
            <text x="50" y="55" text-anchor="middle" class="stage-label" data-i18n="tissueLoading.gasExchange.svg.alveoli">Alveoli</text>
            <text x="50" y="72" text-anchor="middle" class="stage-value"><tspan font-style="italic">p</tspan>N₂ = <tspan id="alv-pressure">3,10</tspan></text>
        </g>

        <!-- Arrow 2: Alveoli → Blood -->
        <g class="pathway-arrow" transform="translate(300, 90)">
            <path d="M 0 10 L 40 10" stroke="#2980b9" stroke-width="3" fill="none" class="arrow-line" />
            <polygon points="40,10 30,5 30,15" class="arrow-head arrow-head-right" />
            <polygon points="0,10 10,5 10,15" class="arrow-head arrow-head-left" style="display:none" />
            <path id="arrow-path-2" d="M 0 10 L 40 10" fill="none" stroke="none" />
            <path id="arrow-path-2-rev" d="M 40 10 L 0 10" fill="none" stroke="none" />
            <circle class="gas-particle particle-descent" r="4" fill="#e74c3c">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="0.2s">
                    <mpath href="#arrow-path-2" />
                </animateMotion>
            </circle>
            <circle class="gas-particle particle-descent" r="4" fill="#e74c3c">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="0.7s">
                    <mpath href="#arrow-path-2" />
                </animateMotion>
            </circle>
            <circle class="gas-particle particle-ascent" r="4" fill="#3498db" style="display:none">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="0.2s">
                    <mpath href="#arrow-path-2-rev" />
                </animateMotion>
            </circle>
            <circle class="gas-particle particle-ascent" r="4" fill="#3498db" style="display:none">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="0.7s">
                    <mpath href="#arrow-path-2-rev" />
                </animateMotion>
            </circle>
        </g>

        <!-- Blood -->
        <g class="pathway-stage" transform="translate(350, 60)">
            <rect x="0" y="0" width="100" height="80" rx="8" class="stage-box stage-blood" />
            <text x="50" y="30" text-anchor="middle" class="stage-icon">💉</text>
            <text x="50" y="55" text-anchor="middle" class="stage-label" data-i18n="tissueLoading.gasExchange.svg.blood">Blood</text>
            <text x="50" y="72" text-anchor="middle" class="stage-value"><tspan font-style="italic">p</tspan>N₂ = <tspan id="blood-pressure">2,5</tspan></text>
        </g>

        <!-- Arrow 3: Blood → Tissues -->
        <g class="pathway-arrow" transform="translate(460, 90)">
            <path d="M 0 10 L 40 10" stroke="#2980b9" stroke-width="3" fill="none" class="arrow-line" />
            <polygon points="40,10 30,5 30,15" class="arrow-head arrow-head-right" />
            <polygon points="0,10 10,5 10,15" class="arrow-head arrow-head-left" style="display:none" />
            <path id="arrow-path-3" d="M 0 10 L 40 10" fill="none" stroke="none" />
            <path id="arrow-path-3-rev" d="M 40 10 L 0 10" fill="none" stroke="none" />
            <circle class="gas-particle particle-descent" r="4" fill="#27ae60">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="0.4s">
                    <mpath href="#arrow-path-3" />
                </animateMotion>
            </circle>
            <circle class="gas-particle particle-descent" r="4" fill="#27ae60">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="1.1s">
                    <mpath href="#arrow-path-3" />
                </animateMotion>
            </circle>
            <circle class="gas-particle particle-ascent" r="4" fill="#3498db" style="display:none">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="0.4s">
                    <mpath href="#arrow-path-3-rev" />
                </animateMotion>
            </circle>
            <circle class="gas-particle particle-ascent" r="4" fill="#3498db" style="display:none">
                <animateMotion dur="1.5s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear" begin="1.1s">
                    <mpath href="#arrow-path-3-rev" />
                </animateMotion>
            </circle>
        </g>

        <!-- Tissues -->
        <g class="pathway-stage" transform="translate(500, 40)">
            <rect x="0" y="0" width="198" height="120" rx="8" class="stage-box stage-tissues" />
            <text x="99" y="25" text-anchor="middle" class="stage-label" style="font-weight: 600;" data-i18n="tissueLoading.gasExchange.svg.tissues">Tissues</text>
            <g transform="translate(10, 32)">
                <text x="0" y="16" class="tissue-label" data-i18n="tissueLoading.gasExchange.svg.fast">🧠 Fast</text>
                <rect x="74" y="0" width="110" height="24" rx="4" fill="#ecf0f1" />
                <rect x="74" y="0" width="28" height="24" rx="4" class="tissue-fill tissue-fast" />
            </g>
            <g transform="translate(10, 60)">
                <text x="0" y="16" class="tissue-label" data-i18n="tissueLoading.gasExchange.svg.medium">💪 Med</text>
                <rect x="74" y="0" width="110" height="24" rx="4" fill="#ecf0f1" />
                <rect x="74" y="0" width="14" height="24" rx="4" class="tissue-fill tissue-medium" />
            </g>
            <g transform="translate(10, 88)">
                <text x="0" y="16" class="tissue-label" data-i18n="tissueLoading.gasExchange.svg.slow">🦴 Slow</text>
                <rect x="74" y="0" width="110" height="24" rx="4" fill="#ecf0f1" />
                <rect x="74" y="0" width="7" height="24" rx="4" class="tissue-fill tissue-slow" />
            </g>
        </g>

        <!-- Discrete pressure levels along the pathway -->
        <g transform="translate(30, 174)">
            <text x="0" y="15" class="legend-text" data-i18n="tissueLoading.gasExchange.svg.pressureLabel">Pressure:</text>
            <text x="120" y="15" text-anchor="end" class="legend-text legend-pressure-start" style="font-weight: 600;" data-i18n="tissueLoading.gasExchange.svg.high">HIGH</text>
            <rect x="132" y="0" width="22" height="18" rx="3" class="pressure-step pressure-step-1" />
            <rect x="158" y="0" width="22" height="18" rx="3" class="pressure-step pressure-step-2" />
            <rect x="184" y="0" width="22" height="18" rx="3" class="pressure-step pressure-step-3" />
            <rect x="210" y="0" width="22" height="18" rx="3" class="pressure-step pressure-step-4" />
            <text x="244" y="15" class="legend-text legend-pressure-end" style="font-weight: 600;" data-i18n="tissueLoading.gasExchange.svg.low">LOW</text>
        </g>
        <g transform="translate(30, 201)">
            <text x="0" y="12" class="legend-text legend-direction" id="flow-direction" data-i18n="tissueLoading.gasExchange.svg.flowDirection">→ Gas flows from HIGH to LOW pressure</text>
        </g>
    </svg>

`;

/**
 * Vykreslí ovládání a schéma do prvku.
 * @param {HTMLElement} host prvek, dostane třídu `gas-pathway-container`
 * @param {{t?: (key: string, fallback?: string) => string, i18n?: boolean}} [options]
 */
export function renderGasPathway(host, { t = translate, i18n = true } = {}) {
    host.classList.add('gas-pathway-container');
    host.innerHTML = PATHWAY_MARKUP.replace(
        /\sdata-i18n="([^"]+)"([^>]*)>([^<]*)</g,
        (_, key, rest, fallback) => `${i18n ? ` data-i18n="${key}"` : ''}${rest}>${t(key, fallback)}<`,
    );
}

/** Ovládání schématu: přepínání sestup / výstup, čísla, šipky, částice a sloupce tkání. */
export class GasPathway {
    /**
     * @param {HTMLElement} host prvek se schématem (viz `renderGasPathway`)
     * @param {{t?: (key: string, fallback?: string) => string, lang?: string}} [options]
     */
    constructor(host, options = {}) {
        this.host = host;
        this.tr = options.t ?? translate;
        this.lang = options.lang;
        this.svg = host.querySelector('.gas-pathway-svg');
        this.descentBtn = host.querySelector('#pathway-descent-btn');
        this.ascentBtn = host.querySelector('#pathway-ascent-btn');
        this.phase = 'descent';
        this.descentBtn.addEventListener('click', () => this.setPhase('descent'));
        this.ascentBtn.addEventListener('click', () => this.setPhase('ascent'));
        this._update();
    }

    /** @param {'descent'|'ascent'} phase */
    setPhase(phase) {
        if (phase === this.phase) return;
        this.phase = phase;
        this.descentBtn.classList.toggle('btn-active', phase === 'descent');
        this.ascentBtn.classList.toggle('btn-active', phase === 'ascent');
        this._update();
    }

    /** Přepíše texty a čísla aktuální fáze (po přepnutí jazyka webu). */
    refresh() {
        this._update();
    }

    _num(value, decimals) {
        return fmtNum(value, decimals, this.lang);
    }

    _update() {
        const { svg, host, phase } = this;
        const tr = this.tr;
        const arrowLines = svg.querySelectorAll('.arrow-line');
        const arrowHeadsRight = svg.querySelectorAll('.arrow-head-right');
        const arrowHeadsLeft = svg.querySelectorAll('.arrow-head-left');
        const particlesDescent = svg.querySelectorAll('.particle-descent');
        const particlesAscent = svg.querySelectorAll('.particle-ascent');
        const legendStart = svg.querySelector('.legend-pressure-start');
        const legendEnd = svg.querySelector('.legend-pressure-end');
        const flowDirection = host.querySelector('#flow-direction');
        const regPressure = host.querySelector('#reg-pressure');
        const alvPressure = host.querySelector('#alv-pressure');
        const bloodPressure = host.querySelector('#blood-pressure');
        const tissueFast = svg.querySelector('.tissue-fast');
        const tissueMedium = svg.querySelector('.tissue-medium');
        const tissueSlow = svg.querySelector('.tissue-slow');

        if (phase === 'descent') {
            // Descent: on-gassing, flow left → right
            applyPressureSteps(svg, PRESSURE_STEP_COLORS);
            if (legendStart) legendStart.textContent = tr('tissueLoading.gasExchange.svg.high', 'HIGH');
            if (legendEnd) legendEnd.textContent = tr('tissueLoading.gasExchange.svg.low', 'LOW');
            arrowLines.forEach(line => line.style.stroke = '#2980b9');
            arrowHeadsRight.forEach(h => { h.style.display = ''; h.style.fill = '#2980b9'; });
            arrowHeadsLeft.forEach(h => h.style.display = 'none');
            particlesDescent.forEach(p => p.style.display = '');
            particlesAscent.forEach(p => p.style.display = 'none');
            if (regPressure) regPressure.textContent = this._num(3.16, 2);
            if (alvPressure) alvPressure.textContent = this._num(3.10, 2);
            if (bloodPressure) bloodPressure.textContent = this._num(2.5, 1);
            if (flowDirection) {
                flowDirection.textContent = tr('tissueLoading.gasExchange.svg.flowDirection', '→ Gas flows from HIGH to LOW pressure');
            }
            animateTissueBars('descent', tissueFast, tissueMedium, tissueSlow);
        } else {
            // Ascent: off-gassing, flow right → left (tissues are now HIGH)
            applyPressureSteps(svg, [...PRESSURE_STEP_COLORS].reverse());
            if (legendStart) legendStart.textContent = tr('tissueLoading.gasExchange.svg.low', 'LOW');
            if (legendEnd) legendEnd.textContent = tr('tissueLoading.gasExchange.svg.high', 'HIGH');
            arrowLines.forEach(line => line.style.stroke = '#2980b9');
            arrowHeadsRight.forEach(h => h.style.display = 'none');
            arrowHeadsLeft.forEach(h => { h.style.display = ''; h.style.fill = '#2980b9'; });
            particlesDescent.forEach(p => p.style.display = 'none');
            particlesAscent.forEach(p => p.style.display = '');
            // tissues now higher than ambient
            if (regPressure) regPressure.textContent = this._num(0.79, 2);
            if (alvPressure) alvPressure.textContent = this._num(0.74, 2);
            if (bloodPressure) bloodPressure.textContent = this._num(1.2, 1);
            if (flowDirection) {
                flowDirection.textContent = tr(
                    'tissueLoading.gasExchange.svg.flowDirectionAscent',
                    '← Gas flows from HIGH to LOW pressure (tissues supersaturated)',
                );
            }
            animateTissueBars('ascent', tissueFast, tissueMedium, tissueSlow);
        }
    }
}

function applyPressureSteps(svg, colors) {
    const stages = [
        svg.querySelector('.stage-regulator'),
        svg.querySelector('.stage-lungs'),
        svg.querySelector('.stage-blood'),
        svg.querySelector('.stage-tissues'),
    ];
    stages.forEach((stage, index) => {
        if (stage) stage.style.fill = colors[index];
    });
    svg.querySelectorAll('.pressure-step').forEach((step, index) => {
        step.style.fill = colors[index];
    });
}

function animateTissueBars(phase, fast, medium, slow) {
    if (!fast || !medium || !slow) return;
    fast.style.fill = '#3498db';
    medium.style.fill = '#9b59b6';
    slow.style.fill = '#e67e22';
    // Start state, then animate at different speeds: fast tissue quick, slow tissue slow.
    const [from, to] = phase === 'descent'
        ? [['14', '14', '14'], ['96', '69', '41']]   // surface saturation → filling
        : [['96', '96', '96'], ['14', '55', '83']];  // saturated at depth → emptying
    [fast, medium, slow].forEach((bar, i) => {
        bar.style.transition = 'none';
        bar.setAttribute('width', from[i]);
    });
    fast.getBoundingClientRect(); // force reflow
    setTimeout(() => {
        fast.style.transition = 'width 0.8s ease-out';
        medium.style.transition = 'width 2s ease-out';
        slow.style.transition = 'width 4s ease-out';
        [fast, medium, slow].forEach((bar, i) => bar.setAttribute('width', to[i]));
    }, 50);
}
