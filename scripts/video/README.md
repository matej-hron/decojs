# Video walkthroughs

Generates narrated walkthrough videos of DecoJS pages: Playwright drives the real
page, Kokoro speaks the English narration, ffmpeg mixes the audio and leaves a bar
under the page where the player draws the subtitles. Subtitles ship as WebVTT
tracks (one per language in the scenario), so viewers pick their language.

```bash
cd scripts/video
npm install                     # once
npm run video -- scenes/transfilling.mjs
```

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
| `highlight(sel \| [sels])` / `highlight(null)` | orange ring(s); scrolls them into view first |
| `reveal(sel)` | smooth-scroll the element between the sticky nav and the bottom edge |
| `moveTo(sel, ms?)` / `click(sel, ms?)` | glide the visible cursor (default 700 ms); click with a ripple |
| `select(sel, value)` | pulse + set a `<select>` (native dropdowns are not captured) |
| `slide(sel, value)` | drag a range input to `value` |
| `expectText(sel, text)` | fail the render if the page shows something else |
| `cursorAway()` / `wait(ms)` | park the cursor off-screen / pause |

Viewport is 1920×940 CSS px; captions live in a 140 px bar below it, so content
can use the full height. The sticky `.main-nav` covers the top ~75 px.
