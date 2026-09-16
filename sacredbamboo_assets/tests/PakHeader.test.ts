import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PakEntry, PakHeader, PakHeaderParseError} from '../src/index.js';

const makeHeader = (sig: string, ver: number, count: number, u04: number): ArrayBuffer => {
    const buf = new ArrayBuffer(PakHeader.SIZE);
    const u8  = new Uint8Array(buf);
    const dv  = new DataView(buf);

    u8[0] = sig.charCodeAt(0);
    u8[1] = sig.charCodeAt(1);
    u8[2] = sig.charCodeAt(2);
    u8[3] = ver;
    dv.setUint32(4, count, true);
    dv.setUint32(8, u04,   true);

    return buf;
};

test('PakHeader.parse reads signature, version, entryCount, u04', () => {
    const h = PakHeader.parse(makeHeader('OBJ', 1, 1234, 5678));

    assert.equal(h.signature,  'OBJ');
    assert.equal(h.version,    1);
    assert.equal(h.entryCount, 1234);
    assert.equal(h.u04,        5678);
});

test('PakHeader.parse rejects buffers smaller than SIZE', () => {
    const small = new ArrayBuffer(64);

    assert.throws(
        () => PakHeader.parse(small),
        (err) => err instanceof PakHeaderParseError && /at least 256 bytes/.test(err.message)
    );
});

test('PakHeader.SIZE is the 0x100 documented in PAKExtractor.pas', () => {
    assert.equal(PakHeader.SIZE, 0x100);
});

test('PakEntry.parse extracts a row at the given index', () => {
    const tableBuf = new ArrayBuffer(PakEntry.SIZE * 3);
    const dv       = new DataView(tableBuf);

    // row 0 — all zero (= empty slot)
    dv.setUint32(0,                       0,     true);
    dv.setUint32(4,                       0,     true);
    dv.setUint32(8,                       0,     true);
    // row 1
    dv.setUint32(PakEntry.SIZE + 0,       0x87,  true);
    dv.setUint32(PakEntry.SIZE + 4,       256,   true);
    dv.setUint32(PakEntry.SIZE + 8,       16,    true);
    // row 2
    dv.setUint32(2 * PakEntry.SIZE + 0,   0x88,  true);
    dv.setUint32(2 * PakEntry.SIZE + 4,   512,   true);
    dv.setUint32(2 * PakEntry.SIZE + 8,   32,    true);

    const e0 = PakEntry.parse(tableBuf, 0);
    const e1 = PakEntry.parse(tableBuf, 1);
    const e2 = PakEntry.parse(tableBuf, 2);

    assert.deepEqual(
        {index: e1.index, type: e1.type, offset: e1.offset, length: e1.length},
        {index: 1, type: 0x87, offset: 256, length: 16}
    );
    assert.equal(e0.index,  0);
    assert.equal(e2.length, 32);
});

test('PakEntry.isNonZero is true only when all three fields are non-zero', () => {
    assert.equal(new PakEntry(0, 0x87, 256, 16).isNonZero(),   true);
    assert.equal(new PakEntry(0, 0,    256, 16).isNonZero(),   false);
    assert.equal(new PakEntry(0, 0x87, 0,   16).isNonZero(),   false);
    assert.equal(new PakEntry(0, 0x87, 256, 0).isNonZero(),    false);
});

test('PakEntry.fitsInFile bounds-checks against the file size', () => {
    assert.equal(new PakEntry(0, 1, 100, 50).fitsInFile(200),   true);
    assert.equal(new PakEntry(0, 1, 100, 50).fitsInFile(150),   true);
    assert.equal(new PakEntry(0, 1, 100, 50).fitsInFile(149),   false);
    assert.equal(new PakEntry(0, 1, 100, 50).fitsInFile(0),     false);
});