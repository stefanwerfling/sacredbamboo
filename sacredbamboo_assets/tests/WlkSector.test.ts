import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WlkSector} from '../src/index.js';

class WlkSectorFixture {

    public static build(gridIndex: number, ordinal: number, opts?: {
        size?:        number;
        byteOffset?:  number;
        compOffset?:  number;
        compSize?:    number;
        tilesOffset?: number;
        tilesSize?:   number;
    }): {buf: ArrayBuffer; byteOffset: number} {
        const sectorSize = opts?.size       ?? WlkSector.SIZE;
        const before     = opts?.byteOffset ?? 0;
        const buf        = new ArrayBuffer(before + sectorSize);
        const dv         = new DataView(buf);

        dv.setUint32(before + WlkSector.GRID_INDEX_OFFSET,        gridIndex,             true);
        dv.setUint32(before + WlkSector.ORDINAL_OFFSET,           ordinal,               true);
        dv.setUint32(before + WlkSector.COMPRESSED_OFFSET_OFFSET, opts?.compOffset  ?? 0, true);
        dv.setUint32(before + WlkSector.COMPRESSED_SIZE_OFFSET,   opts?.compSize    ?? 0, true);
        dv.setUint32(before + WlkSector.TILES_OFFSET_OFFSET,      opts?.tilesOffset ?? 0, true);
        dv.setUint32(before + WlkSector.TILES_SIZE_OFFSET,        opts?.tilesSize   ?? 0, true);

        return {buf, byteOffset: before};
    }

}

test('WlkSector.parse extracts gridIndex and ordinal from the documented offsets', () => {
    const {buf} = WlkSectorFixture.build(1500, 915);
    const s     = WlkSector.parse(buf);

    assert.equal(s.gridIndex, 1500);
    assert.equal(s.ordinal,   915);
});

test('WlkSector.parse extracts the wldx compressed + tile pointers (@0xEC/@0xF0/@0xD4/@0xD8)', () => {
    const {buf} = WlkSectorFixture.build(1500, 915, {
        compOffset:  0x100,
        compSize:    957,
        tilesOffset: 0x20,
        tilesSize:   131072
    });
    const s = WlkSector.parse(buf);

    assert.equal(s.compressedOffset,    0x100);
    assert.equal(s.compressedSize,      957);
    assert.equal(s.tilesRelativeOffset, 0x20);
    assert.equal(s.tilesSize,           131072);
});

test('WlkSector.parse honours byteOffset for parsing inline inside a larger buffer', () => {
    const {buf, byteOffset} = WlkSectorFixture.build(9999, 6050, {byteOffset: 128});
    const s                 = WlkSector.parse(buf, byteOffset);

    assert.equal(s.gridIndex, 9999);
    assert.equal(s.ordinal,   6050);
});

test('WlkSector.row/col decompose gridIndex with the supplied gridWidth', () => {
    // (row 15, col 0) in a 100-wide grid → gridIndex 1500
    const a = new WlkSector(1500, 915);

    assert.equal(a.row(100), 15);
    assert.equal(a.col(100), 0);

    // (row 99, col 99) → gridIndex 9999
    const b = new WlkSector(9999, 6050);

    assert.equal(b.row(100), 99);
    assert.equal(b.col(100), 99);

    // (row 27, col 1) → gridIndex 2701 (sector 30 in the real file)
    const c = new WlkSector(2701, 42);

    assert.equal(c.row(100), 27);
    assert.equal(c.col(100), 1);
});

test('WlkSector.parse rejects a buffer that is too small', () => {
    const buf = new ArrayBuffer(WlkSector.SIZE - 1);

    assert.throws(() => WlkSector.parse(buf), /need at least 768 bytes/);
});

test('WlkSector.parse rejects a byteOffset that leaves too few bytes', () => {
    const buf = new ArrayBuffer(WlkSector.SIZE);

    assert.throws(() => WlkSector.parse(buf, 1), /need at least 768 bytes from offset 1/);
});

test('WlkSector.SIZE matches WlkReader.SECTOR_SIZE (0x300)', () => {
    assert.equal(WlkSector.SIZE, 0x300);
});