/**
 * Shared Navigation Component
 * 
 * Generates consistent navigation across all pages.
 * Include this script and call initNavigation() on DOMContentLoaded.
 */

const NAV_ITEMS = [
    { href: 'index.html', label: 'Home' },
    { href: 'dive-setup.html', label: 'Dive Setup' },
    { 
        href: 'pressure.html', 
        label: 'Pressure',
        submenu: [
            { href: 'pressure.html#terminology', label: 'Terminology' },
            { href: 'pressure.html#dive-profile', label: 'Dive Profile' },
            { href: 'pressure.html#total-pressure', label: 'Total Pressure' },
            { href: 'pressure.html#gas-consumption', label: 'Gas Consumption' },
            { href: 'pressure.html#air-composition', label: 'Air Composition' },
            { href: 'pressure.html#daltons-law', label: "Dalton's Law" },
            { href: 'pressure.html#partial-pressure-limits', label: 'Partial Pressure Limits' },
            { href: 'pressure.html#end-calculation', label: 'END Calculation' },
            { href: 'pressure.html#oxygen-toxicity', label: 'Oxygen Toxicity' },
            { href: 'pressure.html#partial-pressure-chart', label: 'Partial Pressure Chart' }
        ]
    },
    { 
        href: 'tissue-loading.html', 
        label: 'Tissue Loading',
        submenu: [
            { href: 'tissue-loading.html#henrys-law', label: "Henry's Law" },
            { href: 'tissue-loading.html#gas-exchange', label: 'Gas Exchange' },
            { href: 'tissue-loading.html#saturation-dynamics', label: 'Saturation Dynamics' },
            { href: 'tissue-loading.html#half-time-concept', label: 'Half-Time Concept' },
            { href: 'tissue-loading.html#half-time-charts', label: 'Half-Time Charts' },
            { href: 'tissue-loading.html#tissue-heterogeneity', label: 'Tissue Types' },
            { href: 'tissue-loading.html#buhlmann-compartments', label: 'Bühlmann Compartments' },
            { href: 'tissue-loading.html#tissue-chart-section', label: 'Interactive Chart' }
        ]
    },
    {
        href: 'm-values.html',
        label: 'M-Values',
        submenu: [
            { href: 'm-values.html#compartment-selection', label: 'Compartment Selection' },
            { href: 'm-values.html#mvalue-chart-section', label: 'M-Value Chart' }
        ]
    },
    { 
        label: 'Tests',
        submenu: [
            { href: 'quiz-physics.html', label: 'Physics' },
            { href: 'quiz-anatomy.html', label: 'Anatomy' },
            { href: 'quiz-accidents.html', label: 'Accidents' }
        ]
    },
    { href: 'about.html', label: 'About' }
];

/**
 * Get the current page filename from the URL
 */
function getCurrentPage() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return filename;
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
    
    for (const item of NAV_ITEMS) {
        const isActive = isActiveItem(item, currentPage);
        
        if (item.submenu) {
            // Dropdown item
            html += `<li class="nav-dropdown">`;
            
            if (item.href) {
                // Has both link and submenu (like Pressure)
                const activeClass = item.href.split('#')[0] === currentPage ? ' class="active"' : '';
                html += `<a href="${item.href}"${activeClass}>${item.label}</a>`;
            } else {
                // Just a dropdown trigger (like Tests)
                const activeClass = isActive ? ' class="active"' : '';
                html += `<a${activeClass}>${item.label}</a>`;
            }
            
            html += `<ul class="nav-dropdown-menu">`;
            for (const sub of item.submenu) {
                // For submenu items on the current page, use just the hash
                let subHref = sub.href;
                if (sub.href.split('#')[0] === currentPage && sub.href.includes('#')) {
                    subHref = '#' + sub.href.split('#')[1];
                }
                const subActiveClass = sub.href.split('#')[0] === currentPage ? ' class="active"' : '';
                html += `<li><a href="${subHref}"${subActiveClass}>${sub.label}</a></li>`;
            }
            html += `</ul></li>`;
        } else {
            // Simple link
            const activeClass = isActive ? ' class="active"' : '';
            html += `<li><a href="${item.href}"${activeClass}>${item.label}</a></li>`;
        }
    }
    
    return html;
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
        
        // Close menu when clicking on a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('nav-open');
                hamburger.classList.remove('is-active');
                hamburger.setAttribute('aria-expanded', 'false');
            });
        });
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
} else {
    initNavigation();
}

// Export for module usage
export { initNavigation, NAV_ITEMS };
