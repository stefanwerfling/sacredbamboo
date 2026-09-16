/**
 * Typed view over one 768-byte sector entry in `sectors.keyx` ("WLK\x05").
 *
 * The vast majority of the 768 bytes is still undecoded. What this class
 * commits to are the two columns verified on 2026-05-21 across all 6050
 * sectors (see `scripts/verify_wlk_obj_xref.ts`):
 *
 *   uint32 gridIndex   @+0x20   `row * gridWidth + col` — this sector's
 *                                position in the WLK header's grid (100×100).
 *                                Every value < gridWidth*gridHeight, all
 *                                6050 values distinct. Sectors are iterated
 *                                column-major (col ASC, then row ASC) and
 *                                only ~60.5% of grid cells are populated.
 *   uint32 ordinal     @+0x24   1-based ordinal in `1..sectorCount`. Exact
 *                                permutation of that range. Not the same
 *                                as the iteration index — sector 0 has
 *                                ordinal 915. Probably a key into another
 *                                file (WLD?) or an alternate ordering.
 *
 * The original hypothesis that these were first-record-indices into
 * Floor.PAK / Static.PAK was falsified by the same script (max values 9999
 * and 6050 are far too small for Floor's 6.7 M records or Static's 1 M).
 *
 * `gridWidth` is needed to split `gridIndex` into (row, col); we keep it
 * out of the parsed object so this class stays a pure bytes-to-fields view
 * matching `FloorRecord.parse(buf)`. Callers obtain it from `WlkHeader`.
 */
export class WlkSector {

    public static readonly SIZE              = 0x300;
    public static readonly GRID_INDEX_OFFSET = 0x20;
    public static readonly ORDINAL_OFFSET    = 0x24;

    public constructor(
        public readonly gridIndex: number,
        public readonly ordinal:   number
    ) {}

    public static parse(buf: ArrayBuffer, byteOffset = 0): WlkSector {
        if (buf.byteLength - byteOffset < WlkSector.SIZE) {
            throw new RangeError(
                `WlkSector.parse: need at least ${WlkSector.SIZE} bytes from offset ${byteOffset}, got ${buf.byteLength - byteOffset}`
            );
        }

        const v = new DataView(buf, byteOffset, WlkSector.SIZE);

        return new WlkSector(
            v.getUint32(WlkSector.GRID_INDEX_OFFSET, true),
            v.getUint32(WlkSector.ORDINAL_OFFSET,    true)
        );
    }

    /** Decompose `gridIndex` into (row, col) using the WLK header's gridWidth. */
    public row(gridWidth: number): number {
        return Math.floor(this.gridIndex / gridWidth);
    }

    public col(gridWidth: number): number {
        return this.gridIndex % gridWidth;
    }

}