# Mobile-portrait dive charts — design

Date: 2026-10-08 · Branch: `feat/mobile-charts`

## Problem

User report: "charts are broken until the phone is rotated to landscape". At 390 px portrait
(measured in Chrome via an iframe harness):

- **P-P / GF charts squashed.** Hosts have page-fixed heights (dive log 640 px, Sandbox 700 px, …).
  Inside that height the wrapper stacks 5 rows of compartment chips, the playback bar, the plot and
  a 100 px mini profile, so the plot gets ~190 px. The vertical axis title is then longer than the
  plot and gets clipped ("sue N₂ Pressure (ba").
- **Lock / reset / fullscreen buttons cover the legend** (top-right overlay, centred legend at 330 px).
- **Legend boxes are 40 px wide**, which wastes a whole line at 330 px.
- **Playback bar overflows**: five buttons, the slider and a 120 px time readout don't fit; the
  readout and part of the slider are off-card.
- **Compartment chips take 5 rows**, and the keyboard-shortcut hint is noise on touch.
- **GF tissue ranking is hidden** below 800 px chart width, so phones never see it.
- **Profile annotation labels clip** at the plot edges ("SURFACE INTE…", "20 m/min" cut on the left).

Desktop must not change.

## Decisions

1. **Narrow = chart host width ≤ 600 px, detected in JS per chart**, and marked by a `chart-narrow`
   class on the host element. *Why:* CSS container queries would put layout containment on the
   host, and that makes the host the containing block for the `position: fixed` fullscreen
   wrapper. Viewport media queries would also miss narrow hosts on wide screens.
   Shared module `js/charts/narrowLayout.js`, unit-tested.
2. **Height on narrow (P-P, GF):** the host drops its page-fixed height (`height: auto !important`
   under `.chart-narrow`). The plot gets `aspect-ratio: 1`, bounded to 300 px–70 vh, and the mini
   profile shrinks to 64 px. *Why:* every page sets its own fixed height inline, so one component
   rule fixes all pages, and the P-P diagram is square by nature.
3. **Height on narrow (profile):** keep the page height but cap it at `max-height: 460px`.
   *Why:* small hosts (the 200–250 px mini profiles on the theory pages) stay small, and tall hosts
   (600 px) stop looking stretched.
4. **Button gutter:** narrow charts reserve 40 px at the top of the canvas (Chart.js
   `layout.padding.top`), so the buttons sit above the legend instead of on it. Buttons become
   36×36 px touch targets. *Why:* at 360 px the centred, wrapping legend leaves no free corner.
5. **Narrow chart options are applied by one Chart.js plugin** (`narrowChartPlugin`, run in
   `beforeUpdate`). Overrides: legend box 14 px, padding 6, font 11; axis titles 11; ticks 10;
   annotation label fonts −1 px (minimum 8) with tighter padding; top padding 40. The original
   values are saved and restored when the chart widens again (phone rotation crosses 600 px).
   Chart.js calls `update()` on resize, so rotation re-adapts with no component code.
   *Why:* one tested function, the same behaviour in all three charts, and the desktop path is
   untouched (a no-op when wide).
6. **Compartment chips on narrow:** a compact 8-per-row grid (two rows for 16 tissues). The
   checkbox is visually hidden but stays in the DOM; the selected state shows as a tinted fill
   (`:has(input:checked)`); chips are at least 34 px tall. Quick buttons and the alveolar toggle
   share the first row. The keyboard-shortcut hint is hidden. *Why:* a horizontally scrolling row
   would hide most of the selection state; the grid shows all 16 at a glance.
7. **Playback bar on narrow:** 40 px buttons with the time readout right-aligned on the same row;
   the slider wraps to its own full-width row with a 32 px hit area. *Why:* it doesn't fit on one
   line, and the slider is the main touch control.
8. **GF ranking on narrow:** shown *below* the plot as a compact wrapping list
   ("Tissue ranking · ● TC1 92,1 % · ● TC3 80,4 % …") instead of being hidden.
   600–800 px: unchanged (hidden). ≥ 800 px: unchanged (overlay at right).
   *Why:* the brief asks for it below on narrow, and an overlay would cover the plot.
9. **Shared classes added to existing DOM** (`chart-compartments`, `chart-chip`, `chart-quick-btns`,
   `chart-hint`, `chart-timeline`, `chart-timeline-btn`, `chart-timeline-slider`,
   `chart-timeline-time`, `chart-overlay-btn`). Narrow CSS targets these, and the existing
   inline styles stay exactly as they are. Narrow rules use `!important` only where they must
   beat an inline style. *Why:* desktop stays pixel-identical with no refactor risk.
10. **Dark theme:** no new hard-coded colours; new narrow-only elements use tokens. The existing
    light inline control backgrounds in dark mode predate this work and are out of scope.

## Out of scope / known gaps

- Selecting several compartments on touch: shift+click has no touch equivalent (presets
  All/Fast/Slow still work). A long-press toggle could follow.
- `RecordedDiveAnalysis` profile y-axis shows an odd top tick ("15.10"); this also happens on
  desktop.

## Testing

- `tests/chart-narrow-layout.test.mjs` (node:test): the width threshold, applying and restoring
  overrides on plain option objects, annotation font shrinking, and the host class toggle.
- Browser at 390×844 and 360 px (iframe harness), plus desktop width, light and dark
  (`data-theme="dark"`): Sandbox, theory pages (pressure, tissue-loading, m-values,
  gradient-factors), sandbox/repetitive-dives, the dive log (logged-out demo copy in the scratchpad
  harness). Check: no horizontal page scroll, legend not covered, axis titles whole, playback
  usable, ranking below the GF plot.
