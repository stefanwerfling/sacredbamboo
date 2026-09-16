/**
 * Common header for the Sacred Gold PAK-family containers.
 *
 * Verified magics seen on disk:
 *   "PAK"  v? — not yet observed; placeholder
 *   "SND"  v? — sound (per PAKExtractor.pas)
 *   "TEX"  v1 — textures (per sacred_tex_extractor.c)
 *   "MDL"  v? — models (per PAKExtractor.pas)
 *   "OBJ"  v1 — Floor.PAK, Static.PAK
 *   "TRG"  v1 — Triggers.PAK
 *   "WLD"  v5 — sectors.wldx (different inner layout — handled separately)
 *   "WLK"  v5 — sectors.keyx (different inner layout — handled separately)
 *
 * For TEX/SND/MDL/OBJ/TRG the layout sacred_tex_extractor.c documents holds:
 *   byte  0..2   3-byte ASCII signature
 *   byte  3      version
 *   byte  4..7   uint32 entryCount
 *   byte  8..11  uint32 u04 (unknown — possibly file-size or table-size)
 *   byte 12..255 padding (244 bytes; brings header to 0x100)
 *   byte 0x100   start of entry table — 12 bytes per entry:
 *                  uint32 type
 *                  uint32 offset
 *                  uint32 length
 *
 * WLD/WLK use the same first 4 bytes but the rest is different and is parsed
 * by a dedicated reader.
 */

export class PakHeaderParseError extends Error {

    public constructor(public readonly reason: string) {
        super(`PAK header parse failed: ${reason}`);
    }

}

export class PakHeader {

    public static readonly SIZE = 0x100;

    public constructor(
        public readonly signature:  string,
        public readonly version:    number,
        public readonly entryCount: number,
        public readonly u04:        number
    ) {}

    /**
     * Parse the 256-byte header from a buffer that contains *at least* the
     * first `PakHeader.SIZE` bytes of the file. Does not validate the
     * signature against any specific allow-list — callers that expect a
     * particular container check `header.signature` themselves.
     */
    public static parse(buf: ArrayBuffer): PakHeader {
        if (buf.byteLength < PakHeader.SIZE) {
            throw new PakHeaderParseError(
                `need at least ${PakHeader.SIZE} bytes, got ${buf.byteLength}`
            );
        }

        const view  = new DataView(buf);
        const bytes = new Uint8Array(buf, 0, 4);
        const sig   = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);

        return new PakHeader(
            sig,
            bytes[3]!,
            view.getUint32(4, true),
            view.getUint32(8, true)
        );
    }

}

export class PakEntry {

    public static readonly SIZE = 12;

    public constructor(
        /** Zero-based index in the entry table. */
        public readonly index:  number,
        /** type tag (meaning depends on the container — for TEX it's $20=wav $21=mp3 etc.). */
        public readonly type:   number,
        /** Absolute byte offset of this entry's payload inside the container. */
        public readonly offset: number,
        /** Payload length in bytes (compressed size for TEX). */
        public readonly length: number
    ) {}

    /**
     * Parse one entry-table row out of a buffer positioned at the table
     * start. `tableBuf` must hold at least `(index+1) * PakEntry.SIZE` bytes;
     * the read is relative to `tableBuf`'s start, not the file.
     */
    public static parse(tableBuf: ArrayBuffer, index: number): PakEntry {
        const off  = index * PakEntry.SIZE;
        const view = new DataView(tableBuf, off, PakEntry.SIZE);

        return new PakEntry(
            index,
            view.getUint32(0, true),
            view.getUint32(4, true),
            view.getUint32(8, true)
        );
    }

    /** All three fields non-zero. Matches PAKExtractor.pas's validity check. */
    public isNonZero(): boolean {
        return this.type !== 0 && this.offset !== 0 && this.length !== 0;
    }

    /** This entry's payload fits inside a file of `fileSize` bytes. */
    public fitsInFile(fileSize: number): boolean {
        return this.offset + this.length <= fileSize;
    }

}