/**
 * Animace částic plynu v nádobě: částice letí rovně, odrážejí se od stěn a srážejí se mezi sebou.
 *
 * Vlastní náhrada GIFu z Wikimedia Commons (`images/gas-particles.gif`, Tlak slide 22), protože GIF nejde obarvit.
 * Slide 40 (Dalton, rozhodnutí 3) obarví asi každou pátou částici jako kyslík: pětina částic → pětina nárazů do stěn
 * → pětina tlaku. Bez obarvení (`oxygenEvery: 0`) jde stejný modul použít i na slidu 22.
 *
 *     <svg viewBox="0 0 600 420">…<g data-gas-particles data-oxygen-every="5"
 *         data-box="30 80 540 320"></g></svg>
 *
 * Kreslí do SVG, barvy jsou třídy `fig-o2` a `fig-n2` (proměnné scény Hladina). Nárazy do stěny krátce blikne
 * značka `fig-hit` v barvě částice. Když uživatel nechce pohyb (`prefers-reduced-motion`), částice stojí.
 * Animace běží, jen když je obrázek vidět.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Souřadnice do atributu SVG (ne zobrazené číslo): desetiny stačí. */
const coord = (v) => String(Math.round(v * 10) / 10);

/** @typedef {'o2'|'n2'} GasKind */
/** @typedef {{x: number, y: number, vx: number, vy: number, kind: GasKind}} Particle */
/** @typedef {{x: number, y: number, width: number, height: number}} Box */

/** Výchozí rozměry: 40 částic, z nich 8 kyslík (20 %, „asi pětina“, přesně je ho ve vzduchu 21 %). */
export const PARTICLE_DEFAULTS = Object.freeze({ count: 40, radius: 11, speed: 2.4, oxygenEvery: 0, seed: 7 });

/**
 * Deterministický generátor (mulberry32), aby se obrázek při každém načtení choval stejně a dal se testovat.
 * @param {number} seed
 * @returns {() => number} čísla v [0, 1)
 */
export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Částice v mřížce s náhodným posunem (nepřekrývají se) a se stejně velkou rychlostí v náhodném směru.
 * Každá `oxygenEvery`-tá je kyslík (0 = žádný).
 * @param {Box} box
 * @param {Partial<typeof PARTICLE_DEFAULTS>} [options]
 * @returns {Particle[]}
 */
export function createParticles(box, options = {}) {
    const { count, radius, speed, oxygenEvery, seed } = { ...PARTICLE_DEFAULTS, ...options };
    const rnd = seededRandom(seed);
    const cols = Math.ceil(Math.sqrt(count * box.width / box.height));
    const rows = Math.ceil(count / cols);
    const cw = box.width / cols;
    const ch = box.height / rows;
    const slack = Math.max(0, Math.min(cw, ch) / 2 - radius);
    const particles = [];
    for (let i = 0; i < count; i++) {
        const cx = box.x + cw * (i % cols + 0.5);
        const cy = box.y + ch * (Math.floor(i / cols) + 0.5);
        const angle = rnd() * 2 * Math.PI;
        particles.push({
            x: cx + (rnd() * 2 - 1) * slack,
            y: cy + (rnd() * 2 - 1) * slack,
            vx: speed * Math.cos(angle),
            vy: speed * Math.sin(angle),
            kind: oxygenEvery > 0 && i % oxygenEvery === oxygenEvery - 1 ? 'o2' : 'n2',
        });
    }
    return particles;
}

/**
 * Jeden krok: posun, pružné odrazy od stěn a srážky stejných částic (vymění si složku rychlosti ve směru srážky).
 * @param {Particle[]} particles mění se na místě
 * @param {Box} box
 * @param {number} radius
 * @param {number} [dt=1]
 * @returns {{kind: GasKind, x: number, y: number}[]} nárazy do stěn v tomto kroku
 */
