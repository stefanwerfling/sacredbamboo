/**
 * A decoded texture.pak image: RGBA8888 pixels ready for a canvas ImageData.
 * Produced by {@link TexReader}. Sacred's on-disk formats are 4-bit-per-channel
 * ARGB4444 (type 4, zlib) or raw 32bpp (type 6); both expand to RGBA here.
 */
export class TexImage {

    public constructor(
        public readonly name:   string,
        public readonly width:  number,
        public readonly height: number,
        /** RGBA8888, length width*height*4. */
        public readonly rgba:   Uint8ClampedArray
    ) {}

    /** Expand a 4-bit ARGB4444 buffer (little-endian u16 per pixel) to RGBA8888. */
    public static fromArgb4444(name: string, width: number, height: number, raw: Uint8Array): TexImage {
        const n    = width * height;
        const need = n * 2;

        if (raw.byteLength < need) {
            throw new RangeError(`TexImage.fromArgb4444: ${name} expected ${need} bytes, got ${raw.byteLength}`);
        }

        const dv  = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const out = new Uint8ClampedArray(n * 4);

        for (let i = 0; i < n; i++) {
            const w = dv.getUint16(i * 2, true);
            const o = i * 4;

            out[o]     = ((w >> 8) & 0xf) * 17; // R (nibble → 8-bit, 15→255)
            out[o + 1] = ((w >> 4) & 0xf) * 17; // G
            out[o + 2] = (w & 0xf) * 17;        // B
            out[o + 3] = ((w >> 12) & 0xf) * 17; // A
        }

        return new TexImage(name, width, height, out);
    }

    /** Raw 32bpp (TGA-order BGRA per pixel) → RGBA8888. */
    public static from32bpp(name: string, width: number, height: number, raw: Uint8Array): TexImage {
        const n    = width * height;
        const need = n * 4;

        if (raw.byteLength < need) {
            throw new RangeError(`TexImage.from32bpp: ${name} expected ${need} bytes, got ${raw.byteLength}`);
        }

        const out = new Uint8ClampedArray(n * 4);

        for (let i = 0; i < n; i++) {
            const o = i * 4;

            out[o]     = raw[o + 2]!; // R ← B
            out[o + 1] = raw[o + 1]!; // G
            out[o + 2] = raw[o]!;     // B ← R
            out[o + 3] = raw[o + 3]!; // A
        }

        return new TexImage(name, width, height, out);
    }

}
