import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WldCell, WldSector} from '../src/index.js';

class WldCellFixture {

    /** Build a 32-byte cell, optionally embedded at `byteOffset` in a larger buffer. */
    public static build(fields: Partial<{
        floorIndex:   number;
        staticIndexA: number;
        reserved08:   number;
        staticIndexB: number;
        unknown10:    number;
        extSentinel:  number;
        corners:      number;
        flags:        number;
    }>, byteOffset = 0): {buf: ArrayBuffer; byteOffset: number} {
        const buf = new ArrayBuffer(byteOffset + WldCell.SIZE);
        const dv  = new DataView(buf);

        dv.setUint32(byteOffset + 0x00, fields.floorIndex   ?? 0, true);
        dv.setUint32(byteOffset + 0x04, fields.staticIndexA ?? 0, true);
        dv.setUint32(byteOffset + 0x08, fields.reserved08   ?? 0, true);
        dv.setUint32(byteOffset + 0x0c, fields.staticIndexB ?? 0, true);
        dv.setUint32(byteOffset + 0x10, fields.unknown10    ?? 0, true);
        dv.setUint32(byteOffset + 0x14, fields.extSentinel  ?? 0, true);
        dv.setUint32(byteOffset + 0x18, fields.corners      ?? 0, true);
        dv.setUint32(byteOffset + 0x1c, fields.flags        ?? 0, true);

        return {buf, byteOffset};
    }

}

test('WldCell.parse reads all eight u32 lanes from the documented offsets', () => {
    const {buf} = WldCellFixture.build({
        floorIndex:   89173,
        staticIndexA: 100,
        staticIndexB: 3074,
        unknown10:    12,
        extSentinel:  0,
        corners:      0x01010101,
        flags:        0xd1000000
    });
    const c = WldCell.parse(buf);

    assert.equal(c.floorIndex,   89173);
    assert.equal(c.staticIndexA, 100);
    assert.equal(c.reserved08,   0);
    assert.equal(c.staticIndexB, 3074);
    assert.equal(c.unknown10,    12);
    assert.equal(c.extSentinel,  0);
    assert.equal(c.corners,      0x01010101);
    assert.equal(c.flags >>> 0,  0xd1000000);
});

test('WldCell helpers: static presence, corners, flags byte, sentinel', () => {
    const {buf} = WldCellFixture.build({
        staticIndexA: 5,
        staticIndexB: 0,
        corners:      0x04030201,
        flags:        0x40000000,
        extSentinel:  WldCell.EMPTY_SENTINEL
    });
    const c = WldCell.parse(buf);

    assert.equal(c.hasStaticA(), true);
    assert.equal(c.hasStaticB(), false);
    assert.deepEqual(c.getCorners(), [0x01, 0x02, 0x03, 0x04]);
    assert.equal(c.getFlagsByte(), 0x40);
    assert.equal(c.isEmptySentinel(), true);
});

test('WldCell.staticA/B split the low-20-bit index from the flag bits', () => {
    // staticIndexB = flags(0x2) << 20 | index(0xb091) = 0x28b091
    const {buf} = WldCellFixture.build({staticIndexA: 45201, staticIndexB: 0x28b091});
    const c = WldCell.parse(buf);

    assert.equal(c.staticA(),      45201);
    assert.equal(c.staticAFlags(), 0);
    assert.equal(c.staticB(),      0x8b091); // 0x28b091 & 0xFFFFF (low 20 bits)
    assert.equal(c.staticBFlags(), 0x2);     // 0x28b091 >>> 20
    assert.equal(c.hasStaticA(),   true);
    assert.equal(c.hasStaticB(),   true);
});

test('WldCell.parse honours byteOffset inside a larger buffer', () => {
    const {buf, byteOffset} = WldCellFixture.build({floorIndex: 6782}, 0x20);
    const c                 = WldCell.parse(buf, byteOffset);

    assert.equal(c.floorIndex, 6782);
});

test('WldCell.parse rejects a slice that is too small', () => {
    const buf = new ArrayBuffer(WldCell.SIZE - 1);

    assert.throws(() => WldCell.parse(buf), /need 32 bytes/);
});

test('regression: the real sectors.wldx sector-0 cell decodes as expected', () => {
    // First 32 bytes of sector 0's body ("Sector 0,15", uniform empty cell).
    const bytes = Uint8Array.from([
        0x7e, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0
    ]);
    const c = WldCell.parse(bytes);

    assert.equal(c.floorIndex, 6782);           // 0x1a7e — matches Floor[6782].selfIndex
    assert.equal(c.hasStaticA(), false);
    assert.equal(c.hasStaticB(), false);
    assert.equal(c.isEmptySentinel(), true);    // 0xFFFFFFFF at @0x14
    assert.equal(c.getFlagsByte(), 0xc0);       // high byte of @0x1c
});

test('WldSector.getCell / getCellAt index into the 64×64 grid', () => {
    // Minimal base body: name block (32) + two known cells at grid 0 and 1.
    const buf = new Uint8Array(WldSector.NAME_BLOCK_SIZE + 2 * WldCell.SIZE);
    const dv  = new DataView(buf.buffer);

    buf[0] = 'S'.charCodeAt(0); // any name byte
    dv.setUint32(WldSector.NAME_BLOCK_SIZE + 0 * WldCell.SIZE + 0x00, 111, true);
    dv.setUint32(WldSector.NAME_BLOCK_SIZE + 1 * WldCell.SIZE + 0x00, 222, true);

    const sec = WldSector.parse(buf);

    assert.equal(sec.getCell(0).floorIndex, 111);
    assert.equal(sec.getCell(1).floorIndex, 222);
    assert.equal(sec.getCellAt(0, 0).floorIndex, 111);
    assert.equal(sec.getCellAt(0, 1).floorIndex, 222);
    assert.throws(() => sec.getCell(2), /out of range/);
    assert.throws(() => sec.getCellAt(64, 0), /out of 64×64 grid/);
});

test('WldSector cell-layout constants are consistent', () => {
    assert.equal(WldCell.SIZE, 32);
    assert.equal(WldSector.CELL_GRID, 64);
    assert.equal(WldSector.CELL_COUNT, 64 * 64);
    // name block + cells + trailer == base body size
    assert.equal(
        WldSector.NAME_BLOCK_SIZE + WldSector.CELL_COUNT * WldCell.SIZE + WldSector.TRAILER_SIZE,
        WldSector.BASE_BODY_SIZE
    );
});