export function stepParticles(particles, box, radius, dt = 1) {
    const hits = [];
    const left = box.x + radius;
    const right = box.x + box.width - radius;
    const top = box.y + radius;
    const bottom = box.y + box.height - radius;
    for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < left) { p.x = 2 * left - p.x; p.vx = -p.vx; hits.push({ kind: p.kind, x: box.x, y: p.y }); }
        else if (p.x > right) { p.x = 2 * right - p.x; p.vx = -p.vx; hits.push({ kind: p.kind, x: box.x + box.width, y: p.y }); }
        if (p.y < top) { p.y = 2 * top - p.y; p.vy = -p.vy; hits.push({ kind: p.kind, x: p.x, y: box.y }); }
        else if (p.y > bottom) { p.y = 2 * bottom - p.y; p.vy = -p.vy; hits.push({ kind: p.kind, x: p.x, y: box.y + box.height }); }
    }
    const min2 = (2 * radius) ** 2;
    for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min2 || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (approach <= 0) continue; // už se vzdalují
            a.vx -= approach * nx; a.vy -= approach * ny;
            b.vx += approach * nx; b.vy += approach * ny;
        }
    }
    return hits;
}

/**
 * Spustí animaci v prvku `<g data-gas-particles>` uvnitř SVG.
 * @param {SVGGElement} group
 * @param {Partial<typeof PARTICLE_DEFAULTS> & {box?: Box}} [options] jinak z `data-box` a `data-oxygen-every`
 * @returns {{stop: () => void, particles: Particle[]}}
 */
export function mountGasParticles(group, options = {}) {
    const [bx, by, bw, bh] = (group.dataset.box ?? '0 0 600 420').split(/\s+/).map(Number);
    const box = options.box ?? { x: bx, y: by, width: bw, height: bh };
    const oxygenEvery = options.oxygenEvery ?? Number(group.dataset.oxygenEvery ?? 0);
    const opts = { ...PARTICLE_DEFAULTS, ...options, oxygenEvery };
    const particles = createParticles(box, opts);
    const doc = group.ownerDocument;
    const circles = particles.map((p) => {
        const c = doc.createElementNS(SVG_NS, 'circle');
        c.setAttribute('r', String(opts.radius));
        c.setAttribute('class', p.kind === 'o2' ? 'fig-o2' : 'fig-n2');
        group.append(c);
        return c;
    });
    const flashes = Array.from({ length: 16 }, () => {
        const f = doc.createElementNS(SVG_NS, 'circle');
        f.setAttribute('r', String(opts.radius * 0.9));
        f.setAttribute('opacity', '0');
        group.prepend(f);
        return { el: f, life: 0 };
    });
    let nextFlash = 0;
    const draw = () => particles.forEach((p, i) => {
        circles[i].setAttribute('cx', coord(p.x));
        circles[i].setAttribute('cy', coord(p.y));
    });
    draw();

    const win = doc.defaultView;
    const still = win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still || !win?.requestAnimationFrame) return { stop: () => {}, particles };

    let visible = true;
    let frame = 0;
    let last = 0;
    const tick = (now) => {
        frame = 0;
        const dt = last ? Math.min((now - last) / (1000 / 60), 3) : 1;
        last = now;
        for (const hit of stepParticles(particles, box, opts.radius, dt)) {
            const f = flashes[nextFlash];
            nextFlash = (nextFlash + 1) % flashes.length;
            f.el.setAttribute('cx', coord(hit.x));
            f.el.setAttribute('cy', coord(hit.y));
            f.el.setAttribute('class', `fig-hit fig-hit-${hit.kind}`);
            f.life = 1;
        }
        for (const f of flashes) {
            if (f.life <= 0) continue;
            f.life = Math.max(0, f.life - 0.08 * dt);
            f.el.setAttribute('opacity', String(Math.round(f.life * 100) / 100));
        }
        draw();
        schedule();
    };
    const schedule = () => {
        if (!frame && visible && !doc.hidden) frame = win.requestAnimationFrame(tick);
    };
    const pause = () => { if (frame) win.cancelAnimationFrame(frame); frame = 0; last = 0; };
    const svg = group.ownerSVGElement ?? group;
    let observer = null;
    if (win.IntersectionObserver) {
        observer = new win.IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            if (visible) schedule(); else pause();
        });
        observer.observe(svg);
    }
    const onVisibility = () => (doc.hidden ? pause() : schedule());
    doc.addEventListener('visibilitychange', onVisibility);
    schedule();
    return {
        stop() {
            pause();
            observer?.disconnect();
            doc.removeEventListener('visibilitychange', onVisibility);
        },
        particles,
    };
}
