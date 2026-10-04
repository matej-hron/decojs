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

    // Rings follow their targets every frame, so growing panels stay outlined.
    function trackRings() {
        for (const { el, node, pad } of rings) {
            const b = el.getBoundingClientRect();
            Object.assign(node.style, {
                left: `${b.left - pad}px`, top: `${b.top - pad}px`,
                width: `${b.width + 2 * pad}px`, height: `${b.height + 2 * pad}px`,
            });
        }
        requestAnimationFrame(trackRings);
    }

    window.__video = {
        card(opts) {
            if (!opts) { card.classList.remove('on'); return; }
            card.querySelector('h1').textContent = opts.title ?? '';
            card.querySelector('p').textContent = opts.subtitle ?? '';
            card.querySelector('small').textContent = opts.footer ?? '';
            card.classList.add('on');
        },
        highlight(selectors, pad = 8) {
            for (const r of rings) {
                r.node.classList.remove('on');
                setTimeout(() => r.node.remove(), 400);
            }
            rings = [];
            for (const sel of [].concat(selectors ?? [])) {
                const el = document.querySelector(sel);
                if (!el) throw new Error(`highlight: no element for ${sel}`);
                const node = document.createElement('div');
                node.className = 'vid-ring';
                root.appendChild(node);
                rings.push({ el, node, pad });
            }
            requestAnimationFrame(() => rings.forEach((r) => r.node.classList.add('on')));
        },
        ripple,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
