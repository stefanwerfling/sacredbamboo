import {
    FileRandomAccess,
    FloorRecord,
    IsoTilesReader,
    MixedReader,
    ObjReader,
    PakEntry,
    StaticRecord,
    TexReader,
    TrgReader,
    WldReader,
    WldSector,
    WlkReader,
    WlkSector
} from 'sacredbamboo-assets';
import {SacredGoldDir} from '../io/SacredGoldDir.js';

export interface LoadedTrg {
    kind:    'trg';
    name:    string;
    reader:  TrgReader;
    entries: PakEntry[];
}

export interface LoadedObj {
    kind:           'obj';
    name:           string;
    reader:         ObjReader;
    recordCount:    number;
    recordType:     number;
    recordLength:   number;
}

export interface LoadedWlk {
    kind:        'wlk';
    name:        string;
    reader:      WlkReader;
    sectorCount: number;
    gridWidth:   number;
    gridHeight:  number;
    /** Sector i's `gridIndex` (= row*gridWidth + col). Pre-parsed at load time. */
    gridIndex:   Uint32Array;
    /** Sector i's `ordinal` (1-based permutation of 1..sectorCount). */
    ordinal:     Uint32Array;
}

export interface LoadedWld {
    kind:        'wld';
    name:        string;
    reader:      WldReader;
    sectorCount: number;
}

export type LoadedContainer = LoadedTrg | LoadedObj | LoadedWlk | LoadedWld;

export interface Selection {
    /** Index into AppState.containers identifying which file. */
    containerIdx: number;
    /** Record (TRG: PakEntry index; OBJ: synthesised record index). */
    recordIdx:    number;
}

/**
 * Per-cell render data for one WLD sector's 64×64 grid, resolved on selection.
 * Feeds the isometric tile-map view in the Viewport.
 */
export interface SectorDetail {
    /** WLD container index this sector belongs to. */
    containerIdx: number;
    sectorIndex:  number;
    name:         string;
    /** Floor assetId per cell (index = row*64 + col); 0 if unresolved. */
    assetIds:     Uint32Array;
    /** Per cell: bit0 = staticA present, bit1 = staticB present. */
    staticMask:   Uint8Array;
    /** Decoded floor tile textures keyed by tile index (`assetId & 0x1FFFF`). */
    tileTextures: Map<number, CanvasImageSource>;
    /** Per cell: the staticA / staticB objects' mixed.pak assetIds (0 = none). */
    staticAssetA: Uint32Array;
    staticAssetB: Uint32Array;
    /** Decoded static-object sprites keyed by mixed.pak assetId (frame 0). */
    staticSprites: Map<number, {img: CanvasImageSource; w: number; h: number}>;
}

/**
 * Single-source-of-truth for the editor session. Plain observer pattern —
 * UI panels subscribe and rerender when something they care about changes.
 *
 * Triggers.PAK is eager-loaded after picking the directory (small, fast).
 * Floor.PAK / Static.PAK are lazy — they're huge and the user might not
 * care about them yet. ObjReader itself only touches 280 bytes during open,
 * so the cost of lazy-loading them is mostly the FileSystemFileHandle round
 * trips.
 */
export class AppState {

    /** Max composited object dimension (px); larger objects stay a marker (perf/UI cap). */
    public static readonly MAX_SPRITE_DIM = 768;

    public dir:          SacredGoldDir | null  = null;
    public containers:   LoadedContainer[]      = [];
    public selection:    Selection | null       = null;
    /** Resolved 64×64 cell data for the selected sector (iso tile-map view). */
    public sectorDetail: SectorDetail | null    = null;
    /** Cell picked inside the iso view (index = row*64 + col), or null. */
    public activeCell:   number | null          = null;

    private readonly _listeners = new Set<() => void>();
    private _detailToken = 0;

