import {IRandomAccess} from '../Util/IRandomAccess.js';
import {PakHeader} from '../Pak/PakHeader.js';
import {PakReader} from '../Pak/PakReader.js';

/**
 * Triggers.PAK ("TRG\x01") — small (~36 KB) container of trigger records.
 *
 * Today this is a thin specialisation over PakReader so the editor can name
 * what it's looking at; once the inner record layout is reversed it'll grow
 * a `decodeTrigger(entry)` method.
 */
export class TrgReader {

    private readonly _pak: PakReader;

    public constructor(src: IRandomAccess) {
        this._pak = new PakReader(src);
    }

    public async open(): Promise<void> {
        await this._pak.open();
        const h = this._pak.getHeader();

        if (h.signature !== 'TRG') {
            throw new Error(
                `Not a Triggers.PAK — signature was "${h.signature}", expected "TRG"`
            );
        }
    }

    public getHeader(): PakHeader {
        return this._pak.getHeader();
    }

    public getEntries() {
        return this._pak.getEntries();
    }

    public async readEntry(index: number): Promise<ArrayBuffer> {
        const e = this._pak.getEntries()[index];

        if (!e) {
            throw new RangeError(`TrgReader: no entry at index ${index}`);
        }

        return this._pak.readEntry(e);
    }

}