import {AppState, LoadedWlk, SectorDetail} from '../state/AppState.js';

interface IsoGeom {
    cx: number;
    cy: number;
    hw: number; // tile half-width  (iso X unit)
    hh: number; // tile half-height (iso Y unit)
}

/**
 * Center canvas. Two modes:
 *  - a WLD/WLK sector is selected → isometric tile map of its 64×64 cells. Each
 *    cell is drawn with its decoded Floor tile texture (from AppState.sectorDetail
 *    .tileTextures) when available, else a stable hash colour of the assetId; a
 *    marker overlays cells carrying a Static.PAK object.
 *    Camera: mouse-wheel zooms (cursor-anchored), drag pans, a click (no drag)
 *    picks a cell. The camera resets when a new sector is shown.
 *  - otherwise, if a sectors.keyx is loaded → the sparse WLK occupancy overview.
 *  - else a hint message.
 */
export class Viewport {

    private static readonly GRID      = 64;
    private static readonly TILE_MASK = 0x1ffff; // assetId low 17 bits = tile index

    private static readonly ZOOM_MIN = 0.5;
    private static readonly ZOOM_MAX = 40;

    private _ctx:  CanvasRenderingContext2D | null;
    private _geom: IsoGeom | null = null; // last composed geometry, for hit-testing

    // Camera (per-sector): auto-fit at zoom 1, panned/zoomed by the user.
    private _zoom      = 1;
    private _panX      = 0;
    private _panY      = 0;
    private _sectorKey = '';

    // Drag state (pan vs click discrimination).
    private _dragging = false;
    private _lastX    = 0;
    private _lastY    = 0;
    private _moved    = 0;

    public constructor(
        private readonly _canvas: HTMLCanvasElement,
        private readonly _state:  AppState
    ) {
        this._ctx = _canvas.getContext('2d');
        this._state.subscribe(() => this._draw());

        const ro = new ResizeObserver(() => this._draw());

        ro.observe(_canvas);

        _canvas.addEventListener('wheel', (e) => this._onWheel(e), {passive: false});
        _canvas.addEventListener('mousedown', (e) => this._onDown(e));
        window.addEventListener('mousemove', (e) => this._onMove(e));
        window.addEventListener('mouseup', (e) => this._onUp(e));

        this._draw();
    }

    private _draw(): void {
        if (!this._ctx) {
            return;
        }

        const cssW = this._canvas.clientWidth;
        const cssH = this._canvas.clientHeight;
        const dpr  = window.devicePixelRatio || 1;

        this._canvas.width  = Math.max(1, Math.floor(cssW * dpr));
        this._canvas.height = Math.max(1, Math.floor(cssH * dpr));

        const ctx = this._ctx;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const detail = this._state.sectorDetail;

        if (detail) {
            this._drawIsoSector(ctx, cssW, cssH, detail);

            return;
        }

        this._geom = null;

        const wlk    = this._findWlk();
        const wlkIdx = wlk ? this._state.containers.indexOf(wlk) : -1;

        if (wlk) {
            this._drawOccupancy(ctx, cssW, cssH, wlk, wlkIdx);

            return;
        }

        ctx.fillStyle = '#8a8a90';
        ctx.font      = '12px ui-monospace, monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign    = 'center';

        const hint = this._state.dir
            ? `${this._state.containers.length} Container geladen — wähle einen Sektor.`
            : 'Wähle ein "Sacred Gold/"-Verzeichnis um zu starten.';

        ctx.fillText(hint, cssW / 2, cssH / 2);
    }

    // ---- isometric sector tile map -------------------------------------------

    /** Auto-fit geometry at zoom 1, before the camera transform. */
    private _baseGeom(cssW: number, cssH: number): IsoGeom {
        const g      = Viewport.GRID;
        const margin = 28;
        const spanX  = 2 * g;
        const spanY  = 2 * g;
        // keep a 2:1 tile ratio (hw = 2*hh)
        const hh     = Math.max(0.5, Math.min((cssW - 2 * margin) / (2 * spanX), (cssH - 2 * margin) / spanY));

        // _cellToScreen re-centres isoY around (GRID-1), so cy is just the middle.
        return {cx: cssW / 2, cy: cssH / 2, hw: hh * 2, hh};
    }

