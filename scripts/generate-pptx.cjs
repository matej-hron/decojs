const pptxgen = require("pptxgenjs");
const path = require("path");

const IMG = path.join(__dirname, "..", "images", "slides");

// =========================================================================
// THEME
// =========================================================================
const C = {
    darkBg:    "0D2137",
    primary:   "2980B9",
    secondary: "1C7293",
    lightBg:   "F0F6FC",
    white:     "FFFFFF",
    text:      "1E293B",
    textLight: "FFFFFF",
    muted:     "64748B",
    danger:    "E74C3C",
    warning:   "F39C12",
    success:   "2ECC71",
    accent:    "21295C",
};

const FONT = { title: "Georgia", body: "Calibri" };

// Sandbox URLs (with encoded dive profiles)
const SANDBOX_BASE = "https://decotheory.eu/sandbox/?profile=eyJpZCI6ImRlY28tMjBtLTQwbWluIiwibmFtZSI6IjIwbSBEZWNvIERpdmUiLCJnYXNlcyI6W3siaWQiOiJhaXIiLCJuYW1lIjoiQWlyIiwibzIiOjAuMjEsIm4yIjowLjc5LCJoZSI6MCwiY3lsaW5kZXJWb2x1bWUiOjE4LCJzdGFydFByZXNzdXJlIjoyMDB9XSwiZ2ZMb3ciOjUwLCJnZkhpZ2giOjgwLCJkaXZlcyI6W3sid2F5cG9pbnRzIjpbeyJ0aW1lIjowLCJkZXB0aCI6MH0seyJ0aW1lIjoxLCJkZXB0aCI6MjAsImdhc0lkIjoiYWlyIn0seyJ0aW1lIjo0MCwiZGVwdGgiOjIwfSx7InRpbWUiOjQyLCJkZXB0aCI6Nn0seyJ0aW1lIjo0MywiZGVwdGgiOjZ9LHsidGltZSI6NDQsImRlcHRoIjozfSx7InRpbWUiOjUxLCJkZXB0aCI6M30seyJ0aW1lIjo1MiwiZGVwdGgiOjB9XX1dLCJkZXNjcmlwdGlvbiI6IkEgMjBtIGRpdmUgZm9yIDQwIG1pbnV0ZXMgd2l0aCBjb25zZXJ2YXRpdmUgR0YgNTAvODAiLCJzdXJmYWNlSW50ZXJ2YWwiOjAuMX0";
const sandboxUrl = (mode) => `${SANDBOX_BASE}&chart=${mode}`;

// =========================================================================
// HELPERS
// =========================================================================

function makeShadow() {
    return { type: "outer", color: "000000", blur: 4, offset: 2, angle: 135, opacity: 0.12 };
}

function addSectionTitle(slide, title) {
    // Colored top bar
    slide.addShape("rect", {
        x: 0, y: 0, w: 10, h: 0.06,
        fill: { color: C.primary },
    });
    slide.addText(title, {
        x: 0.6, y: 0.25, w: 8.8, h: 0.5,
        fontSize: 28, fontFace: FONT.title, color: C.text, bold: true, margin: 0,
    });
}

function addSandboxLink(slide, mode, y) {
    slide.addText("Open in Sandbox  \u2192", {
        x: 6.5, y: y, w: 3, h: 0.35,
        fontSize: 12, fontFace: FONT.body, color: C.primary, align: "right",
        hyperlink: { url: sandboxUrl(mode) },
    });
}

function addFooter(slide, pageNum, total) {
    slide.addText("decotheory.eu", {
        x: 0.5, y: 5.15, w: 3, h: 0.35,
        fontSize: 9, fontFace: FONT.body, color: C.muted,
        hyperlink: { url: "https://decotheory.eu/pressure.html" },
    });
    slide.addText(`${pageNum} / ${total}`, {
        x: 8, y: 5.15, w: 1.5, h: 0.35,
        fontSize: 9, fontFace: FONT.body, color: C.muted, align: "right",
    });
}

// =========================================================================
// PRESENTATION
// =========================================================================
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Deco Theory";
pres.title = "Pressure & Partial Pressure";
pres.subject = "Scuba Diving Decompression Theory";

