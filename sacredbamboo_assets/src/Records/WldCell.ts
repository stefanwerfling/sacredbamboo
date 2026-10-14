/**
 * One 32-byte cell record from a WLD sector body. A sector's body holds a
 * 64×64 grid (4096) of these, in row-major order (cell index = row*64 + col),
 * followed by a 292-byte sector trailer (see {@link WldSector}).
 *
 * This is the sector→records linkage plus the per-tile terrain data.
 *
 * Layout (little-endian). The four u32 chain heads @0x00..0x0C were verified
 * 2026-05-22; the per-corner terrain fields @0x10..0x1B and @0x1C..0x1F were
 * decoded 2026-10-14 (`scripts/verify_cell_corners.ts` + `verify_tile_byte.ts`,
 * offsets hinted by [[reference-sacredengineremake]]'s WldxTileRecord and
 * confirmed empirically here):
 *
 *   @0x00  u32   floorIndex            Floor.PAK record index (0 = none) — VERIFIED
 *                                      matches Floor[i].selfIndex. Head of the
 *                                      floor-tile chain (FloorRecord.nextIndex).
 *                                      Observed range 1..~90k (the ground-tile band).
 *   @0x04  u32   staticIndexA          Static.PAK reference: low 20 bits = record
 *                                      index (0 = none). Upper flag bits observed 0
 *                                      across all sampled cells (raw max 1,037,505
 *                                      < Static count), unlike staticIndexB.
 *   @0x08  u32   worldObjectChainHead  Dynamic world-object chain head; 0 at rest
 *                                      (runtime-only), always 0 in authored data.
 *   @0x0C  u32   staticIndexB          second Static.PAK reference: low 20 bits =
 *                                      record index, upper bits = flags (0..6).
 *                                      RESOLVED 2026-10-14 (`discriminate_cell_refs.ts`):
 *                                      the reference labels this a Floor overlay
 *                                      chain, but reading the low 20 bits as a
 *                                      Static index lands on a valid record
 *                                      (Static[masked].self==masked) 100% of the
 *                                      time, whereas reading the full u32 as a Floor
 *                                      index hits uninitialised Floor records 85.6%
 *                                      of the time — so it is Static, not Floor.
 *   @0x10  sbyte visualElevation[4]    L/T/R/B visual Y offset of the terrain
 *                                      vertices (on liquid also per-corner opacity).
 *   @0x14  byte  bakedBrightness[4]    SW/NW/NE/SE baked corner brightness, in
 *                                      steps of 0x14; 0xFF = unoccluded (dominant).
 *                                      VERIFIED: the old "0xFFFFFFFF sentinel" is
 *                                      exactly all four corners == 0xFF.
 *   @0x18  sbyte elevation[4]          SW/NW/NE/SE terrain height-field. VERIFIED by
 *                                      corner continuity: a cell's E corners (NE,SE)
 *                                      equal its col+1 neighbor's W corners (NW,SW)
 *                                      100%, and its S corners (SW,SE) equal its
 *                                      row+1 neighbor's N corners (NW,NE) 100%.
 *   @0x1C  sbyte indoorAnchorDeltaX    signed X delta to the parent indoor anchor tile.
 *   @0x1D  sbyte indoorAnchorDeltaY    signed Y delta to the parent indoor anchor tile.
 *                                      VERIFIED linked to Indoor: an anchor delta is
 *                                      set iff the tile is Indoor (anchor⇒Indoor 0
 *                                      exceptions; Indoor⇒anchor 98.9%, the rest are
 *                                      their own anchor at delta 0,0).
 *   @0x1E  byte  pathFlags             authored per-tile world flags. VERIFIED 2026-10-14
 *                                      over ~5M cells: only 0x01 Indoor (0.40%),
 *                                      0x02 Town (0.58%), 0x04 Trigger (0.01%) ever
 *                                      appear; 0x08 RuntimeBlocked / 0x10 FootprintAnim
 *                                      are runtime-only (0 in authored data), 0x20/40/80
 *                                      never set. See isIndoor()/isTown()/hasTrigger().
 *   @0x1F  byte  properties            nibble-packed tile selector (behavior+surface).
 *
 * `@0x1F` nibble layout — verified over 1.65M retail cells (`verify_tile_byte.ts`):
 *   low nibble  = navigation behavior. 0/1,654,784 cells held an undocumented
 *                 value. Observed: None(0), BlockerA(1), BlockerB(2), StairsUp(5),
 *                 StairsUp2(7), IndoorEntry(9), IndoorExit(0xA). StairsDown(6)/
 *                 StairsDown2(8) documented but unseen outdoors.
 *   high nibble = terrain surface. All 16 values 0x00..0xF0 occur; 0x90/0xA0
 *                 are the two authored liquid surfaces (0x80 = liquid-family bit).
 */
