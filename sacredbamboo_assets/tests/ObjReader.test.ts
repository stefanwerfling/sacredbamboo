import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferRandomAccess, ObjReader, PakEntry, PakHeader} from '../src/index.js';

/**
 * Builds a synthetic OBJ container with `count` uniform records of `length`
 * bytes each, where record i's payload is filled with `(i & 0xff)`. Lets
 * tests check that ObjReader synthesises offsets correctly without having
 * to round-trip through the full PakFixture.
 */
class ObjFixture {

    public static build(count: number, length: number, type = 0x87): ArrayBuffer {
        const tableBytes = count * PakEntry.SIZE;
        const payloadOff = PakHeader.SIZE + tableBytes;
        const total      = payloadOff + count * length;

        const buf = new ArrayBuffer(total);
        const u8  = new Uint8Array(buf);
        const dv  = new DataView(buf);

        u8[0] = 'O'.charCodeAt(0);
        u8[1] = 'B'.charCodeAt(0);
        u8[2] = 'J'.charCodeAt(0);
        u8[3] = 1;
        dv.setUint32(4, count, true);

        for (let i = 0; i < count; i++) {
            const off = PakHeader.SIZE + i * PakEntry.SIZE;

            dv.setUint32(off,     type,                     true);
            dv.setUint32(off + 4, payloadOff + i * length,  true);
            dv.setUint32(off + 8, length,                   true);
        }

        for (let i = 0; i < count; i++) {
            u8.fill(i & 0xff, payloadOff + i * length, payloadOff + (i + 1) * length);
        }

        return buf;
    }

}

test('ObjReader.open extracts uniform stride from first+last entry', async () => {
    const buf = ObjFixture.build(10, 16);
    const r   = new ObjReader(new BufferRandomAccess(buf));

    await r.open();

    assert.equal(r.getRecordCount(),  10);
    assert.equal(r.getRecordType(),   0x87);
    assert.equal(r.getRecordLength(), 16);
});

test('ObjReader.readRecord returns the synthesised payload by index', async () => {
    const buf = ObjFixture.build(5, 4);
    const r   = new ObjReader(new BufferRandomAccess(buf));

    await r.open();

    for (let i = 0; i < 5; i++) {
        const rec = new Uint8Array(await r.readRecord(i));

        assert.deepEqual(Array.from(rec), [i, i, i, i]);
    }
});

test('ObjReader.readRecord rejects out-of-range indices', async () => {
    const buf = ObjFixture.build(3, 4);
    const r   = new ObjReader(new BufferRandomAccess(buf));

    await r.open();

    await assert.rejects(() => r.readRecord(-1), /out of range/);
    await assert.rejects(() => r.readRecord(3),  /out of range/);
});

test('ObjReader.readRecords reads a contiguous range', async () => {
    const buf = ObjFixture.build(5, 4);
    const r   = new ObjReader(new BufferRandomAccess(buf));

    await r.open();

    const out = new Uint8Array(await r.readRecords(1, 3));

    assert.equal(out.length, 12);
    assert.deepEqual(
        Array.from(out),
        [1,1,1,1, 2,2,2,2, 3,3,3,3]
    );
});

test('ObjReader.open rejects non-uniform tables', async () => {
    const buf = ObjFixture.build(3, 16);
    const dv  = new DataView(buf);

    // Mangle the LAST entry's length so first.length !== last.length
    dv.setUint32(PakHeader.SIZE + 2 * PakEntry.SIZE + 8, 99, true);

    const r = new ObjReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /not uniform/);
});

test('ObjReader.open rejects mismatching last-entry offset (gap in payload)', async () => {
    const buf = ObjFixture.build(3, 16);
    const dv  = new DataView(buf);

    // Shift last entry's offset so first + (n-1)*stride !== last.offset
    const lastOff = dv.getUint32(PakHeader.SIZE + 2 * PakEntry.SIZE + 4, true);

    dv.setUint32(PakHeader.SIZE + 2 * PakEntry.SIZE + 4, lastOff + 4, true);

    const r = new ObjReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /not uniform/);
});

test('ObjReader.open rejects wrong signature', async () => {
    const buf = ObjFixture.build(2, 8);
    const u8  = new Uint8Array(buf);

    u8[0] = 'T'.charCodeAt(0);
    u8[1] = 'R'.charCodeAt(0);
    u8[2] = 'G'.charCodeAt(0);

    const r = new ObjReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /Not an OBJ container/);
});