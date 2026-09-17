import {IRandomAccess} from '../Util/IRandomAccess.js';
import {PakHeader}     from '../Pak/PakHeader.js';
import {MixDef}        from '../Records/MixDef.js';

/**
 * Reader for `mixed.pak` — the "MIX" static-object sprite catalogue (signature
 * "MIX", version 0). 256-byte PAK header + `entryCount`×12-byte entry table
 * `{type, offset, size}` + variable-length {@link MixDef} records.
 *
 * `StaticRecord.assetId` → `getDef(assetId)` → a `MixDef` whose frames point at
 * texture.pak atlas sub-rects (decode with `TexReader`).
 */
export class MixedReader {

    private _header:  PakHeader | null = null;
    private _entries: DataView | null  = null;

    public constructor(private readonly _src: IRandomAccess) {}

    public async open(): Promise<void> {
        if (this._src.size() < PakHeader.SIZE) {
            throw new Error('MixedReader: file too small');
        }

        this._header = PakHeader.parse(await this._src.read(0, PakHeader.SIZE));

        if (this._header.signature !== 'MIX') {
            throw new Error(`MixedReader: expected "MIX" signature, got "${this._header.signature}"`);
        }

        this._entries = new DataView(await this._src.read(PakHeader.SIZE, this._header.entryCount * 12));
    }

    public getDefCount(): number {
        return this._req().entryCount;
    }

    public getHeader(): PakHeader {
        return this._req();
    }

    /** Parse the object definition at `index` (a `StaticRecord.assetId`). */
    public async getDef(index: number): Promise<MixDef> {
        const dv = this._reqEntries(index);
        const off  = dv.getUint32(index * 12 + 4, true);
        const size = dv.getUint32(index * 12 + 8, true);

        return MixDef.parse(await this._src.read(off, size));
    }

    private _reqEntries(index: number): DataView {
        if (!this._entries) {
            throw new Error('MixedReader: open() not called');
        }

        if (index < 0 || index >= this.getDefCount()) {
            throw new RangeError(`MixedReader: def index ${index} out of range 0..${this.getDefCount() - 1}`);
        }

        return this._entries;
    }

    private _req(): PakHeader {
        if (!this._header) {
            throw new Error('MixedReader: open() not called');
        }

        return this._header;
    }

}
