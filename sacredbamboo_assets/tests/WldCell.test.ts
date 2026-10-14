import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WldCell, WldSector} from '../src/index.js';

class WldCellFixture {

    /** Build a 32-byte cell, optionally embedded at `byteOffset` in a larger buffer. */
    public static build(fields: Partial<{
        floorIndex:           number;
        staticIndexA:         number;
        staticIndexB:         number;
        worldObjectChainHead: number;
        visualElevation:      number[];  // L,T,R,B  @0x10..0x13
        bakedBrightness:      number[];  // SW,NW,NE,SE  @0x14..0x17
        elevation:            number[];  // SW,NW,NE,SE  @0x18..0x1B
        indoorAnchorDeltaX:   number;    // @0x1C
        indoorAnchorDeltaY:   number;    // @0x1D
        pathFlags:            number;    // @0x1E
        properties:           number;    // @0x1F
    }>, byteOffset = 0): {buf: ArrayBuffer; byteOffset: number} {
        const buf = new ArrayBuffer(byteOffset + WldCell.SIZE);
        const dv  = new DataView(buf);

        dv.setUint32(byteOffset + 0x00, fields.floorIndex           ?? 0, true);
        dv.setUint32(byteOffset + 0x04, fields.staticIndexA         ?? 0, true);
        dv.setUint32(byteOffset + 0x08, fields.worldObjectChainHead ?? 0, true);
        dv.setUint32(byteOffset + 0x0c, fields.staticIndexB         ?? 0, true);

        const quad = (base: number, vals: number[] | undefined, signed: boolean): void => {
            for (let i = 0; i < 4; i++) {
                const v = vals?.[i] ?? 0;

                if (signed) {dv.setInt8(byteOffset + base + i, v);} else {dv.setUint8(byteOffset + base + i, v);}
            }
        };

        quad(0x10, fields.visualElevation, true);
        quad(0x14, fields.bakedBrightness, false);
        quad(0x18, fields.elevation,       true);
        dv.setInt8(byteOffset + 0x1c, fields.indoorAnchorDeltaX ?? 0);
        dv.setInt8(byteOffset + 0x1d, fields.indoorAnchorDeltaY ?? 0);
        dv.setUint8(byteOffset + 0x1e, fields.pathFlags  ?? 0);
        dv.setUint8(byteOffset + 0x1f, fields.properties ?? 0);

        return {buf, byteOffset};
    }

}

test('WldCell.parse reads the four chain heads and per-corner fields', () => {
    const {buf} = WldCellFixture.build({
        floorIndex:           89173,
        staticIndexA:         100,
        staticIndexB:         3074,
        worldObjectChainHead: 0,
        visualElevation:      [-1, 0, 2, 3],
        bakedBrightness:      [0xff, 0xeb, 0xff, 0xd7],
        elevation:            [0, 1, -2, 5],
        indoorAnchorDeltaX:   -4,
        indoorAnchorDeltaY:   6,
        pathFlags:            0x12,
        properties:           0xd1
    });
    const c = WldCell.parse(buf);

    assert.equal(c.floorIndex,           89173);
    assert.equal(c.staticIndexA,         100);
    assert.equal(c.staticIndexB,         3074);
    assert.equal(c.worldObjectChainHead, 0);
    assert.deepEqual(c.visualElevation,  [-1, 0, 2, 3]);
    assert.deepEqual(c.bakedBrightness,  [0xff, 0xeb, 0xff, 0xd7]);
    assert.deepEqual(c.elevation,        [0, 1, -2, 5]);
    assert.equal(c.indoorAnchorDeltaX,   -4);
    assert.equal(c.indoorAnchorDeltaY,   6);
    assert.equal(c.pathFlags,            0x12);
    assert.equal(c.properties,           0xd1);
});

test('WldCell @0x1F splits into behavior (low nibble) and terrain surface (high nibble)', () => {
    const a = WldCell.parse(WldCellFixture.build({properties: 0xd1}).buf);

    assert.equal(a.getFlagsByte(),   0xd1);
    assert.equal(a.behavior(),       0x1);
    assert.equal(a.behaviorName(),   'BlockerA');
    assert.equal(a.terrainSurface(), 0xd0);
    assert.equal(a.isMovementBlocker(), true);
    assert.equal(a.isStairs(),          false);
    assert.equal(a.isIndoorPortal(),    false);
    assert.equal(a.isLiquidSurface(),   false);

    // 0x9a → behavior 0xA (IndoorExit), surface 0x90 (liquid A)
    const b = WldCell.parse(WldCellFixture.build({properties: 0x9a}).buf);

    assert.equal(b.behaviorName(),    'IndoorExit');
    assert.equal(b.isIndoorPortal(),  true);
    assert.equal(b.terrainSurface(),  0x90);
    assert.equal(b.isLiquidSurface(), true);

    // 0x07 → StairsUp2
    const c = WldCell.parse(WldCellFixture.build({properties: 0x07}).buf);

    assert.equal(c.behaviorName(), 'StairsUp2');
    assert.equal(c.isStairs(),     true);

    // 0x3b → behavior 0xB is not a documented value → Unknown
    const d = WldCell.parse(WldCellFixture.build({properties: 0x3b}).buf);

    assert.equal(d.behaviorName(),   'Unknown');
    assert.equal(d.terrainSurface(), 0x30);
});

test('WldCell corner helpers: fully-bright and has-elevation', () => {
    const flat = WldCell.parse(WldCellFixture.build({
        bakedBrightness: [0xff, 0xff, 0xff, 0xff],
        elevation:       [0, 0, 0, 0]
    }).buf);

    assert.equal(flat.isFullyBright(), true);
    assert.equal(flat.hasElevation(),  false);

    const sloped = WldCell.parse(WldCellFixture.build({
        bakedBrightness: [0xff, 0xeb, 0xff, 0xff],
        elevation:       [0, 0, -2, 0]
    }).buf);

    assert.equal(sloped.isFullyBright(), false);
    assert.equal(sloped.hasElevation(),  true);
});

test('WldCell helpers: static presence and flags byte', () => {
    const {buf} = WldCellFixture.build({staticIndexA: 5, staticIndexB: 0, properties: 0x40});
    const c     = WldCell.parse(buf);

    assert.equal(c.hasStaticA(), true);
    assert.equal(c.hasStaticB(), false);
    assert.equal(c.getFlagsByte(), 0x40);
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

    assert.equal(c.floorIndex, 6782);        // 0x1a7e — matches Floor[6782].selfIndex
    assert.equal(c.hasStaticA(), false);
    assert.equal(c.hasStaticB(), false);
    assert.deepEqual(c.bakedBrightness, [0xff, 0xff, 0xff, 0xff]);
    assert.equal(c.isFullyBright(), true);   // @0x14..0x17 all 0xFF (the old "sentinel")
    assert.deepEqual(c.elevation, [0, 0, 0, 0]);
    assert.equal(c.getFlagsByte(), 0xc0);    // @0x1F; behavior None, surface 0xC0
    assert.equal(c.behaviorName(), 'None');
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
