/**
 * One record of `Floor.PAK` ("OBJ\x01", type 0x87, 16 bytes per record).
 *
 * Layout discovered empirically over all 6,713,136 records:
 *
 *   uint32 selfIndex   == record index (self-referential redundancy)
 *   uint32 assetId      packed tile reference (decoded 2026-09-17):
 *                         bits 0-16  = tile index into tiles.pak (< entryCount
 *                                      90132; VERIFIED, 2138/2138 samples).
 *                         bits 17-27 = flags (orientation / blend / variant;
 *                                      bits 28-31 never set; flag 0 dominant).
 *                       Resolve: tiles.pak[tileIndex()].textureIndex →
 *                       texture.pak image. See IsoTilesReader / TexReader.
 *   uint32 reserved    Always 0 in initialised records. A handful of records
 *                       carry 0xCDCDCDCD (MSVC's uninitialised-heap marker)
 *                       which is the original packer leaking debug fill —
 *                       semantically equivalent to "no value".
 *   uint32 nextIndex   Index of the next record in this floor stack, or 0
 *                       if this is the last. The graph is a forest of
 *                       singly-linked chains: every nextIndex > selfIndex
 *                       (strictly forward), every record has at most one
 *                       inbound link, no cycles, no out-of-range. 1,426,900
 *                       records are chain heads (no inbound, nextIndex≠0)
 *                       and 3,189,241 are length-1 solo records.
 *
 * The chain semantics aren't yet pinned to a coordinate — that probably
 * lives in `sectors.keyx`/`sectors.wldx`. For now we just expose the
 * decoded fields; the editor can already walk the chains for visual debug.
 */
export class FloorRecord {

    public static readonly SIZE            = 16;
    public static readonly UNINIT_MARK     = 0xCDCDCDCD;
    /** `assetId` low 17 bits = tiles.pak tile index; upper bits = flags. */
    public static readonly TILE_INDEX_MASK = 0x1FFFF;

    public constructor(
        public readonly selfIndex: number,
        public readonly assetId:   number,
        public readonly reserved:  number,
        public readonly nextIndex: number
    ) {}

    public static parse(buf: ArrayBuffer, byteOffset = 0): FloorRecord {
        const v = new DataView(buf, byteOffset, FloorRecord.SIZE);

        return new FloorRecord(
            v.getUint32(0,  true),
            v.getUint32(4,  true),
            v.getUint32(8,  true),
            v.getUint32(12, true)
        );
    }

    /** True when `reserved` carries MSVC's 0xCDCDCDCD heap-padding marker. */
    public isReservedUninit(): boolean {
        return this.reserved === FloorRecord.UNINIT_MARK;
    }

    public isChainTerminator(): boolean {
        return this.nextIndex === 0;
    }

    /** tiles.pak tile index this cell's floor uses (`assetId` low 17 bits). */
    public tileIndex(): number {
        return this.assetId & FloorRecord.TILE_INDEX_MASK;
    }

    /** Orientation/variant flag bits packed above the tile index (bits 17-27). */
    public tileFlags(): number {
        return this.assetId >>> 17;
    }

}