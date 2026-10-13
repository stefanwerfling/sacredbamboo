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
 *                                permutation of that range. Not the iteration
 *                                index — sector 0 has ordinal 915. CONFIRMED
 *                                2026-10-14 as the sector's world-archive id:
 *                                `neighbors` reference other sectors by this
 *                                value (all adjacent), so it is the sector
 *                                adjacency/linking key.
 *
 * The original hypothesis that these were first-record-indices into
 * Floor.PAK / Static.PAK was falsified (max values 9999 and 6050 are far too
 * small for Floor's 6.7 M records or Static's 1 M).
 *
 * `gridWidth` is needed to split `gridIndex` into (row, col); we keep it
 * out of the parsed object so this class stays a pure bytes-to-fields view
 * matching `FloorRecord.parse(buf)`. Callers obtain it from `WlkHeader`.
 */
/** Compass directions of the 8 neighbor slots, clockwise from NW. */
export type WlkNeighborDirection = 'NW' | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W';

export interface WlkSectorFields {
    compressedOffset:    number;
    compressedSize:      number;
    tilesRelativeOffset: number;
    tilesSize:           number;
    serverRevisionId:    number;
    neighbors:           readonly number[];
    rawX:                number;
    rawY:                number;
    rawEndX:             number;
    rawEndY:             number;
    environmentFlags:    number;
    natureType:          number;
    liquidStyleA:        number;
    liquidStyleB:        number;
}

export class WlkSector {

    public static readonly SIZE              = 0x300;
    public static readonly GRID_INDEX_OFFSET = 0x20;
    public static readonly ORDINAL_OFFSET    = 0x24;

    /**
     * Pointers into `sectors.wldx`, verified 2026-10-14 across all 6050
     * sectors (see `scripts/verify_keyx_wldx_xref.ts`) — keyx IS the wldx
     * offset table, so `WldReader` no longer has to walk the file.
     *
     *   compressedOffset   @+0xEC  absolute byte offset of this sector's zlib
     *                              stream in sectors.wldx (sector 0 = 0x100).
     *   compressedSize     @+0xF0  full zlib-frame length (2B header + deflate
     *                              + 4B Adler-32).
     *   tilesRelativeOffset@+0xD4  tile-table start within the *decompressed*
     *                              body — constant 0x20 (right after the 32-byte
     *                              name block).
     *   tilesSize          @+0xD8  tile-table byte size — 131072 = 4096 cells
     *                              × 32 B (the 64×64 outdoor grid).
     */
    public static readonly COMPRESSED_OFFSET_OFFSET = 0xEC;
    public static readonly COMPRESSED_SIZE_OFFSET   = 0xF0;
    public static readonly TILES_OFFSET_OFFSET      = 0xD4;
    public static readonly TILES_SIZE_OFFSET        = 0xD8;

    /**
     * Fields decoded + verified 2026-10-14 over all 6050 retail sectors
     * (`scripts/inspect_keyx_fields.ts`), offsets hinted by [[reference-
     * sacredengineremake]]'s `KeyxSectorRecord` and confirmed empirically here:
     *
     *   neighbors  @+0x2C  uint16[8] — adjacent sector `ordinal`s (the @0x24 id
     *                      space), 0 = no neighbor. VERIFIED: all 39 618 non-zero
     *                      refs are valid ids AND spatially adjacent (|Δrow|≤1,
     *                      |Δcol|≤1). Slot order (compass direction) not pinned.
     *   rawX/rawY  @+0x3C/0x40  int32 world-space origin of the sector =
     *                      col/row × 3434.596 (6050/6050 fit within ±2).
     *   rawEndX/Y  @+0x44/0x48  int32 opposite corner = raw + 3434 (sector extent).
     *
     * Present but semantics only partially understood — exposed as raw values,
     * no bit/enum meaning claimed:
     *   serverRevisionId @+0x28 (u32; 0 across retail)
     *   environmentFlags @+0x1CC (u32 bitfield; 23 distinct values)
     *   natureType       @+0x1D8 (u8 enum; 12 distinct, high-nibble values)
     *   liquidStyleA/B   @+0x2E0/0x2E1 (u8; mostly 0)
     */
    public static readonly SERVER_REVISION_OFFSET = 0x28;
    public static readonly NEIGHBORS_OFFSET       = 0x2C;
    public static readonly NEIGHBOR_COUNT         = 8;
    public static readonly RAW_X_OFFSET           = 0x3C;
    public static readonly RAW_Y_OFFSET           = 0x40;
    public static readonly RAW_END_X_OFFSET       = 0x44;
    public static readonly RAW_END_Y_OFFSET       = 0x48;
    public static readonly ENV_FLAGS_OFFSET       = 0x1CC;
    public static readonly NATURE_TYPE_OFFSET     = 0x1D8;
    public static readonly LIQUID_A_OFFSET        = 0x2E0;
    public static readonly LIQUID_B_OFFSET        = 0x2E1;

    /** Approximate world units per grid step, derived from the authored RawX/RawY (340025 / 99). */
    public static readonly WORLD_STRIDE = 340025 / 99;

    public readonly compressedOffset:    number;
    public readonly compressedSize:      number;
    public readonly tilesRelativeOffset: number;
    public readonly tilesSize:           number;
    public readonly serverRevisionId:    number;
    public readonly neighbors:           readonly number[];
    public readonly rawX:                number;
    public readonly rawY:                number;
    public readonly rawEndX:             number;
    public readonly rawEndY:             number;
    public readonly environmentFlags:    number;
    public readonly natureType:          number;
    public readonly liquidStyleA:        number;
    public readonly liquidStyleB:        number;

