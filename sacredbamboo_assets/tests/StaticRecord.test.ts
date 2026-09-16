import assert from 'node:assert/strict';
import {test} from 'node:test';
import {StaticRecord} from '../src/index.js';

test('StaticRecord.parse reads the decoded fields', () => {
    const buf = new Uint8Array(StaticRecord.SIZE);
    const dv  = new DataView(buf.buffer);

    dv.setUint32(0x00, 12, true);
    dv.setUint32(0x04, 29889, true);
    dv.setUint32(0x08, 0, true);
    dv.setInt16(0x0c, 1498, true);
    dv.setInt16(0x0e, -8073, true);
    dv.setInt16(0x10, -2, true);
    dv.setInt16(0x12, -28651, true);

    const r = StaticRecord.parse(buf);

    assert.equal(r.selfIndex,  12);
    assert.equal(r.assetId,    29889);
    assert.equal(r.reserved08, 0);
    assert.equal(r.fieldC,     1498);
    assert.equal(r.worldX,     -8073);
    assert.equal(r.reserved10, -2);
    assert.equal(r.worldY,     -28651);
    assert.deepEqual(r.position(), [-8073, -28651]);
});

test('regression: the real Static.PAK record #12 decodes as expected', () => {
    // Bytes of Static[12], referenced by sector 1 "Sector 0,24".
    const bytes = Uint8Array.from([
        0x0c, 0x00, 0x00, 0x00, 0xc1, 0x74, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xda, 0x05, 0x77, 0xe0,
        0xfe, 0xff, 0x15, 0x90, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0xff, 0xff, 0x08, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    const r = StaticRecord.parse(bytes);

    assert.equal(r.selfIndex, 12);
    assert.equal(r.assetId,   29889);   // 0x74c1
    assert.equal(r.fieldC,    1498);    // 0x05da
    assert.equal(r.worldX,    -8073);   // 0xe077 i16
    assert.equal(r.reserved10, -2);     // 0xfffe
    assert.equal(r.worldY,    -28651);  // 0x9015 i16
    assert.equal(StaticRecord.isUninitialized(bytes), false);
});

test('StaticRecord.isUninitialized detects 0xCDCDCDCD heap-fill at 0x30', () => {
    const buf = new Uint8Array(StaticRecord.SIZE);
    const dv  = new DataView(buf.buffer);

    dv.setUint32(0x30, StaticRecord.UNINIT_MARK, true);

    assert.equal(StaticRecord.isUninitialized(buf), true);
});

test('StaticRecord.parse honours byteOffset and rejects short buffers', () => {
    const buf = new Uint8Array(0x20 + StaticRecord.SIZE);

    new DataView(buf.buffer).setUint32(0x20, 999, true);
    assert.equal(StaticRecord.parse(buf, 0x20).selfIndex, 999);
    assert.throws(() => StaticRecord.parse(new ArrayBuffer(StaticRecord.SIZE - 1)), /need 64 bytes/);
});
