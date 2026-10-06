# Video walkthroughs

Generates narrated walkthrough videos of DecoJS pages: Playwright drives the real
page, Kokoro speaks the English narration, ffmpeg mixes the audio and leaves a bar
under the page where the player draws the subtitles. Subtitles ship as WebVTT
tracks (one per language in the scenario), so viewers pick their language.

```bash
cd scripts/video
npm install                     # once
npm run video -- scenes/transfilling.mjs
npm run video -- scenes/transfilling.mjs en --dry   # drive the page, run every check; no TTS, no recording
```

`--dry` is the fast loop while writing a scenario: it runs `prepare()` and every scene's
actions and checks (seconds instead of minutes) and verifies that each language has one
caption per scene.

Output: `out/<scene>.mp4` + `out/<scene>.<lang>.vtt`, and with `publish` set, copies at
`videos/<name>.mp4`, `videos/<name>.<lang>.vtt` and a `.jpg` poster (the title card
at 1.5 s). An optional second argument narrates in another language (`cs` uses the
Piper voice, which needs `brew install espeak-ng`; it sounds noticeably worse, so the
site uses English narration with Czech subtitles).
Narration WAVs are cached in `out/cache/`, so re-renders only re-record the screen
(~2 min per language). Inspect results by extracting frames with ffmpeg; the
author cannot hear audio, so check timing via captions/frames.

## Embedding on a page

One button opens and plays the video in a dialog. Subtitles start in the viewer's last
choice (first time: the UI language); the dialog bar switches English / Čeština / Off,
and the choice is remembered per browser.

```html
<!-- inside the page hero, under .hero-subtitle -->
<div class="video-walkthrough" data-video-base="../videos/<name>"></div>
```

```js
import { initVideoWalkthroughs } from '../js/components/VideoWalkthrough.js';
initVideoWalkthroughs();
```

Labels come from `common.video.*` in `locales/*.json`; styles live in `css/styles.css`.

Several videos on one page (e.g. one per section, as in `sandbox/index.html`): use the
compact `video-walkthrough--inline` variant (outlined in the primary colour, for light
panels) and put the host **beside** the heading, never inside it: the i18n pass replaces
the `textContent` of `[data-i18n]` elements and would delete the button. A flex row such
as `<div class="sandbox-section-head"><h3 data-i18n="…">…</h3><div class="video-walkthrough
video-walkthrough--inline" …></div></div>` works. `data-video-title="<i18n key>"` gives
each button its own accessible name (`aria-label` + `title`, relabelled on language
change); the visible text stays `common.video.open`. `initVideoWalkthroughs()` is safe to
call more than once.

