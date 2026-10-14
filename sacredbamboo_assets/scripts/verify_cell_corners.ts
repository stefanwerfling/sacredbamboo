/**
 * Research script — test the reference's per-corner interpretation of the
 * WldCell bytes @0x10..0x1B (hint from SacredEngineRemake's WldxTileRecord):
 *   @0x10..0x13  VisualElevation  L/T/R/B   (sbyte)
 *   @0x14..0x17  BakedBrightness  SW/NW/NE/SE (byte; 0xFF = unoccluded)
 *   @0x18..0x1B  Elevation        SW/NW/NE/SE (sbyte; height-field)
 *
 * Headline check: if @0x18..0x1B is a terrain height-field, horizontally /
 * vertically adjacent cells must SHARE their touching corner heights. We test
 * every 4×4 corner pairing across adjacent cells and report which pairing is
 * consistent — a near-100% pairing proves the height-field reading.
 *
 * Also histograms @0x14 bytes to confirm the "steps of 0x14, else 0xFF" claim,
 * and confirms the old `extSentinel == 0xFFFFFFFF` cells are all-corners-0xFF.
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/verify_cell_corners.ts
 */
import {open, FileHandle} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IRandomAccess, WlkReader, WldReader, WldSector} from '../src/index.js';

const WORLD_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'work', 'Sacred Gold', 'World');
const GRID = 64;

class NodeRA implements IRandomAccess {

    public static async open(path: string): Promise<NodeRA> {
        const fh = await open(path, 'r'); const st = await fh.stat();

        return new NodeRA(fh, st.size);
    }

    private constructor(private readonly _fh: FileHandle, private readonly _size: number) {}

    public size(): number {
        return this._size;
    }

    public async read(o: number, l: number): Promise<ArrayBuffer> {
        const b = Buffer.allocUnsafe(l); await this._fh.read(b, 0, l, o);

        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }

    public async close(): Promise<void> {
        await this._fh.close();
    }

}

const wlk = new WlkReader(await NodeRA.open(`${WORLD_DIR}/sectors.keyx`));
await wlk.open();
const wld = new WldReader(await NodeRA.open(`${WORLD_DIR}/sectors.wldx`));
await wld.open(await wlk.getWldxSectorIndex());

// Corner byte readers (signed elevation @0x18..0x1B).
const elev = (cell: Uint8Array, i: number): number => {
    const b = cell[0x18 + i]!;

    return b > 127 ? b - 256 : b;
};

// Tally every A.corner[i] == B.corner[j] across adjacent cells.
const hPair = Array.from({length: 4}, () => new Array(4).fill(0));
const vPair = Array.from({length: 4}, () => new Array(4).fill(0));
let hCmp = 0, vCmp = 0;

const b14hist = new Map<number, number>();
let extFFcells = 0, extFFallCorners = 0, cellsSeen = 0;

for (let si = 0; si < wld.getSectorCount(); si += 11) {
    const sec = WldSector.parse(await wld.readSector(si));
    const n   = sec.cellCount();

    if (n < GRID * GRID) {continue;}

    // Raw 32-byte views for every cell.
    const raw: Uint8Array[] = [];

    for (let c = 0; c < GRID * GRID; c++) {raw.push(sec.raw.subarray(0x20 + c * 32, 0x20 + c * 32 + 32));}

    for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
            const a = raw[row * GRID + col]!;

            cellsSeen++;

            // @0x14 brightness histogram + extSentinel cross-check
            for (let i = 0; i < 4; i++) {b14hist.set(a[0x14 + i]!, (b14hist.get(a[0x14 + i]!) ?? 0) + 1);}

            const ext = (a[0x14]! | (a[0x15]! << 8) | (a[0x16]! << 16) | (a[0x17]! << 24)) >>> 0;

            if (ext === 0xffffffff) {
                extFFcells++;
                if (a[0x14] === 0xff && a[0x15] === 0xff && a[0x16] === 0xff && a[0x17] === 0xff) {extFFallCorners++;}
            }

            if (col + 1 < GRID) {
                const b = raw[row * GRID + col + 1]!;

                hCmp++;
                for (let i = 0; i < 4; i++) {for (let j = 0; j < 4; j++) {if (elev(a, i) === elev(b, j)) {hPair[i]![j]++;}}}
            }

            if (row + 1 < GRID) {
                const b = raw[(row + 1) * GRID + col]!;

                vCmp++;
                for (let i = 0; i < 4; i++) {for (let j = 0; j < 4; j++) {if (elev(a, i) === elev(b, j)) {vPair[i]![j]++;}}}
            }
        }
    }
}

const CORNER = ['SW', 'NW', 'NE', 'SE'];
const bestPairs = (m: number[][], cmp: number, label: string): void => {
    console.log(`\n${label} neighbor — corner-pair match rate (A.corner → B.corner), ${cmp} comparisons:`);
    for (let i = 0; i < 4; i++) {
        const row = m[i]!.map((v, j) => `${CORNER[j]}:${(100 * v / cmp).toFixed(0)}%`).join('  ');

        console.log(`  A.${CORNER[i]}  →  ${row}`);
    }
};

console.log(`sampled ${cellsSeen} cells`);
bestPairs(hPair, hCmp, 'horizontal (col→col+1)');
bestPairs(vPair, vCmp, 'vertical (row→row+1)');

console.log(`\n@0x14 byte values (brightness): ${[...b14hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `0x${k.toString(16)}×${v}`).join('  ')}`);
console.log(`extSentinel==0xFFFFFFFF cells: ${extFFcells}; of those all-four-corners==0xFF: ${extFFallCorners}`);
console.log('done');
