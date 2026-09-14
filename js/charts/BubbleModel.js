/**
 * BubbleModel - Interactive visualization of bubble mechanics in decompression
 *
 * Static equilibrium model showing which bubbles would grow or shrink
 * at a given depth based on diffusion between:
 *   - Gas inside the bubble at pAmb + 2γ/r
 *   - Dissolved gas in surrounding tissue at tension pTissue
 *
 * When pTissue > pAmb + 2γ/r → gas diffuses in → bubble would grow
 * When pTissue < pAmb + 2γ/r → gas diffuses out → bubble would shrink
 */

import { fmtNum } from '../format.js';
import { translate } from '../i18n.js';
const GAMMA = 0.018; // Surface tension N/m

function tr(key, fallback) {
    return translate(`tissueLoading.bubbleMechanics.model.${key}`, fallback);
}

function pressureSymbols() {
    const czech = document.documentElement.lang === 'cs';
    return {
        ambient: czech ? 'okol' : 'amb',
        tissue: czech ? 'tk' : 't',
    };
}

function drawTextRun(ctx, text, x, y, { size, weight = 'normal', italic = false } = {}) {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
    return ctx.measureText(text).width;
}

function drawPressureSymbol(ctx, index, x, y, { size, weight = 'normal' } = {}) {
    let cursor = x;
    cursor += drawTextRun(ctx, 'p', cursor, y, { size, weight, italic: true });
    cursor += drawTextRun(ctx, index, cursor, y + size * 0.25, {
        size: size * 0.7,
        weight
    });
    return cursor - x;
}

function drawLaplaceTerm(ctx, x, y, { size, weight = 'normal', leading = '' } = {}) {
    let cursor = x;
    cursor += drawTextRun(ctx, `${leading}2`, cursor, y, { size, weight });
    cursor += drawTextRun(ctx, 'γ', cursor, y, { size, weight, italic: true });
    cursor += drawTextRun(ctx, '/', cursor, y, { size, weight });
    cursor += drawTextRun(ctx, 'r', cursor, y, { size, weight, italic: true });
    return cursor - x;
}

function drawPressureExpression(ctx, index, x, y, {
    size,
    weight = 'normal',
    laplace = false
} = {}) {
    let cursor = x;
    cursor += drawPressureSymbol(ctx, index, cursor, y, { size, weight });
    if (laplace) {
        cursor += drawLaplaceTerm(ctx, cursor, y, { size, weight, leading: ' + ' });
    }
    return cursor - x;
}

function laplacePressure(radiusMicrons) {
    const r = radiusMicrons * 1e-6;
    return (2 * GAMMA / r) / 1e5;
}

function criticalRadius(pTissue, pAmb) {
    const diff = pTissue - pAmb;
    if (diff <= 0) return Infinity;
    return (2 * GAMMA / (diff * 1e5)) * 1e6;
}

function pressureAlpha(value, maxPressure) {
    const normalized = Math.max(0, Math.min(1, value / maxPressure));
    return 0.2 + normalized * 0.6;
}

function pressureGradient(ctx, x, width, rgb, value, maxPressure) {
    const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
    gradient.addColorStop(0, `rgba(${rgb},0.18)`);
    gradient.addColorStop(1, `rgba(${rgb},${pressureAlpha(value, maxPressure)})`);
    return gradient;
}

function pressureShade(value, maxPressure, strength = 1) {
    const normalized = Math.max(0, Math.min(1, value / maxPressure)) * strength;
    const light = [208, 225, 237];
    const dark = [70, 132, 178];
    const channels = light.map((channel, index) =>
        Math.round(channel + (dark[index] - channel) * normalized)
    );
    return `rgb(${channels.join(',')})`;
}

const DEPTH_W = 70;