export type WldCellBehavior =
    | 'None' | 'BlockerA' | 'BlockerB'
    | 'StairsUp' | 'StairsDown' | 'StairsUp2' | 'StairsDown2'
    | 'IndoorEntry' | 'IndoorExit' | 'Unknown';

export interface WldCellFields {
    worldObjectChainHead: number;
    visualElevation:      readonly number[];
    bakedBrightness:      readonly number[];
    elevation:            readonly number[];
    indoorAnchorDeltaX:   number;
    indoorAnchorDeltaY:   number;
    pathFlags:            number;
    properties:           number;
}

export class WldCell {

    public static readonly SIZE = 32;
    /** staticIndexA/B pack a Static.PAK index in the low 20 bits; upper bits are flags. */
    public static readonly STATIC_INDEX_MASK = 0xfffff;
    /** Fully-unoccluded baked-brightness value at a corner. */
    public static readonly BRIGHTNESS_MAX = 0xff;

    /** `pathFlags` (@0x1E) bits. 0x08/0x10 are runtime-only; 0x20/0x40/0x80 unseen in authored data. */
    public static readonly PATH_INDOOR         = 0x01;
    public static readonly PATH_TOWN           = 0x02;
    public static readonly PATH_TRIGGER        = 0x04;
    public static readonly PATH_RUNTIME_BLOCK  = 0x08;
    public static readonly PATH_FOOTPRINT_ANIM = 0x10;

    public readonly worldObjectChainHead: number;
    public readonly visualElevation:      readonly number[];
    public readonly bakedBrightness:      readonly number[];
    public readonly elevation:            readonly number[];
    public readonly indoorAnchorDeltaX:   number;
    public readonly indoorAnchorDeltaY:   number;
    public readonly pathFlags:            number;
    public readonly properties:           number;

    public constructor(
        public readonly floorIndex:   number,
        public readonly staticIndexA: number,
        public readonly staticIndexB: number,
        fields?: Partial<WldCellFields>
    ) {
        this.worldObjectChainHead = fields?.worldObjectChainHead ?? 0;
        this.visualElevation      = fields?.visualElevation      ?? [0, 0, 0, 0];
        this.bakedBrightness      = fields?.bakedBrightness      ?? [0, 0, 0, 0];
        this.elevation            = fields?.elevation            ?? [0, 0, 0, 0];
        this.indoorAnchorDeltaX   = fields?.indoorAnchorDeltaX   ?? 0;
        this.indoorAnchorDeltaY   = fields?.indoorAnchorDeltaY   ?? 0;
        this.pathFlags            = fields?.pathFlags            ?? 0;
        this.properties           = fields?.properties           ?? 0;
    }

    public static parse(buf: Uint8Array | ArrayBuffer, byteOffset = 0): WldCell {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

        if (u8.byteLength - byteOffset < WldCell.SIZE) {
            throw new RangeError(
                `WldCell.parse: need ${WldCell.SIZE} bytes at offset ${byteOffset}, have ${u8.byteLength - byteOffset}`
            );
        }

        const dv  = new DataView(u8.buffer, u8.byteOffset + byteOffset, WldCell.SIZE);
        const s8  = (off: number): number => dv.getInt8(off);
        const quad = (off: number, read: (o: number) => number): number[] =>
            [read(off), read(off + 1), read(off + 2), read(off + 3)];

        return new WldCell(
            dv.getUint32(0x00, true),
            dv.getUint32(0x04, true),
            dv.getUint32(0x0c, true),
            {
                worldObjectChainHead: dv.getUint32(0x08, true),
                visualElevation:      quad(0x10, s8),
                bakedBrightness:      quad(0x14, (o) => dv.getUint8(o)),
                elevation:            quad(0x18, s8),
                indoorAnchorDeltaX:   s8(0x1c),
                indoorAnchorDeltaY:   s8(0x1d),
                pathFlags:            dv.getUint8(0x1e),
                properties:           dv.getUint8(0x1f)
            }
        );
    }

