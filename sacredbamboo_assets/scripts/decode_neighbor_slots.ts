/**
 * Research script — pin each of the 8 neighbor slots (`WlkSector.neighbors`,
 * uint16[8] @0x2C) to a compass direction.
 *
 * For every sector and every non-zero neighbor slot k, look up the neighbor's
 * (row,col) by its ordinal and record the delta (dRow, dCol) relative to this
 * sector. If slot k is a fixed direction, its delta histogram collapses to one
 * (dRow,dCol). Prints the per-slot histogram so the mapping is self-evident.
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/decode_neighbor_slots.ts
 */
import {open, FileHandle} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IRandomAccess, WlkReader, WlkSector} from '../src/index.js';

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
const h    = wlk.getHeader();
const blob = await wlk.readAllSectorsBlob();

// Parse all sectors once; build ordinal → (row,col).
const sectors: WlkSector[] = [];
const rc = new Map<number, {row: number; col: number}>();

for (let i = 0; i < h.sectorCount; i++) {
    const s = WlkSector.parse(blob, i * WlkReader.SECTOR_SIZE);

    sectors.push(s);
    rc.set(s.ordinal, {row: s.row(h.gridWidth), col: s.col(h.gridWidth)});
}

// Per-slot delta histogram.
const perSlot: Map<string, number>[] = Array.from({length: WlkSector.NEIGHBOR_COUNT}, () => new Map());

for (const s of sectors) {
    const me = rc.get(s.ordinal)!;

    for (let k = 0; k < WlkSector.NEIGHBOR_COUNT; k++) {
        const ord = s.neighbors[k]!;

        if (ord === 0) {continue;}

        const n = rc.get(ord);

        if (!n) {continue;}

        const key = `${n.row - me.row},${n.col - me.col}`;

        perSlot[k]!.set(key, (perSlot[k]!.get(key) ?? 0) + 1);
    }
}

const DIR: Record<string, string> = {
    '-1,0': 'N', '-1,1': 'NE', '0,1': 'E', '1,1': 'SE',
    '1,0':  'S', '1,-1': 'SW', '0,-1': 'W', '-1,-1': 'NW'
};

console.log('slot → (dRow,dCol) histogram  [dominant direction]\n');
for (let k = 0; k < WlkSector.NEIGHBOR_COUNT; k++) {
    const entries = [...perSlot[k]!.entries()].sort((a, b) => b[1] - a[1]);
    const total   = entries.reduce((acc, [, v]) => acc + v, 0);
    const [topKey, topN] = entries[0] ?? ['—', 0];
    const dir     = DIR[topKey] ?? '?';
    const rest    = entries.slice(1).map(([key, v]) => `${key}×${v}`).join(' ');

    console.log(`  slot ${k}: ${topKey} ×${topN}/${total}  [${dir}]${rest ? '   other: ' + rest : ''}`);
}
console.log('\ndone');
