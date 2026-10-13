import {Inflate} from 'pako';
import {IRandomAccess} from '../Util/IRandomAccess.js';

/**
 * Pako's public TypeScript surface hides two fields that are essential here:
 *   `ended`             - set true once Z_STREAM_END has been observed
 *   `strm.avail_in`     - bytes from the last push() call that weren't consumed
 * Both are stable runtime properties (see pako's `Inflate.prototype` and the
 * `ZStream` it allocates in the constructor). We type-assert to read them.
 */
interface InflateInternal {
    ended: boolean;
    strm:  {avail_in: number};
}

/**
 * "WLD\x05" container — `sectors.wldx`. Verified against the real 63,854,322 B
 * file via `scripts/inspect_wld.ts` (2026-05-21):
 *
 *   @0..0x03   "WLD" + version 5
 *   @0x04      uint32 sectorCount (matches sectors.keyx's count, 6050)
 *   @0x05..0x27  zeros
 *   @0x28      uint32 unknown — observed 2,502,517 on the retail file. Not
 *              the inflated-total nor the compressed-total. Decoding pending.
 *   @0x29..0xff  zeros
 *   @0x100..EOF  6050 concatenated zlib streams (RFC 1950, with the 0x78 0x9c
 *                magic), one per WLK-sector in iteration order. The wldx file
 *                itself carries no offset table, but `sectors.keyx` does:
 *                each sector entry's @0xEC/@0xF0 give this stream's absolute
 *                offset and full-frame length (verified identical to our walk
 *                across all 6050 sectors, 2026-10-14). `open(index)` consumes
 *                that; `open()` with no argument walks the file to rebuild it.
 *
 * Each stream inflates to a "Sector <col>,<row>\0" ASCII header (12 B name +
 * 0xCD MSVC heap-fill, 32 B block in total) followed by binary record data.
 * 94 % of sectors inflate to exactly 131,396 bytes (= 0x20144, matches the
 * WLK `@+0x50` stride). Populated sectors carry an additional variable tail.
 */
export class WldHeader {

    public static readonly SIZE = 0x100;

    public constructor(
        public readonly signature:     string,
        public readonly version:       number,
        public readonly sectorCount:   number,
        public readonly unknownAt0x28: number
    ) {}

    public static parse(buf: ArrayBuffer): WldHeader {
        if (buf.byteLength < WldHeader.SIZE) {
            throw new Error(`WLD header parse: need at least ${WldHeader.SIZE} bytes, got ${buf.byteLength}`);
        }

        const view  = new DataView(buf);
        const bytes = new Uint8Array(buf, 0, 4);
        const sig   = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);

        return new WldHeader(
            sig,
            bytes[3]!,
            view.getUint32(4,    true),
            view.getUint32(0x28, true)
        );
    }

}

/**
 * Reader for `sectors.wldx`. Two-phase use:
 *
 *   1. `await open(index?)` — reads the 256 B header and validates the
 *      signature. With an `index` (from `WlkReader.getWldxSectorIndex()`) it
 *      adopts that (offset,length) table after bounds/contiguity validation —
 *      no file walk. Without one it falls back to walking every zlib stream
 *      from @0x100 to EOF to rebuild the index, inflating each stream once to
 *      discover its length (~1–3 s on the 60 MB retail file). Either way we
 *      keep only the index (~48 KB), not the inflated bytes.
 *   2. `await readSector(i)` — seeks via the index, reads exactly the right
 *      compressed range, inflates, returns the raw `Uint8Array`.
 *
 * The walk fallback reads the whole file into memory (the IRandomAccess is
 * asked for a single `read(0, size)`); 60 MB is acceptable for the editor
 * target. If a much larger WLD is encountered later, this can be redone with
 * a chunked Inflate fed by sliding-window reads.
 */
export class WldReader {

    /** 2-byte zlib (RFC 1950) header + 4-byte Adler-32 trailer = 6 bytes of wrapper around each deflate stream. */
    public static readonly ZLIB_FRAME_OVERHEAD = 6;

    private _header: WldHeader | null  = null;
    private _index:  Uint32Array | null = null;

    public constructor(private readonly _src: IRandomAccess) {}

    /**
     * Two entry points into the same reader:
     *
     *   - `open()` (no argument) walks every zlib stream once to derive the
     *     per-sector (offset, length) index — the self-contained path, used
     *     when only the wldx file is available (~3.5 s on the retail file).
     *   - `open(precomputedIndex)` takes the index straight from the keyx
     *     table (`WlkReader.getWldxSectorIndex()`) and skips the walk entirely.
     *     Verified 2026-10-14 to be byte-for-byte identical to the walked
     *     index for all 6050 retail sectors. The supplied index is validated
     *     against this file (count, per-stream bounds, contiguity, exact EOF
     *     fit); a mismatch throws so a stale/foreign keyx can't desync us.
     */
    public async open(precomputedIndex?: Uint32Array): Promise<void> {
        const fileSize  = this._src.size();
        const headerBuf = await this._src.read(0, WldHeader.SIZE);
        const header    = WldHeader.parse(headerBuf);

        if (header.signature !== 'WLD') {
            throw new Error(`Not a sectors.wldx — signature was "${header.signature}", expected "WLD"`);
        }

        this._header = header;
        this._index  = precomputedIndex === undefined
            ? await this._walkIndex(fileSize, header.sectorCount)
            : this._validateIndex(precomputedIndex, fileSize, header.sectorCount);
    }

