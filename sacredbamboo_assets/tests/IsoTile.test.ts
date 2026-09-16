import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IsoTile, FloorRecord} from '../src/index.js';

const buildTile = (name: string, textureIndex: number, variant: number, scale = 0x10000): ArrayBuffer => {
    const buf = new ArrayBuffer(IsoTile.SIZE);
    const u8  = new Uint8Array(buf);
    const dv  = new DataView(buf);

    for (let i = 0; i < name.length && i < 31; i++) {u8[i] = name.charCodeAt(i);}
    dv.setUint32(0x20, textureIndex, true);
    dv.setUint32(0x24, variant, true);
    dv.setUint32(0x2c, scale, true);

    return buf;
};

test('IsoTile.parse reads filename, textureIndex, variant, scale', () => {
    const t = IsoTile.parse(buildTile('iso108.tga', 1592, 11));

    assert.equal(t.filename,     'iso108.tga');
    assert.equal(t.textureIndex, 1592);
    assert.equal(t.variant,      11);
    assert.equal(t.scale,        0x10000);
});

test('IsoTile.parse honours byteOffset and rejects short buffers', () => {
    const outer = new Uint8Array(0x40 + IsoTile.SIZE);

    outer.set(new Uint8Array(buildTile('iso00.tga', 1493, 0)), 0x40);
    assert.equal(IsoTile.parse(outer, 0x40).textureIndex, 1493);
    assert.throws(() => IsoTile.parse(new ArrayBuffer(IsoTile.SIZE - 1)), /need 64 bytes/);
});

test('FloorRecord unpacks assetId into tileIndex (low 17 bits) + flags', () => {
    // real sample: assetId 148856786 → tile#90066, flags 0x46f
    const fr = new FloorRecord(0, 148856786, 0, 0);

    assert.equal(fr.tileIndex(), 148856786 & 0x1ffff);
    assert.equal(fr.tileIndex(), 90066);
    assert.equal(fr.tileFlags(), 148856786 >>> 17);
    assert.equal(fr.tileFlags(), 0x46f);

    // a direct-index (flags 0) asset
    const d = new FloorRecord(0, 1955, 0, 0);

    assert.equal(d.tileIndex(), 1955);
    assert.equal(d.tileFlags(), 0);
    assert.equal(FloorRecord.TILE_INDEX_MASK, 0x1ffff);
});
