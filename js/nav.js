/**
 * Shared Navigation Component
 * 
 * Generates consistent navigation across all pages.
 * Include this script and call initNavigation() on DOMContentLoaded.
 */

const NAV_ITEMS = [
    { href: 'index.html', label: 'Home' },
    { href: 'sandbox/index.html', label: 'Sandbox' },
    { 
        label: 'Theory',
        href: 'pressure.html',
        submenu: [
            { href: 'pressure.html', label: 'Pressure & Depth' },
            { href: 'tissue-loading.html', label: 'Tissue Loading' },
            { href: 'm-values.html', label: 'M-Values' }
        ]
    },
    { 
        label: 'Tests',
        href: 'quiz-physics.html',
        submenu: [
            { href: 'quiz-physics.html', label: 'Physics' },
            { href: 'quiz-anatomy.html', label: 'Anatomy' },
            { href: 'quiz-accidents.html', label: 'Accidents' }
        ]
    },
    { href: 'about.html', label: 'About' }
];

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
        
        if (item.submenu) {
            // Dropdown item
            html += `<li class="nav-dropdown">`;
            
            if (item.href) {
                // Has both link and submenu (like Pressure)
                const activeClass = item.href.split('#')[0] === currentPage ? ' class="active"' : '';
                html += `<a href="${prefix}${item.href}"${activeClass}>${item.label}</a>`;
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
                } else {
                    subHref = prefix + sub.href;
                }
                const subActiveClass = sub.href.split('#')[0] === currentPage ? ' class="active"' : '';
                html += `<li><a href="${subHref}"${subActiveClass}>${sub.label}</a></li>`;
            }
            html += `</ul></li>`;
        } else {
            // Simple link
            const activeClass = isActive ? ' class="active"' : '';
            html += `<li><a href="${prefix}${item.href}"${activeClass}>${item.label}</a></li>`;
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
