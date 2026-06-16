/**
 * Shared Navigation Component
 *
 * Generates consistent navigation across all pages.
 * Include this script and call initNavigation() on DOMContentLoaded.
 *
 * Labels are resolved through the i18n module. Each nav entry carries a
 * `labelKey` (for i18n lookup) and `label` (English fallback used when
 * translations haven't loaded yet or the key is missing).
 */

import { translate } from './i18n.js';

const NAV_ITEMS = [
    { href: 'index.html', labelKey: 'nav.home', label: 'Home' },
    {
        labelKey: 'nav.sandbox.label',
        label: 'Sandbox',
        href: 'sandbox/index.html',
        submenu: [
            { href: 'sandbox/index.html', labelKey: 'nav.sandbox.deco', label: 'Decompression Modelling' },
            { href: 'sandbox/repetitive-dives.html', labelKey: 'nav.sandbox.repetitive', label: 'Repetitive Dives (preview)' },
            { href: 'sandbox/tissue-saturation.html', labelKey: 'nav.sandbox.tissue', label: 'Tissue Saturation' },
            { href: 'sandbox/haldane.html', labelKey: 'nav.sandbox.haldane', label: 'Haldane Equation' },
            { href: 'sandbox/schreiner.html', labelKey: 'nav.sandbox.schreiner', label: 'Schreiner Equation' },
            { href: 'sandbox/m-values.html', labelKey: 'nav.sandbox.mvalues', label: 'M-Value Sandbox' },
            { href: 'sandbox/gradient-factors.html', labelKey: 'nav.sandbox.gradientFactors', label: 'Gradient Factors Sandbox' },
            { href: 'sandbox/transfilling.html', labelKey: 'nav.sandbox.transfill', label: 'Cylinder Transfilling' },
            { href: 'sandbox/cascade-filling.html', labelKey: 'nav.sandbox.cascade', label: 'Cascade Filling' },
            { href: 'sandbox/gas-law.html', labelKey: 'nav.sandbox.gasLaw', label: 'Gas Law: Temp & Pressure' }
        ]
    },
    {
        labelKey: 'nav.theory.label',
        label: 'Theory',
        href: 'pressure.html',
        submenu: [
            { href: 'pressure.html', labelKey: 'nav.theory.pressure', label: 'Pressure & Depth' },
            { href: 'tissue-loading.html', labelKey: 'nav.theory.tissue', label: 'Tissue Loading' },
            { href: 'm-values.html', labelKey: 'nav.theory.mValues', label: 'M-Values' },
            { href: 'gradient-factors.html', labelKey: 'nav.theory.gf', label: 'Gradient Factors' }
        ]
    },
    {
        labelKey: 'nav.tests.label',
        label: 'Tests',
        href: 'quiz-physics.html',
        submenu: [
            { href: 'quiz-physics.html', labelKey: 'nav.tests.physics', label: 'Physics' },
            { href: 'quiz-anatomy.html', labelKey: 'nav.tests.anatomy', label: 'Anatomy' },
            { href: 'quiz-accidents.html', labelKey: 'nav.tests.accidents', label: 'Accidents' },
            { href: 'quiz-safety.html', labelKey: 'nav.tests.safety', label: 'Safety Guidelines' },
            { href: 'quiz-training.html', labelKey: 'nav.tests.training', label: 'Training Guidelines' },
            { href: 'quiz-equipment.html', labelKey: 'nav.tests.equipment', label: 'Equipment' },
            { href: 'quiz-vessel.html', labelKey: 'nav.tests.vessel', label: 'Vessel' }
        ]
    },
    { href: 'about.html', labelKey: 'nav.about', label: 'About' }
];

/**
 * Resolve the display label for a nav entry, falling back to the English
 * `label` field when no translation is available.
 * @param {{labelKey?: string, label: string}} item
 * @returns {string}
 */
function resolveLabel(item) {
    if (item.labelKey) {
        return translate(item.labelKey, item.label);
    }
    return item.label;
}

/**
 * Get the current page path from the URL
 * Returns path relative to the project root (e.g., 'index.html' or 'sandbox/index.html')
 */
function getCurrentPage() {
    const path = window.location.pathname;

    // Check if we're in a subdirectory like /sandbox/
    if (path.includes('/sandbox/')) {
        const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        return 'sandbox/' + filename;
    }

    const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return filename;
}

/**
 * Detect if we're in a subdirectory and return path prefix
 */
function getPathPrefix() {
    const path = window.location.pathname;
    // Check if we're in a subdirectory like /sandbox/
    if (path.includes('/sandbox/')) {
        return '../';
    }
    return '';
}