    /** Static.PAK record index from `staticIndexA` (low 20 bits; 0 = none). */
    public staticA(): number {
        return this.staticIndexA & WldCell.STATIC_INDEX_MASK;
    }

    /** Flag bits packed above the index in `staticIndexA` (observed 0/2/4/5). */
    public staticAFlags(): number {
        return this.staticIndexA >>> 20;
    }

    /** Static.PAK record index from `staticIndexB` (low 20 bits; 0 = none). */
    public staticB(): number {
        return this.staticIndexB & WldCell.STATIC_INDEX_MASK;
    }

    /** Flag bits packed above the index in `staticIndexB` (observed 0/2/4/5). */
    public staticBFlags(): number {
        return this.staticIndexB >>> 20;
    }

    /** True when this cell references a first Static.PAK object. */
    public hasStaticA(): boolean {
        return this.staticA() !== 0;
    }

    /** True when this cell references a second Static.PAK object. */
    public hasStaticB(): boolean {
        return this.staticB() !== 0;
    }

    /** The nibble-packed tile selector byte (`@0x1F`). */
    public getFlagsByte(): number {
        return this.properties;
    }

    /** Navigation behavior — low nibble of `@0x1F`. */
    public behavior(): number {
        return this.properties & 0x0f;
    }

    /** Named navigation behavior, or 'Unknown' for values outside the enum. */
    public behaviorName(): WldCellBehavior {
        switch (this.behavior()) {
            case 0x0: return 'None';
            case 0x1: return 'BlockerA';
            case 0x2: return 'BlockerB';
            case 0x5: return 'StairsUp';
            case 0x6: return 'StairsDown';
            case 0x7: return 'StairsUp2';
            case 0x8: return 'StairsDown2';
            case 0x9: return 'IndoorEntry';
            case 0xa: return 'IndoorExit';
            default:  return 'Unknown';
        }
    }

    /** Terrain surface selector — high nibble of `@0x1F` (0x00..0xF0). */
    public terrainSurface(): number {
        return this.properties & 0xf0;
    }

    /** True for a movement-blocking tile (BlockerA ground+air, BlockerB ground-only). */
    public isMovementBlocker(): boolean {
        const b = this.behavior();

        return b === 0x1 || b === 0x2;
    }

    /** True for any stairs behavior (up/down, single/two-level). */
    public isStairs(): boolean {
        const b = this.behavior();

        return b >= 0x5 && b <= 0x8;
    }

    /** True for an indoor entry/exit portal tile. */
    public isIndoorPortal(): boolean {
        const b = this.behavior();

        return b === 0x9 || b === 0xa;
    }

    /** True for one of the two authored liquid surfaces (0x90 / 0xA0). */
    public isLiquidSurface(): boolean {
        const s = this.terrainSurface();

        return s === 0x90 || s === 0xa0;
    }

    /** True when all four corners are fully unoccluded (brightness 0xFF) — the flat-lit case. */
    public isFullyBright(): boolean {
        return this.bakedBrightness.every((b) => b === WldCell.BRIGHTNESS_MAX);
    }

    /** True when the tile has any non-zero terrain elevation at a corner (sloped/raised). */
    public hasElevation(): boolean {
        return this.elevation.some((e) => e !== 0);
    }

    /** pathFlags @0x1E: tile belongs to an authored indoor area. */
    public isIndoor(): boolean {
        return (this.pathFlags & WldCell.PATH_INDOOR) !== 0;
    }

    /** pathFlags @0x1E: tile belongs to an authored town area. */
    public isTown(): boolean {
        return (this.pathFlags & WldCell.PATH_TOWN) !== 0;
    }

    /** pathFlags @0x1E: tile carries a trigger. */
    public hasTrigger(): boolean {
        return (this.pathFlags & WldCell.PATH_TRIGGER) !== 0;
    }

}
