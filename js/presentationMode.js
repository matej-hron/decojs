/**
 * Presentation Mode for Theory Pages
 *
 * Shows one <section> at a time with navigation controls.
 * Activate via toggle button or ?slides URL parameter.
 *
 * Usage:
 *   import { initPresentationMode } from './js/presentationMode.js';
 *   initPresentationMode(document.querySelector('main'));
 */

/** Theory pages with display titles for sidebar hierarchy */
const THEORY_PAGES = [
    { href: 'pressure.html', title: 'Pressure & Partial Pressure', titleCs: 'Tlak a parciální tlak' },
    { href: 'tissue-loading.html', title: 'Tissue Loading & Saturation', titleCs: 'Sycení tkání a saturace' },
    { href: 'm-values.html', title: 'M-Values', titleCs: 'M-hodnoty' },
    { href: 'gradient-factors.html', title: 'Gradient Factors', titleCs: 'Gradientní faktory' },
];

/**
 * Get the current page filename.
 * @returns {string} e.g. 'pressure.html'
 */
function getCurrentPage() {
    const path = window.location.pathname;
    return path.substring(path.lastIndexOf('/') + 1) || 'index.html';
}

/**
 * Navigate to adjacent theory page in slides mode.
 * @param {'next'|'prev'} direction
 */
function navigateToPage(direction) {
    const current = getCurrentPage();
    const idx = THEORY_PAGES.findIndex(p => p.href === current);
    if (idx === -1) return;
    const targetIdx = direction === 'next' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= THEORY_PAGES.length) return;
    const target = THEORY_PAGES[targetIdx];
    const slideNum = direction === 'prev' ? 'last' : '1';
    window.location.href = `${target.href}?slides=${slideNum}`;
}

/**
 * Initialize presentation mode for a given main element.
 * Finds all <section> children and builds slide navigation.
 * @param {HTMLElement} mainElement - The <main> element containing sections
 */