    public constructor(
        public readonly gridIndex: number,
        public readonly ordinal:   number,
        fields?: Partial<WlkSectorFields>
    ) {
        this.compressedOffset    = fields?.compressedOffset    ?? 0;
        this.compressedSize      = fields?.compressedSize      ?? 0;
        this.tilesRelativeOffset = fields?.tilesRelativeOffset ?? 0;
        this.tilesSize           = fields?.tilesSize           ?? 0;
        this.serverRevisionId    = fields?.serverRevisionId    ?? 0;
        this.neighbors           = fields?.neighbors           ?? [];
        this.rawX                = fields?.rawX                ?? 0;
        this.rawY                = fields?.rawY                ?? 0;
        this.rawEndX             = fields?.rawEndX             ?? 0;
        this.rawEndY             = fields?.rawEndY             ?? 0;
        this.environmentFlags    = fields?.environmentFlags    ?? 0;
        this.natureType          = fields?.natureType          ?? 0;
        this.liquidStyleA        = fields?.liquidStyleA        ?? 0;
        this.liquidStyleB        = fields?.liquidStyleB        ?? 0;
    }

    public static parse(buf: ArrayBuffer, byteOffset = 0): WlkSector {
        if (buf.byteLength - byteOffset < WlkSector.SIZE) {
            throw new RangeError(
                `WlkSector.parse: need at least ${WlkSector.SIZE} bytes from offset ${byteOffset}, got ${buf.byteLength - byteOffset}`
            );
        }

        const v         = new DataView(buf, byteOffset, WlkSector.SIZE);
        const neighbors = new Array<number>(WlkSector.NEIGHBOR_COUNT);

        for (let i = 0; i < WlkSector.NEIGHBOR_COUNT; i++) {
            neighbors[i] = v.getUint16(WlkSector.NEIGHBORS_OFFSET + i * 2, true);
        }

        return new WlkSector(
            v.getUint32(WlkSector.GRID_INDEX_OFFSET, true),
            v.getUint32(WlkSector.ORDINAL_OFFSET,    true),
            {
                compressedOffset:    v.getUint32(WlkSector.COMPRESSED_OFFSET_OFFSET, true),
                compressedSize:      v.getUint32(WlkSector.COMPRESSED_SIZE_OFFSET,   true),
                tilesRelativeOffset: v.getUint32(WlkSector.TILES_OFFSET_OFFSET,      true),
                tilesSize:           v.getUint32(WlkSector.TILES_SIZE_OFFSET,        true),
                serverRevisionId:    v.getUint32(WlkSector.SERVER_REVISION_OFFSET,  true),
                neighbors,
                rawX:                v.getInt32(WlkSector.RAW_X_OFFSET,     true),
                rawY:                v.getInt32(WlkSector.RAW_Y_OFFSET,     true),
                rawEndX:             v.getInt32(WlkSector.RAW_END_X_OFFSET, true),
                rawEndY:             v.getInt32(WlkSector.RAW_END_Y_OFFSET, true),
                environmentFlags:    v.getUint32(WlkSector.ENV_FLAGS_OFFSET, true),
                natureType:          v.getUint8(WlkSector.NATURE_TYPE_OFFSET),
                liquidStyleA:        v.getUint8(WlkSector.LIQUID_A_OFFSET),
                liquidStyleB:        v.getUint8(WlkSector.LIQUID_B_OFFSET)
            }
        );
    }

    /**
     * Compass direction of each of the 8 `neighbors` slots, pinned 2026-10-14
     * via `scripts/decode_neighbor_slots.ts` — every slot maps to exactly one
     * (dRow,dCol) with 100% consistency across all sectors. Clockwise from NW.
     */
    public static readonly NEIGHBOR_DIRECTIONS: readonly WlkNeighborDirection[] =
        ['NW', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W'];

    /** Grid (dRow, dCol) step for each slot, same index order as NEIGHBOR_DIRECTIONS. */
    public static readonly NEIGHBOR_DELTAS: readonly [number, number][] =
        [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];

    /** Non-zero neighbor ordinals only (drops the 0 = "no neighbor" slots). */
    public neighborOrdinals(): number[] {
        return this.neighbors.filter((n) => n !== 0);
    }

    /** Present neighbors paired with their compass direction (skips empty slots). */
    public neighborsByDirection(): {direction: WlkNeighborDirection; ordinal: number}[] {
        const out: {direction: WlkNeighborDirection; ordinal: number}[] = [];

        for (let k = 0; k < WlkSector.NEIGHBOR_COUNT; k++) {
            const ordinal = this.neighbors[k]!;

            if (ordinal !== 0) {
                out.push({direction: WlkSector.NEIGHBOR_DIRECTIONS[k]!, ordinal});
            }
        }

        return out;
    }

    /** The neighbor ordinal in a given compass direction, or 0 if none / edge. */
    public neighborInDirection(direction: WlkNeighborDirection): number {
        return this.neighbors[WlkSector.NEIGHBOR_DIRECTIONS.indexOf(direction)] ?? 0;
    }

    /** Decompose `gridIndex` into (row, col) using the WLK header's gridWidth. */
    public row(gridWidth: number): number {
        return Math.floor(this.gridIndex / gridWidth);
    }

    public col(gridWidth: number): number {
        return this.gridIndex % gridWidth;
    }

}