export class BubbleModel {
    constructor(container, options = {}) {
        this.container = container;
        this.saturatedDepth = options.saturatedDepth || 30;
        this.mainWidth = options.mainWidth || 640;
        this.rowHeight = options.rowHeight || 70;
        this.teachingWidth = options.teachingWidth || 600;
        this.currentDepth = this.saturatedDepth;
        this.dpr = window.devicePixelRatio || 1;

        this.bubbles = [
            { radius: 0.3, label: 'A', color: '#3498db' },
            { radius: 1.0, label: 'B', color: '#e67e22' },
            { radius: 3.5, label: 'C', color: '#9b59b6' },
        ];

        this._build();
        this._render();
    }

    get pAmb() { return 1 + this.currentDepth / 10; }
    get pTissue() { return 0.79 * (1 + this.saturatedDepth / 10); }

    _initCanvas(canvas, w, h) {
        canvas.width = w * this.dpr;
        canvas.height = h * this.dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(this.dpr, this.dpr);
        return ctx;
    }

    _build() {
        this.container.innerHTML = '';
        this.container.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

        // Main row: depth + main canvas
        const vizRow = document.createElement('div');
        vizRow.style.cssText = 'display: flex; gap: 12px; align-items: flex-start; width: max-content;';

        this.depthCanvas = document.createElement('canvas');
        this.depthCanvas.style.cssText = 'cursor: ns-resize; border-radius: 8px; flex-shrink: 0;';
        vizRow.appendChild(this.depthCanvas);

        this.mainCanvas = document.createElement('canvas');
        this.mainCanvas.style.cssText = 'border-radius: 8px; flex: none;';
        vizRow.appendChild(this.mainCanvas);

        // Teaching diagram: single large bubble with radial pressure arrows
        this.teachCanvas = document.createElement('canvas');
        this.teachCanvas.style.cssText = 'border-radius: 8px; align-self: center;';
        this.container.appendChild(this.teachCanvas);

        this.container.appendChild(vizRow);

        // Slider
        const sliderRow = document.createElement('div');
        sliderRow.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 0 4px;';

        this.sliderLabel = document.createElement('span');
        this.sliderLabel.textContent = tr('depth', 'Depth:');
        this.sliderLabel.style.cssText = 'font-size: 16px; font-weight: 600;';
        sliderRow.appendChild(this.sliderLabel);

        this.slider = document.createElement('input');
        this.slider.type = 'range';
        this.slider.min = 0;
        this.slider.max = this.saturatedDepth;
        this.slider.value = this.saturatedDepth;
        this.slider.step = 0.5;
        this.slider.style.cssText = 'flex: 1; cursor: pointer;';
        this.slider.addEventListener('input', () => {
            this.currentDepth = parseFloat(this.slider.value);
            this._render();
        });
        sliderRow.appendChild(this.slider);

        this.depthDisplay = document.createElement('span');
        this.depthDisplay.style.cssText = 'font-size: 16px; font-weight: 600; min-width: 64px; text-align: right;';
        sliderRow.appendChild(this.depthDisplay);

        this.container.appendChild(sliderRow);

        this._setupDepthDrag();
    }

