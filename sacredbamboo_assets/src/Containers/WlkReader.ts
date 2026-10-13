import {IRandomAccess} from '../Util/IRandomAccess.js';
import {WlkSector}     from '../Records/WlkSector.js';

/**
 * "WLK\x05" container — `sectors.keyx`. Verified against the real 4.6 MB
 * file from Sacred Gold:
 *
 *   File size              4,646,656 bytes (0x46E700)
 *   Header                       256 bytes (0x100)
 *   Sector entries        6050 × 768 bytes = 4,646,400 bytes
 *   Total                256 + 4,646,400 = 4,646,656 ✓
 *
 * Header layout (little-endian throughout):
 *   @0   char[3]   signature ("WLK")
 *   @3   uint8     version (5)
 *   @4   uint32    sectorCount (= 6050)
 *   @8   uint32    gridWidth   (= 100)
 *   @12  uint32    gridHeight  (= 100)
 *   @16  int32     worldOriginA (= -18432)         see notes below
 *   @20  int32     worldOriginB (= 112152)
 *   @24..@FF      reserved / zero
 *
 * The two signed fields at @16/@20 sit in a region of the header that's
 * otherwise zero and span the full i32 range, which is consistent with
 * world-space bounding-box coordinates — Sacred's world is huge and
 * uses signed coordinates. We expose them by name but stop short of
 * claiming X/Y vs A/B until they're cross-referenced against the Floor
 * record positions.
 *
 * Sector entry layout (768 bytes): largely sparse — only ~30-50 of the
 * 192 u32 fields are non-zero in any given sector. Three observed
 * column-wise patterns, every value below verified across all 6050
 * sectors:
 *   @+0x20  uint32  every sector has a unique increasing value (1500,
 *                   2400, 2800, …) — looks like a "first record" index
 *                   into Static.PAK.
 *   @+0x24  uint32  every sector has a unique increasing value (915,
 *                   1498, 1731, …) — note that 915=0x0393 also appears
 *                   as the constant low-i16 of u32@12 in Static.PAK
 *                   records, strengthening the cross-reference theory.
 *   @+0x54  uint32  constant 0x20 (=32) across all sampled sectors.
 *   @+0x58  uint32  constant 0x01 across all sampled sectors.
 *   @+0x50  uint32  monotonically increases with stride 0x20144 (131,396).
 *   @+0x5C  uint32  same stride, offset by +0x20 from @+0x50.
 *
 * Until the full per-sector layout is reversed we expose the raw 768-byte
 * blob via readSector(i) and let the editor's inspector show it; named
 * accessors are limited to what's verified.
 */
export class WlkHeader {

    public static readonly SIZE = 0x100;

    public constructor(
        public readonly signature:    string,
        public readonly version:      number,
        public readonly sectorCount:  number,
        public readonly gridWidth:    number,
        public readonly gridHeight:   number,
        public readonly worldOriginA: number,
        public readonly worldOriginB: number
    ) {}

    public static parse(buf: ArrayBuffer): WlkHeader {
        if (buf.byteLength < WlkHeader.SIZE) {
            throw new Error(`WLK header parse: need at least ${WlkHeader.SIZE} bytes, got ${buf.byteLength}`);
        }

        const view  = new DataView(buf);
        const bytes = new Uint8Array(buf, 0, 4);
        const sig   = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);

        return new WlkHeader(
            sig,
            bytes[3]!,
            view.getUint32(4,  true),
            view.getUint32(8,  true),
            view.getUint32(12, true),
            view.getInt32(16,  true),
            view.getInt32(20,  true)
        );
    }

}

export class WlkReader {

    public static readonly SECTOR_SIZE = 0x300;

    private _header: WlkHeader | null = null;

    public constructor(private readonly _src: IRandomAccess) {}

    public async open(): Promise<void> {
        const headerBuf = await this._src.read(0, WlkHeader.SIZE);
        const header    = WlkHeader.parse(headerBuf);

        if (header.signature !== 'WLK') {
            throw new Error(`Not a sectors.keyx — signature was "${header.signature}", expected "WLK"`);
        }

        const expectedSize = WlkHeader.SIZE + header.sectorCount * WlkReader.SECTOR_SIZE;

        if (expectedSize !== this._src.size()) {
            throw new Error(
                `WLK file size mismatch: header says ${header.sectorCount} sectors → expected ${expectedSize} bytes, got ${this._src.size()}`
            );
        }

        this._header = header;
    }

    public getHeader(): WlkHeader {
        if (this._header === null) {
            throw new Error('WlkReader: open() not called');
        }

        return this._header;
    }

    public getSectorCount(): number {
        return this.getHeader().sectorCount;
    }

    public async readSector(index: number): Promise<ArrayBuffer> {
        const h = this.getHeader();

        if (index < 0 || index >= h.sectorCount) {
            throw new RangeError(`WlkReader: sector index ${index} out of range (count=${h.sectorCount})`);
        }

        return this._src.read(WlkHeader.SIZE + index * WlkReader.SECTOR_SIZE, WlkReader.SECTOR_SIZE);
    }

    /**
     * Read the entire sector-array region as one buffer. Callers parse each
     * 768-byte sub-slice themselves (e.g. `WlkSector.parse(buf, i * SECTOR_SIZE)`).
     * Lets a UI pre-build sector indices without 6050 separate slice round-trips.
     */
    public async readAllSectorsBlob(): Promise<ArrayBuffer> {
        const h = this.getHeader();

        return this._src.read(WlkHeader.SIZE, h.sectorCount * WlkReader.SECTOR_SIZE);
    }

    /**
     * Build the `sectors.wldx` per-sector index straight from the keyx table.
     * Returns an interleaved `Uint32Array` of `[offset0, length0, offset1, …]`,
     * i.e. the exact shape `WldReader.open(index)` consumes.
     *
     * Verified 2026-10-14 (`scripts/verify_keyx_wldx_xref.ts`) to match, for all
     * 6050 retail sectors, the index `WldReader` otherwise derives by walking
     * every zlib stream — so passing this in lets `WldReader.open()` skip that
     * ~3.5 s walk. `@+0xEC` = absolute compressed offset in wldx, `@+0xF0` =
     * full zlib-frame length. Sectors are stored in keyx iteration order, the
     * same order `WldReader` indexes by.
     */
    public async getWldxSectorIndex(): Promise<Uint32Array> {
        const h     = this.getHeader();
        const blob  = await this.readAllSectorsBlob();
        const view  = new DataView(blob);
        const index = new Uint32Array(h.sectorCount * 2);

        for (let i = 0; i < h.sectorCount; i++) {
            const base = i * WlkReader.SECTOR_SIZE;

            index[i * 2]     = view.getUint32(base + WlkSector.COMPRESSED_OFFSET_OFFSET, true);
            index[i * 2 + 1] = view.getUint32(base + WlkSector.COMPRESSED_SIZE_OFFSET,   true);
        }

        return index;
    }

}