import {PakEntry, PakHeader} from '../../src/index.js';

/**
 * Synthetic PAK/OBJ/TRG file builder used by the unit tests. Lets a test
 * say "give me a header with signature OBJ and these N entries" without
 * having to manually hand-craft 256+ bytes for every fixture.
 */
export class PakFixture {

    private readonly _entries: Array<{type: number; offset: number; length: number; data: Uint8Array}> = [];
    private          _signature       = 'OBJ';
    private          _version         = 1;
    private          _declaredCount: number | null = null;

    public signature(s: string): this {
        if (s.length !== 3) {
            throw new Error('signature must be 3 chars');
        }

        this._signature = s;

        return this;
    }

    public version(v: number): this {
        this._version = v;

        return this;
    }

    /** Override the entryCount field stored in the header (defaults to entries.length). */
    public declaredCount(n: number): this {
        this._declaredCount = n;

        return this;
    }

    /** Append one entry. `data` is the entry's payload — offset is computed. */
    public addEntry(type: number, data: Uint8Array): this {
        this._entries.push({type, offset: 0, length: data.byteLength, data});

        return this;
    }

    /** Append a "garbage" entry-table row that has non-zero values but no payload. */
    public addGarbageEntry(type: number, offset: number, length: number): this {
        this._entries.push({type, offset, length, data: new Uint8Array(0)});

        return this;
    }

    public build(): ArrayBuffer {
        const tableBytes = this._entries.length * PakEntry.SIZE;
        const payloadStart = PakHeader.SIZE + tableBytes;

        let payloadCursor = payloadStart;

        for (const e of this._entries) {
            if (e.data.byteLength > 0) {
                e.offset = payloadCursor;
                payloadCursor += e.data.byteLength;
            }
        }

        const total = payloadCursor;
        const buf   = new ArrayBuffer(total);
        const u8    = new Uint8Array(buf);
        const dv    = new DataView(buf);

        u8[0] = this._signature.charCodeAt(0);
        u8[1] = this._signature.charCodeAt(1);
        u8[2] = this._signature.charCodeAt(2);
        u8[3] = this._version;

        dv.setUint32(4, this._declaredCount ?? this._entries.length, true);

        for (let i = 0; i < this._entries.length; i++) {
            const e   = this._entries[i]!;
            const off = PakHeader.SIZE + i * PakEntry.SIZE;

            dv.setUint32(off,      e.type,   true);
            dv.setUint32(off +  4, e.offset, true);
            dv.setUint32(off +  8, e.length, true);
        }

        for (const e of this._entries) {
            if (e.data.byteLength > 0) {
                u8.set(e.data, e.offset);
            }
        }

        return buf;
    }

}