    // Tile-texture pipeline (pak/tiles.pak → pak/texture.pak), loaded lazily.
    private _isoTiles: IsoTilesReader | null                 = null;
    private _tex:      TexReader | null                      = null;
    private _mixed:    MixedReader | null                    = null;
    /** wldx (offset,length) index lifted from sectors.keyx, so WldReader skips its stream-walk. */
    private _wldxIndex: Uint32Array | null                   = null;
    private readonly _texCache    = new Map<number, CanvasImageSource>(); // by tile index
    // Static-object sprites (mixed.pak assetId → decoded frame-0 sprite).
    private readonly _spriteCache = new Map<number, {img: CanvasImageSource; w: number; h: number} | null>();

    public subscribe(fn: () => void): () => void {
        this._listeners.add(fn);

        return () => this._listeners.delete(fn);
    }

    public emit(): void {
        for (const fn of this._listeners) {
            fn();
        }
    }

    public async openDir(dir: SacredGoldDir): Promise<void> {
        this.dir          = dir;
        this.containers   = [];
        this.selection    = null;
        this.sectorDetail = null;
        this.activeCell   = null;
        this._isoTiles    = null;
        this._tex         = null;
        this._mixed       = null;
        this._wldxIndex   = null;
        this._texCache.clear();
        this._spriteCache.clear();

        try {
            const file   = await dir.getFile('World/Triggers.PAK');
            const reader = new TrgReader(new FileRandomAccess(file));

            await reader.open();

            this.containers.push({
                kind:    'trg',
                name:    'World/Triggers.PAK',
                reader,
                entries: reader.getEntries()
            });
        } catch (err) {
            console.warn('Triggers.PAK not loaded:', err);
        }

        await this._loadObj('World/Floor.PAK');
        await this._loadObj('World/Static.PAK');
        await this._loadWlk('World/sectors.keyx');
        await this._loadWld('World/sectors.wldx');
        await this._loadTilePaks();

        this.emit();
    }

    /** Open pak/tiles.pak + pak/texture.pak for floor tile textures (optional). */
    private async _loadTilePaks(): Promise<void> {
        if (!this.dir) {
            return;
        }

        try {
            const tilesFile = await this.dir.getFile('pak/tiles.pak');
            const isoTiles  = new IsoTilesReader(new FileRandomAccess(tilesFile));

            await isoTiles.open();

            const texFile = await this.dir.getFile('pak/texture.pak');
            const tex     = new TexReader(new FileRandomAccess(texFile));

            await tex.open();

            this._isoTiles = isoTiles;
            this._tex      = tex;
        } catch (err) {
            console.warn('tile textures unavailable (pak/tiles.pak / pak/texture.pak):', err);
        }

        // Static-object sprites (pak/mixed.pak → texture.pak atlases). Optional.
        try {
            const mixFile = await this.dir.getFile('pak/mixed.pak');
            const mixed   = new MixedReader(new FileRandomAccess(mixFile));

            await mixed.open();
            this._mixed = mixed;
        } catch (err) {
            console.warn('static sprites unavailable (pak/mixed.pak):', err);
        }
    }

