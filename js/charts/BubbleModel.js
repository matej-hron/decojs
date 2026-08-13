/**
 * BubbleModel - Interactive visualization of bubble mechanics in decompression
 *
 * Static equilibrium model showing which bubbles would grow or shrink
 * at a given depth based on the pressure balance:
 *   - Inside bubble: P_amb + 2γ/r (pushes outward)
 *   - Outside bubble: P_tissue dissolved gas tension (pushes inward)
 *
 * When P_tissue > P_amb + 2γ/r → gas diffuses in → bubble would grow
 * When P_tissue < P_amb + 2γ/r → gas diffuses out → bubble would shrink
 */

import { fmtNum } from '../format.js';
const GAMMA = 0.018; // Surface tension N/m

function laplacePressure(radiusMicrons) {
    const r = radiusMicrons * 1e-6;
    return (2 * GAMMA / r) / 1e5;
}

function criticalRadius(pTissue, pAmb) {
    const diff = pTissue - pAmb;
    if (diff <= 0) return Infinity;
    return (2 * GAMMA / (diff * 1e5)) * 1e6;
}

const DEPTH_W = 70;

export class BubbleModel {
    constructor(container, options = {}) {
        this.container = container;
        this.saturatedDepth = options.saturatedDepth || 30;
        this.currentDepth = this.saturatedDepth;
        this.dpr = window.devicePixelRatio || 1;

        this.bubbles = [
            { radius: 0.3, label: 'A', color: '#3498db' },
            { radius: 0.6, label: 'B', color: '#27ae60' },
            { radius: 1.0, label: 'C', color: '#e67e22' },
            { radius: 1.8, label: 'D', color: '#e74c3c' },
            { radius: 3.5, label: 'E', color: '#9b59b6' },
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
        vizRow.style.cssText = 'display: flex; gap: 8px; align-items: flex-start;';

        this.depthCanvas = document.createElement('canvas');
        this.depthCanvas.style.cssText = 'cursor: ns-resize; border-radius: 8px; flex-shrink: 0;';
        vizRow.appendChild(this.depthCanvas);

        this.mainCanvas = document.createElement('canvas');
        this.mainCanvas.style.cssText = 'border-radius: 8px; flex: 1; min-width: 400px;';
        vizRow.appendChild(this.mainCanvas);

        // Teaching diagram: single large bubble with radial pressure arrows
        this.teachCanvas = document.createElement('canvas');
        this.teachCanvas.style.cssText = 'border-radius: 8px; align-self: center;';
        this.container.appendChild(this.teachCanvas);

        this.container.appendChild(vizRow);

        // Slider
        const sliderRow = document.createElement('div');
        sliderRow.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 0 4px;';

        const sliderLabel = document.createElement('span');
        sliderLabel.textContent = 'Depth:';
        sliderLabel.style.cssText = 'font-size: 13px; font-weight: 600;';
        sliderRow.appendChild(sliderLabel);

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
        this.depthDisplay.style.cssText = 'font-size: 13px; font-weight: 600; min-width: 50px; text-align: right;';
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
        const rowH = 70;
        const mainH = 55 + this.bubbles.length * rowH + 10;
        this._drawDepthScale(mainH);
        this._drawMain(mainH, rowH);
        this._drawTeachingDiagram();
        this.depthDisplay.textContent = `${fmtNum(this.currentDepth, 0)}m`;
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
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        for (let d = 0; d <= maxD; d += 5) {
            const y = pad + (d / maxD) * (totalH - 2 * pad);
            ctx.fillRect(w - 18, y, 10, 1);
            ctx.fillText(`${d}m`, w - 22, y + 4);
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
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('◉', 18, diverY + 3);
    }

    _drawMain(totalH, rowH) {
        const w = 640;
        const ctx = this._initCanvas(this.mainCanvas, w, totalH);

        ctx.fillStyle = '#f8f9fa';
        ctx.beginPath();
        ctx.roundRect(0, 0, w, totalH, 8);
        ctx.fill();

        const pAmb = this.pAmb;
        const pTissue = this.pTissue;
        const rCrit = criticalRadius(pTissue, pAmb);

        // Header: current values
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498db';
        ctx.fillText(`p_amb = ${fmtNum(pAmb, 2)}\u00a0bar`, 10, 14);
        ctx.fillStyle = '#2ecc71';
        ctx.fillText(`p_tissue = ${fmtNum(pTissue, 2)}\u00a0bar (fixed)`, 140, 14);
        if (rCrit < 100) {
            ctx.fillStyle = '#e74c3c';
            ctx.fillText(`r_crit = ${fmtNum(rCrit, 2)} μm`, 340, 14);
        }

        // Scale
        const barLeft = 130;
        const pAmbMax = 1 + this.saturatedDepth / 10;
        const maxP = Math.max(
            pTissue + 0.3,
            ...this.bubbles.map(b => pAmbMax + laplacePressure(b.radius))
        ) * 1.03;

        const topPad = 28;
        const barMaxW = w - barLeft - 90;
        const scale = barMaxW / maxP;
        const barH = 16;

        // Bar legend row (compact, above bars)
        const legendY = topPad - 6;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498db';
        ctx.fillRect(barLeft, legendY - 8, 8, 8);
        ctx.fillStyle = '#666';
        ctx.fillText('p_amb', barLeft + 11, legendY - 1);
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(barLeft + 52, legendY - 8, 8, 8);
        ctx.fillStyle = '#666';
        ctx.fillText('+ 2γ/r  → pushes OUT', barLeft + 63, legendY - 1);
        ctx.fillStyle = 'rgba(100,200,100,0.5)';
        ctx.fillRect(barLeft + 195, legendY - 8, 8, 8);
        ctx.fillStyle = '#666';
        ctx.fillText('p_tissue → pushes IN', barLeft + 206, legendY - 1);

        this.bubbles.forEach((b, i) => {
            const yTop = topPad + i * rowH;
            const yCenterBubble = yTop + rowH / 2;

            const pLaplace = laplacePressure(b.radius);
            const pBubble = pAmb + pLaplace;
            const wouldGrow = pTissue > pBubble;

            // === Left: Bubble ===
            const bx = 55;
            const visualR = Math.max(5, Math.log(b.radius + 1) * 16);
            const clampedR = Math.min(visualR, 25);

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

            // Label: put below for small bubbles, to the right for large ones
            ctx.fillStyle = b.color;
            ctx.font = 'bold 9px sans-serif';
            if (clampedR > 18) {
                // Large bubble — label to the right to avoid overlap
                ctx.textAlign = 'left';
                ctx.fillText(`${b.label}  ${b.radius} μm`, bx + clampedR + 4, yCenterBubble + 3);
            } else {
                ctx.textAlign = 'center';
                ctx.fillText(`${b.label}  ${b.radius} μm`, bx, yCenterBubble + clampedR + 14);
            }

            // === Right: Bars ===

            // Top bar: P_amb + 2γ/r
            const barY1 = yCenterBubble - barH - 1;
            const ambW = pAmb * scale;
            const lapW = Math.max(1, pLaplace * scale);

            ctx.fillStyle = '#3498db';
            ctx.fillRect(barLeft, barY1, ambW, barH);
            ctx.fillStyle = '#f39c12';
            ctx.fillRect(barLeft + ambW, barY1, lapW, barH);

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'left';
            if (ambW > 28) ctx.fillText('p_amb', barLeft + 2, barY1 + 10);
            if (lapW > 18) ctx.fillText('2γ/r', barLeft + ambW + 2, barY1 + 10);

            ctx.fillStyle = '#444';
            ctx.font = '9px sans-serif';
            ctx.fillText(fmtNum(pBubble, 2), barLeft + ambW + lapW + 3, barY1 + 10);

            // Bottom bar: P_tissue
            const barY2 = yCenterBubble + 1;
            const tissueW = pTissue * scale;
            ctx.fillStyle = wouldGrow ? 'rgba(231,76,60,0.5)' : 'rgba(46,204,113,0.5)';
            ctx.fillRect(barLeft, barY2, tissueW, barH);

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'left';
            if (tissueW > 35) ctx.fillText('p_tissue', barLeft + 2, barY2 + 10);

            ctx.fillStyle = '#444';
            ctx.font = '9px sans-serif';
            ctx.fillText(fmtNum(pTissue, 2), barLeft + tissueW + 3, barY2 + 10);

            // Result
            ctx.fillStyle = wouldGrow ? '#e74c3c' : '#27ae60';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(wouldGrow ? 'GROWS ↑' : 'SHRINKS ↓', w - 6, yCenterBubble + 4);
        });
    }

    _drawTeachingDiagram() {
        const w = 600, h = 240;
        const ctx = this._initCanvas(this.teachCanvas, w, h);

        const pAmb = this.pAmb;
        const pTissue = this.pTissue;
        // Use the largest bubble for the teaching diagram
        const b = this.bubbles[this.bubbles.length - 1];
        const pLaplace = laplacePressure(b.radius);
        const pBubble = pAmb + pLaplace;
        const wouldGrow = pTissue > pBubble;

        const cx = w * 0.28, cy = h / 2;
        const R = 50; // big bubble radius for teaching

        // Background
        ctx.fillStyle = '#f8f9fa';
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 8);
        ctx.fill();

        // Surrounding tissue zone
        ctx.beginPath();
        ctx.arc(cx, cy, R + 40, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46,204,113,0.08)';
        ctx.fill();

        // Label: "surrounding tissue"
        ctx.fillStyle = '#2ecc71';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('surrounding tissue', cx, cy - R - 48);

        // Bubble body
        const grad = ctx.createRadialGradient(cx - R * 0.15, cy - R * 0.15, 0, cx, cy, R);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.7, wouldGrow ? 'rgba(231,76,60,0.12)' : 'rgba(46,204,113,0.12)');
        grad.addColorStop(1, wouldGrow ? 'rgba(231,76,60,0.05)' : 'rgba(46,204,113,0.05)');
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Surface tension ring (orange)
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Surface tension label — with line pointing to the ring
        ctx.strokeStyle = '#e67e22';
        ctx.lineWidth = 1;
        const stLabelX = cx + R + 45;
        const stLabelY = cy + R - 10;
        // line from label to ring surface
        const ringX = cx + R * Math.cos(Math.PI / 5);
        const ringY = cy + R * Math.sin(Math.PI / 5);
        ctx.beginPath();
        ctx.moveTo(stLabelX - 2, stLabelY);
        ctx.lineTo(ringX, ringY);
        ctx.stroke();
        ctx.fillStyle = '#e67e22';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('surface tension (2γ/r)', stLabelX, stLabelY + 3);

        // Label inside bubble
        ctx.fillStyle = '#555';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('gas inside', cx, cy - 8);
        ctx.fillText('bubble', cx, cy + 4);

        // Radial arrows from CENTER outward = P_amb + 2γ/r (pushes OUT)
        const numArrows = 8;
        const innerArrowStart = R * 0.45;
        const innerArrowEnd = R - 5;

        for (let i = 0; i < numArrows; i++) {
            const angle = (i / numArrows) * Math.PI * 2;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);

            // Inner arrows: from center toward surface (blue = P_amb + 2γ/r pushing out)
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 1.8;
            const isx = cx + dx * innerArrowStart;
            const isy = cy + dy * innerArrowStart;
            const iex = cx + dx * innerArrowEnd;
            const iey = cy + dy * innerArrowEnd;
            ctx.beginPath();
            ctx.moveTo(isx, isy);
            ctx.lineTo(iex, iey);
            ctx.stroke();
            // arrowhead
            const ia = Math.atan2(iey - isy, iex - isx);
            ctx.beginPath();
            ctx.moveTo(iex, iey);
            ctx.lineTo(iex - 5 * Math.cos(ia - 0.4), iey - 5 * Math.sin(ia - 0.4));
            ctx.moveTo(iex, iey);
            ctx.lineTo(iex - 5 * Math.cos(ia + 0.4), iey - 5 * Math.sin(ia + 0.4));
            ctx.stroke();
        }

