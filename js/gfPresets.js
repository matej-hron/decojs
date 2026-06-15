/**
 * Gradient-Factor presets shared by the dive-setup editor and the trip-config
 * GF picker — single source of truth so the two lists can't drift.
 * labelKey/titleKey are i18n keys; label/title are English fallbacks.
 */
export const GF_PRESETS = [
    { labelKey: 'diveEditor.gf.presetBuhlmann',    label: 'Bühlmann',     titleKey: 'diveEditor.gf.presetBuhlmannTitle',    title: 'Raw Bühlmann tables, no conservatism', gfLow: 100, gfHigh: 100 },
    { labelKey: 'diveEditor.gf.presetRecreational', label: 'Recreational', titleKey: 'diveEditor.gf.presetRecreationalTitle', title: 'Recreational: ≤40m, short deco',        gfLow: 60,  gfHigh: 90  },
    { labelKey: 'diveEditor.gf.presetIntensive',   label: 'Intensive',    titleKey: 'diveEditor.gf.presetIntensiveTitle',   title: 'Intensive: repeat dives, safari',       gfLow: 40,  gfHigh: 80  },
    { labelKey: 'diveEditor.gf.presetDeep',        label: 'Deep',         titleKey: 'diveEditor.gf.presetDeepTitle',        title: 'Deep: >60m, single dive',               gfLow: 50,  gfHigh: 90  },
    { labelKey: 'diveEditor.gf.presetBailout',     label: 'Bailout',      titleKey: 'diveEditor.gf.presetBailoutTitle',     title: 'Bailout: emergency',                    gfLow: 80,  gfHigh: 100 },
    { labelKey: 'diveEditor.gf.presetDecoPlanner', label: 'Deco Planner', titleKey: 'diveEditor.gf.presetDecoPlannerTitle', title: 'Deco Planner default',                  gfLow: 20,  gfHigh: 80  },
    { labelKey: 'diveEditor.gf.presetFreedom',     label: 'Freedom',      titleKey: 'diveEditor.gf.presetFreedomTitle',     title: 'Divesoft Freedom default',              gfLow: 30,  gfHigh: 80  }
];
