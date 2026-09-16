import assert from 'node:assert/strict';
import {test} from 'node:test';
import {FloorRecord} from '../src/index.js';

const makeRecord = (selfIdx: number, asset: number, reserved: number, next: number): ArrayBuffer => {
    const buf = new ArrayBuffer(FloorRecord.SIZE);
    const dv  = new DataView(buf);

    dv.setUint32(0,  selfIdx,  true);
    dv.setUint32(4,  asset,    true);
    dv.setUint32(8,  reserved, true);
    dv.setUint32(12, next,     true);

    return buf;
};

test('FloorRecord.SIZE is 16', () => {
    assert.equal(FloorRecord.SIZE, 16);
});

test('FloorRecord.parse extracts the four little-endian u32 fields', () => {
    const rec = FloorRecord.parse(makeRecord(42, 0x0AEEEE1B, 0, 99));

    assert.equal(rec.selfIndex, 42);
    assert.equal(rec.assetId,   0x0AEEEE1B);
    assert.equal(rec.reserved,  0);
    assert.equal(rec.nextIndex, 99);
});

test('FloorRecord.parse accepts a byte offset into a larger buffer', () => {
    const outer = new ArrayBuffer(48);
    const u8    = new Uint8Array(outer);
    const dv    = new DataView(outer);

    // place a record at offset 16
    dv.setUint32(16 + 0,  7,    true);
    dv.setUint32(16 + 4,  0xCA, true);
    dv.setUint32(16 + 8,  0,    true);
    dv.setUint32(16 + 12, 8,    true);

    const rec = FloorRecord.parse(u8.buffer, 16);

    assert.equal(rec.selfIndex, 7);
    assert.equal(rec.assetId,   0xCA);
    assert.equal(rec.nextIndex, 8);
});

test('FloorRecord.isReservedUninit detects MSVC 0xCDCDCDCD heap-padding', () => {
    const rec       = FloorRecord.parse(makeRecord(1, 0xABCD, 0xCDCDCDCD, 0));
    const cleanRec  = FloorRecord.parse(makeRecord(1, 0xABCD, 0,          0));

    assert.equal(rec.isReservedUninit(),      true);
    assert.equal(cleanRec.isReservedUninit(), false);
});

test('FloorRecord.isChainTerminator is true exactly when nextIndex === 0', () => {
    assert.equal(FloorRecord.parse(makeRecord(1, 0, 0, 0)).isChainTerminator(),  true);
    assert.equal(FloorRecord.parse(makeRecord(1, 0, 0, 99)).isChainTerminator(), false);
});

test('FloorRecord.UNINIT_MARK matches MSVC 0xCDCDCDCD', () => {
    assert.equal(FloorRecord.UNINIT_MARK, 0xCDCDCDCD);
});