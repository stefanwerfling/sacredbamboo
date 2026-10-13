/**
 * Research script — test the WldCell @0x1F byte as a nibble-packed
 * navigation+terrain selector (hint from SacredEngineRemake's WldxTileRecord;
 * confirmed structurally here against retail sectors.wldx):
 *   low nibble  = behavior  {0 None, 1 BlockerA, 2 BlockerB, 5 StairsUp,
 *                 6 StairsDown, 7 StairsUp2, 8 StairsDown2, 9 IndoorEntry,
 *                 0xA IndoorExit}
 *   high nibble = terrain surface (0x00,0x10..0x70, 0x80 liquid marker,
 *                 0x90/0xA0 liquid A/B, 0xB0..0xF0)
 *
 * If the low nibble ONLY ever takes the documented behavior values (never
 * 3,4,0xB..0xF), the behavior-nibble reading is strongly supported.
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/verify_tile_byte.ts
 */
import {open, FileHandle} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IRandomAccess, WlkReader, WldReader, WldSector, WldCell} from '../src/index.js';

const WORLD_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'work', 'Sacred Gold', 'World');

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

const BEHAVIOR: Record<number, string> = {
    0: 'None', 1: 'BlockerA', 2: 'BlockerB', 5: 'StairsUp', 6: 'StairsDown',
    7: 'StairsUp2', 8: 'StairsDown2', 9: 'IndoorEntry', 10: 'IndoorExit'
};
const KNOWN_LOW = new Set(Object.keys(BEHAVIOR).map(Number));

const lowHist  = new Map<number, number>();
const highHist = new Map<number, number>();
let cells = 0, unknownLow = 0, sampled = 0;

// Sample ~400 sectors spread across the grid (every 15th) to keep it quick.
for (let si = 0; si < wld.getSectorCount(); si += 15) {
    const sec = WldSector.parse(await wld.readSector(si));
    const n   = sec.cellCount();

    sampled++;

    for (let c = 0; c < n; c++) {
        const b    = sec.getCell(c).getFlagsByte();
        const low  = b & 0x0f;
        const high = b & 0xf0;

        cells++;
        lowHist.set(low, (lowHist.get(low) ?? 0) + 1);
        highHist.set(high, (highHist.get(high) ?? 0) + 1);
        if (!KNOWN_LOW.has(low)) {unknownLow++;}
    }
}

const dump = (m: Map<number, number>, label: (k: number) => string): string =>
    [...m.entries()].sort((a, b) => a[0] - b[0])
        .map(([k, v]) => `0x${k.toString(16).padStart(2, '0')}${label(k)}=${v}`).join('  ');

console.log(`sampled ${sampled} sectors · ${cells} cells\n`);
console.log('low nibble (behavior):');
console.log('  ' + dump(lowHist, (k) => BEHAVIOR[k] ? `(${BEHAVIOR[k]})` : '(?)'));
console.log(`  unknown low-nibble values: ${unknownLow}/${cells}`);
console.log('\nhigh nibble (terrain surface):');
console.log('  ' + dump(highHist, () => ''));
console.log('\ndone');
