/**
 * One 32-byte cell record from a WLD sector body. A sector's body holds a
 * 64×64 grid (4096) of these, in row-major order (cell index = row*64 + col),
 * followed by a 292-byte sector trailer (see {@link WldSector}).
 *
 * This is the sector→records linkage: each cell points at a Floor.PAK record
 * (the ground-tile chain head) and up to two Static.PAK object records.
 *
 * Layout empirically verified (2026-05-22, retail Sacred Gold sectors.wldx),
 * all fields little-endian u32:
 *
 *   @0x00  floorIndex    Floor.PAK record index — VERIFIED: matches
 *                        Floor[floorIndex].selfIndex for all 4096 cells of
 *                        every sampled sector. Head of the floor-tile chain
 *                        (FloorRecord.nextIndex links stacked tiles).
 *   @0x04  staticIndexA  Static.PAK reference: low 20 bits = record index
 *                        (0 = none, matches Static[i].selfIndex), upper bits =
 *                        flags. Use staticA()/staticAFlags().
 *   @0x08  reserved08    always 0 in sampled data.
 *   @0x0C  staticIndexB  second Static.PAK reference, same 20-bit-index +
 *                        flag-bits packing (flags 0/2/4/5 observed).
 *                        Use staticB()/staticBFlags().
 *   @0x10  unknown10     small enum, 0..~251 observed (~14 distinct values).
 *   @0x14  extSentinel   0xFFFFFFFF in static-free cells, 0 where static data
 *                        is present (tentative "has-extended-data" marker).
 *   @0x18  corners       four independent bytes, mostly 0/1 — likely per-corner
 *                        tile flags (blend / height-step / walkable).
 *   @0x1C  flags         low 3 bytes 0; byte @0x1F is a nibble-packed tile
 *                        selector (see getFlagsByte()/behavior()/terrainSurface()).
 *
 * `@0x1F` nibble layout — verified 2026-10-14 over 1.65M retail cells
 * (`scripts/verify_tile_byte.ts`; offsets hinted by [[reference-
 * sacredengineremake]]'s WldxTileRecord, confirmed here):
 *   low nibble  = navigation behavior. 0/1,654,784 cells held an undocumented
 *                 value. Observed in retail: None(0), BlockerA(1), BlockerB(2),
 *                 StairsUp(5), StairsUp2(7), IndoorEntry(9), IndoorExit(0xA).
 *                 StairsDown(6)/StairsDown2(8) documented but unseen outdoors.
 *   high nibble = terrain surface. All 16 values 0x00..0xF0 occur; 0x90/0xA0
 *                 are the two authored liquid surfaces (0x80 = liquid-family bit).
 */
export type WldCellBehavior =
    | 'None' | 'BlockerA' | 'BlockerB'
    | 'StairsUp' | 'StairsDown' | 'StairsUp2' | 'StairsDown2'
    | 'IndoorEntry' | 'IndoorExit' | 'Unknown';

export class WldCell {

    public static readonly SIZE           = 32;
    public static readonly EMPTY_SENTINEL = 0xffffffff;
    /** staticIndexA/B pack a Static.PAK index in the low 20 bits; upper bits are flags. */
    public static readonly STATIC_INDEX_MASK = 0xfffff;

    public constructor(
        public readonly floorIndex:   number,
        public readonly staticIndexA: number,
        public readonly reserved08:   number,
        public readonly staticIndexB: number,
        public readonly unknown10:    number,
        public readonly extSentinel:  number,
        public readonly corners:      number,
        public readonly flags:        number
    ) {}

    public static parse(buf: Uint8Array | ArrayBuffer, byteOffset = 0): WldCell {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

        if (u8.byteLength - byteOffset < WldCell.SIZE) {
            throw new RangeError(
                `WldCell.parse: need ${WldCell.SIZE} bytes at offset ${byteOffset}, have ${u8.byteLength - byteOffset}`
            );
        }

        const dv = new DataView(u8.buffer, u8.byteOffset + byteOffset, WldCell.SIZE);

        return new WldCell(
            dv.getUint32(0x00, true),
            dv.getUint32(0x04, true),
            dv.getUint32(0x08, true),
            dv.getUint32(0x0c, true),
            dv.getUint32(0x10, true),
            dv.getUint32(0x14, true),
            dv.getUint32(0x18, true),
            dv.getUint32(0x1c, true)
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

    /** The four `@0x18` bytes, low-to-high (candidate per-corner tile flags). */
    public getCorners(): [number, number, number, number] {
        return [
            this.corners & 0xff,
            (this.corners >>> 8) & 0xff,
            (this.corners >>> 16) & 0xff,
            (this.corners >>> 24) & 0xff
        ];
    }

    /** The nibble-packed tile selector byte (`@0x1F`, the high byte of `flags`). */
    public getFlagsByte(): number {
        return (this.flags >>> 24) & 0xff;
    }

    /** Navigation behavior — low nibble of `@0x1F`. */
    public behavior(): number {
        return this.getFlagsByte() & 0x0f;
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
        return this.getFlagsByte() & 0xf0;
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

    /** True when `extSentinel` is the 0xFFFFFFFF "no extended data" marker. */
    public isEmptySentinel(): boolean {
        return this.extSentinel === WldCell.EMPTY_SENTINEL;
    }

}
