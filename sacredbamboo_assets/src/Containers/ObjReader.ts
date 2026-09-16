import {IRandomAccess} from '../Util/IRandomAccess.js';
import {PakEntry, PakHeader} from '../Pak/PakHeader.js';

/**
 * "OBJ\x01" container. Used by Floor.PAK (~188 MB, 6.7 M tile records of
 * 16 bytes each) and Static.PAK (~79 MB, 1 M static-object records of
 * 64 bytes each).
 *
 * Verified on disk: in both files every entry has the same `type` and
 * `length`, the entry table is fully populated (no 0xCC garbage gaps), and
 * the payload starts immediately after the table. So an OBJ container is
 * effectively a uniformly-strided array of records.
 *
 * Performance note: a naive "read the whole entry table" approach would
 * pull 80 MB off disk and allocate 6.7 M PakEntry JS objects just for
 * Floor.PAK. We instead read the header + the first and last entry only,
 * verify the table is uniform from those two anchors, and then synthesise
 * any record's offset as `firstOffset + index * stride`. If the anchors
 * disagree we throw — non-uniform OBJ files haven't been observed yet, and
 * loading the full table for an 80 MB index would dominate the editor's
 * startup cost without buying us anything until we have a real such file.
 */
export class ObjReader {

    private _header:        PakHeader | null = null;
    private _payloadOffset = 0;
    private _stride        = 0;
    private _recordType    = 0;
    private _recordCount   = 0;

    public constructor(private readonly _src: IRandomAccess) {}

    public async open(): Promise<void> {
        const headerBuf = await this._src.read(0, PakHeader.SIZE);
        const header    = PakHeader.parse(headerBuf);

        if (header.signature !== 'OBJ') {
            throw new Error(
                `Not an OBJ container — signature was "${header.signature}", expected "OBJ"`
            );
        }

        if (header.entryCount === 0) {
            this._header = header;

            return;
        }

        const firstBuf   = await this._src.read(PakHeader.SIZE, PakEntry.SIZE);
        const firstEntry = PakEntry.parse(firstBuf, 0);

        const lastEntryOff = PakHeader.SIZE + (header.entryCount - 1) * PakEntry.SIZE;
        const lastBuf      = await this._src.read(lastEntryOff, PakEntry.SIZE);
        const lastEntry    = PakEntry.parse(lastBuf, 0);

        if (firstEntry.type !== lastEntry.type) {
            throw new Error(
                `OBJ container not uniform: first.type=${firstEntry.type} last.type=${lastEntry.type} — table-streaming reader needed`
            );
        }

        if (firstEntry.length !== lastEntry.length) {
            throw new Error(
                `OBJ container not uniform: first.length=${firstEntry.length} last.length=${lastEntry.length} — table-streaming reader needed`
            );
        }

        const expectedLastOffset = firstEntry.offset + (header.entryCount - 1) * firstEntry.length;

        if (expectedLastOffset !== lastEntry.offset) {
            throw new Error(
                `OBJ container not uniform: last entry at ${lastEntry.offset}, expected ${expectedLastOffset}`
            );
        }

        if (lastEntry.offset + lastEntry.length > this._src.size()) {
            throw new Error(`OBJ container truncated: last record extends past EOF`);
        }

        this._header         = header;
        this._payloadOffset  = firstEntry.offset;
        this._stride         = firstEntry.length;
        this._recordType     = firstEntry.type;
        this._recordCount    = header.entryCount;
    }

    public getHeader(): PakHeader {
        if (this._header === null) {
            throw new Error('ObjReader: open() not called');
        }

        return this._header;
    }

    public getRecordCount():  number { return this._recordCount; }
    public getRecordType():   number { return this._recordType; }
    public getRecordLength(): number { return this._stride; }

    public async readRecord(index: number): Promise<ArrayBuffer> {
        if (index < 0 || index >= this._recordCount) {
            throw new RangeError(`ObjReader: record index ${index} out of range (count=${this._recordCount})`);
        }

        return this._src.read(this._payloadOffset + index * this._stride, this._stride);
    }

    /** Read a contiguous range of records in one call — useful for sampling. */
    public async readRecords(start: number, count: number): Promise<ArrayBuffer> {
        if (start < 0 || count < 0 || start + count > this._recordCount) {
            throw new RangeError(
                `ObjReader: range [${start}, ${start + count}) out of bounds (count=${this._recordCount})`
            );
        }

        return this._src.read(this._payloadOffset + start * this._stride, count * this._stride);
    }

}