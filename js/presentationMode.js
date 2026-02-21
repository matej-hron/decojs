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

    // Build sidebar with slide list
    const sidebar = document.createElement('nav');
    sidebar.className = 'presentation-sidebar';
    const sidebarList = document.createElement('ul');
    sections.forEach((section, i) => {
        const h2 = section.querySelector('h2');
        const title = h2 ? h2.textContent.trim() : `Slide ${i + 1}`;
        const li = document.createElement('li');
        li.textContent = title;
        li.addEventListener('click', () => goTo(i));
        sidebarList.appendChild(li);
    });
    sidebar.appendChild(sidebarList);
    document.body.appendChild(sidebar);

    function updateSidebar() {
        const items = sidebarList.querySelectorAll('li');
        items.forEach((li, i) => {
            li.classList.toggle('active', i === currentIndex);
            // Refresh title from live h2 (supports i18n language switching)
            const h2 = sections[i].querySelector('h2');
            if (h2) li.textContent = h2.textContent.trim();
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
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === sections.length - 1;
        updateSidebar();
        updateUrl();
        // Trigger resize so Chart.js redraws
        window.dispatchEvent(new Event('resize'));
        // Scroll to top of the visible section
        sections[currentIndex].scrollIntoView({ behavior: 'instant', block: 'start' });
    }

    function next() {
        if (currentIndex < sections.length - 1) goTo(currentIndex + 1);
    }

    function prev() {
        if (currentIndex > 0) goTo(currentIndex - 1);
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

        const startIndex = (typeof slideNum === 'number' && slideNum >= 1 && slideNum <= sections.length)
            ? slideNum - 1
            : 0;

        // Mark initial slide visible
        currentIndex = startIndex;
        sections[currentIndex].classList.add('slide-visible');
        counter.textContent = `${currentIndex + 1} / ${sections.length}`;
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === sections.length - 1;
        updateSidebar();
        updateUrl();
        window.dispatchEvent(new Event('resize'));
    }

    function exit() {
        if (!active) return;
        active = false;
        document.body.classList.remove('presentation-active');
        sections.forEach(s => s.classList.remove('slide-visible'));

        // Remove slides param from URL
        const url = new URL(window.location);
        url.searchParams.delete('slides');
        window.history.replaceState(null, '', url);

        // Scroll to the section that was being viewed
        sections[currentIndex].scrollIntoView({ behavior: 'instant', block: 'start' });
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

    // Refresh sidebar titles when language changes
    document.addEventListener('languagechange', () => updateSidebar());

    // Check URL for ?slides parameter on load
    const params = new URLSearchParams(window.location.search);
    const slidesParam = params.get('slides');
    if (slidesParam !== null) {
        const num = parseInt(slidesParam, 10);
        enter(isNaN(num) ? 1 : num);
    }
}
