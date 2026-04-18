/**
 * Sticky TOC + scroll-spy + reading-progress bar for theory pages.
 *
 * On screens >= 1024px, promotes <nav class="toc"> into a sticky left
 * column by adding `.with-sticky-toc` to <main> (CSS handles the grid).
 * On smaller screens the TOC stays in its original in-flow position.
 *
 * Scroll-spy keeps a `.active` class on the TOC link pointing to the
 * section currently at the top of the reading area.
 *
 * Usage from a theory page:
 *   import { initStickyTOC } from './js/components/StickyTOC.js';
 *   initStickyTOC();
 */

const STICKY_BREAKPOINT = '(min-width: 1024px)';
const NAV_OFFSET_PX = 72;

/**
 * @param {Object} [options]
 * @param {HTMLElement} [options.main]   Main element to scope to. Defaults to <main>.
 * @param {HTMLElement} [options.toc]    TOC element. Defaults to .toc inside main.
 * @param {boolean}     [options.progress=true]  Whether to install the reading-progress bar.
 */
export function initStickyTOC(options = {}) {
    const main = options.main || document.querySelector('main');
    if (!main) return;
    const toc = options.toc || main.querySelector('.toc');
    if (!toc) return;

    const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
    const sections = links
        .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
        .filter(Boolean);
    if (sections.length === 0) return;

    applyLayout(main);
    installScrollSpy(links, sections);
    installSmoothScroll(links);
    if (options.progress !== false) installProgressBar(main);
}

function applyLayout(main) {
    const mq = window.matchMedia(STICKY_BREAKPOINT);
    const toggle = () => {
        main.classList.toggle('with-sticky-toc', mq.matches);
    };
    toggle();
    if (mq.addEventListener) mq.addEventListener('change', toggle);
    else mq.addListener(toggle);
}

function installScrollSpy(links, sections) {
    const linkById = new Map();
    links.forEach((a) => {
        const id = a.getAttribute('href').slice(1);
        if (id) linkById.set(id, a);
    });

    const visible = new Set();
    const setActive = () => {
        let activeId = null;
        let bestTop = Infinity;
        visible.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const top = el.getBoundingClientRect().top;
            if (top < bestTop) {
                bestTop = top;
                activeId = id;
            }
        });
        if (!activeId) {
            // Fallback: section that just scrolled off the top.
            let bestAbove = -Infinity;
            sections.forEach((s) => {
                const t = s.getBoundingClientRect().top;
                if (t < NAV_OFFSET_PX && t > bestAbove) {
                    bestAbove = t;
                    activeId = s.id;
                }
            });
        }
        links.forEach((a) => a.classList.remove('active'));
        if (activeId && linkById.has(activeId)) {
            linkById.get(activeId).classList.add('active');
        }
    };

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) visible.add(e.target.id);
                else visible.delete(e.target.id);
            });
            setActive();
        },
        {
            rootMargin: `-${NAV_OFFSET_PX + 8}px 0px -55% 0px`,
            threshold: [0, 0.1, 0.5, 1.0],
        }
    );
    sections.forEach((s) => observer.observe(s));
}

function installSmoothScroll(links) {
    links.forEach((a) => {
        a.addEventListener('click', (ev) => {
            const href = a.getAttribute('href');
            if (!href || !href.startsWith('#')) return;
            const target = document.getElementById(href.slice(1));
            if (!target) return;
            ev.preventDefault();
            const top =
                target.getBoundingClientRect().top +
                window.scrollY -
                NAV_OFFSET_PX;
            window.scrollTo({ top, behavior: 'smooth' });
            history.replaceState(null, '', href);
        });
    });
}

function installProgressBar(main) {
    const bar = document.createElement('div');
    bar.className = 'reading-progress';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('div');
    bar.appendChild(fill);
    document.body.appendChild(bar);

    let ticking = false;
    const update = () => {
        ticking = false;
        const rect = main.getBoundingClientRect();
        const readable = main.offsetHeight - window.innerHeight * 0.5;
        const scrolled = Math.max(0, -rect.top + window.innerHeight * 0.1);
        const pct = readable > 0 ? (scrolled / readable) * 100 : 0;
        fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    };
    const schedule = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
}
