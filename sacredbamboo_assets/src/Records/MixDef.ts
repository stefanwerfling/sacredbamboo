/**
 * One record from `mixed.pak` (the "MIX" object-definition container) — the
 * static-object sprite catalogue. `StaticRecord.assetId` indexes it.
 *
 * Layout empirically decoded (2026-09-17, retail Sacred Gold mixed.pak), all
 * little-endian. Record = 16-byte header + `frameCount` × 64-byte frames:
 *
 *   header @0x00 u32 frameCount   number of frame sub-records
 *          @0x04 u16 width        overall composed sprite width
 *          @0x06 u16 height       overall composed sprite height
 *          @0x08 i16 anchor?      small signed value (tentative)
 *          @0x0C                  0xCDCDCDCD packer fill
 *   frame  @0x00 char[32] textureName   e.g. "MIX0.444" (UPPERCASE in texture.pak)
 *          @0x20 u32 textureIndex       index into texture.pak (VERIFIED)
 *          @0x24 u16 x2                 source sub-rect right edge in the atlas
 *          @0x26 u16 y2                 source sub-rect bottom edge
 *          @0x28 u32 origin             (y1<<16)|x1 — source top-left in the atlas
 *          @0x30 f32 dx0, @0x34 f32 dy0, @0x38 f32 dx1, @0x3C f32 dy1
 *                                       normalized DEST rect (0..1) in the composed
 *                                       width×height sprite (@0x2C float = 0, unused).
 *
 * A frame's atlas source rect is [x1, y1, x2, y2] (x1=origin&0xFFFF,
 * y1=origin>>>16). Composite the object: for each frame, blit the atlas source
 * rect into the sprite at [dx0*width, dy0*height, dx1*width, dy1*height].
 */
export interface MixFrame {
    textureName:  string;
    textureIndex: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    /** Normalized DEST rect (0..1) in the composed width×height sprite. */
    dx0: number;
    dy0: number;
    dx1: number;
    dy1: number;
}

export class MixDef {

    public static readonly HEADER_SIZE = 16;
    public static readonly FRAME_SIZE  = 64;

    public constructor(
        public readonly frameCount: number,
        public readonly width:      number,
        public readonly height:     number,
        public readonly frames:     MixFrame[]
    ) {}

    public static parse(buf: Uint8Array | ArrayBuffer, byteOffset = 0): MixDef {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        const avail = u8.byteLength - byteOffset;

        if (avail < MixDef.HEADER_SIZE) {
            throw new RangeError(`MixDef.parse: need ${MixDef.HEADER_SIZE} header bytes, have ${avail}`);
        }

        const dv         = new DataView(u8.buffer, u8.byteOffset + byteOffset, avail);
        const frameCount = dv.getUint32(0, true);
        const width      = dv.getUint16(4, true);
        const height     = dv.getUint16(6, true);
        const nFrames    = Math.min(frameCount, Math.floor((avail - MixDef.HEADER_SIZE) / MixDef.FRAME_SIZE));
        const frames: MixFrame[] = [];

        for (let f = 0; f < nFrames; f++) {
            const base = MixDef.HEADER_SIZE + f * MixDef.FRAME_SIZE;

            let end = base;

            while (end < base + 32 && u8[byteOffset + end] !== 0) {
                end++;
            }

            const origin = dv.getUint32(base + 0x28, true);

            frames.push({
                textureName:  String.fromCharCode(...u8.subarray(byteOffset + base, byteOffset + end)),
                textureIndex: dv.getUint32(base + 0x20, true),
                x1: origin & 0xffff,
                y1: origin >>> 16,
                x2: dv.getUint16(base + 0x24, true),
                y2: dv.getUint16(base + 0x26, true),
                dx0: dv.getFloat32(base + 0x30, true),
                dy0: dv.getFloat32(base + 0x34, true),
                dx1: dv.getFloat32(base + 0x38, true),
                dy1: dv.getFloat32(base + 0x3c, true)
            });
        }

        return new MixDef(frameCount, width, height, frames);
    }

}
