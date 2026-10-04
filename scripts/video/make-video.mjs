#!/usr/bin/env node
/**
 * Narrated video walkthrough generator.
 *
 *   node make-video.mjs scenes/transfilling.mjs [lang]
 *
 * A scenario module exports a scenario object, or a function (lang) -> scenario.
 *
 * 1. Narration: each scene's `say` text -> WAV (cached in out/cache/). A voice is a
 *    Kokoro id ('bf_emma') or { piper: 'cs_CZ-jirka-medium' } for languages Kokoro lacks.
 * 2. Recording: Playwright drives the real page while CDP screencast captures frames;
 *    each scene lasts max(narration, actions) so picture and voice stay in sync.
 * 3. Mux: ffmpeg turns the variable-rate frames into 30 fps H.264, adds a caption
 *    bar below the page (burned-in subtitles) and lays every narration clip at its
 *    scene's start time. Also writes an .srt for players / YouTube.
 */
import { chromium } from 'playwright';
import { KokoroTTS } from 'kokoro-js';
import { piperSpeak, writeWav } from './tts-piper.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'out');
const CACHE = path.join(OUT, 'cache');

// The screencast captures CSS pixels, so record at full width and enlarge the page
// with body zoom (scenario.zoom) instead of deviceScaleFactor.
const VIEWPORT = { width: 1920, height: 940 };
const CAPTION_BAR = 140; // 940 + 140 = 1080
const BAR_COLOUR = '0x0f1e2d';
const SCENE_GAP_MS = 450; // breathing room after each narration
const FPS = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------------------------------------------------------------- narration

async function synthesize(scenes) {
    fs.mkdirSync(CACHE, { recursive: true });
    let kokoro = null;
    for (const scene of scenes) {
        const voice = scene.voice;
        const label = voice.piper ?? voice;
        const key = createHash('sha1').update(`${JSON.stringify(voice)}\n${scene.say}`).digest('hex').slice(0, 16);
        const wav = path.join(CACHE, `${key}.wav`);
        const meta = path.join(CACHE, `${key}.json`);
        if (!fs.existsSync(meta)) {
            let seconds;
            if (voice.piper) {
                const { samples, sampleRate } = await piperSpeak(scene.say, voice.piper, path.join(CACHE, 'piper'));
                writeWav(wav, samples, sampleRate);
                seconds = samples.length / sampleRate;
            } else {
                kokoro ??= await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
                const audio = await kokoro.generate(scene.say, { voice });
                await audio.save(wav);
                seconds = audio.audio.length / audio.sampling_rate;
            }
            fs.writeFileSync(meta, JSON.stringify({ seconds }));
            console.log(`  tts ${label}: ${scene.say.slice(0, 60)}…`);
        }
        scene.wav = wav;
        scene.narrationMs = JSON.parse(fs.readFileSync(meta, 'utf8')).seconds * 1000;
    }
}

// ---------------------------------------------------------------- static server

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

