import {
    FileRandomAccess,
    FloorRecord,
    IsoTilesReader,
    ObjReader,
    PakEntry,
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
    private readonly _texCache = new Map<number, CanvasImageSource>(); // by tile index

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
        this._texCache.clear();

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

            await reader.open();

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

        try {
            const sec        = WldSector.parse(await target.wld.reader.readSector(target.sectorIndex));
            const n          = WldSector.CELL_COUNT;
            const cellCount  = sec.cellCount();
            const assetIds   = new Uint32Array(n);
            const staticMask = new Uint8Array(n);
            const cellFloor  = new Uint32Array(n);
            const uniq       = new Map<number, number>();

            for (let c = 0; c < cellCount; c++) {
                const cell = sec.getCell(c);

                cellFloor[c]  = cell.floorIndex;
                staticMask[c] = (cell.hasStaticA() ? 1 : 0) | (cell.hasStaticB() ? 2 : 0);
                uniq.set(cell.floorIndex, 0);
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

            if (token !== this._detailToken) {
                return; // a newer selection superseded this load
            }

            const tileTextures = new Map<number, CanvasImageSource>();

            this.sectorDetail = {
                containerIdx: target.wldIdx,
                sectorIndex:  target.sectorIndex,
                name:         sec.getName(),
                assetIds,
                staticMask,
                tileTextures
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
        } catch (err) {
            console.warn('sector detail load failed:', err);
        }
    }

}