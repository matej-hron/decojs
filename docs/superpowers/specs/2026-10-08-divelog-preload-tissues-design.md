# Dive log: visible repetitive-dive preload in the Tissues view

Problem (phone screenshot, dives #100 → #101, 209 min interval): the summary says the dive carries
nitrogen from #100, but the Tissues view opens on TC1/TC2, which are back at surface saturation
(0.74 bar). The preload sits in the middle and slow compartments, so the chart shows none of it.

## Decisions

1. **Preload ranking** (`rankPreload`, `preloadFocus`, `compartmentSpan` in `js/import/diveChain.js`).
   Excess = start tissue pressure − surface saturation (the fresh-start value). Ranked compartments
   are those with excess ≥ `CHAIN_SETTLED_BAR` (0.01 bar), largest first. The *focus* is the ranked
   compartments with at least half the peak excess; the summary names their span (min–max id).
   *Why:* the absolute threshold matches the existing "settled" rule; the half-peak rule picks the
   bulk of the load whatever the dive (#101: peak 0.097 bar → TC8–TC15).
2. **Summary text**: "carries nitrogen from #100 (surface interval 3.5 h), mostly in TC8–TC15";
   several dives: "from #92, #93, #94 (last surface interval 2.1 h)". No positive excess → the
   "mostly in" part is left out. *Why:* the user needs to know where to look, not how many dives.
3. **Initial selection**: a chained dive opens the Tissues view on the top 3 compartments by
   excess; a fresh dive on the chart default. Once the user picks compartments themselves (chip,
   quick button, keys) the suggestion is not applied again. A "Carried over" quick button re-selects
   the suggestion. *Why:* show the preload by default without fighting an explicit choice.
4. **Start marker**: tissue lines that start ≥ 0.01 bar above surface saturation get a hollow dot
   at t = 0, and one small muted label "carried over from #100" next to the highest dot.
   Opt-in option `carriedOverLabel` (null = off), so Sandbox and Theory are unchanged.
5. **Phone polish** (narrow layout only, dive log):
   - keyboard hint hidden on coarse pointers (`(pointer: coarse)`), everywhere — it never applies to touch;
   - compartment chips in two rows of 8 with the quick buttons on one row, the same chip style as
     the P-P and GF charts (consistency over a new disclosure widget);
   - Tissues view on a narrow chart (opt-in `narrowDepthBand`): the depth axis is hidden, the depth
     profile stays as a light background band with a thin edge, the pressure axis (on the right, where it
     already is: Chart.js reads `position` before plugins run) gets the grid — one y axis;
   - depth axis maximum is `ceil(max depth + 5)`, so a recorded 10.1 m dive ends at 16, not 15.10.
     Integer Sandbox depths give the same value as before.
