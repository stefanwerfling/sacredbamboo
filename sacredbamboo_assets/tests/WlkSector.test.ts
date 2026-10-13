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
        serverRev?:   number;
        neighbors?:   number[];
        rawX?:        number;
        rawY?:        number;
        rawEndX?:     number;
        rawEndY?:     number;
        envFlags?:    number;
        natureType?:  number;
        liquidA?:     number;
        liquidB?:     number;
    }): {buf: ArrayBuffer; byteOffset: number} {
        const sectorSize = opts?.size       ?? WlkSector.SIZE;
        const before     = opts?.byteOffset ?? 0;
        const buf        = new ArrayBuffer(before + sectorSize);
        const dv         = new DataView(buf);

        dv.setUint32(before + WlkSector.GRID_INDEX_OFFSET,        gridIndex,              true);
        dv.setUint32(before + WlkSector.ORDINAL_OFFSET,           ordinal,                true);
        dv.setUint32(before + WlkSector.COMPRESSED_OFFSET_OFFSET, opts?.compOffset  ?? 0, true);
        dv.setUint32(before + WlkSector.COMPRESSED_SIZE_OFFSET,   opts?.compSize    ?? 0, true);
        dv.setUint32(before + WlkSector.TILES_OFFSET_OFFSET,      opts?.tilesOffset ?? 0, true);
        dv.setUint32(before + WlkSector.TILES_SIZE_OFFSET,        opts?.tilesSize   ?? 0, true);
        dv.setUint32(before + WlkSector.SERVER_REVISION_OFFSET,   opts?.serverRev   ?? 0, true);

        const nb = opts?.neighbors ?? [];

        for (let i = 0; i < WlkSector.NEIGHBOR_COUNT; i++) {
            dv.setUint16(before + WlkSector.NEIGHBORS_OFFSET + i * 2, nb[i] ?? 0, true);
        }

        dv.setInt32(before + WlkSector.RAW_X_OFFSET,     opts?.rawX     ?? 0, true);
        dv.setInt32(before + WlkSector.RAW_Y_OFFSET,     opts?.rawY     ?? 0, true);
        dv.setInt32(before + WlkSector.RAW_END_X_OFFSET, opts?.rawEndX  ?? 0, true);
        dv.setInt32(before + WlkSector.RAW_END_Y_OFFSET, opts?.rawEndY  ?? 0, true);
        dv.setUint32(before + WlkSector.ENV_FLAGS_OFFSET, opts?.envFlags ?? 0, true);
        dv.setUint8(before + WlkSector.NATURE_TYPE_OFFSET, opts?.natureType ?? 0);
        dv.setUint8(before + WlkSector.LIQUID_A_OFFSET,    opts?.liquidA    ?? 0);
        dv.setUint8(before + WlkSector.LIQUID_B_OFFSET,    opts?.liquidB    ?? 0);

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

test('WlkSector.parse extracts neighbors, raw world bounds and env/nature/liquid', () => {
    const {buf} = WlkSectorFixture.build(2701, 1661, {
        serverRev:  7,
        neighbors:  [0, 0, 1591, 1662, 1732, 0, 1731, 0],
        rawX:       3434,
        rawY:       92734,
        rawEndX:    6869,
        rawEndY:    96168,
        envFlags:   0xd0,
        natureType: 64,
        liquidA:    1,
        liquidB:    2
    });
    const s = WlkSector.parse(buf);

    assert.equal(s.serverRevisionId, 7);
    assert.deepEqual(Array.from(s.neighbors), [0, 0, 1591, 1662, 1732, 0, 1731, 0]);
    assert.deepEqual(s.neighborOrdinals(), [1591, 1662, 1732, 1731]);
    assert.equal(s.rawX,    3434);
    assert.equal(s.rawY,    92734);
    assert.equal(s.rawEndX, 6869);
    assert.equal(s.rawEndY, 96168);
    assert.equal(s.environmentFlags, 0xd0);
    assert.equal(s.natureType,       64);
    assert.equal(s.liquidStyleA,     1);
    assert.equal(s.liquidStyleB,     2);
});

test('WlkSector.parse reads signed negative raw coordinates', () => {
    const {buf} = WlkSectorFixture.build(0, 1, {rawX: -18432, rawY: -5});
    const s     = WlkSector.parse(buf);

    assert.equal(s.rawX, -18432);
    assert.equal(s.rawY, -5);
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