function serve(root) {
    const server = http.createServer((req, res) => {
        const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

// ---------------------------------------------------------------- director

/** Scene helpers: an eased visible cursor plus overlay controls. */
function director(page) {
    let pos = { x: VIEWPORT.width / 2, y: VIEWPORT.height + 40 };

    async function glide(x, y, ms = 700) {
        const from = { ...pos };
        const steps = Math.max(1, Math.round(ms / 16));
        for (let i = 1; i <= steps; i++) {
            const t = ease(i / steps);
            await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
            await sleep(16);
        }
        pos = { x, y };
    }

    async function centre(selector) {
        const box = await page.locator(selector).boundingBox();
        if (!box) throw new Error(`not visible: ${selector}`);
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
    }

    const ui = {
        wait: sleep,
        card: (opts) => page.evaluate((o) => window.__video.card(o), opts ?? null),
        async highlight(sel) {
            if (sel) await ui.reveal(sel);
            await page.evaluate((s) => window.__video.highlight(s), sel ?? null);
        },
        /** Smooth-scroll just enough to show the selectors between the sticky nav and the bottom edge. */
        async reveal(sel, ms = 700) {
            const { from, dy } = await page.evaluate(([sels, h]) => {
                const rects = [].concat(sels).map((s) => document.querySelector(s).getBoundingClientRect());
                const top = Math.min(...rects.map((r) => r.top));
                const bottom = Math.max(...rects.map((r) => r.bottom));
                const navBottom = document.querySelector('.main-nav')?.getBoundingClientRect().bottom ?? 0;
                let d = Math.max(0, bottom - (h - 16));
                if (top - d < navBottom + 16) d = top - navBottom - 16;
                return { from: window.scrollY, dy: d };
            }, [sel, VIEWPORT.height]);
            if (Math.abs(dy) < 2) return;
            const steps = Math.round(ms / 16);
            for (let i = 1; i <= steps; i++) {
                await page.evaluate((y) => window.scrollTo(0, y), from + dy * ease(i / steps));
                await sleep(16);
            }
        },
        async moveTo(selector, ms) {
            const { x, y } = await centre(selector);
            await glide(x, y, ms);
        },
        async click(selector) {
            await ui.moveTo(selector);
            await sleep(180);
            await page.mouse.down();
            await page.mouse.up();
        },
        /** Native dropdowns are not painted by the screencast: pulse, then set the value. */
        async select(selector, value) {
            await ui.moveTo(selector);
            await sleep(150);
            await page.evaluate(({ x, y }) => window.__video.ripple(x, y), pos);
            await page.locator(selector).selectOption(String(value));
        },
        /** Drag a range input's thumb to `value`, then snap to the exact number. */
        async slide(selector, value, ms = 1100) {
            const { box } = await centre(selector);
            const { min, max, cur } = await page.locator(selector).evaluate((el) =>
                ({ min: +el.min, max: +el.max, cur: +el.value }));
            const thumb = 8;
            const xOf = (v) => box.x + thumb + ((v - min) / (max - min)) * (box.width - 2 * thumb);
            const y = box.y + box.height / 2;
            await glide(xOf(cur), y);
            await page.mouse.down();
            await glide(xOf(value), y, ms);
            await page.mouse.up();
            await page.locator(selector).evaluate((el, v) => {
                el.value = v;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }, value);
        },
        /** Guard: fail the render if the page disagrees with what the narration claims. */
        async expectText(selector, expected) {
            const norm = (t) => t.replace(/\u00a0/g, ' ').trim();
            const actual = norm(await page.locator(selector).innerText());
            if (actual !== norm(expected)) throw new Error(`${selector}: narration says "${expected}", page shows "${actual}"`);
        },
        async cursorAway() {
            await glide(VIEWPORT.width - 60, VIEWPORT.height + 40, 600);
        },
    };
    return ui;
}

// ---------------------------------------------------------------- recording

async function record(scenario, framesDir) {
    const server = await serve(REPO);
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: VIEWPORT, locale: scenario.locale ?? 'en-US', serviceWorkers: 'block',
    });
    await context.addInitScript({ path: path.join(HERE, 'overlay.js') });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('  page error:', e.message));
    await page.goto(`http://localhost:${server.address().port}/${scenario.page}`);
    await page.waitForLoadState('networkidle');
    await page.evaluate((z) => { document.body.style.zoom = z; return document.fonts.ready; }, scenario.zoom ?? 1);

    const ui = director(page);
    await scenario.prepare?.(page, ui);
    await sleep(800); // let the first card fade in before capture starts

    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
    const frames = [];
    const cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
        const file = path.join(framesDir, `${String(frames.length).padStart(5, '0')}.jpg`);
        frames.push({ t: Date.now(), file });
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080 });
    const t0 = Date.now();

    for (const [i, scene] of scenario.scenes.entries()) {
        scene.startMs = Date.now() - t0;
        console.log(`  scene ${i + 1}/${scenario.scenes.length} @ ${(scene.startMs / 1000).toFixed(1)} s`);
        await Promise.all([scene.run?.(ui), sleep(scene.narrationMs)]);
        await sleep(SCENE_GAP_MS);
        scene.endMs = Date.now() - t0;
    }
    await sleep(1200);
    const endMs = Date.now() - t0;

    await cdp.send('Page.stopScreencast');
    await browser.close();
    server.close();
    // The first frame stands in for the (static) picture from t0 until the next repaint.
    const timed = frames.map((f) => ({ ...f, ms: Math.max(0, f.t - t0) }));
    timed[0].ms = 0;
    return { frames: timed, endMs };
}

// ---------------------------------------------------------------- mux