        // Outer arrows: from tissue toward surface = P_tissue (pushes IN)
        const outerArrowStart = R + 30;
        const outerArrowEnd = R + 5;

        for (let i = 0; i < numArrows; i++) {
            const angle = (i / numArrows) * Math.PI * 2;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);

            ctx.strokeStyle = '#2ecc71';
            ctx.lineWidth = 1.8;
            const osx = cx + dx * outerArrowStart;
            const osy = cy + dy * outerArrowStart;
            const oex = cx + dx * outerArrowEnd;
            const oey = cy + dy * outerArrowEnd;
            ctx.beginPath();
            ctx.moveTo(osx, osy);
            ctx.lineTo(oex, oey);
            ctx.stroke();
            const oa = Math.atan2(oey - osy, oex - osx);
            ctx.beginPath();
            ctx.moveTo(oex, oey);
            ctx.lineTo(oex - 5 * Math.cos(oa - 0.4), oey - 5 * Math.sin(oa - 0.4));
            ctx.moveTo(oex, oey);
            ctx.lineTo(oex - 5 * Math.cos(oa + 0.4), oey - 5 * Math.sin(oa + 0.4));
            ctx.stroke();
        }

        // Right side: pressure values and explanation
        const tx = w * 0.52;
        let ty = 30;
        const lineH = 18;

        ctx.textAlign = 'left';

        // Define P_bubble first
        ctx.fillStyle = '#3498db';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`p_bubble = p_amb + 2γ/r`, tx, ty);
        ty += lineH;
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#666';
        ctx.fillText(`= ${fmtNum(pAmb, 2)} + ${fmtNum(pLaplace, 2)} = ${fmtNum(pBubble, 2)}\u00a0bar`, tx + 10, ty);
        ty += lineH - 4;
        ctx.fillStyle = '#888';
        ctx.font = '9px sans-serif';
        ctx.fillText(`(r = ${b.radius} μm)  inside bubble, pushes OUT`, tx + 10, ty);

        ty += lineH + 6;
        ctx.fillStyle = '#2ecc71';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`p_tissue = ${fmtNum(pTissue, 2)}\u00a0bar`, tx, ty);
        ty += lineH;
        ctx.fillStyle = '#888';
        ctx.font = '9px sans-serif';
        ctx.fillText('dissolved gas tension, pushes IN', tx + 10, ty);

        ty += lineH + 8;
        ctx.font = 'bold 12px sans-serif';
        if (wouldGrow) {
            ctx.fillStyle = '#e74c3c';
            ctx.fillText(`p_tissue > p_bubble`, tx, ty);
            ty += lineH;
            ctx.fillText('→ gas diffuses IN → GROWS', tx, ty);
        } else {
            ctx.fillStyle = '#27ae60';
            ctx.fillText(`p_tissue < p_bubble`, tx, ty);
            ty += lineH;
            ctx.fillText('→ gas diffuses OUT → SHRINKS', tx, ty);
        }
    }

    destroy() {}
}
