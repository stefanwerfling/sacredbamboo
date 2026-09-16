import {IRandomAccess} from '../Util/IRandomAccess.js';
import {PakEntry, PakHeader, PakHeaderParseError} from './PakHeader.js';

/**
 * Generic reader for the PAK-family containers that follow the layout
 * documented in PakHeader.ts (TEX/SND/MDL/OBJ/TRG — *not* WLD/WLK).
 *
 * An entry is considered valid only when **all three** of type/offset/length
 * are non-zero AND the (offset, offset+length) range lies inside the file.
 * PAKExtractor.pas only does the non-zero check, but on Triggers.PAK that
 * leaves ~225 spurious "entries" whose offsets point hundreds of MB past
 * EOF — those are uninitialised packer memory (0xCC fill, partial writes)
 * that happen to have all three fields non-zero. The EOF bounds check
 * cuts Triggers.PAK down to its single real entry.
 */
export class PakReader {

    private _header:  PakHeader | null = null;
    private _entries: PakEntry[] | null = null;

    public constructor(private readonly _src: IRandomAccess) {}

    /**
     * Reads header + entry table. Cheap relative to the file size — the
     * whole table is at most `entryCount * PakEntry.SIZE` bytes.
     */
    public async open(): Promise<void> {
        if (this._src.size() < PakHeader.SIZE) {
            throw new PakHeaderParseError(
                `file too small: ${this._src.size()} bytes`
            );
        }

        const headerBuf = await this._src.read(0, PakHeader.SIZE);
        this._header    = PakHeader.parse(headerBuf);

        const tableLen = this._header.entryCount * PakEntry.SIZE;
        const tableBuf = await this._src.read(PakHeader.SIZE, tableLen);

        const entries: PakEntry[] = [];
        const fileSize            = this._src.size();

        for (let i = 0; i < this._header.entryCount; i++) {
            const e = PakEntry.parse(tableBuf, i);

            if (!e.isNonZero()) {
                continue;
            }

            if (!e.fitsInFile(fileSize)) {
                continue;
            }

            entries.push(e);
        }

        this._entries = entries;
    }

    public getHeader(): PakHeader {
        if (this._header === null) {
            throw new Error('PakReader: open() not called');
        }

        return this._header;
    }

    /** All non-empty entries from the table, in file order. */
    public getEntries(): PakEntry[] {
        if (this._entries === null) {
            throw new Error('PakReader: open() not called');
        }

        return this._entries;
    }

    /** Raw payload of one entry. No type-specific decoding (zlib, image, etc). */
    public async readEntry(entry: PakEntry): Promise<ArrayBuffer> {
        return this._src.read(entry.offset, entry.length);
    }

}