A host whose section changes content (e.g. the Dive Profile chart's tabs) can be
re-pointed with `setVideoWalkthrough(host, { base, title })`: it updates the base and the
title key and relabels the button; the next click opens the new video. `sandbox/index.html`
does this in `syncProfileVideo(btnId)` (map `profileVideos`, one video per tab).

## Writing a scenario

`scenes/<name>.mjs` default-exports `(lang) => scenario`. Copy
`scenes/transfilling.mjs`: one array of per-scene actions shared by all languages,
and per-language `lines` (`[caption, spoken]` pairs) of the same length. The English
`spoken` lines are narrated; every language's `caption` becomes that language's
subtitle cue for the scene, so keep each caption a faithful translation of the
English scene.

- **caption** follows the notation rules (non-breaking space between number and
  unit, decimal comma in Czech); **spoken** spells numbers out so the TTS reads
  them naturally. Keep the two saying the same thing.
- Voices: English alternates `bf_emma` / `bm_george`; Czech uses
  `{ piper: 'cs_CZ-jirka-medium' }` (the only Czech voice).
- Keep it ~60–100 s: intro card, a tour, one or two worked examples, a caveat, an
  outro card ("Try it yourself", path to the page, educational-use footer).
- Use `ui.expectText()` for every number the narration quotes, so a future change
  in the app fails the render instead of shipping a wrong video.

Scenario fields: `page` (path from repo root), `locale` (`en-US` / `cs-CZ`, which
drives the page language), `zoom` (body zoom, ~1.25 fills 1920×940),
`publish` (`videos/<name>`), `prepare(page, ui)` (runs before capture; put
the page into its starting state and show the intro card), `scenes`
(`{ voice, text, say, run(ui) }`). A scene lasts max(narration, run) + a short gap.

`ui` helpers (all async):

| Helper | Does |
|---|---|
| `card({ title, subtitle, footer })` / `card(null)` | full-screen title card on / off |
| `highlight(sel \| [sels], { union? })` / `highlight(null)` | orange ring(s) that follow their elements; scrolls them into view first. `union: true` draws one ring around all matches (e.g. a range of table rows) |
| `ring(rect \| [rects], { round?, pad? })` / `ring(null)` | ring fixed viewport rectangles `{left, top, width, height, round?}` (per-rect `round` mixes boxes and circles) — for things without a selector, like canvas chart features; `round: true` for points. `ring(null)` and `highlight(null)` both clear every ring |
| `glideTo(x, y, ms?)` | glide the visible cursor to viewport coordinates |
| `reveal(sel)` | smooth-scroll the element between the sticky nav and the bottom edge |
| `moveTo(sel, ms?)` / `click(sel, ms?)` | glide the visible cursor (default 700 ms); click with a ripple |
| `select(sel, value)` | pulse + set a `<select>` (native dropdowns are not captured) |
| `slide(sel, value)` | drag a range input to `value` |
| `expectText(sel, text)` | fail the render if the page shows something else |
| `cursorAway()` / `wait(ms)` | park the cursor off-screen / pause |

Viewport is 1920×940 CSS px; captions live in a 140 px bar below it, so content
can use the full height. The sticky `.main-nav` covers the top ~75 px.

Element rings track their target every frame, but a target that is *replaced* (e.g. a
table rebuilt with `innerHTML` after an edit) leaves the ring behind: `highlight(null)`
before the edit and highlight again afterwards.

## Pointing at Chart.js charts

Canvas content has no selectors. `lib/sandbox.mjs` (shared by the `sandbox-*` series)
computes viewport boxes from the live chart instance, ready for `ui.ring()` /
`ui.glideTo()`; each helper first waits two animation frames + 150 ms for the chart to
settle (after entering a chart's fullscreen, also wait ~400 ms for its resizes):

| Helper | Returns |
|---|---|
| `annotationBox(page, canvasSel, id, { part: 'label'? })` | box of a chartjs-plugin-annotation element (or its label), plus its `content` |
| `dataPoint(page, canvasSel, x, y, { xScale, yScale })` | `{x, y}` of a data value (profile chart: `yScale: 'yDepth'`) |
| `dataRect(page, canvasSel, x0, y0, x1, y1, …)` | box between two data corners, clipped to the plot area |
| `scaleBox(page, canvasSel, id)` / `chartAreaBox(page, canvasSel)` | an axis with ticks and title / the plot area |
| `legendBox(page, canvasSel, i, { match? })` | a legend item (by index or RegExp source), plus its `text` |
| `datasets(page, canvasSel)` | `[{label, hidden, data:[{x,y}]}]` for numeric checks |
| `dataPoints(page, canvasSel, [{x, y}], …)` | many data values → viewport points in one call (one settle), for cursor paths along a curve |
| `muteChartHover(page)` | recording only: no Chart.js hover tooltips while the visible cursor glides over the charts |
| `fitChartFullscreen(page, zoom)` | recording only: sizes the charts' CSS fullscreen to the zoomed viewport, so a zoomed chart (larger text) still fits the frame, and keeps the profile canvas uniformly scaled |
| `unstickNav(page)` | recording only: lets the sticky nav scroll away (more room for a zoomed table) |
| `hideFullscreenClose(page)` | recording only: hides the charts' fullscreen ✕ (it covers the right axis's top tick); it stays clickable for JS, so keep glides out of its 63 × 63 px area |
| `sampleAt(data, x)` / `pick(datasets, label \| RegExp)` | the sample nearest to x (e.g. a time) / a dataset by label, throwing with the available labels |

Zoom and canvases: with `zoom` ≠ 1 the generator reports the zoom as `devicePixelRatio`,
so Chart.js draws canvases at the recorded size instead of upscaling them (sharp chart
text). This applies to **every** scenario with `zoom` ≠ 1, including the older
ones (transfilling, cascade filling, gas law, deco table at 1.25): their next render gets
sharper canvases and a different backing-store size for components that read
`devicePixelRatio` (MValueChart, GFChart, the bubble model), so expect a pixel diff
against their current videos. The charts' CSS fullscreen ignores body zoom; call `fitChartFullscreen()` in
`prepare()` when a zoomed scenario uses it.

Selectors: `PROFILE_CANVAS`, `PP_CANVAS`. Series 2 (the other Dive Profile tabs) uses `introTabs(lang, n)` for its own "Dive Profile tabs · part n of 4" cards. The module also exports the series dive
(`DIVE_URL`), `EXPECTED_PLAN` + `assertPlan(page)` (call it in `prepare()`: any change to
the plan fails the render), and the series cards `intro(lang, n)` / `outro(lang)` (the
outro path is read from the nav labels in `locales/`).
