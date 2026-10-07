#!/usr/bin/env node
/**
 * Assemble the public GitHub Pages site into an output directory (default `_site/`).
 *
 * Only tracked files under an explicit allow-list are copied, so dev material
 * (tests/ with real dive logs, docs/, supabase/, wiki/, scripts/ …) never goes public.
 * The build fails when:
 *   - a service-worker STATIC_ASSET is missing from the output,
 *   - a local href/src in a published HTML page points at a file that is not published.
 *
 * Usage: node scripts/build-pages.mjs [outDir]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Top-level directories served as-is. */
const SITE_DIRS = ['css', 'data', 'fonts', 'icons', 'images', 'js', 'lab', 'locales', 'sandbox', 'videos'];
/** Top-level files served as-is (plus every top-level *.html). */
const SITE_FILES = ['.nojekyll', 'CNAME', 'manifest.json', 'sw.js'];
/** Never publish these, even if someone adds them to the lists above. */
const FORBIDDEN = [/^tests\//, /^docs\//, /^supabase\//, /^wiki\//, /^scripts\//, /^resources\//,
    /^\.github\//, /^\.superpowers\//, /^node_modules\//, /\.DLF$/i, /\.bak$/, /^package(-lock)?\.json$/];

export function selectSiteFiles(trackedFiles) {
    return trackedFiles.filter(f => {
        if (FORBIDDEN.some(re => re.test(f))) return false;
        const top = f.split('/')[0];
        if (f === top) return SITE_FILES.includes(f) || f.endsWith('.html');
        return SITE_DIRS.includes(top);
    });
}

export function staticAssets(swSource) {
    const block = swSource.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
    if (!block) throw new Error('STATIC_ASSETS not found in sw.js');
    return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

/** Local href/src targets of an HTML page, resolved to site-root-relative paths. */
export function localRefs(htmlPath, html) {
    const refs = [];
    for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g)) {
        const raw = m[1];
        if (/^(?:[a-z]+:|\/\/|#)/i.test(raw) || raw.includes('${')) continue;
        const path = raw.split(/[?#]/)[0];
        if (!path) continue;
        refs.push(posix.normalize(posix.join(posix.dirname(htmlPath), path)).replace(/\/$/, '/index.html'));
    }
    return refs;
}

function build(outDir) {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    const files = selectSiteFiles(tracked);
    rmSync(outDir, { recursive: true, force: true });
    for (const f of files) {
        mkdirSync(dirname(join(outDir, f)), { recursive: true });
        cpSync(join(ROOT, f), join(outDir, f));
    }

    const published = new Set(files);
    const problems = [];
    for (const asset of staticAssets(readFileSync(join(ROOT, 'sw.js'), 'utf8'))) {
        const path = asset === './' ? 'index.html' : posix.normalize(asset);
        if (!published.has(path)) problems.push(`sw.js STATIC_ASSET not published: ${asset}`);
    }
    for (const f of files.filter(f => f.endsWith('.html'))) {
        for (const ref of localRefs(f, readFileSync(join(ROOT, f), 'utf8'))) {
            if (!published.has(ref)) problems.push(`${f} references unpublished ${ref}`);
        }
    }
    if (!existsSync(join(outDir, '.nojekyll'))) problems.push('.nojekyll missing');

    if (problems.length) {
        console.error(problems.map(p => `✗ ${p}`).join('\n'));
        process.exit(1);
    }
    console.log(`Published ${files.length} files to ${outDir}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    build(resolve(process.argv[2] ?? join(ROOT, '_site')));
}