    /**
     * Composite a static object's full sprite from all its mixed.pak frames:
     * each frame blits its texture.pak atlas source rect into the object's
     * width×height canvas at the frame's normalized DEST rect. Cached by assetId.
     */
    private async _resolveStaticSprite(assetId: number): Promise<{img: CanvasImageSource; w: number; h: number} | null> {
        if (this._spriteCache.has(assetId)) {
            return this._spriteCache.get(assetId)!;
        }

        let result: {img: CanvasImageSource; w: number; h: number} | null = null;

        if (this._mixed && this._tex && assetId > 0 && assetId < this._mixed.getDefCount()) {
            try {
                const def = await this._mixed.getDef(assetId);
                const W   = def.width;
                const H   = def.height;

                if (W > 0 && H > 0 && W <= AppState.MAX_SPRITE_DIM && H <= AppState.MAX_SPRITE_DIM && def.frames.length) {
                    const canvas = new Uint8ClampedArray(W * H * 4);
                    const atlases = new Map<number, {rgba: Uint8ClampedArray; width: number; height: number}>();

                    for (const f of def.frames) {
                        const sw = f.x2 - f.x1;
                        const sh = f.y2 - f.y1;

                        if (sw <= 0 || sh <= 0 || f.textureIndex >= this._tex.getImageCount()) {
                            continue;
                        }

                        if (!atlases.has(f.textureIndex)) {
                            atlases.set(f.textureIndex, await this._tex.readImage(f.textureIndex));
                        }

                        const img = atlases.get(f.textureIndex)!;
                        const dx  = Math.round(f.dx0 * W);
                        const dy  = Math.round(f.dy0 * H);
                        const dw  = Math.round((f.dx1 - f.dx0) * W);
                        const dh  = Math.round((f.dy1 - f.dy0) * H);

                        for (let y = 0; y < dh; y++) {
                            const sy = f.y1 + (dh > 0 ? Math.floor(y * sh / dh) : 0);
                            const py = dy + y;

                            if (sy >= img.height || py < 0 || py >= H) {continue;}

                            for (let x = 0; x < dw; x++) {
                                const sx = f.x1 + (dw > 0 ? Math.floor(x * sw / dw) : 0);
                                const px = dx + x;

                                if (sx >= img.width || px < 0 || px >= W) {continue;}

                                const si = (sy * img.width + sx) * 4;

                                if (img.rgba[si + 3] === 0) {continue;} // keep transparency

                                const di = (py * W + px) * 4;

                                canvas[di]     = img.rgba[si]!;
                                canvas[di + 1] = img.rgba[si + 1]!;
                                canvas[di + 2] = img.rgba[si + 2]!;
                                canvas[di + 3] = img.rgba[si + 3]!;
                            }
                        }
                    }

                    const bmp = await createImageBitmap(new ImageData(canvas, W, H));

                    result = {img: bmp, w: W, h: H};
                }
            } catch (err) {
                console.warn(`static sprite ${assetId} failed:`, err);
            }
        }

        this._spriteCache.set(assetId, result);

        return result;
    }