export function initPresentationMode(mainElement) {
    const sections = Array.from(mainElement.querySelectorAll(':scope > section'));
    if (sections.length === 0) return;

    let currentIndex = 0;
    let active = false;
    let currentLang = 'en'; // tracks language for slide-text

    // Cross-page navigation state
    const currentPage = getCurrentPage();
    const pageIdx = THEORY_PAGES.findIndex(p => p.href === currentPage);
    const hasPrevPage = pageIdx > 0;
    const hasNextPage = pageIdx >= 0 && pageIdx < THEORY_PAGES.length - 1;

    // Build sidebar with full course hierarchy
    const sidebar = document.createElement('nav');
    sidebar.className = 'presentation-sidebar';
    const sidebarList = document.createElement('ul');
    sidebarList.className = 'sidebar-course-list';

    THEORY_PAGES.forEach((page, pi) => {
        const isCurrent = page.href === currentPage;

        // Page group header
        const pageHeader = document.createElement('li');
        pageHeader.className = 'sidebar-page-header' + (isCurrent ? ' sidebar-page-current' : '');
        if (!isCurrent) {
            // Link to other page's slides
            const link = document.createElement('a');
            link.href = `${page.href}?slides=1`;
            link.textContent = currentLang === 'cs' ? page.titleCs : page.title;
            link.className = 'sidebar-page-link';
            pageHeader.appendChild(link);
        } else {
            const span = document.createElement('span');
            span.textContent = currentLang === 'cs' ? page.titleCs : page.title;
            span.className = 'sidebar-page-title';
            pageHeader.appendChild(span);
        }
        sidebarList.appendChild(pageHeader);

        // Slide items for current page
        if (isCurrent) {
            sections.forEach((section, i) => {
                const h2 = section.querySelector('h2');
                const title = h2 ? h2.textContent.trim() : `Slide ${i + 1}`;
                const li = document.createElement('li');
                li.className = 'sidebar-slide-item';
                li.textContent = title;
                li.addEventListener('click', () => goTo(i));
                sidebarList.appendChild(li);
            });
        }
    });

    sidebar.appendChild(sidebarList);
    document.body.appendChild(sidebar);

    function updateSidebar() {
        // Update slide items for current page
        const slideItems = sidebarList.querySelectorAll('.sidebar-slide-item');
        slideItems.forEach((li, i) => {
            li.classList.toggle('active', i === currentIndex);
            const h2 = sections[i].querySelector('h2');
            if (h2) li.textContent = h2.textContent.trim();
        });
        // Update page headers for language
        const pageHeaders = sidebarList.querySelectorAll('.sidebar-page-header');
        pageHeaders.forEach((header, pi) => {
            if (pi < THEORY_PAGES.length) {
                const page = THEORY_PAGES[pi];
                const textEl = header.querySelector('.sidebar-page-link, .sidebar-page-title');
                if (textEl) textEl.textContent = currentLang === 'cs' ? page.titleCs : page.title;
            }
        });
    }

    /**
     * Convert **bold** markers to <strong> tags.
     */
    function processBold(text) {
        return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    /**
     * Inject .slide-text elements into sections that have data-slide-text.
     * Inserts after .chart-header if present, otherwise after the h2.
     */
    function injectSlideText() {
        const attr = currentLang === 'cs' ? 'data-slide-text-cs' : 'data-slide-text';
        const fallback = 'data-slide-text';
        sections.forEach(section => {
            const raw = section.getAttribute(attr) || section.getAttribute(fallback);
            if (!raw) return;
            const el = document.createElement('p');
            el.className = 'slide-text';
            el.innerHTML = processBold(raw);
            // Insert after .chart-header wrapper if present, else after h2
            const chartHeader = section.querySelector('.chart-header');
            if (chartHeader) {
                chartHeader.insertAdjacentElement('afterend', el);
            } else {
                const h2 = section.querySelector('h2');
                if (h2) {
                    h2.insertAdjacentElement('afterend', el);
                } else {
                    section.prepend(el);
                }
            }
        });
    }

    /**
     * Remove all injected .slide-text elements.
     */
    function removeSlideText() {
        sections.forEach(section => {
            const el = section.querySelector('.slide-text');
            if (el) el.remove();
        });
    }

    /**
     * Update slide-text content to match the current language.
     */
    function updateSlideTextLang() {
        const attr = currentLang === 'cs' ? 'data-slide-text-cs' : 'data-slide-text';
        const fallback = 'data-slide-text';
        sections.forEach(section => {
            const el = section.querySelector('.slide-text');
            if (!el) return;
            const raw = section.getAttribute(attr) || section.getAttribute(fallback);
            if (raw) el.innerHTML = processBold(raw);
        });
    }

    // Build navigation bar
    const nav = document.createElement('div');
    nav.className = 'presentation-nav';
    nav.innerHTML = `
        <button class="presentation-nav-btn presentation-prev" aria-label="Previous slide">&larr; Prev</button>
        <span class="presentation-counter">1 / ${sections.length}</span>
        <button class="presentation-nav-btn presentation-next" aria-label="Next slide">Next &rarr;</button>
        <button class="presentation-nav-btn presentation-exit" aria-label="Exit presentation">&times;</button>
    `;
    document.body.appendChild(nav);

    const counter = nav.querySelector('.presentation-counter');
    const prevBtn = nav.querySelector('.presentation-prev');
    const nextBtn = nav.querySelector('.presentation-next');
    const exitBtn = nav.querySelector('.presentation-exit');

    function goTo(index) {
        if (index < 0 || index >= sections.length) return;
        sections[currentIndex].classList.remove('slide-visible');
        currentIndex = index;
        sections[currentIndex].classList.add('slide-visible');
        counter.textContent = `${currentIndex + 1} / ${sections.length}`;
        prevBtn.disabled = currentIndex === 0 && !hasPrevPage;
        nextBtn.disabled = currentIndex === sections.length - 1 && !hasNextPage;
        updateSidebar();
        updateUrl();
        // Trigger resize so Chart.js redraws
        window.dispatchEvent(new Event('resize'));
        // Scroll to top of the visible section
        sections[currentIndex].scrollIntoView({ behavior: 'instant', block: 'start' });
    }

    function next() {
        if (currentIndex < sections.length - 1) {
            goTo(currentIndex + 1);
        } else {
            navigateToPage('next');
        }
    }

    function prev() {
        if (currentIndex > 0) {
            goTo(currentIndex - 1);
        } else {
            navigateToPage('prev');
        }
    }

    function updateUrl() {
        const url = new URL(window.location);
        url.searchParams.set('slides', String(currentIndex + 1));
        window.history.replaceState(null, '', url);
    }

    function enter(slideNum) {
        if (active) return;
        active = true;
        document.body.classList.add('presentation-active');

        // Inject slide-text elements
        injectSlideText();

        const startIndex = (typeof slideNum === 'number' && slideNum >= 1 && slideNum <= sections.length)
            ? slideNum - 1
            : 0;

        // Mark initial slide visible
        currentIndex = startIndex;
        sections[currentIndex].classList.add('slide-visible');
        counter.textContent = `${currentIndex + 1} / ${sections.length}`;
        prevBtn.disabled = currentIndex === 0 && !hasPrevPage;
        nextBtn.disabled = currentIndex === sections.length - 1 && !hasNextPage;
        updateSidebar();
        updateUrl();
        window.dispatchEvent(new Event('resize'));
    }

    function exit() {
        if (!active) return;
        active = false;
        document.body.classList.remove('presentation-active');
        sections.forEach(s => s.classList.remove('slide-visible'));

        // Remove injected slide-text elements
        removeSlideText();

        // Remove slides param from URL
        const url = new URL(window.location);
        url.searchParams.delete('slides');
        window.history.replaceState(null, '', url);

        // Scroll to the section that was being viewed
        sections[currentIndex].scrollIntoView({ behavior: 'instant', block: 'start' });

        // Trigger resize so charts redraw at normal size
        window.dispatchEvent(new Event('resize'));
    }

    // Button handlers
    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    exitBtn.addEventListener('click', exit);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        // Toggle with 'S' key (only when not typing in an input)
        if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey
            && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            e.preventDefault();
            active ? exit() : enter();
            return;
        }
        if (!active) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            next();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            prev();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            exit();
        }
    });

    // Create toggle button in header
    const header = document.querySelector('header');
    if (header) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'presentation-toggle';
        toggleBtn.textContent = 'Slides';
        toggleBtn.setAttribute('aria-label', 'Enter presentation mode');
        toggleBtn.addEventListener('click', () => enter());
        header.appendChild(toggleBtn);
    }

    // Refresh sidebar titles and slide-text when language changes
    document.addEventListener('languagechange', (e) => {
        if (e.detail && e.detail.lang) {
            currentLang = e.detail.lang;
        }
        updateSidebar();
        if (active) {
            updateSlideTextLang();
        }
    });

    // Check URL for ?slides parameter on load
    const params = new URLSearchParams(window.location.search);
    const slidesParam = params.get('slides');
    if (slidesParam !== null) {
        if (slidesParam === 'last') {
            enter(sections.length);
        } else {
            const num = parseInt(slidesParam, 10);
            enter(isNaN(num) ? 1 : num);
        }
    }
}
