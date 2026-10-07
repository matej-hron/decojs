import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectSiteFiles, staticAssets, localRefs } from '../scripts/build-pages.mjs';

describe('selectSiteFiles', () => {
    it('keeps site files and drops dev material', () => {
        const picked = selectSiteFiles([
            'index.html', 'sw.js', 'CNAME', '.nojekyll', 'manifest.json', 'js/nav.js', 'lab/dive-log.html',
            'tests/fixtures/divesoft/00000100.DLF', 'docs/notation/glossary.md', 'supabase/schema.sql',
            'wiki/Home.md', 'scripts/build-pages.mjs', 'resources/x.pdf', '.github/workflows/ci.yml',
            'README.md', 'package.json', 'package-lock.json', 'data/quiz-anatomy.json.bak', 'sandbox/dlf-local/1.DLF',
        ]);
        assert.deepEqual(picked, ['index.html', 'sw.js', 'CNAME', '.nojekyll', 'manifest.json', 'js/nav.js', 'lab/dive-log.html']);
    });
});

describe('staticAssets', () => {
    it('reads the STATIC_ASSETS list from sw.js', () => {
        const assets = staticAssets(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'));
        assert.ok(assets.includes('./lab/dive-log.html'));
        assert.ok(assets.includes('./manifest.json'));
    });
});

describe('localRefs', () => {
    it('resolves relative refs and skips external, anchors and templates', () => {
        const html = '<a href="../index.html#x"></a><script src="../js/nav.js?v=1"></script>'
            + '<a href="https://x.eu/a.html"></a><a href="#top"></a><a href="mailto:a@b"></a>'
            + '<img src="${url}"><a href="./"></a>';
        assert.deepEqual(localRefs('lab/dive-log.html', html), ['index.html', 'js/nav.js', 'lab/index.html']);
    });
});
