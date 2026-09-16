/**
 * Research script — first look at `sectors.wldx` ("WLD\x05").
 *
 * 2026-05-21: we know sectors.keyx (WLK) encodes per-sector (row, col) + an
 * alternate ordinal, but not the records-mapping. WLD is the leading
 * candidate for "what's in each sector". File is 63,854,322 bytes — not a
 * round multiple of 6050, so layout is almost certainly header + per-sector
 * offset table + variable-length payloads.
 *
 * Output:
 *   1. Hex+ASCII of the first 512 bytes (header region).
 *   2. Decoded u32 fields at @0..@31 (signature, version, candidate counts).
 *   3. Compare candidate offset-table entries against the known sectorCount.
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/inspect_wld.ts
 */
import {open, FileHandle} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {createInflate, inflateSync} from 'node:zlib';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR  = resolve(SCRIPT_DIR, '..', '..', 'work', 'Sacred Gold', 'World');
const WLD_PATH   = `${WORLD_DIR}/sectors.wldx`;

// Known from sectors.keyx investigation:
const SECTOR_COUNT = 6050;
const GRID_W       = 100;
const GRID_H       = 100;

class HexDump {

    public static format(bytes: Uint8Array, baseOff = 0, lineWidth = 16): string {
        const lines: string[] = [];

        for (let i = 0; i < bytes.length; i += lineWidth) {
            const chunk = bytes.subarray(i, Math.min(i + lineWidth, bytes.length));
            const hex   = Array.from(chunk, (b) => b.toString(16).padStart(2, '0')).join(' ');
            const ascii = Array.from(chunk, (b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');

            lines.push(`  ${(baseOff + i).toString(16).padStart(6, '0')}  ${hex.padEnd(lineWidth * 3 - 1)}  ${ascii}`);
        }

        return lines.join('\n');
    }

}

class Inspector {

    public constructor(
        private readonly _fh:   FileHandle,
        private readonly _size: number
    ) {}

    public static async open(path: string): Promise<Inspector> {
        const fh   = await open(path, 'r');
        const stat = await fh.stat();

        return new Inspector(fh, stat.size);
    }

    public async run(): Promise<void> {
        console.log(`file: ${WLD_PATH}`);
        console.log(`size: ${this._size.toLocaleString()} bytes  (${(this._size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`note: known sector count = ${SECTOR_COUNT}, grid = ${GRID_W}×${GRID_H}\n`);

        const headerLen = 512;
        const headerBuf = await this._readBytes(0, headerLen);
        const view      = new DataView(headerBuf);
        const u8        = new Uint8Array(headerBuf);

        console.log('=== Header hex dump (first 512 bytes) ===');
        console.log(HexDump.format(u8.subarray(0, 256), 0));
        console.log('  …');
        console.log(HexDump.format(u8.subarray(496, 512), 496));
        console.log('');

        // Decode signature + version
        const sig = String.fromCharCode(u8[0]!, u8[1]!, u8[2]!);

        console.log('=== Decoded fields ===');
        console.log(`  @0   signature:  "${sig}" + version=${u8[3]!}`);

        for (let off = 4; off < 64; off += 4) {
            const u32 = view.getUint32(off, true);
            const i32 = view.getInt32(off, true);

            console.log(`  @${off.toString().padStart(3)}  u32 = ${u32.toLocaleString().padStart(13)}  (0x${u32.toString(16).padStart(8, '0')})${i32 < 0 && i32 > -1000000 ? `  i32=${i32}` : ''}`);
        }

        console.log('');

        // Look for known-magic numbers anywhere in the first 512 bytes
        console.log('=== Known-value search in first 512B ===');

        const matchU32 = (target: number, label: string): void => {
            for (let off = 0; off + 4 <= headerLen; off++) {
                if (view.getUint32(off, true) === target) {
                    console.log(`  ${label} (${target}) found at @${off} (0x${off.toString(16)})`);
                }
            }
        };

        matchU32(SECTOR_COUNT, 'sectorCount');
        matchU32(GRID_W,       'gridWidth');
        matchU32(GRID_H,       'gridHeight');
        matchU32(GRID_W * GRID_H, 'gridW*gridH');

        console.log('');

        // Plausibility: if there's an offset table starting somewhere in the
        // first 512B with SECTOR_COUNT u32 entries, that table would occupy
        // sectorCount*4 = 24200 bytes. Try assuming the table starts right
        // after a 256-byte header (PAK convention).
        const candidateStarts = [16, 32, 64, 128, 256];

        for (const ts of candidateStarts) {
            const expectedEnd = ts + SECTOR_COUNT * 4;

            if (expectedEnd > this._size) {
                continue;
            }

            const tableBuf  = await this._readBytes(ts, SECTOR_COUNT * 4);
            const tableView = new DataView(tableBuf);
            const first     = tableView.getUint32(0, true);
            const last      = tableView.getUint32((SECTOR_COUNT - 1) * 4, true);

            let monotone = true;
            let inFile   = true;
            let prev     = first;

            for (let i = 1; i < SECTOR_COUNT; i++) {
                const v = tableView.getUint32(i * 4, true);

                if (v <= prev) {monotone = false;}
                if (v >= this._size) {inFile = false;}

                prev = v;
            }

            console.log(`=== Offset-table candidate @${ts} (${SECTOR_COUNT} u32) ===`);
            console.log(`  first = ${first.toLocaleString()}  (0x${first.toString(16)})`);
            console.log(`  last  = ${last.toLocaleString()}  (0x${last.toString(16)})`);
            console.log(`  monotonically increasing? ${monotone ? 'YES' : 'no'}`);
            console.log(`  all values < fileSize (${this._size.toLocaleString()})? ${inFile ? 'YES' : 'no'}`);
            console.log('');
        }

        // Where does the data after the sparse header start?
        // The hex dump shows zeros until ~@0x1d0 then high-entropy bytes.
        // Pin the transition precisely and dump 256B around it.
        const headerScan = await this._readBytes(0, 0x400);
        const scanU8     = new Uint8Array(headerScan);
        let firstNonZeroAfter32 = -1;

        for (let i = 0x40; i < scanU8.length; i++) {
            if (scanU8[i] !== 0) {
                firstNonZeroAfter32 = i;
                break;
            }
        }

        console.log(`=== Header/payload boundary ===`);
        console.log(`  first non-zero byte after @0x40: @0x${firstNonZeroAfter32.toString(16)}  (= @${firstNonZeroAfter32})`);

        if (firstNonZeroAfter32 > 0) {
            const start = Math.max(0, firstNonZeroAfter32 - 16);

            console.log(`  hex around the transition (@0x${start.toString(16)}..@0x${(start + 128).toString(16)}):`);
            console.log(HexDump.format(scanU8.subarray(start, start + 128), start));
        }

        console.log('');

        // Look at the mystery value 2,502,517 (0x262f75) as a possible
        // section offset.
        const mystery = 2502517;

        if (mystery < this._size - 64) {
            const buf = await this._readBytes(mystery, 64);

            console.log(`=== What's at the mystery offset 0x${mystery.toString(16)} (${mystery.toLocaleString()})? ===`);
            console.log(HexDump.format(new Uint8Array(buf), mystery));
            console.log('');
        }

        // Look at the end of the file — often section trailers live there.
        const tailLen = 128;
        const tailOff = this._size - tailLen;
        const tailBuf = await this._readBytes(tailOff, tailLen);

        console.log(`=== End of file (last ${tailLen} bytes) ===`);
        console.log(HexDump.format(new Uint8Array(tailBuf), tailOff));
        console.log('');

        // The 0x78 0x9c at @0x100 is the zlib/deflate magic. Try inflating
        // the entire payload from @0x100 to EOF and report what we get.
        if (scanU8[0x100] === 0x78 && scanU8[0x101] === 0x9c) {
            console.log('=== zlib magic 0x78 0x9c detected at @0x100 — attempting full inflate ===');

            const compressedLen = this._size - 0x100;
            const compressed    = await this._readBytes(0x100, compressedLen);

            try {
                const inflated     = inflateSync(new Uint8Array(compressed));
                const inflatedSize = inflated.byteLength;

                console.log(`  compressed bytes:   ${compressedLen.toLocaleString()}`);
                console.log(`  inflated   bytes:   ${inflatedSize.toLocaleString()}`);
                console.log(`  mystery @0x28:      ${mystery.toLocaleString()}   ${mystery === inflatedSize ? '== inflatedSize ✓' : '(does not match)'}`);
                console.log(`  bytes / sector:     ${(inflatedSize / SECTOR_COUNT).toFixed(2)}`);
                console.log('');
                console.log('  first 256 bytes inflated:');
                console.log(HexDump.format(inflated.subarray(0, 256), 0));
                console.log('');
                console.log('  bytes 256..512 inflated:');
                console.log(HexDump.format(inflated.subarray(256, 512), 256));
            } catch (err) {
                console.log(`  inflate failed: ${(err as Error).message}`);
            }

            console.log('');
        }

        // Iterate all concatenated zlib streams: how many sectors total,
        // do all decompress to 131396 bytes, what's the per-sector name?
        if (scanU8[0x100] === 0x78 && scanU8[0x101] === 0x9c) {
            console.log('=== Walking all zlib streams from @0x100 ===');

            const allBuf      = await this._readBytes(0x100, this._size - 0x100);
            const all         = Buffer.from(allBuf);
            const streamEnds:  Array<{startOff: number; consumed: number; inflatedLen: number; name: string}> = [];
            let cursor        = 0;
            let streamIndex   = 0;
            const sizeHisto   = new Map<number, number>();

            while (cursor < all.length && streamIndex < SECTOR_COUNT + 4) {
                if (all[cursor] !== 0x78) {
                    console.log(`  stream ${streamIndex} stopped: byte at @0x${(0x100 + cursor).toString(16)} is 0x${all[cursor]!.toString(16)}, not 0x78`);
                    break;
                }

                const startOff = cursor;

                try {
                    const inflated = await Inspector._inflateOne(all.subarray(cursor));
                    const name     = Inspector._readCString(inflated.buf, 0, 32);

                    sizeHisto.set(inflated.buf.byteLength, (sizeHisto.get(inflated.buf.byteLength) ?? 0) + 1);

                    streamEnds.push({
                        startOff,
                        consumed:    inflated.consumed,
                        inflatedLen: inflated.buf.byteLength,
                        name
                    });

                    if (streamIndex < 5 || streamIndex >= SECTOR_COUNT - 3 || streamIndex === SECTOR_COUNT - 1) {
                        console.log(`  sec ${streamIndex.toString().padStart(4)}  fileOff=0x${(0x100 + startOff).toString(16).padStart(8, '0')}  compressed=${inflated.consumed.toString().padStart(8)}B  inflated=${inflated.buf.byteLength.toString().padStart(7)}B  name="${name}"`);
                    }

                    cursor += inflated.consumed;
                    streamIndex++;
                } catch (err) {
                    console.log(`  stream ${streamIndex} inflate failed: ${(err as Error).message}`);
                    break;
                }
            }

            console.log(`\n  total streams decoded: ${streamIndex} (expected ${SECTOR_COUNT})`);
            console.log(`  unconsumed tail:       ${all.length - cursor} bytes`);
            console.log(`  inflated-size histogram:`);

            for (const [size, count] of Array.from(sizeHisto.entries()).sort((a, b) => b[1] - a[1])) {
                console.log(`    ${size.toLocaleString().padStart(10)}B: ${count} streams`);
            }
        }
    }

    private static async _inflateOne(input: Buffer): Promise<{buf: Buffer; consumed: number}> {
        return new Promise((res, rej) => {
            const inflate: ReturnType<typeof createInflate> = createInflate();
            const chunks: Buffer[] = [];

            inflate.on('data', (c: Buffer) => chunks.push(c));
            inflate.on('end', () => {
                const consumed = input.length - inflate.bytesWritten + inflate.bytesRead;

                res({buf: Buffer.concat(chunks), consumed: inflate.bytesWritten});
            });
            inflate.on('error', rej);
            inflate.end(input);
        });
    }

    private static _readCString(buf: Buffer, off: number, maxLen: number): string {
        let end = off;

        while (end < off + maxLen && end < buf.length && buf[end] !== 0 && buf[end]! >= 0x20 && buf[end]! < 0x7f) {
            end++;
        }

        return buf.toString('latin1', off, end);
    }

    private async _readBytes(off: number, len: number): Promise<ArrayBuffer> {
        const buf = Buffer.allocUnsafe(len);
        const r   = await this._fh.read(buf, 0, len, off);

        if (r.bytesRead !== len) {
            throw new Error(`short read at ${off}: wanted ${len}, got ${r.bytesRead}`);
        }

        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    public async close(): Promise<void> {
        await this._fh.close();
    }

}

const ins = await Inspector.open(WLD_PATH);

try {
    await ins.run();
} finally {
    await ins.close();
}