function assTime(ms) {
    const cs = Math.round(ms / 10);
    const pad = (n) => String(n).padStart(2, '0');
    return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

/** Captions centred in the bar under the page (alignment 5 + \pos = middle of the bar). */
function writeAss(file, scenes) {
    const pos = `\\pos(${VIEWPORT.width / 2},${VIEWPORT.height + CAPTION_BAR / 2})`;
    fs.writeFileSync(file, [
        '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${VIEWPORT.width}`, `PlayResY: ${VIEWPORT.height + CAPTION_BAR}`,
        'WrapStyle: 0', '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV',
        'Style: Caption,Inter,36,&H00FFFFFF,&H00000000,&H00000000,0,0,1,0,0,5,160,160,0', '',
        '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ...scenes.map((s) =>
            `Dialogue: 0,${assTime(s.startMs)},${assTime(s.endMs - 150)},Caption,,0,0,0,,{${pos}\\fad(200,200)}${s.text}`),
        '',
    ].join('\n'));
}

function srtTime(ms) {
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(Math.round(ms % 1000), 3)}`;
}

function mux(name, scenes, { frames, endMs }) {
    // Variable-rate frames -> concat list with per-frame durations.
    const list = path.join(OUT, `${name}.frames.txt`);
    const lines = [];
    frames.forEach((f, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].ms : endMs;
        lines.push(`file '${f.file}'`, `duration ${((next - f.ms) / 1000).toFixed(3)}`);
    });
    lines.push(`file '${frames.at(-1).file}'`); // concat demuxer ignores the last duration otherwise
    fs.writeFileSync(list, lines.join('\n'));

    const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
    scenes.forEach((s) => args.push('-i', s.wav));
    const ass = path.join(OUT, `${name}.ass`);
    writeAss(ass, scenes);
    const video = `[0:v]fps=${FPS},pad=${VIEWPORT.width}:${VIEWPORT.height + CAPTION_BAR}:0:0:color=${BAR_COLOUR},` +
        `subtitles=${ass}:fontsdir=${path.join(REPO, 'fonts')},format=yuv420p[vout]`;
    const delays = scenes.map((s, i) => `[${i + 1}:a]adelay=${s.startMs}:all=1[a${i}]`);
    const mix = `${scenes.map((_, i) => `[a${i}]`).join('')}amix=inputs=${scenes.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`;
    const mp4 = path.join(OUT, `${name}.mp4`);
    args.push(
        '-filter_complex', [video, ...delays, mix].join(';'),
        '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', (endMs / 1000).toFixed(3), '-movflags', '+faststart', mp4,
    );
    execFileSync('ffmpeg', args, { stdio: 'inherit' });

    const srt = scenes.map((s, i) =>
        `${i + 1}\n${srtTime(s.startMs)} --> ${srtTime(s.startMs + s.narrationMs)}\n${s.text}\n`).join('\n');
    fs.writeFileSync(path.join(OUT, `${name}.srt`), srt);
    return mp4;
}

// ---------------------------------------------------------------- main

// kokoro-js's bundled espeak rethrows uncaught errors with its whole minified source;
// catch here so a failed render prints just the message.
try {
    const scenarioFile = path.resolve(process.argv[2] ?? path.join(HERE, 'scenes/transfilling.mjs'));
    const lang = process.argv[3] ?? 'en';
    const { default: exported } = await import(scenarioFile);
    const scenario = typeof exported === 'function' ? exported(lang) : exported;
    const name = `${path.basename(scenarioFile, '.mjs')}-${lang}`;

    console.log(`[1/3] narration (${scenario.scenes.length} scenes)`);
    await synthesize(scenario.scenes);
    console.log('[2/3] recording');
    const recording = await record(scenario, path.join(OUT, `${name}.frames`));
    console.log(`[3/3] encoding ${recording.frames.length} frames`);
    const mp4 = mux(name, scenario.scenes, recording);
    console.log(`done: ${path.relative(process.cwd(), mp4)} (${(recording.endMs / 1000).toFixed(1)} s)`);

    // Copy to the site and grab the title card as the poster image.
    if (scenario.publish) {
        const target = path.join(REPO, scenario.publish);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(mp4, `${target}.mp4`);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.5', '-i', mp4, '-frames:v', '1',
            '-vf', 'scale=1280:-2', '-q:v', '4', `${target}.jpg`]);
        console.log(`published: ${scenario.publish}.mp4 + .jpg`);
    }
    // Exit explicitly: onnxruntime (Piper) can abort while tearing down after a
    // successful render, turning a good run into exit code 134.
    process.exit(0);
} catch (err) {
    console.error(`\nFAILED: ${err.message}`);
    process.exit(1);
}
