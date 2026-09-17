import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferRandomAccess, MixDef, MixedReader} from '../src/index.js';

interface FrameSpec {name: string; texIndex: number; x1: number; y1: number; x2: number; y2: number; dx0?: number; dy0?: number; dx1?: number; dy1?: number}

/** Build a MixDef record: 16B header + `frames` × 64B frame sub-records. */
const buildRecord = (width: number, height: number, frames: FrameSpec[]): ArrayBuffer => {
    const buf = new ArrayBuffer(MixDef.HEADER_SIZE + frames.length * MixDef.FRAME_SIZE);
    const u8  = new Uint8Array(buf);
    const dv  = new DataView(buf);

    dv.setUint32(0, frames.length, true);
    dv.setUint16(4, width, true);
    dv.setUint16(6, height, true);

    frames.forEach((f, i) => {
        const base = MixDef.HEADER_SIZE + i * MixDef.FRAME_SIZE;

        for (let k = 0; k < f.name.length && k < 31; k++) {u8[base + k] = f.name.charCodeAt(k);}
        dv.setUint32(base + 0x20, f.texIndex, true);
        dv.setUint16(base + 0x24, f.x2, true);
        dv.setUint16(base + 0x26, f.y2, true);
        dv.setUint32(base + 0x28, ((f.y1 & 0xffff) << 16) | (f.x1 & 0xffff), true);
        dv.setFloat32(base + 0x30, f.dx0 ?? 0, true);
        dv.setFloat32(base + 0x34, f.dy0 ?? 0, true);
        dv.setFloat32(base + 0x38, f.dx1 ?? 0, true);
        dv.setFloat32(base + 0x3c, f.dy1 ?? 0, true);
    });

    return buf;
};

test('MixDef.parse reads header + frame source rects (origin = y1<<16|x1)', () => {
    const rec = buildRecord(105, 90, [
        {name: 'MIX0.444', texIndex: 14944, x1: 11, y1: 0, x2: 75, y2: 64, dx0: 0, dy0: 0, dx1: 0.25, dy1: 0.5},
        {name: 'MIX0.444', texIndex: 14944, x1: 75, y1: 6, x2: 107, y2: 70}
    ]);
    const d = MixDef.parse(rec);

    assert.equal(d.frameCount, 2);
    assert.equal(d.width, 105);
    assert.equal(d.height, 90);
    assert.equal(d.frames.length, 2);

    assert.deepEqual(d.frames[0], {textureName: 'MIX0.444', textureIndex: 14944, x1: 11, y1: 0, x2: 75, y2: 64, dx0: 0, dy0: 0, dx1: 0.25, dy1: 0.5});
    assert.equal(d.frames[1]!.x1, 75);
    assert.equal(d.frames[1]!.y1, 6);
    assert.equal(d.frames[1]!.x2, 107);
    assert.equal(d.frames[1]!.y2, 70);
});

test('MixDef.parse tolerates frameCount larger than the buffer', () => {
    const buf = new ArrayBuffer(MixDef.HEADER_SIZE + MixDef.FRAME_SIZE);

    new DataView(buf).setUint32(0, 99, true); // claims 99 frames, only 1 present

    const d = MixDef.parse(buf);

    assert.equal(d.frameCount, 99);
    assert.equal(d.frames.length, 1);
});

test('MixedReader reads a "MIX" pak and returns a MixDef', async () => {
    const rec  = new Uint8Array(buildRecord(64, 64, [{name: 'MIX9.444', texIndex: 100, x1: 0, y1: 0, x2: 64, y2: 64}]));
    const HDR  = 256;
    const OFF  = HDR + 12;
    const buf  = new ArrayBuffer(OFF + rec.byteLength);
    const u8   = new Uint8Array(buf);
    const dv   = new DataView(buf);

    u8[0] = 77; u8[1] = 73; u8[2] = 88; u8[3] = 0; // "MIX", ver 0
    dv.setUint32(4, 1, true);                       // entryCount
    dv.setUint32(HDR + 0, 0x63, true);              // entry type
    dv.setUint32(HDR + 4, OFF, true);               // offset
    dv.setUint32(HDR + 8, rec.byteLength, true);    // size
    u8.set(rec, OFF);

    const rd = new MixedReader(new BufferRandomAccess(buf));

    await rd.open();
    assert.equal(rd.getDefCount(), 1);

    const d = await rd.getDef(0);

    assert.equal(d.frames[0]!.textureIndex, 100);
    assert.equal(d.frames[0]!.x2 - d.frames[0]!.x1, 64);
    await assert.rejects(() => rd.getDef(1), /out of range/);
});

test('MixedReader rejects a non-MIX signature', async () => {
    const bad = new ArrayBuffer(256);

    new Uint8Array(bad).set([84, 69, 88]); // "TEX"
    await assert.rejects(() => new MixedReader(new BufferRandomAccess(bad)).open(), /expected "MIX"/);
});
