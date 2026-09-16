import {WldCell} from './WldCell.js';

/**
 * Typed view over one inflated WLD-sector blob — what `WldReader.readSector(i)`
 * returns. Layout empirically pinned down (2026-05-22, retail Sacred Gold):
 *
 *   @0x00..0x1f    32-byte name block
 *     @0x00..0x0b    "Sector <col>,<row>\0" ASCII (variable length, null-terminated)
 *     @0x0c..0x1f    0xCD heap-fill padding (MSVC uninit marker leaked by packer)
 *   @0x20..0x20020  4096 (= 64×64) {@link WldCell} records of 32 bytes, in
 *                   row-major order (cell index = row*64 + col). This is the
 *                   sector→records linkage (Floor + Static indices per cell).
 *   @0x20020..0x20144  292-byte sector trailer:
 *     trailer @0x04 = row × 64 (sector's world-cell Y origin), @0x0c = 6 (const).
 *   base_end = 0x20144 = 131,396 for ~94 % of sectors (matches WLK `@+0x50`
 *   stride). The other ~6 % append extra data past base_end (`getTail()`).
 */
export class WldSector {

    public static readonly NAME_BLOCK_SIZE = 0x20;
    public static readonly BASE_BODY_SIZE  = 0x20144;
    public static readonly CELL_GRID       = 64;
    public static readonly CELL_COUNT      = 4096; // 64 × 64
    public static readonly TRAILER_SIZE    = 292;

    public constructor(public readonly raw: Uint8Array) {}

    public static parse(buf: Uint8Array | ArrayBuffer): WldSector {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

        if (u8.byteLength < WldSector.NAME_BLOCK_SIZE) {
            throw new RangeError(
                `WldSector.parse: need at least ${WldSector.NAME_BLOCK_SIZE} bytes, got ${u8.byteLength}`
            );
        }

        return new WldSector(u8);
    }

    /**
     * The "Sector <col>,<row>" ASCII string at the start of the blob. Reads
     * until the first non-printable or null byte, or until `NAME_BLOCK_SIZE`,
     * whichever comes first.
     */
    public getName(): string {
        let end = 0;

        while (end < WldSector.NAME_BLOCK_SIZE
            && end < this.raw.length
            && this.raw[end]! >= 0x20
            && this.raw[end]! < 0x7f) {
            end++;
        }

        let s = '';

        for (let i = 0; i < end; i++) {
            s += String.fromCharCode(this.raw[i]!);
        }

        return s;
    }

    /** Full 32-byte name block (name + 0xCD padding). */
    public getNameBlock(): Uint8Array {
        return this.raw.subarray(0, WldSector.NAME_BLOCK_SIZE);
    }

    /** Everything after the name block — sub-records and (if present) variable tail. */
    public getBody(): Uint8Array {
        return this.raw.subarray(WldSector.NAME_BLOCK_SIZE);
    }

    /** Total inflated size of this sector's blob. */
    public getSize(): number {
        return this.raw.byteLength;
    }

    /** True for the ~94 % of sectors with the minimal 131,396-byte layout. */
    public isBaseSized(): boolean {
        return this.raw.byteLength === WldSector.BASE_BODY_SIZE;
    }

    /** Bytes past `BASE_BODY_SIZE`, empty when `isBaseSized()` is true. */
    public getTail(): Uint8Array {
        if (this.raw.byteLength <= WldSector.BASE_BODY_SIZE) {
            return new Uint8Array(0);
        }

        return this.raw.subarray(WldSector.BASE_BODY_SIZE);
    }

    /** Number of cell records available in this blob (normally `CELL_COUNT`). */
    public cellCount(): number {
        const avail = this.raw.byteLength - WldSector.NAME_BLOCK_SIZE;

        return Math.min(WldSector.CELL_COUNT, Math.max(0, Math.floor(avail / WldCell.SIZE)));
    }

    /** Parse the cell record at grid index `index` (row*64 + col). */
    public getCell(index: number): WldCell {
        if (index < 0 || index >= this.cellCount()) {
            throw new RangeError(`WldSector.getCell: index ${index} out of range 0..${this.cellCount() - 1}`);
        }

        return WldCell.parse(this.raw, WldSector.NAME_BLOCK_SIZE + index * WldCell.SIZE);
    }

    /** Parse the cell at (`row`, `col`) within the 64×64 grid. */
    public getCellAt(row: number, col: number): WldCell {
        if (row < 0 || row >= WldSector.CELL_GRID || col < 0 || col >= WldSector.CELL_GRID) {
            throw new RangeError(`WldSector.getCellAt: (${row},${col}) out of 64×64 grid`);
        }

        return this.getCell(row * WldSector.CELL_GRID + col);
    }

    /**
     * The 292-byte sector trailer between the cell grid and `BASE_BODY_SIZE`
     * (trailer `@0x04` = row × 64, `@0x0c` = 6). Empty if the blob is too short.
     */
    public getTrailer(): Uint8Array {
        const start = WldSector.NAME_BLOCK_SIZE + WldSector.CELL_COUNT * WldCell.SIZE;

        if (this.raw.byteLength < start) {
            return new Uint8Array(0);
        }

        return this.raw.subarray(start, WldSector.BASE_BODY_SIZE);
    }

}