    /** Base fit composed with the current camera (zoom around centre + pan). */
    private _computeGeom(cssW: number, cssH: number): IsoGeom {
        const b = this._baseGeom(cssW, cssH);

        return {
            cx: b.cx + this._panX,
            cy: b.cy + this._panY,
            hw: b.hw * this._zoom,
            hh: b.hh * this._zoom
        };
    }

    private _cellToScreen(col: number, row: number, geom: IsoGeom): {sx: number; sy: number} {
        return {
            sx: geom.cx + (col - row) * geom.hw,
            sy: geom.cy + ((col + row) - (Viewport.GRID - 1)) * geom.hh
        };
    }

    private _screenToCell(mx: number, my: number, geom: IsoGeom): number | null {
        const isoX = (mx - geom.cx) / geom.hw;
        const isoY = (my - geom.cy) / geom.hh + (Viewport.GRID - 1);
        const col  = Math.round((isoY + isoX) / 2);
        const row  = Math.round((isoY - isoX) / 2);

        if (row < 0 || row >= Viewport.GRID || col < 0 || col >= Viewport.GRID) {
            return null;
        }

        return row * Viewport.GRID + col;
    }

    private _drawIsoSector(
        ctx:    CanvasRenderingContext2D,
        cssW:   number,
        cssH:   number,
        detail: SectorDetail
    ): void {
        // Reset the camera when a different sector is shown.
        const key = `${detail.containerIdx}:${detail.sectorIndex}`;

        if (key !== this._sectorKey) {
            this._sectorKey = key;
            this._zoom = 1;
            this._panX = 0;
            this._panY = 0;
        }

        const geom = this._computeGeom(cssW, cssH);

        this._geom = geom;

        const g       = Viewport.GRID;
        const {hw, hh} = geom;

        // Draw floor tiles (painter order: back-to-front, so row+col ascending).
        const textured = detail.tileTextures.size > 0;

        for (let sum = 0; sum <= 2 * (g - 1); sum++) {
            for (let row = Math.max(0, sum - (g - 1)); row <= Math.min(g - 1, sum); row++) {
                const col   = sum - row;
                const idx   = row * g + col;
                const asset = detail.assetIds[idx]!;
                const {sx, sy} = this._cellToScreen(col, row, geom);
                const tex   = textured ? detail.tileTextures.get(asset & Viewport.TILE_MASK) : undefined;

                if (tex) {
                    // Draw the tile texture onto its diamond footprint.
                    ctx.drawImage(tex, sx - hw, sy - hh, 2 * hw, 2 * hh);
                } else {
                    ctx.beginPath();
                    ctx.moveTo(sx, sy - hh);
                    ctx.lineTo(sx + hw, sy);
                    ctx.lineTo(sx, sy + hh);
                    ctx.lineTo(sx - hw, sy);
                    ctx.closePath();
                    ctx.fillStyle = Viewport._colorFor(asset);
                    ctx.fill();
                }

                // Static object sprite, in the same back-to-front order so nearer
                // objects occlude farther ones. Anchored bottom-centre on the tile.
                const sa = detail.staticAsset[idx]!;
                const sp = sa ? detail.staticSprites.get(sa) : undefined;

                if (sp) {
                    const px = hw / 32; // atlas-px → screen (a floor tile ≈ 64 atlas px = 2*hw)
                    const dw = sp.w * px;
                    const dh = sp.h * px;

                    ctx.drawImage(sp.img, sx - dw / 2, sy + hh - dh, dw, dh);
                }
            }
        }

        // Tile edges only when tiles are big enough to read.
        if (hh >= 4) {
            ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            ctx.lineWidth   = 1;

            for (let row = 0; row < g; row++) {
                for (let col = 0; col < g; col++) {
                    const {sx, sy} = this._cellToScreen(col, row, geom);

                    ctx.beginPath();
                    ctx.moveTo(sx, sy - hh);
                    ctx.lineTo(sx + hw, sy);
                    ctx.lineTo(sx, sy + hh);
                    ctx.lineTo(sx - hw, sy);
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }

        // Fallback markers: a dot only where a static object has no decoded sprite
        // (sprites unavailable, still loading, or unresolved assetId).
        const dot = Math.max(1.5, Math.min(hw, hh) * 0.45);

        for (let idx = 0; idx < g * g; idx++) {
            const m = detail.staticMask[idx]!;

            if (m === 0) {
                continue;
            }

            const sa = detail.staticAsset[idx]!;

            if (sa && detail.staticSprites.get(sa)) {
                continue; // sprite already drawn
            }

            const row = Math.floor(idx / g);
            const col = idx % g;
            const {sx, sy} = this._cellToScreen(col, row, geom);

            ctx.beginPath();
            ctx.arc(sx, sy, dot, 0, Math.PI * 2);
            ctx.fillStyle = (m & 1) ? '#ffd76a' : '#ff9d5c';
            ctx.fill();
        }

        // Active-cell highlight.
        const active = this._state.activeCell;

        if (active !== null && active >= 0 && active < g * g) {
            const row = Math.floor(active / g);
            const col = active % g;
            const {sx, sy} = this._cellToScreen(col, row, geom);

            ctx.beginPath();
            ctx.moveTo(sx, sy - hh);
            ctx.lineTo(sx + hw, sy);
            ctx.lineTo(sx, sy + hh);
            ctx.lineTo(sx - hw, sy);
            ctx.closePath();
            ctx.strokeStyle = '#e6c065';
            ctx.lineWidth   = 2;
            ctx.stroke();
        }

        // Header + active-cell readout.
        ctx.fillStyle    = '#a8a8b0';
        ctx.font         = '11px ui-monospace, monospace';
        ctx.textBaseline = 'top';
        ctx.textAlign    = 'left';
        ctx.fillText(
            `${detail.name}  —  64×64  ·  ${textured ? `textured (${detail.tileTextures.size})` : 'colour=assetId'}`
            + `  ·  ${this._zoom.toFixed(1)}×  ·  wheel=zoom, drag=pan, click=pick`,
            12,
            10
        );

        if (active !== null && active >= 0 && active < g * g) {
            const row = Math.floor(active / g);
            const col = active % g;
            const m   = detail.staticMask[active]!;
            const st  = (m & 3) === 3 ? 'A+B' : (m & 1) ? 'A' : (m & 2) ? 'B' : '–';

            ctx.textAlign = 'right';
            ctx.fillStyle = '#e6c065';
            ctx.fillText(
                `cell (r${row}, c${col})  floor asset=${detail.assetIds[active]}  static=${st}`,
                cssW - 12,
                10
            );
        }
    }

    // ---- camera: zoom (wheel, cursor-anchored) + pan (drag) ------------------

    private _onWheel(e: WheelEvent): void {
        if (!this._state.sectorDetail || !this._geom) {
            return;
        }

        e.preventDefault();

        const rect   = this._canvas.getBoundingClientRect();
        const mx     = e.clientX - rect.left;
        const my     = e.clientY - rect.top;
        const g      = this._geom;
        // iso-unit point currently under the cursor
        const ux     = (mx - g.cx) / g.hw;
        const uy     = (my - g.cy) / g.hh;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const next   = Math.min(Viewport.ZOOM_MAX, Math.max(Viewport.ZOOM_MIN, this._zoom * factor));

        if (next === this._zoom) {
            return;
        }

        // Re-derive base half-sizes, then pan so (ux,uy) stays under the cursor.
        const base = this._baseGeom(this._canvas.clientWidth, this._canvas.clientHeight);

        this._zoom = next;
        this._panX = mx - base.cx - ux * base.hw * next;
        this._panY = my - base.cy - uy * base.hh * next;
        this._draw();
    }

    private _onDown(e: MouseEvent): void {
        if (!this._state.sectorDetail) {
            return;
        }

        this._dragging = true;
        this._moved    = 0;
        this._lastX    = e.clientX;
        this._lastY    = e.clientY;
    }

    private _onMove(e: MouseEvent): void {
        if (!this._dragging) {
            return;
        }

        const dx = e.clientX - this._lastX;
        const dy = e.clientY - this._lastY;

        this._lastX  = e.clientX;
        this._lastY  = e.clientY;
        this._moved += Math.abs(dx) + Math.abs(dy);
        this._panX  += dx;
        this._panY  += dy;
        this._draw();
    }

    private _onUp(e: MouseEvent): void {
        if (!this._dragging) {
            return;
        }

        this._dragging = false;

        // A negligible movement counts as a click → pick the cell.
        if (this._moved < 4 && this._state.sectorDetail && this._geom) {
            const rect = this._canvas.getBoundingClientRect();

            this._state.setActiveCell(this._screenToCell(e.clientX - rect.left, e.clientY - rect.top, this._geom));
        }
    }

    /** Stable pseudo-random colour for a floor assetId (provisional tile identity). */
    private static _colorFor(assetId: number): string {
        if (assetId === 0) {
            return '#26262c';
        }

        let h = assetId >>> 0;

        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
        h ^= h >>> 13;
        h = Math.imul(h, 0x297a2d39) >>> 0;
        h ^= h >>> 15;

        const hue    = h % 360;
        const direct = assetId < 90132;           // a direct tiles.pak index
        const sat    = direct ? 58 : 42;
        const light  = 34 + ((h >>> 9) % 20);      // 34..53

        return `hsl(${hue} ${sat}% ${light}%)`;
    }

    // ---- WLK occupancy overview (unchanged) ----------------------------------

    private _findWlk(): LoadedWlk | null {
        for (const c of this._state.containers) {
            if (c.kind === 'wlk') {
                return c;
            }
        }

        return null;
    }

    private _drawOccupancy(
        ctx:    CanvasRenderingContext2D,
        cssW:   number,
        cssH:   number,
        wlk:    LoadedWlk,
        wlkIdx: number
    ): void {
        const margin = 24;
        const w      = wlk.gridWidth;
        const h      = wlk.gridHeight;
        const cell   = Math.max(1, Math.floor(Math.min((cssW - 2 * margin) / w, (cssH - 2 * margin) / h)));
        const gridW  = cell * w;
        const gridH  = cell * h;
        const originX = Math.floor((cssW - gridW) / 2);
        const originY = Math.floor((cssH - gridH) / 2);

        ctx.fillStyle = '#1a1a1f';
        ctx.fillRect(originX, originY, gridW, gridH);

        ctx.strokeStyle = '#2c2c33';
        ctx.lineWidth   = 1;
        ctx.beginPath();

        for (let i = 0; i <= w; i += 10) {
            const x = originX + i * cell + 0.5;

            ctx.moveTo(x, originY);
            ctx.lineTo(x, originY + gridH);
        }

        for (let i = 0; i <= h; i += 10) {
            const y = originY + i * cell + 0.5;

            ctx.moveTo(originX, y);
            ctx.lineTo(originX + gridW, y);
        }

        ctx.stroke();

        ctx.fillStyle = '#3d7e9a';

        for (let i = 0; i < wlk.sectorCount; i++) {
            const gi  = wlk.gridIndex[i]!;
            const row = Math.floor(gi / w);
            const col = gi % w;

            ctx.fillRect(originX + col * cell, originY + row * cell, cell, cell);
        }

        const sel = this._state.selection;

        if (sel && sel.containerIdx === wlkIdx && sel.recordIdx >= 0 && sel.recordIdx < wlk.sectorCount) {
            const gi  = wlk.gridIndex[sel.recordIdx]!;
            const row = Math.floor(gi / w);
            const col = gi % w;
            const x   = originX + col * cell;
            const y   = originY + row * cell;
            const s   = Math.max(2, cell);

            ctx.fillStyle = '#e6c065';
            ctx.fillRect(x, y, cell, cell);
            ctx.strokeStyle = '#e6c065';
            ctx.lineWidth   = 1;
            ctx.strokeRect(Math.floor(x - 2) + 0.5, Math.floor(y - 2) + 0.5, s + 4, s + 4);
        }

        ctx.fillStyle    = '#a8a8b0';
        ctx.font         = '11px ui-monospace, monospace';
        ctx.textBaseline = 'top';
        ctx.textAlign    = 'left';
        ctx.fillText(
            `${wlk.name}  —  ${wlk.sectorCount.toLocaleString('de-DE')} sectors on ${w}×${h} grid  ·  cell=${cell}px  ·  pick a sector for the tile map`,
            originX,
            Math.max(4, originY - 16)
        );
    }

}
