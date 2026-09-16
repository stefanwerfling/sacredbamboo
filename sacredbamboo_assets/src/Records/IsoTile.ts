/**
 * One 64-byte record from `tiles.pak` (the "ISO" tile-definition container).
 * A floor cell's tile is resolved as:
 *   FloorRecord.assetId → tileIndex (low 17 bits) → IsoTile → textureIndex →
 *   texture.pak image (see {@link TexReader}).
 *
 * Layout empirically decoded (2026-09-17, retail Sacred Gold tiles.pak):
 *   @0x00  char[32] filename     source TGA name, e.g. "iso108.tga" (lower-case;
 *                                the texture.pak entry is the same name upper-cased).
 *   @0x20  u32      textureIndex index into texture.pak (VERIFIED: texture.pak[
 *                                textureIndex].name === filename.toUpperCase()).
 *   @0x24  u32      variant      sub-index / animation-or-orientation variant
 *                                (multiple tile indices share one texture).
 *   @0x28  u32      reserved28   0 in samples.
 *   @0x2C  u32      scale        constant 65536 (0x10000) — a 16.16 fixed-point 1.0.
 *   @0x30..0x3F                  0.
 */
export class IsoTile {

    public static readonly SIZE = 64;

    public constructor(
        public readonly filename:     string,
        public readonly textureIndex: number,
        public readonly variant:      number,
        public readonly scale:        number
    ) {}

    public static parse(buf: Uint8Array | ArrayBuffer, byteOffset = 0): IsoTile {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

        if (u8.byteLength - byteOffset < IsoTile.SIZE) {
            throw new RangeError(`IsoTile.parse: need ${IsoTile.SIZE} bytes at ${byteOffset}, have ${u8.byteLength - byteOffset}`);
        }

        let end = byteOffset;

        while (end < byteOffset + 32 && u8[end] !== 0) {
            end++;
        }

        const name = String.fromCharCode(...u8.subarray(byteOffset, end));
        const dv   = new DataView(u8.buffer, u8.byteOffset + byteOffset, IsoTile.SIZE);

        return new IsoTile(name, dv.getUint32(0x20, true), dv.getUint32(0x24, true), dv.getUint32(0x2c, true));
    }

}