/**
 * Check if a nav item or its submenu contains the current page
 */
function isActiveItem(item, currentPage) {
    if (item.href && item.href.split('#')[0] === currentPage) {
        return true;
    }
    if (item.submenu) {
        return item.submenu.some(sub => sub.href.split('#')[0] === currentPage);
    }
    return false;
}

/**
 * Generate the navigation HTML
 */
function generateNavHTML(currentPage) {
    let html = '';
    const prefix = getPathPrefix();

    for (const item of NAV_ITEMS) {
        const isActive = isActiveItem(item, currentPage);
        const itemLabel = resolveLabel(item);

        if (item.submenu) {
            // Dropdown item
            html += `<li class="nav-dropdown">`;

            if (item.href) {
                // Has both link and submenu (like Pressure)
                const activeClass = item.href.split('#')[0] === currentPage ? ' class="active"' : '';
                html += `<a href="${prefix}${item.href}"${activeClass}>${itemLabel}</a>`;
            } else {
                // Just a dropdown trigger (like Tests)
                const activeClass = isActive ? ' class="active"' : '';
                html += `<a${activeClass}>${itemLabel}</a>`;
            }

            html += `<ul class="nav-dropdown-menu">`;
            for (const sub of item.submenu) {
                // For submenu items on the current page, use just the hash
                let subHref = sub.href;
                if (sub.href.split('#')[0] === currentPage && sub.href.includes('#')) {
                    subHref = '#' + sub.href.split('#')[1];
                } else {
                    subHref = prefix + sub.href;
                }
                const subActiveClass = sub.href.split('#')[0] === currentPage ? ' class="active"' : '';
                html += `<li><a href="${subHref}"${subActiveClass}>${resolveLabel(sub)}</a></li>`;
            }
            html += `</ul></li>`;
        } else {
            // Simple link
            const activeClass = isActive ? ' class="active"' : '';
            html += `<li><a href="${prefix}${item.href}"${activeClass}>${itemLabel}</a></li>`;
        }
    }

    return html;
}

/**
 * Render the nav menu HTML into the existing .nav-links container.
 * Does not re-attach hamburger handlers (those stay attached on the
 * container element, which is preserved).
 */
function renderNav() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    const currentPage = getCurrentPage();
    navLinks.innerHTML = generateNavHTML(currentPage);

    // Re-attach per-link click handlers for mobile menu behaviour.
    attachLinkHandlers();
}

// Module-level reference to close-menu function so languagechange re-renders
// can reuse mobile-menu helpers without re-registering the outer click
// listener on the hamburger button.
let _mobileMQ = null;
let _closeMenu = null;

function attachLinkHandlers() {
    const navLinks = document.querySelector('.nav-links');
    const hamburger = document.querySelector('.nav-hamburger');
    if (!navLinks || !hamburger || !_mobileMQ || !_closeMenu) return;

    navLinks.querySelectorAll('a').forEach(link => {
        const dropdownParent = link.parentElement.classList.contains('nav-dropdown')
            && link.parentElement.querySelector('.nav-dropdown-menu')
            ? link.parentElement
            : null;

        link.addEventListener('click', (e) => {
            if (_mobileMQ.matches && dropdownParent) {
                e.preventDefault();
                dropdownParent.classList.toggle('open');
                return;
            }
            _closeMenu();
        });
    });
}

/**
 * Initialize the navigation
 * Call this on DOMContentLoaded
 */
function initNavigation() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const currentPage = getCurrentPage();
    navLinks.innerHTML = generateNavHTML(currentPage);

    // Setup mobile hamburger menu
    const hamburger = document.querySelector('.nav-hamburger');
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', function() {
            const isOpen = navLinks.classList.toggle('nav-open');
            hamburger.classList.toggle('is-active');
            hamburger.setAttribute('aria-expanded', isOpen);
        });

        _mobileMQ = window.matchMedia('(max-width: 768px)');
        _closeMenu = () => {
            navLinks.classList.remove('nav-open');
            hamburger.classList.remove('is-active');
            hamburger.setAttribute('aria-expanded', 'false');
            navLinks.querySelectorAll('.nav-dropdown.open').forEach(d => d.classList.remove('open'));
        };

        // On mobile, dropdown triggers expand the submenu instead of navigating.
        // Leaf links and submenu items close the menu after navigation.
        attachLinkHandlers();
    }

    // Re-render nav whenever language changes so translated labels appear.
    document.addEventListener('languagechange', renderNav);
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
} else {
    initNavigation();
}

// Export for module usage
export { initNavigation, NAV_ITEMS };