const TOTAL_SLIDES = 13;
let slideNum = 0;

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 1: Title
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.darkBg };

    // Subtle accent line at top
    s.addShape("rect", { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.primary } });

    s.addText("Pressure &\nPartial Pressure", {
        x: 0.8, y: 1.0, w: 8.4, h: 2.2,
        fontSize: 44, fontFace: FONT.title, color: C.textLight, bold: true,
        lineSpacingMultiple: 1.15,
    });
    s.addText("Understanding how pressure changes with depth\nand affects the gases you breathe", {
        x: 0.8, y: 3.2, w: 8.4, h: 1.0,
        fontSize: 18, fontFace: FONT.body, color: C.muted, lineSpacingMultiple: 1.4,
    });

    // Bottom bar
    s.addShape("rect", { x: 0, y: 5.1, w: 10, h: 0.525, fill: { color: C.accent } });
    s.addText("decotheory.eu", {
        x: 0.8, y: 5.15, w: 4, h: 0.4,
        fontSize: 14, fontFace: FONT.body, color: C.muted,
        hyperlink: { url: "https://decotheory.eu" },
    });
    s.addText("Deco Theory  |  Educational Use Only", {
        x: 5, y: 5.15, w: 4.5, h: 0.4,
        fontSize: 12, fontFace: FONT.body, color: C.muted, align: "right",
    });
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 2: Dive Profile Chart
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Dive Profile Terminology");

    s.addText("A dive profile is a graphical representation of your dive, showing depth over time.", {
        x: 0.6, y: 0.85, w: 8.8, h: 0.4,
        fontSize: 13, fontFace: FONT.body, color: C.muted,
    });

    s.addImage({
        path: path.join(IMG, "dive-profile.png"),
        x: 0.3, y: 1.35, w: 9.4, h: 3.4,
        shadow: makeShadow(),
    });

    addSandboxLink(s, "profile", 4.8);
    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 3: Key Terms
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Key Terms");

    s.addImage({
        path: path.join(IMG, "terminology-legend.png"),
        x: 0.3, y: 0.95, w: 9.4, h: 2.75,
        shadow: makeShadow(),
    });

    // Additional notes below the image
    const terms = [
        { label: "Descent", desc: "Surface to planned depth. Rate: \u226418\u201320 m/min." },
        { label: "Bottom Time", desc: "Start of descent to start of final ascent." },
        { label: "TDT", desc: "Total Dive Time \u2014 entire dive from leaving surface to return." },
        { label: "Safety Stop", desc: "Voluntary 3 min at 3\u20135 m. Deco Stop = mandatory." },
    ];
    const textArr = terms.map((t, i) => ([
        { text: `${t.label}: `, options: { bold: true, fontSize: 11, breakLine: false } },
        { text: t.desc, options: { fontSize: 11, breakLine: i < terms.length - 1 } },
    ])).flat();
    s.addText(textArr, {
        x: 0.6, y: 3.9, w: 8.8, h: 1.2,
        fontFace: FONT.body, color: C.text, paraSpaceAfter: 4,
    });

    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 4: Total Pressure Underwater
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Total Pressure Underwater");

    // Left column: explanation
    s.addText("Two sources of pressure:", {
        x: 0.6, y: 0.95, w: 4.5, h: 0.35,
        fontSize: 14, fontFace: FONT.body, color: C.text, bold: true,
    });
    s.addText([
        { text: "Atmospheric pressure", options: { bold: true, breakLine: true, bullet: true } },
        { text: "Weight of air above you \u2248 1 bar at sea level", options: { fontSize: 12, color: C.muted, breakLine: true, indentLevel: 1 } },
        { text: "Hydrostatic pressure", options: { bold: true, breakLine: true, bullet: true } },
        { text: "Weight of water above you \u2248 1 bar per 10 m", options: { fontSize: 12, color: C.muted, breakLine: true, indentLevel: 1 } },
    ], {
        x: 0.6, y: 1.35, w: 4.5, h: 1.6,
        fontSize: 13, fontFace: FONT.body, color: C.text, paraSpaceAfter: 2,
    });

    // Formula box
    s.addShape("rect", {
        x: 0.6, y: 3.1, w: 4.5, h: 0.8,
        fill: { color: C.lightBg },
        shadow: makeShadow(),
    });
    s.addText("P_amb = 1 + depth/10  (bar)", {
        x: 0.8, y: 3.15, w: 4.1, h: 0.7,
        fontSize: 16, fontFace: "Consolas", color: C.accent, align: "center", valign: "middle",
    });

    // Right column: depth/pressure table
    s.addShape("rect", {
        x: 5.5, y: 0.95, w: 4, h: 0.45,
        fill: { color: C.primary },
    });
    s.addText([
        { text: "Depth", options: { bold: true } },
        { text: "                  ", options: {} },
        { text: "Total Pressure", options: { bold: true } },
    ], {
        x: 5.5, y: 0.95, w: 4, h: 0.45,
        fontSize: 13, fontFace: FONT.body, color: C.textLight, align: "center", valign: "middle",
    });

    const depthData = [
        ["Surface", "1 bar"],
        ["10 m", "2 bar"],
        ["20 m", "3 bar"],
        ["30 m", "4 bar"],
        ["40 m", "5 bar"],
    ];
    depthData.forEach((row, i) => {
        const yy = 1.4 + i * 0.38;
        const bg = i % 2 === 0 ? C.lightBg : C.white;
        s.addShape("rect", { x: 5.5, y: yy, w: 4, h: 0.38, fill: { color: bg } });
        s.addText(row[0], { x: 5.7, y: yy, w: 1.8, h: 0.38, fontSize: 12, fontFace: FONT.body, color: C.text, valign: "middle" });
        s.addText(row[1], { x: 7.5, y: yy, w: 1.8, h: 0.38, fontSize: 12, fontFace: FONT.body, color: C.accent, bold: true, valign: "middle", align: "center" });
    });

    // Note at bottom
    s.addText("Each 10 m of seawater adds approximately 1 bar of pressure.", {
        x: 0.6, y: 4.3, w: 8.8, h: 0.4,
        fontSize: 12, fontFace: FONT.body, color: C.muted, italic: true,
    });

    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 5: Pressure Chart
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Dive Profile with Total Pressure");

    s.addImage({
        path: path.join(IMG, "pressure-chart.png"),
        x: 0.3, y: 0.95, w: 9.4, h: 3.7,
        shadow: makeShadow(),
    });

    addSandboxLink(s, "pressure", 4.75);
    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 6: Gas Consumption
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Gas Consumption");

    // Left: Boyle's Law explanation
    s.addText("Why Depth Matters for Gas Supply", {
        x: 0.6, y: 0.95, w: 5, h: 0.35,
        fontSize: 15, fontFace: FONT.body, color: C.text, bold: true,
    });
    s.addText([
        { text: "Boyle-Mariotte's Law: ", options: { bold: true } },
        { text: "as pressure increases, gas volume decreases proportionally. At depth, each breath draws more gas molecules from your tank.", options: {} },
    ], {
        x: 0.6, y: 1.35, w: 5, h: 1.0,
        fontSize: 12, fontFace: FONT.body, color: C.text, lineSpacingMultiple: 1.3,
    });

    // SAC rate box
    s.addShape("rect", {
        x: 0.6, y: 2.5, w: 5, h: 0.45,
        fill: { color: C.lightBg },
    });
    s.addText("SAC Rate (Surface Air Consumption) \u2248 20 L/min", {
        x: 0.8, y: 2.5, w: 4.6, h: 0.45,
        fontSize: 12, fontFace: FONT.body, color: C.accent, bold: true, valign: "middle",
    });

    // Consumption at depth
    s.addText("At depth: Consumption = SAC \u00d7 Ambient Pressure", {
        x: 0.6, y: 3.1, w: 5, h: 0.35,
        fontSize: 12, fontFace: FONT.body, color: C.text, bold: true,
    });

    // Right: consumption table
    s.addShape("rect", {
        x: 6, y: 0.95, w: 3.5, h: 0.4,
        fill: { color: C.primary },
    });
    s.addText("Depth         Consumption", {
        x: 6, y: 0.95, w: 3.5, h: 0.4,
        fontSize: 12, fontFace: FONT.body, color: C.textLight, align: "center", valign: "middle", bold: true,
    });

    const sacData = [
        ["Surface (1 bar)", "20 L/min"],
        ["10 m (2 bar)", "40 L/min"],
        ["20 m (3 bar)", "60 L/min"],
        ["30 m (4 bar)", "80 L/min"],
        ["40 m (5 bar)", "100 L/min"],
    ];
    sacData.forEach((row, i) => {
        const yy = 1.35 + i * 0.36;
        const bg = i % 2 === 0 ? C.lightBg : C.white;
        s.addShape("rect", { x: 6, y: yy, w: 3.5, h: 0.36, fill: { color: bg } });
        s.addText(row[0], { x: 6.15, y: yy, w: 2, h: 0.36, fontSize: 11, fontFace: FONT.body, color: C.text, valign: "middle" });
        s.addText(row[1], { x: 8.1, y: yy, w: 1.3, h: 0.36, fontSize: 11, fontFace: FONT.body, color: C.danger, bold: true, valign: "middle", align: "center" });
    });

    // Formula box
    s.addShape("rect", {
        x: 0.6, y: 3.6, w: 8.8, h: 0.65,
        fill: { color: C.lightBg },
        shadow: makeShadow(),
    });
    s.addText("Gas Available = V_cylinder \u00d7 (P_start \u2212 P_reserve)    |    e.g. 12L \u00d7 (200\u221250) = 1800 L", {
        x: 0.8, y: 3.6, w: 8.4, h: 0.65,
        fontSize: 13, fontFace: "Consolas", color: C.accent, valign: "middle", align: "center",
    });

    // Warning note
    s.addText("Deeper dives consume gas exponentially faster \u2014 always plan conservatively!", {
        x: 0.6, y: 4.4, w: 8.8, h: 0.35,
        fontSize: 11, fontFace: FONT.body, color: C.danger, italic: true,
    });

    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 7: Gas Consumption Chart
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Gas Consumption During Dive");

    s.addImage({
        path: path.join(IMG, "gas-consumption-chart.png"),
        x: 0.3, y: 0.95, w: 9.4, h: 3.7,
        shadow: makeShadow(),
    });

    addSandboxLink(s, "gas", 4.75);
    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 8: Air Composition
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Air Composition");

    // Left: doughnut chart
    s.addImage({
        path: path.join(IMG, "air-composition.png"),
        x: 0.3, y: 0.95, w: 3.5, h: 3.5,
    });

    // Right: explanation
    s.addText("What's in the Air You Breathe?", {
        x: 4.2, y: 0.95, w: 5.3, h: 0.35,
        fontSize: 15, fontFace: FONT.body, color: C.text, bold: true,
    });

    // Gas breakdown cards
    const gases = [
        { name: "Nitrogen (N\u2082)", pct: "78%", desc: "Inert gas \u2014 does not participate in metabolism", color: "3498DB" },
        { name: "Oxygen (O\u2082)", pct: "21%", desc: "Essential for life, but toxic at high partial pressures", color: "2ECC71" },
        { name: "Other gases", pct: "1%", desc: "Primarily Argon, CO\u2082, and trace gases", color: "95A5A6" },
    ];

    gases.forEach((gas, i) => {
        const yy = 1.5 + i * 0.85;
        // Color dot
        s.addShape("oval", { x: 4.3, y: yy + 0.08, w: 0.2, h: 0.2, fill: { color: gas.color } });
        s.addText(`${gas.name}  \u2014  ${gas.pct}`, {
            x: 4.65, y: yy, w: 4.8, h: 0.3,
            fontSize: 13, fontFace: FONT.body, color: C.text, bold: true,
        });
        s.addText(gas.desc, {
            x: 4.65, y: yy + 0.32, w: 4.8, h: 0.3,
            fontSize: 11, fontFace: FONT.body, color: C.muted,
        });
    });

    // Breathing mixtures
    s.addShape("rect", { x: 4.2, y: 4.0, w: 5.3, h: 0.06, fill: { color: C.primary } });
    s.addText([
        { text: "Nitrox (EAN): ", options: { bold: true } },
        { text: "More O\u2082, less N\u2082 loading.  ", options: {} },
        { text: "Trimix: ", options: { bold: true } },
        { text: "Adds helium for deep diving.", options: {} },
    ], {
        x: 4.2, y: 4.15, w: 5.3, h: 0.45,
        fontSize: 11, fontFace: FONT.body, color: C.text,
    });

    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 9: Dalton's Law
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Dalton's Law of Partial Pressures");

    s.addText("The total pressure of a gas mixture equals the sum of the partial pressures of each component gas.", {
        x: 0.6, y: 0.9, w: 8.8, h: 0.45,
        fontSize: 13, fontFace: FONT.body, color: C.text, italic: true,
    });

    // Formula boxes
    s.addShape("rect", { x: 0.6, y: 1.5, w: 4.2, h: 0.6, fill: { color: C.lightBg }, shadow: makeShadow() });
    s.addText("pp_x = f_x \u00d7 P_amb", {
        x: 0.6, y: 1.5, w: 4.2, h: 0.6,
        fontSize: 18, fontFace: "Consolas", color: C.accent, align: "center", valign: "middle",
    });

    s.addText([
        { text: "pp_x", options: { bold: true, fontFace: "Consolas" } },
        { text: " = partial pressure of gas x (bar)", options: { breakLine: true } },
        { text: "f_x", options: { bold: true, fontFace: "Consolas" } },
        { text: " = fraction of gas x (e.g. 0.21 for 21%)", options: { breakLine: true } },
        { text: "P_amb", options: { bold: true, fontFace: "Consolas" } },
        { text: " = ambient pressure = 1 + depth/10", options: {} },
    ], {
        x: 5.2, y: 1.4, w: 4.3, h: 0.9,
        fontSize: 11, fontFace: FONT.body, color: C.text, paraSpaceAfter: 2,
    });

    // Example: Air at 30m
    s.addShape("rect", { x: 0.6, y: 2.55, w: 8.8, h: 0.4, fill: { color: C.primary } });
    s.addText("Example: Air at 30 meters  (P_amb = 4 bar)", {
        x: 0.8, y: 2.55, w: 8.4, h: 0.4,
        fontSize: 14, fontFace: FONT.body, color: C.textLight, bold: true, valign: "middle",
    });

    // Example table
    const exHeaders = [
        [
            { text: "Gas", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Fraction", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Calculation", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Partial Pressure", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
        ],
        ["O\u2082", "0.21", "0.21 \u00d7 4", { text: "0.84 bar", options: { bold: true, color: C.success } }],
        ["N\u2082", "0.79", "0.79 \u00d7 4", { text: "3.16 bar", options: { bold: true, color: C.warning } }],
    ];
    s.addTable(exHeaders, {
        x: 1.5, y: 3.05, w: 7, colW: [1.2, 1.5, 2, 2.3],
        fontSize: 12, fontFace: FONT.body, color: C.text,
        border: { pt: 0.5, color: "E0E0E0" },
        rowH: [0.35, 0.35, 0.35],
    });

    // Operational vs Physiological note
    s.addShape("rect", { x: 0.6, y: 4.2, w: 8.8, h: 0.7, fill: { color: C.lightBg } });
    s.addText([
        { text: "Operational: ", options: { bold: true } },
        { text: "ppO\u2082 = f_O\u2082 \u00d7 P_amb  (MOD / gas limits)", options: { breakLine: true } },
        { text: "Physiological: ", options: { bold: true } },
        { text: "pp_inert = f_inert \u00d7 (P_amb \u2212 0.0627)  (tissue kinetics, subtracts water vapour)", options: {} },
    ], {
        x: 0.8, y: 4.2, w: 8.4, h: 0.7,
        fontSize: 11, fontFace: FONT.body, color: C.text, valign: "middle", paraSpaceAfter: 2,
    });

    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 10: Oxygen Limits & MOD
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Partial Pressure Limits \u2014 Oxygen (ppO\u2082)");

    // ppO2 limits table
    const o2Headers = [
        [
            { text: "ppO\u2082 (bar)", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Status", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Notes", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
        ],
        [
            "< 0.16",
            { text: "\u26ab Hypoxia", options: { color: C.danger, bold: true } },
            "Loss of consciousness, death",
        ],
        [
            "0.16 \u2013 0.50",
            { text: "\ud83d\udfe2 Normal", options: { color: C.success, bold: true } },
            "Surface breathing range",
        ],
        [
            "0.50 \u2013 1.40",
            { text: "\ud83d\udfe2 Safe for diving", options: { color: C.success, bold: true } },
            "Recommended working limit",
        ],
        [
            "1.40 \u2013 1.60",
            { text: "\ud83d\udfe1 Caution", options: { color: C.warning, bold: true } },
            "Deco stops only. Limited exposure.",
        ],
        [
            "> 1.60",
            { text: "\ud83d\udd34 Danger", options: { color: C.danger, bold: true } },
            "High risk of CNS O\u2082 toxicity",
        ],
    ];
    s.addTable(o2Headers, {
        x: 0.4, y: 0.85, w: 5.5, colW: [1.2, 1.8, 2.5],
        fontSize: 10, fontFace: FONT.body, color: C.text,
        border: { pt: 0.5, color: "E0E0E0" },
        rowH: [0.38, 0.35, 0.35, 0.35, 0.35, 0.35],
    });

    // MOD section on right
    s.addText("Maximum Operating Depth (MOD)", {
        x: 6.2, y: 0.85, w: 3.5, h: 0.35,
        fontSize: 14, fontFace: FONT.body, color: C.text, bold: true,
    });

    s.addShape("rect", { x: 6.2, y: 1.3, w: 3.5, h: 0.5, fill: { color: C.lightBg }, shadow: makeShadow() });
    s.addText("MOD = (ppO\u2082max / fO\u2082 \u2212 1) \u00d7 10", {
        x: 6.2, y: 1.3, w: 3.5, h: 0.5,
        fontSize: 12, fontFace: "Consolas", color: C.accent, align: "center", valign: "middle",
    });

    // MOD examples table
    const modHeaders = [
        [
            { text: "Gas", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "fO\u2082", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "MOD", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
        ],
        ["Air (21%)", "0.21", { text: "56.7 m", options: { bold: true } }],
        ["EAN32", "0.32", { text: "33.8 m", options: { bold: true } }],
        ["EAN36", "0.36", { text: "28.9 m", options: { bold: true } }],
        ["EAN40", "0.40", { text: "25.0 m", options: { bold: true } }],
    ];
    s.addTable(modHeaders, {
        x: 6.2, y: 2.0, w: 3.5, colW: [1.3, 0.8, 1.4],
        fontSize: 11, fontFace: FONT.body, color: C.text,
        border: { pt: 0.5, color: "E0E0E0" },
        rowH: [0.3, 0.3, 0.3, 0.3, 0.3],
    });

    s.addText("Higher O\u2082 fraction \u2192 shallower MOD", {
        x: 6.2, y: 3.55, w: 3.5, h: 0.3,
        fontSize: 10, fontFace: FONT.body, color: C.danger, italic: true,
    });

    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 11: Nitrogen Narcosis
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Nitrogen Narcosis (ppN\u2082)");

    // Left: Martini Rule
    s.addShape("rect", {
        x: 0.5, y: 0.9, w: 4.5, h: 2.8,
        fill: { color: C.lightBg },
        shadow: makeShadow(),
    });
    s.addText('\ud83c\udf78 The "Martini Rule"', {
        x: 0.7, y: 1.0, w: 4.1, h: 0.35,
        fontSize: 15, fontFace: FONT.body, color: C.text, bold: true,
    });
    s.addText("Every 10 m of depth on air \u2248 one martini on an empty stomach.", {
        x: 0.7, y: 1.4, w: 4.1, h: 0.4,
        fontSize: 11, fontFace: FONT.body, color: C.text,
    });
    s.addText([
        { text: "10 m \u2014 1 martini", options: { bullet: true, breakLine: true } },
        { text: "20 m \u2014 2 martinis", options: { bullet: true, breakLine: true } },
        { text: "30 m \u2014 3 martinis", options: { bullet: true, breakLine: true } },
        { text: "40 m \u2014 4 martinis", options: { bullet: true } },
    ], {
        x: 0.9, y: 1.9, w: 3.9, h: 1.2,
        fontSize: 12, fontFace: FONT.body, color: C.text,
    });
    s.addText("Individual susceptibility varies. Cold, stress, and fatigue increase narcosis.", {
        x: 0.7, y: 3.15, w: 4.1, h: 0.4,
        fontSize: 9, fontFace: FONT.body, color: C.muted, italic: true,
    });

    // Right: ppN2 effects table
    const n2Headers = [
        [
            { text: "ppN\u2082 (bar)", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Depth (Air)", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Effects", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
        ],
        [
            "< 2.4",
            "< 20 m",
            { text: "Minimal effects", options: { color: C.success } },
        ],
        [
            "2.4 \u2013 3.2",
            "20 \u2013 30 m",
            { text: "Mild euphoria, slight impairment", options: { color: C.warning } },
        ],
        [
            "3.2 \u2013 4.0",
            "30 \u2013 40 m",
            { text: "Noticeable impairment", options: { color: C.warning } },
        ],
        [
            "> 4.0",
            "> 40 m",
            { text: "Severe narcosis. Max rec. limit.", options: { color: C.danger, bold: true } },
        ],
    ];
    s.addTable(n2Headers, {
        x: 5.3, y: 0.9, w: 4.4, colW: [1.1, 1.2, 2.1],
        fontSize: 10, fontFace: FONT.body, color: C.text,
        border: { pt: 0.5, color: "E0E0E0" },
        rowH: [0.32, 0.32, 0.36, 0.36, 0.36],
    });

    // Nitrox note
    s.addShape("rect", { x: 5.3, y: 2.7, w: 4.4, h: 0.5, fill: { color: C.lightBg } });
    s.addText("Nitrox pushes narcosis limit deeper, but oxygen MOD kicks in first \u2014 always respect both limits.", {
        x: 5.4, y: 2.7, w: 4.2, h: 0.5,
        fontSize: 10, fontFace: FONT.body, color: C.text, valign: "middle",
    });

    // Max depth for narcosis limit table
    s.addText("Max depth for ppN\u2082 = 4.0 bar:", {
        x: 0.5, y: 3.55, w: 4, h: 0.3,
        fontSize: 12, fontFace: FONT.body, color: C.text, bold: true,
    });

    const narcTable = [
        [
            { text: "Gas", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "fN\u2082", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Max Depth", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Note", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
        ],
        ["Air", "0.79", { text: "40.6 m", options: { bold: true } }, ""],
        ["EAN32", "0.68", { text: "48.8 m", options: { bold: true } }, { text: "but MOD is 33.8 m!", options: { color: C.danger, fontSize: 9 } }],
        ["EAN36", "0.64", { text: "52.5 m", options: { bold: true } }, { text: "but MOD is 28.9 m!", options: { color: C.danger, fontSize: 9 } }],
        ["EAN40", "0.60", { text: "56.7 m", options: { bold: true } }, { text: "but MOD is 25.0 m!", options: { color: C.danger, fontSize: 9 } }],
    ];
    s.addTable(narcTable, {
        x: 0.5, y: 3.9, w: 9, colW: [1.2, 1.0, 1.5, 5.3],
        fontSize: 10, fontFace: FONT.body, color: C.text,
        border: { pt: 0.5, color: "E0E0E0" },
        rowH: [0.24, 0.24, 0.24, 0.24, 0.24],
    });

    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 12: Oxygen Toxicity
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Oxygen Toxicity");

    // Two types table
    const toxHeaders = [
        [
            { text: "Type", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Cause", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Symptoms", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
            { text: "Relevance", options: { bold: true, color: C.textLight, fill: { color: C.secondary } } },
        ],
        [
            { text: "CNS Toxicity", options: { bold: true, color: C.danger } },
            "High ppO\u2082 (>1.6 bar)",
            "Seizures, tunnel vision, twitching",
            { text: "Immediate danger, can cause drowning", options: { color: C.danger } },
        ],
        [
            { text: "Pulmonary Toxicity", options: { bold: true, color: C.warning } },
            "Prolonged ppO\u2082 >0.5 bar",
            "Chest pain, coughing, breathing difficulty",
            "Relevant for long exposures, rebreathers",
        ],
    ];
    s.addTable(toxHeaders, {
        x: 0.4, y: 0.9, w: 9.2, colW: [1.8, 1.8, 2.6, 3.0],
        fontSize: 10, fontFace: FONT.body, color: C.text,
        border: { pt: 0.5, color: "E0E0E0" },
        rowH: [0.35, 0.45, 0.45],
    });

    // VENTID-C mnemonic
    s.addShape("rect", {
        x: 0.5, y: 2.35, w: 9, h: 2.45,
        fill: { color: C.lightBg },
        shadow: makeShadow(),
    });
    s.addText("CNS Symptoms \u2014 Remember VENTID-C", {
        x: 0.7, y: 2.4, w: 8.6, h: 0.4,
        fontSize: 15, fontFace: FONT.body, color: C.text, bold: true,
    });

    const ventid = [
        { letter: "V", word: "Visual disturbances", desc: "(tunnel vision)" },
        { letter: "E", word: "Ear ringing", desc: "(tinnitus)" },
        { letter: "N", word: "Nausea", desc: "" },
        { letter: "T", word: "Twitching", desc: "(especially facial muscles)" },
        { letter: "I", word: "Irritability", desc: ", anxiety" },
        { letter: "D", word: "Dizziness", desc: "" },
        { letter: "C", word: "Convulsions", desc: "(the most dangerous)" },
    ];

    // Two columns for VENTID-C
    const col1 = ventid.slice(0, 4);
    const col2 = ventid.slice(4);

    col1.forEach((v, i) => {
        const yy = 2.9 + i * 0.4;
        s.addShape("oval", { x: 0.8, y: yy + 0.05, w: 0.28, h: 0.28, fill: { color: C.danger } });
        s.addText(v.letter, { x: 0.8, y: yy + 0.05, w: 0.28, h: 0.28, fontSize: 12, fontFace: FONT.body, color: C.textLight, bold: true, align: "center", valign: "middle" });
        s.addText([
            { text: v.word, options: { bold: true } },
            { text: ` ${v.desc}`, options: { color: C.muted } },
        ], {
            x: 1.2, y: yy, w: 3.6, h: 0.35,
            fontSize: 12, fontFace: FONT.body, color: C.text, valign: "middle",
        });
    });

    col2.forEach((v, i) => {
        const yy = 2.9 + i * 0.4;
        s.addShape("oval", { x: 5.2, y: yy + 0.05, w: 0.28, h: 0.28, fill: { color: C.danger } });
        s.addText(v.letter, { x: 5.2, y: yy + 0.05, w: 0.28, h: 0.28, fontSize: 12, fontFace: FONT.body, color: C.textLight, bold: true, align: "center", valign: "middle" });
        s.addText([
            { text: v.word, options: { bold: true } },
            { text: ` ${v.desc}`, options: { color: C.muted } },
        ], {
            x: 5.6, y: yy, w: 3.6, h: 0.35,
            fontSize: 12, fontFace: FONT.body, color: C.text, valign: "middle",
        });
    });

    // Warning
    s.addText("\u26a0\ufe0f If you experience any symptoms, signal your buddy and begin ascending immediately.", {
        x: 0.5, y: 4.8, w: 9, h: 0.3,
        fontSize: 11, fontFace: FONT.body, color: C.danger, bold: true,
    });

    addFooter(s, slideNum, TOTAL_SLIDES);
}

// ─────────────────────────────────────────────────────────────────────────
// SLIDE 13: Partial Pressure Chart
// ─────────────────────────────────────────────────────────────────────────
{
    slideNum++;
    const s = pres.addSlide();
    s.background = { color: C.white };

    addSectionTitle(s, "Partial Pressures During Dive");

    s.addImage({
        path: path.join(IMG, "partial-pressure-chart.png"),
        x: 0.3, y: 0.95, w: 9.4, h: 3.7,
        shadow: makeShadow(),
    });

    s.addText("This chart shows how ppO\u2082 and ppN\u2082 change throughout the dive profile, relative to safety limits.", {
        x: 0.6, y: 4.7, w: 5.5, h: 0.35,
        fontSize: 11, fontFace: FONT.body, color: C.muted,
    });

    addSandboxLink(s, "pp", 4.75);
    addFooter(s, slideNum, TOTAL_SLIDES);
}

// =========================================================================
// WRITE FILE
// =========================================================================
const outPath = path.join(__dirname, "..", "Pressure-and-Partial-Pressure.pptx");
pres.writeFile({ fileName: outPath }).then(() => {
    console.log("Created: " + outPath);
}).catch(err => {
    console.error("Error:", err);
});