    _setupDepthDrag() {
        let dragging = false;
        const update = (e) => {
            const rect = this.depthCanvas.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const ratio = Math.max(0, Math.min(1, y / rect.height));
            this.currentDepth = Math.round(ratio * this.saturatedDepth * 2) / 2;
            this.currentDepth = Math.min(this.currentDepth, this.saturatedDepth);
            this.slider.value = this.currentDepth;
            this._render();
        };
        this.depthCanvas.addEventListener('mousedown', (e) => { dragging = true; update(e); });
        document.addEventListener('mousemove', (e) => { if (dragging) update(e); });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    _render() {
        const rowH = this.rowHeight;
        const mainH = 100 + this.bubbles.length * rowH;
        this._drawDepthScale(mainH);
        this._drawMain(mainH, rowH);
        this._drawTeachingDiagram();
        this.depthDisplay.textContent = `${fmtNum(this.currentDepth, 0)}\u00a0m`;
    }

    _drawDepthScale(totalH) {
        const w = DEPTH_W;
        const ctx = this._initCanvas(this.depthCanvas, w, totalH);

        const grad = ctx.createLinearGradient(0, 0, 0, totalH);
        grad.addColorStop(0, '#87CEEB');
        grad.addColorStop(1, '#1a5276');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(0, 0, w, totalH, 8);
        ctx.fill();

        const pad = 15;
        const maxD = this.saturatedDepth;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'right';
        for (let d = 0; d <= maxD; d += 5) {
            const y = pad + (d / maxD) * (totalH - 2 * pad);
            ctx.fillRect(w - 18, y, 10, 1);
            ctx.fillText(`${d}\u00a0m`, w - 22, y + 4);
        }

        const diverY = pad + (this.currentDepth / maxD) * (totalH - 2 * pad);
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(18, diverY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('◉', 18, diverY + 3);
    }

    _drawMain(totalH, rowH) {
        const w = this.mainWidth;
        const ctx = this._initCanvas(this.mainCanvas, w, totalH);

        ctx.fillStyle = '#f8f9fa';
        ctx.beginPath();
        ctx.roundRect(0, 0, w, totalH, 8);
        ctx.fill();

        const pAmb = this.pAmb;
        const pTissue = this.pTissue;
        const rCrit = criticalRadius(pTissue, pAmb);
        const symbols = pressureSymbols();

        // Header: current values
        ctx.fillStyle = '#3498db';
        let headerX = 10;
        headerX += drawPressureSymbol(ctx, symbols.ambient, headerX, 18, { size: 14 });
        drawTextRun(ctx, ` = ${fmtNum(pAmb, 2)}\u00a0bar`, headerX, 18, { size: 14 });
        ctx.fillStyle = '#4684b2';
        headerX = 200;
        headerX += drawPressureSymbol(ctx, symbols.tissue, headerX, 18, { size: 14 });
        drawTextRun(
            ctx,
            ` = ${fmtNum(pTissue, 2)}\u00a0bar (${tr('fixed', 'fixed')})`,
            headerX,
            18,
            { size: 14 }
        );
        if (rCrit < 100) {
            ctx.fillStyle = '#e74c3c';
            headerX = 470;
            headerX += drawTextRun(ctx, 'r', headerX, 18, { size: 14, italic: true });
            drawTextRun(
                ctx,
                ` (${tr('critical', 'critical')}) = ${fmtNum(rCrit, 2)}\u00a0μm`,
                headerX,
                18,
                { size: 14 }
            );
        }

        // Scale
        const barLeft = Math.max(170, w * 0.18);
        const pAmbMax = 1 + this.saturatedDepth / 10;
        const maxP = Math.max(
            pTissue + 0.3,
            ...this.bubbles.map(b => pAmbMax + laplacePressure(b.radius))
        ) * 1.03;

        const topPad = 60;
        const resultColumnW = 165;
        const valueGapW = 55;
        const barMaxW = w - barLeft - resultColumnW - valueGapW;
        const scale = barMaxW / maxP;
        const barH = 20;

        // Bar legend row (compact, above bars)
        const legendY = topPad - 6;
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498db';
        ctx.fillRect(barLeft, legendY - 10, 11, 11);
        ctx.fillStyle = '#666';
        drawPressureSymbol(ctx, symbols.ambient, barLeft + 15, legendY, { size: 14 });
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(barLeft + 70, legendY - 10, 11, 11);
        ctx.fillStyle = '#666';
        let legendX = barLeft + 85;
        legendX += drawLaplaceTerm(ctx, legendX, legendY, { size: 14, leading: '+ ' });
        drawTextRun(ctx, ` → ${tr('pushesOut', 'pushes OUT')}`, legendX, legendY, { size: 14 });
        ctx.fillStyle = '#78a8ce';
        ctx.fillRect(barLeft + 470, legendY - 10, 11, 11);
        ctx.fillStyle = '#666';
        legendX = barLeft + 485;
        legendX += drawPressureSymbol(ctx, symbols.tissue, legendX, legendY, { size: 14 });
        drawTextRun(ctx, ` → ${tr('pushesIn', 'pushes IN')}`, legendX, legendY, { size: 14 });

        this.bubbles.forEach((b, i) => {
            const yTop = topPad + i * rowH;
            const yCenterBubble = yTop + rowH / 2;

            const pLaplace = laplacePressure(b.radius);
            const pBubble = pAmb + pLaplace;
            const wouldGrow = pTissue > pBubble;

            // === Left: Bubble ===
            const bx = 112;
            const visualR = 14 + Math.log(b.radius + 1) * 20;
            const clampedR = Math.min(visualR, 42);

            // Glow
            ctx.beginPath();
            ctx.arc(bx, yCenterBubble, clampedR + 5, 0, Math.PI * 2);
            ctx.fillStyle = wouldGrow ? 'rgba(231,76,60,0.1)' : 'rgba(46,204,113,0.1)';
            ctx.fill();

            // Body
            const bGrad = ctx.createRadialGradient(
                bx - clampedR * 0.2, yCenterBubble - clampedR * 0.2, 0,
                bx, yCenterBubble, clampedR
            );
            bGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
            bGrad.addColorStop(1, wouldGrow ? 'rgba(231,76,60,0.15)' : 'rgba(46,204,113,0.15)');
            ctx.beginPath();
            ctx.arc(bx, yCenterBubble, clampedR, 0, Math.PI * 2);
            ctx.fillStyle = bGrad;
            ctx.fill();

            // Surface tension ring (orange, thicker for smaller r)
            ctx.strokeStyle = '#f39c12';
            ctx.lineWidth = Math.max(1.5, Math.min(3.5, pLaplace * 2.5));
            ctx.stroke();

            {
                // Simple flow arrows for other bubbles (up/down)
                const diff = pTissue - pBubble;
                if (Math.abs(diff) > 0.02) {
                    const arrowLen = Math.min(10, Math.abs(diff) * 5);
                    ctx.strokeStyle = wouldGrow ? '#c0392b' : '#1e8449';
                    ctx.lineWidth = 1.5;
                    const gap = clampedR + 3;

                    // Top arrow
                    const topTip = wouldGrow ? yCenterBubble - gap : yCenterBubble - gap - arrowLen;
                    const topTail = wouldGrow ? yCenterBubble - gap - arrowLen : yCenterBubble - gap;
                    ctx.beginPath();
                    ctx.moveTo(bx, topTail);
                    ctx.lineTo(bx, topTip);
                    ctx.stroke();
                    // arrowhead at tip
                    ctx.beginPath();
                    ctx.moveTo(bx, topTip);
                    ctx.lineTo(bx - 3, topTip + (wouldGrow ? -4 : 4));
                    ctx.moveTo(bx, topTip);
                    ctx.lineTo(bx + 3, topTip + (wouldGrow ? -4 : 4));
                    ctx.stroke();

                    // Bottom arrow
                    const botTip = wouldGrow ? yCenterBubble + gap : yCenterBubble + gap + arrowLen;
                    const botTail = wouldGrow ? yCenterBubble + gap + arrowLen : yCenterBubble + gap;
                    ctx.beginPath();
                    ctx.moveTo(bx, botTail);
                    ctx.lineTo(bx, botTip);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(bx, botTip);
                    ctx.lineTo(bx - 3, botTip + (wouldGrow ? 4 : -4));
                    ctx.moveTo(bx, botTip);
                    ctx.lineTo(bx + 3, botTip + (wouldGrow ? 4 : -4));
                    ctx.stroke();
                }
            }

            // Keep labels in their own column so they never overlap bubbles or flow arrows.
            ctx.fillStyle = b.color;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${b.label}  ${fmtNum(b.radius, 1)}\u00a0μm`, bx - clampedR - 10, yCenterBubble + 4);

            // === Right: Bars ===

            // Top bar: pAmb + 2γ/r
            const barY1 = yCenterBubble - barH - 1;
            const ambW = pAmb * scale;
            const lapW = Math.max(1, pLaplace * scale);

            ctx.fillStyle = pressureGradient(ctx, barLeft, ambW, '52,152,219', pAmb, maxP);
            ctx.fillRect(barLeft, barY1, ambW, barH);
            ctx.fillStyle = pressureGradient(
                ctx,
                barLeft + ambW,
                lapW,
                '243,156,18',
                pLaplace,
                maxP
            );
            ctx.fillRect(barLeft + ambW, barY1, lapW, barH);

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'left';
            if (ambW > 36) {
                drawPressureSymbol(ctx, symbols.ambient, barLeft + 3, barY1 + 15, { size: 13 });
            }
            if (lapW > 24) {
                drawLaplaceTerm(ctx, barLeft + ambW + 3, barY1 + 15, { size: 13 });
            }

            ctx.fillStyle = '#444';
            ctx.font = '13px sans-serif';
            ctx.fillText(fmtNum(pBubble, 2), barLeft + ambW + lapW + 5, barY1 + 15);

            // Bottom bar: tissue pressure
            const barY2 = yCenterBubble + 1;
            const tissueW = pTissue * scale;
            ctx.fillStyle = pressureGradient(
                ctx,
                barLeft,
                tissueW,
                '70,132,178',
                pTissue,
                maxP
            );
            ctx.fillRect(barLeft, barY2, tissueW, barH);

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'left';
            if (tissueW > 42) {
                drawPressureSymbol(ctx, symbols.tissue, barLeft + 3, barY2 + 15, { size: 13 });
            }

            ctx.fillStyle = '#444';
            ctx.font = '13px sans-serif';
            ctx.fillText(fmtNum(pTissue, 2), barLeft + tissueW + 5, barY2 + 15);

            // Result
            ctx.fillStyle = wouldGrow ? '#e74c3c' : '#27ae60';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(
                wouldGrow ? tr('grows', 'GROWS ↑') : tr('shrinks', 'SHRINKS ↓'),
                w - 6,
                yCenterBubble + 4
            );
        });
    }

    _drawTeachingDiagram() {
        const w = 600;
        const h = 240;
        const scale = this.teachingWidth / w;
        const ctx = this._initCanvas(this.teachCanvas, this.teachingWidth, h * scale);
        ctx.scale(scale, scale);

        const pAmb = this.pAmb;
        const pTissue = this.pTissue;
        // Use the largest bubble for the teaching diagram
        const b = this.bubbles[this.bubbles.length - 1];
        const pLaplace = laplacePressure(b.radius);
        const pBubble = pAmb + pLaplace;
        const wouldGrow = pTissue > pBubble;
        const symbols = pressureSymbols();

        const cx = 145;
        const cy = 115;
        const R = 55;

        ctx.fillStyle = '#f8f9fa';
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 8);
        ctx.fill();

        const teachingMaxP = 1 + this.saturatedDepth / 10 + pLaplace;

        ctx.beginPath();
        ctx.arc(cx, cy, R + 38, 0, Math.PI * 2);
        ctx.fillStyle = pressureShade(pTissue, teachingMaxP);
        ctx.fill();

        ctx.fillStyle = '#4684b2';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tr('surroundingTissue', 'surrounding tissue'), cx, 18);
        ctx.fillStyle = '#356f9d';
        let tissueX = cx - 31;
        tissueX += drawPressureSymbol(ctx, symbols.tissue, tissueX, 38, {
            size: 11,
            weight: 'bold'
        });
        drawTextRun(ctx, ` = ${fmtNum(pTissue, 2)}\u00a0bar`, tissueX, 38, {
            size: 11,
            weight: 'bold'
        });

        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = pressureShade(pBubble, teachingMaxP);
        ctx.fill();

        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#555';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tr('bubblePressureHeading', 'PRESSURE INSIDE BUBBLE'), cx, cy - 5);
        ctx.font = '11px sans-serif';
        ctx.fillText(`${fmtNum(pBubble, 2)}\u00a0bar`, cx, cy + 14);

        const arrowY = 198;
        const arrowStart = wouldGrow ? cx - R - 32 : cx + R - 12;
        const arrowEnd = wouldGrow ? cx - R + 12 : cx + R + 32;
        ctx.strokeStyle = wouldGrow ? '#e74c3c' : '#27ae60';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(arrowStart, arrowY);
        ctx.lineTo(arrowEnd, arrowY);
        ctx.stroke();
        const direction = Math.sign(arrowEnd - arrowStart);
        ctx.beginPath();
        ctx.moveTo(arrowEnd, arrowY);
        ctx.lineTo(arrowEnd - direction * 8, arrowY - 5);
        ctx.lineTo(arrowEnd - direction * 8, arrowY + 5);
        ctx.closePath();
        ctx.fill();
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
            wouldGrow
                ? tr('diffusionInShort', 'gas diffuses into bubble')
                : tr('diffusionOutShort', 'gas diffuses out of bubble'),
            cx,
            220
        );

        const tx = 315;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#777';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(tr('tissueTensionHeading', 'GAS TENSION IN TISSUE'), tx, 28);
        ctx.fillStyle = '#4684b2';
        let formulaX = tx;
        formulaX += drawPressureSymbol(ctx, symbols.tissue, formulaX, 52, {
            size: 14,
            weight: 'bold'
        });
        drawTextRun(ctx, ` = ${fmtNum(pTissue, 2)}\u00a0bar`, formulaX, 52, {
            size: 14,
            weight: 'bold'
        });

        ctx.fillStyle = '#777';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(tr('bubblePressureHeading', 'PRESSURE INSIDE BUBBLE'), tx, 86);
        ctx.fillStyle = '#3498db';
        formulaX = tx;
        formulaX += drawPressureExpression(ctx, symbols.ambient, formulaX, 110, {
            size: 14,
            weight: 'bold',
            laplace: true
        });
        drawTextRun(ctx, ` = ${fmtNum(pBubble, 2)}\u00a0bar`, formulaX, 110, {
            size: 14,
            weight: 'bold'
        });
        ctx.fillStyle = '#777';
        formulaX = tx;
        formulaX += drawTextRun(ctx, '(', formulaX, 130, { size: 10 });
        formulaX += drawTextRun(ctx, 'r', formulaX, 130, { size: 10, italic: true });
        drawTextRun(
            ctx,
            ` = ${fmtNum(b.radius, 1)}\u00a0μm; ${fmtNum(pAmb, 2)} + ${fmtNum(pLaplace, 2)}\u00a0bar)`,
            formulaX,
            130,
            { size: 10 }
        );

        ctx.strokeStyle = '#d7dde3';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, 148);
        ctx.lineTo(570, 148);
        ctx.stroke();

        const comparisonY = 174;
        if (wouldGrow) {
            ctx.fillStyle = '#e74c3c';
            formulaX = tx;
            formulaX += drawPressureSymbol(ctx, symbols.tissue, formulaX, comparisonY, {
                size: 14,
                weight: 'bold'
            });
            formulaX += drawTextRun(ctx, ' > ', formulaX, comparisonY, { size: 14, weight: 'bold' });
            drawPressureExpression(ctx, symbols.ambient, formulaX, comparisonY, {
                size: 14,
                weight: 'bold',
                laplace: true
            });
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(tr('diffusesIn', '→ gas diffuses IN → GROWS'), tx, 202);
        } else {
            ctx.fillStyle = '#27ae60';
            formulaX = tx;
            formulaX += drawPressureSymbol(ctx, symbols.tissue, formulaX, comparisonY, {
                size: 14,
                weight: 'bold'
            });
            formulaX += drawTextRun(ctx, ' < ', formulaX, comparisonY, { size: 14, weight: 'bold' });
            drawPressureExpression(ctx, symbols.ambient, formulaX, comparisonY, {
                size: 14,
                weight: 'bold',
                laplace: true
            });
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(tr('diffusesOut', '→ gas diffuses OUT → SHRINKS'), tx, 202);
        }
    }

    refreshLanguage() {
        this.sliderLabel.textContent = tr('depth', 'Depth:');
        this._render();
    }

    destroy() {}
}
