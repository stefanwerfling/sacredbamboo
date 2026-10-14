/**
 * Research script — test WldCell @0x1E (pathFlags) against the reference's
 * WorldPathFlags (hint only; confirmed empirically here):
 *   0x01 Indoor · 0x02 Town · 0x04 Trigger · 0x08 RuntimeBlocked
 *   0x10 FootprintAnimation (runtime) · 0x20/0x40/0x80 unresolved
 *
 * Checks:
 *   - value histogram + per-bit counts.
 *   - Indoor(0x01) vs indoorAnchorDelta(@0x1C/0x1D) non-zero — an authored
 *     indoor tile should carry an anchor delta. Confusion matrix.
 *   - runtime bits 0x08/0x10 should be ~absent in authored static data.
 *   - Indoor(0x01) vs keyx EnvironmentFlags dungeon correlation per sector.
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/verify_path_flags.ts
 */
import {open, FileHandle} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IRandomAccess, WlkReader, WldReader, WldSector, WlkSector} from '../src/index.js';

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
const keyxBlob = await wlk.readAllSectorsBlob();
const wld = new WldReader(await NodeRA.open(`${WORLD_DIR}/sectors.wldx`));
await wld.open(await wlk.getWldxSectorIndex());

const BITS: [number, string][] = [
    [0x01, 'Indoor'], [0x02, 'Town'], [0x04, 'Trigger'], [0x08, 'RuntimeBlocked'],
    [0x10, 'FootprintAnim'], [0x20, 'Byte20'], [0x40, 'Byte40'], [0x80, 'Byte80']
];

const valHist = new Map<number, number>();
const bitCount = new Map<number, number>();
let cells = 0;
// Indoor vs anchor confusion
let indoorAndAnchor = 0, indoorNoAnchor = 0, anchorNoIndoor = 0;
// Indoor cells in dungeon vs non-dungeon sectors (keyx EnvironmentFlags bit?)
let indoorInDungeon = 0, indoorInOutdoor = 0;

for (let si = 0; si < wld.getSectorCount(); si += 5) {
    const sec = WldSector.parse(await wld.readSector(si));
    const env = new DataView(keyxBlob).getUint32(si * WlkReader.SECTOR_SIZE + WlkSector.ENV_FLAGS_OFFSET, true) >>> 0;

    for (let c = 0; c < sec.cellCount(); c++) {
        const cell = sec.getCell(c);
        const pf   = cell.pathFlags;

        cells++;
        valHist.set(pf, (valHist.get(pf) ?? 0) + 1);
        for (const [bit] of BITS) {if (pf & bit) {bitCount.set(bit, (bitCount.get(bit) ?? 0) + 1);}}

        const indoor = (pf & 0x01) !== 0;
        const anchor = cell.indoorAnchorDeltaX !== 0 || cell.indoorAnchorDeltaY !== 0;

        if (indoor && anchor)  {indoorAndAnchor++;}
        if (indoor && !anchor) {indoorNoAnchor++;}
        if (!indoor && anchor) {anchorNoIndoor++;}

        // Tentative dungeon test: any env-flags bit set (refine once bit known).
        if (indoor) {if (env !== 0) {indoorInDungeon++;} else {indoorInOutdoor++;}}
    }
}

console.log(`sampled ${cells} cells\n`);
console.log('pathFlags per-bit set counts:');
for (const [bit, name] of BITS) {
    const n = bitCount.get(bit) ?? 0;

    console.log(`  0x${bit.toString(16).padStart(2, '0')} ${name.padEnd(14)} ${n}  (${(100 * n / cells).toFixed(2)}%)`);
}

console.log('\npathFlags value histogram (top 12):');
console.log('  ' + [...valHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `0x${k.toString(16)}×${v}`).join('  '));

const indoorTotal = indoorAndAnchor + indoorNoAnchor;

console.log(`\nIndoor(0x01) vs indoorAnchorDelta≠0:`);
console.log(`  Indoor & anchor:   ${indoorAndAnchor}`);
console.log(`  Indoor & NO anchor:${indoorNoAnchor}`);
console.log(`  anchor & NOT indoor:${anchorNoIndoor}`);
console.log(`  → of ${indoorTotal} Indoor cells, ${indoorTotal ? (100 * indoorAndAnchor / indoorTotal).toFixed(1) : '-'}% carry an anchor delta`);
console.log(`\nIndoor cells by sector env: env≠0 ${indoorInDungeon}  env==0 ${indoorInOutdoor}`);
console.log('done');
