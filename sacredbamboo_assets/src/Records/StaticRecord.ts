/**
 * One 64-byte Static.PAK record ("OBJ\x01", type 0x86) — a placed world object
 * (props, buildings, decoration). Referenced from {@link WldCell} via its
 * `staticIndexA` / `staticIndexB` (low 20 bits = the record index into this
 * pool). Only the first ~44 bytes carry data; the tail is zero in live records
 * and 0xCDCDCDCD MSVC heap-fill in never-placed ones.
 *
 * Layout empirically decoded (2026-05-22, retail Sacred Gold Static.PAK), all
 * little-endian:
 *
 *   @0x00  u32  selfIndex   record index (== its own position) — VERIFIED.
 *   @0x04  u32  assetId     object/asset type id (observed 1036..30944, broad
 *                           distinct set) — the mesh/definition this object is.
 *   @0x08  u32  reserved08  0 in all sampled records.
 *   @0x0C  i16  fieldC      small value (1498 / 1806 observed) — likely a
 *                           z/height or object-layer field. TENTATIVE.
 *   @0x0E  i16  worldX      GLOBAL isometric world X — VERIFIED: an affine fit
 *                           of the referencing cell's (row,col) gives
 *                           X ≈ 48*(col-row) + k, RMS ≈ 1 cell, with k tracking
 *                           the sector's world position (global, not
 *                           sector-local; wraps i16 in far sectors).
 *   @0x10  i16  reserved10  constant -2 in samples. TENTATIVE.
 *   @0x12  i16  worldY      GLOBAL isometric world Y — VERIFIED: Y ≈ 25*(col+row)
 *                           + k (the 2:1 iso depth axis; looser RMS, couples with
 *                           elevation).
 *   @0x14..@0x1B           0 in samples.
 *   @0x1C..@0x2B           sparse small flags/type bytes (e.g. @0x28 = 0x01000000
 *                           constant in placed records). Not yet decoded.
 *   @0x2C..@0x3F           0 (live) or 0xCDCDCDCD (never-placed heap-fill).
 */
export class StaticRecord {

    public static readonly SIZE           = 64;
    public static readonly UNINIT_MARK    = 0xcdcdcdcd;

    public constructor(
        public readonly selfIndex:  number,
        public readonly assetId:    number,
        public readonly reserved08: number,
        public readonly fieldC:     number,
        public readonly worldX:     number,
        public readonly reserved10: number,
        public readonly worldY:     number
    ) {}

    public static parse(buf: Uint8Array | ArrayBuffer, byteOffset = 0): StaticRecord {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

        if (u8.byteLength - byteOffset < StaticRecord.SIZE) {
            throw new RangeError(
                `StaticRecord.parse: need ${StaticRecord.SIZE} bytes at offset ${byteOffset}, have ${u8.byteLength - byteOffset}`
            );
        }

        const dv = new DataView(u8.buffer, u8.byteOffset + byteOffset, StaticRecord.SIZE);

        return new StaticRecord(
            dv.getUint32(0x00, true),
            dv.getUint32(0x04, true),
            dv.getUint32(0x08, true),
            dv.getInt16(0x0c, true),
            dv.getInt16(0x0e, true),
            dv.getInt16(0x10, true),
            dv.getInt16(0x12, true)
        );
    }

    /** The verified isometric world position `[worldX, worldY]`. */
    public position(): [number, number] {
        return [this.worldX, this.worldY];
    }

    /**
     * True when the record looks like never-placed heap-fill (tail = 0xCDCDCDCD).
     * Needs the full 64-byte buffer; call with the same buffer/offset as parse.
     */
    public static isUninitialized(buf: Uint8Array | ArrayBuffer, byteOffset = 0): boolean {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

        if (u8.byteLength - byteOffset < StaticRecord.SIZE) {
            return false;
        }

        const dv = new DataView(u8.buffer, u8.byteOffset + byteOffset, StaticRecord.SIZE);

        return dv.getUint32(0x30, true) === StaticRecord.UNINIT_MARK;
    }

}
