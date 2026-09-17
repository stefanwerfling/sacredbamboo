import {Inflate}       from 'pako';
import {IRandomAccess} from '../Util/IRandomAccess.js';
import {PakHeader}     from '../Pak/PakHeader.js';
import {TexImage}      from '../Records/TexImage.js';

export interface TexImageInfo {
    name:   string;
    width:  number;
    height: number;
    typeId: number; // repeat_type_id: 4 = ARGB4444 (zlib), 6 = raw 32bpp
}

/**
 * Reader for a Sacred "TEX" PAK (`texture.pak`, `texture03.pak`). After the
 * 256-byte PAK header + `entryCount`×12-byte entry table `{typeId, offset,
 * compressedSize}`, each entry's data at `offset` is an 80-byte image header
 * followed by the pixel payload:
 *
 *   image header (80B): char name[32], u16 width, u16 height, u8 repeat_type_id,
 *                       u32 repeat_compr_size, u8 pad[39].
 *   type 4 → zlib-compressed ARGB4444 (width*height*2 after inflate).
 *   type 6 → raw 32bpp (width*height*4).
 *
 * Lazy: only the header + entry table are read on `open()`; image bytes are
 * pulled per `readImage(i)`. Byte layout confirmed against
 * `work/sacred_tex_extractor/`.
 */
export class TexReader {

    public static readonly IMG_HEADER_SIZE = 80;

    private _header:  PakHeader | null    = null;
    private _entries: DataView | null     = null; // the raw 12B-row table
    private _offsetsSorted: number[]      = [];   // ascending entry data offsets

    public constructor(private readonly _src: IRandomAccess) {}

    public async open(): Promise<void> {
        if (this._src.size() < PakHeader.SIZE) {
            throw new Error('TexReader: file too small');
        }

        this._header = PakHeader.parse(await this._src.read(0, PakHeader.SIZE));

        if (this._header.signature !== 'TEX') {
            throw new Error(`TexReader: expected "TEX" signature, got "${this._header.signature}"`);
        }

        const tbl = await this._src.read(PakHeader.SIZE, this._header.entryCount * 12);

        this._entries = new DataView(tbl);

        // The compressed length is NOT reliably stored (repeat_compr_size holds the
        // *uncompressed* size for MIX atlases), so bound each image's payload by the
        // next entry's offset. inflate() stops at the zlib stream end anyway.
        const offs: number[] = [];

        for (let i = 0; i < this._header.entryCount; i++) {
            offs.push(this._entries.getUint32(i * 12 + 4, true));
        }

        offs.sort((a, b) => a - b);
        this._offsetsSorted = offs;
    }

    /** End of image `index`'s payload region: the next entry's offset, or EOF. */
    private _dataEnd(off: number): number {
        const arr = this._offsetsSorted;

        for (let i = 0; i < arr.length; i++) {
            if (arr[i]! > off) {
                return arr[i]!;
            }
        }

        return this._src.size();
    }

    public getImageCount(): number {
        return this._req().entryCount;
    }

    public getHeader(): PakHeader {
        return this._req();
    }

    /** Image metadata (name/dims/type) without decoding the pixels. */
    public async getImageInfo(index: number): Promise<TexImageInfo> {
        const off = this._entryOffset(index);
        const hb  = new Uint8Array(await this._src.read(off, TexReader.IMG_HEADER_SIZE));

        return TexReader._parseImageHeader(hb);
    }

    /** Decode image `index` to RGBA. */
    public async readImage(index: number): Promise<TexImage> {
        const off  = this._entryOffset(index);
        const hb   = new Uint8Array(await this._src.read(off, TexReader.IMG_HEADER_SIZE));
        const info = TexReader._parseImageHeader(hb);
        const dataOff = off + TexReader.IMG_HEADER_SIZE;

        if (info.typeId === 6) {
            const raw = new Uint8Array(await this._src.read(dataOff, info.width * info.height * 4));

            return TexImage.from32bpp(info.name, info.width, info.height, raw);
        }

        // type 4 (and anything else zlib-compressed) → inflate then treat as ARGB4444.
        const zbuf = new Uint8Array(await this._src.read(dataOff, this._dataEnd(off) - dataOff));
        // Inflate stops at the zlib stream end and ignores trailing bytes from the next entry.
        const inflator = new Inflate();

        inflator.push(zbuf, true);

        if (inflator.err) {
            throw new Error(`TexReader: inflate failed for image ${index} ("${info.name}"): ${inflator.msg}`);
        }

        const raw = inflator.result as Uint8Array;

        return TexImage.fromArgb4444(info.name, info.width, info.height, raw);
    }

    private static _parseImageHeader(hb: Uint8Array): TexImageInfo {
        let end = 0;

        while (end < 32 && hb[end] !== 0) {
            end++;
        }

        const dv = new DataView(hb.buffer, hb.byteOffset, hb.byteLength);

        return {
            name:   String.fromCharCode(...hb.subarray(0, end)),
            width:  dv.getUint16(32, true),
            height: dv.getUint16(34, true),
            typeId: hb[36]!
        };
    }

    private _entryOffset(index: number): number {
        const dv = this._reqEntries(index);

        return dv.getUint32(index * 12 + 4, true);
    }

    private _reqEntries(index: number): DataView {
        if (!this._entries) {
            throw new Error('TexReader: open() not called');
        }

        if (index < 0 || index >= this.getImageCount()) {
            throw new RangeError(`TexReader: image index ${index} out of range 0..${this.getImageCount() - 1}`);
        }

        return this._entries;
    }

    private _req(): PakHeader {
        if (!this._header) {
            throw new Error('TexReader: open() not called');
        }

        return this._header;
    }

}