    /** Walk every concatenated zlib stream from @0x100 to EOF to derive the index. */
    private async _walkIndex(fileSize: number, sectorCount: number): Promise<Uint32Array> {
        const all   = new Uint8Array(await this._src.read(0, fileSize));
        const index = new Uint32Array(sectorCount * 2);
        let cursor  = WldHeader.SIZE;

        for (let i = 0; i < sectorCount; i++) {
            const start = cursor;

            if (cursor + WldReader.ZLIB_FRAME_OVERHEAD > all.length) {
                throw new Error(`WLD stream ${i} at @0x${start.toString(16)}: only ${all.length - cursor} bytes left, need at least ${WldReader.ZLIB_FRAME_OVERHEAD} for zlib frame`);
            }

            // Use raw-deflate mode (wrap=0) to disable pako's auto-restart
            // on concatenated zlib streams. We manually skip the 2-byte zlib
            // header and account for the 4-byte Adler-32 trailer.
            const inflator = new Inflate({raw: true});
            const internal = inflator as unknown as InflateInternal;
            const rawInput = all.subarray(cursor + 2);

            inflator.push(rawInput);

            if (inflator.err !== 0) {
                throw new Error(`WLD stream ${i} at @0x${start.toString(16)} inflate error: ${inflator.msg ?? inflator.err}`);
            }

            if (!internal.ended) {
                throw new Error(`WLD stream ${i} at @0x${start.toString(16)} did not terminate within remaining ${rawInput.length} bytes`);
            }

            const consumedRaw = rawInput.length - internal.strm.avail_in;
            const consumed    = 2 + consumedRaw + 4;

            if (cursor + consumed > all.length) {
                throw new Error(`WLD stream ${i} at @0x${start.toString(16)}: computed length ${consumed} runs past file end`);
            }

            index[i * 2]     = start;
            index[i * 2 + 1] = consumed;
            cursor          += consumed;
        }

        if (cursor !== fileSize) {
            throw new Error(
                `WLD walker: after ${sectorCount} streams cursor is at 0x${cursor.toString(16)} but file size is 0x${fileSize.toString(16)}`
            );
        }

        return index;
    }

    /**
     * Accept a keyx-sourced `[offset, length, …]` index and make sure it
     * actually describes THIS wldx file before trusting it: right element
     * count, every stream in-bounds, streams contiguous from the 0x100 header
     * with no gaps/overlaps, and the last one ending exactly at EOF.
     */
    private _validateIndex(index: Uint32Array, fileSize: number, sectorCount: number): Uint32Array {
        if (index.length !== sectorCount * 2) {
            throw new Error(`WLD index length ${index.length} does not match 2× sectorCount (${sectorCount})`);
        }

        let cursor = WldHeader.SIZE;

        for (let i = 0; i < sectorCount; i++) {
            const offset = index[i * 2]!;
            const length = index[i * 2 + 1]!;

            if (offset !== cursor) {
                throw new Error(`WLD index: sector ${i} offset 0x${offset.toString(16)} is not contiguous (expected 0x${cursor.toString(16)})`);
            }

            if (length < WldReader.ZLIB_FRAME_OVERHEAD || offset + length > fileSize) {
                throw new Error(`WLD index: sector ${i} range (0x${offset.toString(16)}, ${length}) is out of bounds for a ${fileSize}-byte file`);
            }

            cursor += length;
        }

        if (cursor !== fileSize) {
            throw new Error(`WLD index: streams end at 0x${cursor.toString(16)} but file size is 0x${fileSize.toString(16)}`);
        }

        return index;
    }

    public getHeader(): WldHeader {
        if (this._header === null) {
            throw new Error('WldReader: open() not called');
        }

        return this._header;
    }

    public getSectorCount(): number {
        return this.getHeader().sectorCount;
    }

    /** Compressed (offset, length) for sector i. Useful for diagnostics. */
    public getSectorRange(i: number): {offset: number; length: number} {
        const idx = this._requireIndex();

        if (i < 0 || i >= this.getSectorCount()) {
            throw new RangeError(`WldReader.getSectorRange: sector ${i} out of range (count=${this.getSectorCount()})`);
        }

        return {
            offset: idx[i * 2]!,
            length: idx[i * 2 + 1]!
        };
    }

    public async readSector(i: number): Promise<Uint8Array> {
        const {offset, length} = this.getSectorRange(i);
        const compressed       = new Uint8Array(await this._src.read(offset, length));
        // Skip 2-byte zlib header; the 4-byte Adler-32 trailer is past the
        // deflate stream end and pako stops cleanly before it.
        const inflator         = new Inflate({raw: true});

        inflator.push(compressed.subarray(2), true);

        if (inflator.err !== 0) {
            throw new Error(`WLD readSector(${i}) inflate error: ${inflator.msg ?? inflator.err}`);
        }

        return inflator.result as Uint8Array;
    }

    private _requireIndex(): Uint32Array {
        if (this._index === null) {
            throw new Error('WldReader: open() not called');
        }

        return this._index;
    }

}