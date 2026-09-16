import {IRandomAccess} from '../Util/IRandomAccess.js';
import {PakHeader}     from '../Pak/PakHeader.js';
import {IsoTile}       from '../Records/IsoTile.js';

/**
 * Reader for `tiles.pak` — the "ISO" tile-definition container (signature
 * "ISO", version 3). After the 256-byte PAK header + `entryCount`×12-byte entry
 * table come `entryCount` contiguous 64-byte {@link IsoTile} records (each entry
 * points at its record; the records tile end-to-end and fill the file exactly).
 *
 * Resolves a floor cell's tile: `FloorRecord.assetId & 0x1FFFF` = tile index →
 * `getTile(index)` → `.textureIndex` into texture.pak.
 */
export class IsoTilesReader {

    private _header:  PakHeader | null = null;
    private _dataOff  = 0;
    private _recSize  = IsoTile.SIZE;

    public constructor(private readonly _src: IRandomAccess) {}

    public async open(): Promise<void> {
        if (this._src.size() < PakHeader.SIZE + 12) {
            throw new Error('IsoTilesReader: file too small');
        }

        this._header = PakHeader.parse(await this._src.read(0, PakHeader.SIZE));

        if (this._header.signature !== 'ISO') {
            throw new Error(`IsoTilesReader: expected "ISO" signature, got "${this._header.signature}"`);
        }

        // First entry gives the data start + record stride (records are contiguous).
        const e0 = new DataView(await this._src.read(PakHeader.SIZE, 12));

        this._dataOff = e0.getUint32(4, true);
        this._recSize = e0.getUint32(8, true) || IsoTile.SIZE;
    }

    public getTileCount(): number {
        return this._req().entryCount;
    }

    public getHeader(): PakHeader {
        return this._req();
    }

    public async getTile(index: number): Promise<IsoTile> {
        const count = this.getTileCount();

        if (index < 0 || index >= count) {
            throw new RangeError(`IsoTilesReader.getTile: index ${index} out of range 0..${count - 1}`);
        }

        return IsoTile.parse(await this._src.read(this._dataOff + index * this._recSize, IsoTile.SIZE));
    }

    private _req(): PakHeader {
        if (!this._header) {
            throw new Error('IsoTilesReader: open() not called');
        }

        return this._header;
    }

}
