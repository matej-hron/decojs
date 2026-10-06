// In-page overlay for video recordings: title cards, highlight rings and a visible
// cursor (headless Chromium does not paint the real one). Captions are burned in by
// ffmpeg below the page, so they never cover content.
// Injected with context.addInitScript(); driven from make-video.mjs via window.__video.
// Mounted on <html>, outside <body>, so a zoomed body does not skew the coordinates.
(() => {
    const css = `
    #vid-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: 'Inter', system-ui, sans-serif; }
    #vid-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 18px; background: linear-gradient(135deg, #1a4a6e 0%, #2980b9 100%); color: #fff; text-align: center;
        opacity: 0; transition: opacity 0.6s ease; }
    #vid-card.on { opacity: 1; }
    #vid-card h1 { font-family: 'Fraunces', Georgia, serif; font-size: 84px; margin: 0; font-weight: 600; }
    #vid-card p { font-size: 34px; margin: 0; opacity: 0.9; max-width: 900px; }
    #vid-card small { position: absolute; bottom: 48px; font-size: 20px; letter-spacing: 0.08em; opacity: 0.75; }
    .vid-ring { position: fixed; border: 4px solid #f39c12; border-radius: 12px; box-shadow: 0 0 0 6px rgba(243, 156, 18, 0.25);
        opacity: 0; transition: opacity 0.3s ease; }
    .vid-ring.on { opacity: 1; }
    #vid-cursor { position: fixed; left: 0; top: 0; width: 28px; height: 28px; transform: translate(-3px, -2px); opacity: 0;
        transition: opacity 0.3s ease; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
    #vid-cursor.on { opacity: 1; }
    .vid-ripple { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        border: 3px solid #f39c12; animation: vid-ripple 0.5s ease-out forwards; }
    @keyframes vid-ripple { from { transform: scale(0.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
    `;

    let root, card, cursor;
    let rings = [];

    function mount() {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        root = document.createElement('div');
        root.id = 'vid-root';
        root.innerHTML = `
            <div id="vid-card"><h1></h1><p></p><small></small></div>
            <svg id="vid-cursor" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.9L20.5 10z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
        document.documentElement.appendChild(root);
        card = root.querySelector('#vid-card');
        cursor = root.querySelector('#vid-cursor');
        document.addEventListener('mousemove', (e) => {
            cursor.style.left = `${e.clientX}px`;
            cursor.style.top = `${e.clientY}px`;
            cursor.classList.add('on');
        }, true);
        document.addEventListener('mousedown', (e) => ripple(e.clientX, e.clientY), true);
        requestAnimationFrame(trackRings);
    }

    function ripple(x, y) {
        const r = document.createElement('div');
        r.className = 'vid-ripple';
        r.style.left = `${x}px`;
        r.style.top = `${y}px`;
        root.appendChild(r);
        setTimeout(() => r.remove(), 600);
    }

    // Element rings follow their targets every frame, so growing panels stay outlined.
    // A ring has `els` (one element, or several for a union ring: their bounding box)
    // or a fixed viewport `rect` (canvas features, which have no element to track).
    function place(node, b, pad) {
        Object.assign(node.style, {
            left: `${b.left - pad}px`, top: `${b.top - pad}px`,
            width: `${b.width + 2 * pad}px`, height: `${b.height + 2 * pad}px`,
        });
    }

    function trackRings() {
        for (const { els, node, pad } of rings) {
            if (!els) continue;
            const bs = els.map((el) => el.getBoundingClientRect());
            const left = Math.min(...bs.map((b) => b.left));
            const top = Math.min(...bs.map((b) => b.top));
            place(node, {
                left, top,
                width: Math.max(...bs.map((b) => b.right)) - left,
                height: Math.max(...bs.map((b) => b.bottom)) - top,
            }, pad);
        }
        requestAnimationFrame(trackRings);
    }

    function clearRings() {
        for (const r of rings) {
            r.node.classList.remove('on');
            setTimeout(() => r.node.remove(), 400);
        }
        rings = [];
    }

    function addRing(ring, round = false) {
        const node = document.createElement('div');
        node.className = 'vid-ring';
        if (round) node.style.borderRadius = '50%';
        root.appendChild(node);
        rings.push({ ...ring, node });
        return node;
    }

    const showRings = () => requestAnimationFrame(() => rings.forEach((r) => r.node.classList.add('on')));

    window.__video = {
        card(opts) {
            if (!opts) { card.classList.remove('on'); return; }
            card.querySelector('h1').textContent = opts.title ?? '';
            card.querySelector('p').textContent = opts.subtitle ?? '';
            card.querySelector('small').textContent = opts.footer ?? '';
            card.classList.add('on');
        },
        /** Ring each selector's element (or, with `union`, one ring around all of them). */
        highlight(selectors, opts = {}) {
            const { pad = 8, union = false } = typeof opts === 'number' ? { pad: opts } : (opts ?? {});
            clearRings();
            const els = [].concat(selectors ?? []).map((sel) => {
                const el = document.querySelector(sel);
                if (!el) throw new Error(`highlight: no element for ${sel}`);
                return el;
            });
            if (union && els.length) addRing({ els, pad });
            else els.forEach((el) => addRing({ els: [el], pad }));
            showRings();
        },
        /** Ring fixed viewport rectangles ({left, top, width, height, round?}); `round` for points (per rect or for all). */
        ring(rects, opts = {}) {
            const { pad = 0, round = false } = opts ?? {};
            clearRings();
            for (const r of [].concat(rects ?? [])) {
                const node = addRing({ rect: r, pad }, r.round ?? round);
                place(node, r, pad);
            }
            showRings();
        },
        ripple,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