    /** Decode one floor tile index → an ImageBitmap, cached across sectors. */
    private async _resolveTileTexture(tileIndex: number): Promise<CanvasImageSource | null> {
        const cached = this._texCache.get(tileIndex);

        if (cached) {
            return cached;
        }

        if (!this._isoTiles || !this._tex || tileIndex >= this._isoTiles.getTileCount()) {
            return null;
        }

        try {
            const tile = await this._isoTiles.getTile(tileIndex);

            if (tile.textureIndex >= this._tex.getImageCount()) {
                return null;
            }

            const img    = await this._tex.readImage(tile.textureIndex);
            // Copy into a plain-ArrayBuffer-backed array (ImageData rejects ArrayBufferLike).
            const data   = new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height);
            const bitmap = await createImageBitmap(data);

            this._texCache.set(tileIndex, bitmap);

            return bitmap;
        } catch (err) {
            console.warn(`tile texture ${tileIndex} failed:`, err);

            return null;
        }
    }

    private async _loadWld(relPath: string): Promise<void> {
        if (!this.dir) {
            return;
        }

        try {
            const file   = await this.dir.getFile(relPath);
            const reader = new WldReader(new FileRandomAccess(file));

            // Prefer the keyx-sourced index (loaded just before us); fall back to
            // WldReader's own stream-walk if keyx was missing or validation throws.
            try {
                await reader.open(this._wldxIndex ?? undefined);
            } catch (err) {
                if (this._wldxIndex) {
                    console.warn(`${relPath}: keyx index rejected, falling back to stream-walk:`, err);
                    await reader.open();
                } else {
                    throw err;
                }
            }

            this.containers.push({
                kind:        'wld',
                name:        relPath,
                reader,
                sectorCount: reader.getSectorCount()
            });
        } catch (err) {
            console.warn(`${relPath} not loaded:`, err);
        }
    }

    private async _loadWlk(relPath: string): Promise<void> {
        if (!this.dir) {
            return;
        }

        try {
            const file   = await this.dir.getFile(relPath);
            const reader = new WlkReader(new FileRandomAccess(file));

            await reader.open();

            const h         = reader.getHeader();
            const gridIndex = new Uint32Array(h.sectorCount);
            const ordinal   = new Uint32Array(h.sectorCount);
            const blob      = await reader.readAllSectorsBlob();

            // keyx carries the wldx compressed-stream (offset,length) table at
            // @0xEC/@0xF0 — hand it to the following _loadWld so WldReader can
            // skip its ~3.5 s stream-walk (verified identical, 2026-10-14).
            this._wldxIndex = await reader.getWldxSectorIndex();

            for (let i = 0; i < h.sectorCount; i++) {
                const s = WlkSector.parse(blob, i * WlkReader.SECTOR_SIZE);

                gridIndex[i] = s.gridIndex;
                ordinal[i]   = s.ordinal;
            }

            this.containers.push({
                kind:        'wlk',
                name:        relPath,
                reader,
                sectorCount: h.sectorCount,
                gridWidth:   h.gridWidth,
                gridHeight:  h.gridHeight,
                gridIndex,
                ordinal
            });
        } catch (err) {
            console.warn(`${relPath} not loaded:`, err);
        }
    }

    private async _loadObj(relPath: string): Promise<void> {
        if (!this.dir) {
            return;
        }

        try {
            const file   = await this.dir.getFile(relPath);
            const reader = new ObjReader(new FileRandomAccess(file));

            await reader.open();

            this.containers.push({
                kind:         'obj',
                name:         relPath,
                reader,
                recordCount:  reader.getRecordCount(),
                recordType:   reader.getRecordType(),
                recordLength: reader.getRecordLength()
            });
        } catch (err) {
            console.warn(`${relPath} not loaded:`, err);
        }
    }

    public select(sel: Selection | null): void {
        this.selection  = sel;
        this.activeCell = null;
        this.emit();
        void this._maybeLoadSectorDetail(sel);
    }

    /** Pick a cell inside the current iso sector view (index = row*64 + col). */
    public setActiveCell(cell: number | null): void {
        this.activeCell = cell;
        this.emit();
    }

    /** Resolve a selection to the WLD container + sector index it maps to. */
    private _resolveSector(sel: Selection | null): {wldIdx: number; wld: LoadedWld; sectorIndex: number} | null {
        if (!sel) {
            return null;
        }

        const container = this.containers[sel.containerIdx];

        if (container?.kind === 'wld') {
            return {wldIdx: sel.containerIdx, wld: container, sectorIndex: sel.recordIdx};
        }

        // WLK sectors are index-aligned with WLD (same iteration order) — map across.
        if (container?.kind === 'wlk') {
            const wldIdx = this.containers.findIndex((c) => c.kind === 'wld');

            if (wldIdx >= 0) {
                return {wldIdx, wld: this.containers[wldIdx] as LoadedWld, sectorIndex: sel.recordIdx};
            }
        }

        return null;
    }

    private async _maybeLoadSectorDetail(sel: Selection | null): Promise<void> {
        const token  = ++this._detailToken;
        const target = this._resolveSector(sel);

        if (!target || target.sectorIndex < 0 || target.sectorIndex >= target.wld.sectorCount) {
            if (this.sectorDetail) {
                this.sectorDetail = null;
                this.emit();
            }

            return;
        }

        const floor = this.containers.find(
            (c): c is LoadedObj => c.kind === 'obj' && c.name.endsWith('Floor.PAK')
        );
        const staticObj = this.containers.find(
            (c): c is LoadedObj => c.kind === 'obj' && c.name.endsWith('Static.PAK')
        );

        try {
            const sec         = WldSector.parse(await target.wld.reader.readSector(target.sectorIndex));
            const n           = WldSector.CELL_COUNT;
            const cellCount   = sec.cellCount();
            const assetIds    = new Uint32Array(n);
            const staticMask  = new Uint8Array(n);
            const staticAssetA = new Uint32Array(n);
            const staticAssetB = new Uint32Array(n);
            const cellFloor   = new Uint32Array(n);
            const cellStaticA = new Uint32Array(n); // staticA Static.PAK record index (0=none)
            const cellStaticB = new Uint32Array(n); // staticB Static.PAK record index (0=none)
            const uniq        = new Map<number, number>();
            const uniqStatic  = new Map<number, number>(); // static record index → mixed.pak assetId

            for (let c = 0; c < cellCount; c++) {
                const cell = sec.getCell(c);

                cellFloor[c]  = cell.floorIndex;
                staticMask[c] = (cell.hasStaticA() ? 1 : 0) | (cell.hasStaticB() ? 2 : 0);
                uniq.set(cell.floorIndex, 0);

                if (staticObj) {
                    const a = cell.staticA();
                    const b = cell.staticB();

                    if (a > 0 && a < staticObj.recordCount) {cellStaticA[c] = a; uniqStatic.set(a, 0);}
                    if (b > 0 && b < staticObj.recordCount) {cellStaticB[c] = b; uniqStatic.set(b, 0);}
                }
            }

            // Resolve each distinct floor record once (≈ a couple hundred reads).
            if (floor) {
                for (const fi of uniq.keys()) {
                    if (fi < floor.recordCount) {
                        uniq.set(fi, FloorRecord.parse(await floor.reader.readRecord(fi)).assetId);
                    }
                }

                for (let c = 0; c < cellCount; c++) {
                    assetIds[c] = uniq.get(cellFloor[c]) ?? 0;
                }
            }

            // Resolve each distinct static record → its mixed.pak assetId.
            if (staticObj) {
                for (const si of uniqStatic.keys()) {
                    uniqStatic.set(si, StaticRecord.parse(await staticObj.reader.readRecord(si)).assetId);
                }

                for (let c = 0; c < cellCount; c++) {
                    staticAssetA[c] = cellStaticA[c] ? (uniqStatic.get(cellStaticA[c]) ?? 0) : 0;
                    staticAssetB[c] = cellStaticB[c] ? (uniqStatic.get(cellStaticB[c]) ?? 0) : 0;
                }
            }

            if (token !== this._detailToken) {
                return; // a newer selection superseded this load
            }

            const tileTextures  = new Map<number, CanvasImageSource>();
            const staticSprites = new Map<number, {img: CanvasImageSource; w: number; h: number}>();

            this.sectorDetail = {
                containerIdx: target.wldIdx,
                sectorIndex:  target.sectorIndex,
                name:         sec.getName(),
                assetIds,
                staticMask,
                tileTextures,
                staticAssetA,
                staticAssetB,
                staticSprites
            };
            this.emit(); // show hash-coloured tiles immediately

            // Progressively decode the distinct floor tile textures.
            if (this._isoTiles && this._tex) {
                const distinct = new Set<number>();

                for (let c = 0; c < cellCount; c++) {
                    distinct.add(assetIds[c]! & FloorRecord.TILE_INDEX_MASK);
                }

                let dirty = 0;

                for (const ti of distinct) {
                    if (token !== this._detailToken) {
                        return;
                    }

                    const bmp = await this._resolveTileTexture(ti);

                    if (bmp) {
                        tileTextures.set(ti, bmp);

                        // Repaint in small batches so tiles fill in visibly.
                        if (++dirty % 8 === 0) {
                            this.emit();
                        }
                    }
                }

                if (token === this._detailToken) {
                    this.emit();
                }
            }

            // Progressively decode the distinct static-object sprites (A and B).
            if (this._mixed && this._tex) {
                const distinct = new Set<number>();

                for (let c = 0; c < cellCount; c++) {
                    if (staticAssetA[c]) {distinct.add(staticAssetA[c]!);}
                    if (staticAssetB[c]) {distinct.add(staticAssetB[c]!);}
                }

                let dirty = 0;

                for (const a of distinct) {
                    if (token !== this._detailToken) {
                        return;
                    }

                    const sprite = await this._resolveStaticSprite(a);

                    if (sprite) {
                        staticSprites.set(a, sprite);

                        if (++dirty % 8 === 0) {
                            this.emit();
                        }
                    }
                }

                if (token === this._detailToken) {
                    this.emit();
                }
            }
        } catch (err) {
            console.warn('sector detail load failed:', err);
        }
    }

}