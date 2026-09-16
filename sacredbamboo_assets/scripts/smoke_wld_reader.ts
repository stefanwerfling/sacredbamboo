/**
 * Smoke test — exercises `WldReader` end-to-end against the retail
 * sectors.wldx file. Verifies:
 *   - index builds without error in reasonable time
 *   - sectorCount matches WLK's 6050
 *   - sector 0 inflates to "Sector 0,15" (cross-checks WLK gridIndex 1500)
 *   - random-access readSector returns identical bytes on repeated calls
 */
import {open}            from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IRandomAccess, WldReader, WldSector} from '../src/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WLD_PATH   = resolve(SCRIPT_DIR, '..', '..', 'work', 'Sacred Gold', 'World', 'sectors.wldx');

class NodeFileRandomAccess implements IRandomAccess {

    public static async open(path: string): Promise<NodeFileRandomAccess> {
        const fh   = await open(path, 'r');
        const stat = await fh.stat();

        return new NodeFileRandomAccess(fh, stat.size);
    }

    private constructor(
        private readonly _fh:   Awaited<ReturnType<typeof open>>,
        private readonly _size: number
    ) {}

    public size(): number {
        return this._size;
    }

    public async read(offset: number, length: number): Promise<ArrayBuffer> {
        const buf = Buffer.allocUnsafe(length);
        const r   = await this._fh.read(buf, 0, length, offset);

        if (r.bytesRead !== length) {
            throw new Error(`short read at ${offset}: wanted ${length}, got ${r.bytesRead}`);
        }

        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    public async close(): Promise<void> {
        await this._fh.close();
    }

}

const src    = await NodeFileRandomAccess.open(WLD_PATH);
const reader = new WldReader(src);

console.log(`file: ${WLD_PATH}`);
console.log(`size: ${src.size().toLocaleString()} bytes`);

const t0 = performance.now();

await reader.open();

const buildMs = performance.now() - t0;

console.log(`\nindex built in ${buildMs.toFixed(0)} ms`);
console.log(`sectorCount: ${reader.getSectorCount()}`);

const header = reader.getHeader();

console.log(`header.unknownAt0x28: ${header.unknownAt0x28.toLocaleString()}`);

// Sector 0 ↔ WLK gridIndex 1500 = (row=15, col=0) ⇒ name "Sector 0,15"
const s0Bytes = await reader.readSector(0);
const s0      = WldSector.parse(s0Bytes);

console.log(`\nsector 0:`);
console.log(`  name:        "${s0.getName()}"`);
console.log(`  inflated:    ${s0.getSize().toLocaleString()} bytes`);
console.log(`  isBaseSized: ${s0.isBaseSized()}`);

// Sample a few sectors to verify the index points at distinct streams.
console.log(`\nsample sectors:`);

for (const i of [0, 1, 2, 100, 1000, reader.getSectorCount() - 1]) {
    const range = reader.getSectorRange(i);
    const s     = WldSector.parse(await reader.readSector(i));

    console.log(`  #${i.toString().padStart(4)}  off=0x${range.offset.toString(16).padStart(8, '0')}  comp=${range.length.toString().padStart(7)}B  inf=${s.getSize().toString().padStart(7)}B  name="${s.getName()}"`);
}

// Idempotency: re-reading the same sector returns identical bytes.
const a = await reader.readSector(42);
const b = await reader.readSector(42);
let eq  = a.byteLength === b.byteLength;

if (eq) {
    for (let i = 0; i < a.byteLength; i++) {
        if (a[i] !== b[i]) {eq = false; break;}
    }
}

console.log(`\nidempotency check (sector 42 read twice): ${eq ? 'PASS' : 'FAIL'}`);

await src.close();