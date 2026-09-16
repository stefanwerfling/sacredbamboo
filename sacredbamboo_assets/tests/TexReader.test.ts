import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deflate} from 'pako';
import {BufferRandomAccess, TexReader, TexImage} from '../src/index.js';

/** Build a minimal one-image "TEX" PAK with an ARGB4444 (type 4) image. */
const buildTexPak = (name: string, w: number, h: number, pixels: number[]): ArrayBuffer => {
    // ARGB4444 raw = one u16 per pixel
    const raw = new Uint8Array(w * h * 2);
    const rdv = new DataView(raw.buffer);

    pixels.forEach((p, i) => rdv.setUint16(i * 2, p, true));

    const z    = deflate(raw);
    const HDR  = 256;
    const ENT  = 12;
    const IMGH = 80;
    const imgOff = HDR + ENT;
    const total  = imgOff + IMGH + z.byteLength;
    const buf = new ArrayBuffer(total);
    const u8  = new Uint8Array(buf);
    const dv  = new DataView(buf);

    // PAK header
    u8[0] = 84; u8[1] = 69; u8[2] = 88; u8[3] = 3; // "TEX", ver 3
    dv.setUint32(4, 1, true);  // entryCount
    dv.setUint32(8, 1, true);  // u04

    // entry table row: {typeId, offset, compressedSize}
    dv.setUint32(HDR + 0, 4, true);
    dv.setUint32(HDR + 4, imgOff, true);
    dv.setUint32(HDR + 8, IMGH + z.byteLength, true);

    // image header @imgOff
    for (let i = 0; i < name.length && i < 31; i++) {u8[imgOff + i] = name.charCodeAt(i);}
    dv.setUint16(imgOff + 32, w, true);
    dv.setUint16(imgOff + 34, h, true);
    u8[imgOff + 36] = 4;                          // repeat_type_id
    dv.setUint32(imgOff + 37, z.byteLength, true); // repeat_compr_size

    u8.set(z, imgOff + IMGH);

    return buf;
};

test('TexReader decodes an ARGB4444 image to RGBA', async () => {
    // 2×2: opaque red, opaque green, opaque blue, transparent (per ARGB4444 nibbles)
    // 0xFF00 = A15 R15 G0 B0? word = A<<12|R<<8|G<<4|B. red=0xFF00, green=0xF0F0, blue=0xF00F, clear=0x0000
    const pak = buildTexPak('test.tga', 2, 2, [0xff00, 0xf0f0, 0xf00f, 0x0000]);
    const rd  = new TexReader(new BufferRandomAccess(pak));

    await rd.open();

    assert.equal(rd.getImageCount(), 1);

    const info = await rd.getImageInfo(0);

    assert.equal(info.name, 'test.tga');
    assert.equal(info.width, 2);
    assert.equal(info.height, 2);
    assert.equal(info.typeId, 4);

    const img = await rd.readImage(0);

    assert.ok(img instanceof TexImage);
    assert.equal(img.rgba.length, 2 * 2 * 4);
    // pixel 0 = opaque red
    assert.deepEqual([...img.rgba.slice(0, 4)], [255, 0, 0, 255]);
    // pixel 1 = opaque green
    assert.deepEqual([...img.rgba.slice(4, 8)], [0, 255, 0, 255]);
    // pixel 2 = opaque blue
    assert.deepEqual([...img.rgba.slice(8, 12)], [0, 0, 255, 255]);
    // pixel 3 = fully transparent
    assert.equal(img.rgba[15], 0);
});

test('TexReader rejects a non-TEX signature', async () => {
    const bad = new ArrayBuffer(256);

    new Uint8Array(bad).set([79, 66, 74]); // "OBJ"
    await assert.rejects(() => new TexReader(new BufferRandomAccess(bad)).open(), /expected "TEX"/);
});

test('TexImage.fromArgb4444 expands nibbles 15→255', () => {
    const raw = new Uint8Array(2);

    new DataView(raw.buffer).setUint16(0, 0xffff, true); // A15 R15 G15 B15
    const img = TexImage.fromArgb4444('x', 1, 1, raw);

    assert.deepEqual([...img.rgba], [255, 255, 255, 255]);
});
