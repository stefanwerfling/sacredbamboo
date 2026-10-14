/**
 * Research script — settle whether WldCell @0x04 and @0x0C are Static.PAK
 * references (low-20-bit index + flag bits, our model) or Floor.PAK indices
 * (full ~23-bit index, as the reference labels @0x0C a Floor overlay chain).
 *
 * Discriminator: Static.PAK has 1,038,014 records (fits 20 bits, max 0xFD7FE);
 * Floor.PAK has 6,713,136 (needs 23 bits, max 0x666330). If a lane's RAW u32
 * values exceed 0xFFFFF as plain indices (rather than small flags in the top
 * bits), it indexes Floor, not Static.
 *
 * Reports per lane: raw min/max, how many raw values exceed 0xFFFFF, the
 * distribution of the top bits (raw >>> 20), and a Floor-record sanity check
 * (is Floor[raw] a non-uninit record?).
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/discriminate_cell_refs.ts
 */
import {open, FileHandle} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IRandomAccess, WlkReader, WldReader, WldSector, ObjReader, FloorRecord, StaticRecord} from '../src/index.js';

const WORLD_DIR    = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'work', 'Sacred Gold', 'World');
const STATIC_COUNT = 1_038_014;

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
const floor = new ObjReader(await NodeRA.open(`${WORLD_DIR}/Floor.PAK`));
await floor.open();

console.log(`Floor.PAK records: ${floor.getRecordCount()}  ·  Static.PAK count (ref): ${STATIC_COUNT}\n`);

interface Lane {min: number; max: number; nonZero: number; over20bit: number; topBits: Map<number, number>; samples: number[]}
const mkLane = (): Lane => ({min: Infinity, max: 0, nonZero: 0, over20bit: 0, topBits: new Map(), samples: []});
const lanes: Record<string, Lane> = {'@0x00': mkLane(), '@0x04': mkLane(), '@0x0C': mkLane()};

const feed = (lane: Lane, raw: number): void => {
    if (raw === 0) {return;}

    lane.nonZero++;
    lane.min = Math.min(lane.min, raw);
    lane.max = Math.max(lane.max, raw);
    if (raw > 0xfffff) {lane.over20bit++; if (lane.samples.length < 6) {lane.samples.push(raw);}}
    const top = raw >>> 20;

    lane.topBits.set(top, (lane.topBits.get(top) ?? 0) + 1);
};

for (let si = 0; si < wld.getSectorCount(); si += 7) {
    const sec = WldSector.parse(await wld.readSector(si));

    for (let c = 0; c < sec.cellCount(); c++) {
        const raw = sec.raw.subarray(0x20 + c * 32, 0x20 + c * 32 + 32);
        const dv  = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

        feed(lanes['@0x00']!, dv.getUint32(0x00, true));
        feed(lanes['@0x04']!, dv.getUint32(0x04, true));
        feed(lanes['@0x0C']!, dv.getUint32(0x0c, true));
    }
}

for (const [name, l] of Object.entries(lanes)) {
    const top = [...l.topBits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, v]) => `${k}×${v}`).join(' ');

    console.log(`${name}: nonzero=${l.nonZero}  raw min=${l.min === Infinity ? '-' : l.min} max=${l.max} (0x${l.max.toString(16)})`);
    console.log(`       raw>0xFFFFF: ${l.over20bit}${l.samples.length ? '  e.g. ' + l.samples.map((s) => s.toLocaleString('de-DE')).join(', ') : ''}`);
    console.log(`       top bits (raw>>>20) histogram: ${top}`);
}

// Floor-record sanity for @0x00 and @0x0C: is the raw index a non-uninit Floor record?
const sanity = async (name: string, lane: Lane): Promise<void> => {
    const idxs = lane.samples.length ? lane.samples : [];

    if (!idxs.length) {console.log(`\n${name}: no >20-bit samples to Floor-check`); return;}

    const lines: string[] = [];

    for (const idx of idxs.slice(0, 4)) {
        if (idx >= floor.getRecordCount()) {lines.push(`  ${idx}: out of Floor range`); continue;}
        const r = FloorRecord.parse(await floor.readRecord(idx));

        lines.push(`  Floor[${idx}]: self=${r.selfIndex} asset=${r.assetId} next=${r.nextIndex}${r.isReservedUninit?.() ? ' (uninit)' : ''}`);
    }

    console.log(`\n${name} as Floor index — sanity:\n${lines.join('\n')}`);
};

await sanity('@0x0C', lanes['@0x0C']!);

// Competing hypothesis: @0x0C = {flags in top bits, 20-bit Static index}.
// Validate across ALL @0x0C refs over a sample: does low-20-bit land on a
// valid, in-range Static record (self==masked)? And how do the two readings
// score on "points at an initialised record"?
const stat = new ObjReader(await NodeRA.open(`${WORLD_DIR}/Static.PAK`));
await stat.open();

const staticSelf = async (i: number): Promise<number> => {
    const r = new Uint8Array(await stat.readRecord(i));

    return new DataView(r.buffer, r.byteOffset, r.byteLength).getUint32(0, true);
};

let maskedInRange = 0, maskedSelfOk = 0, fullFloorInRange = 0, fullFloorUninit = 0, checked = 0;

for (let si = 0; si < wld.getSectorCount(); si += 53) {
    const sec = WldSector.parse(await wld.readSector(si));

    for (let c = 0; c < sec.cellCount(); c++) {
        const raw = sec.getCell(c).staticIndexB;

        if (raw === 0) {continue;}

        checked++;
        const masked = raw & 0xfffff;

        if (masked < stat.getRecordCount()) {
            maskedInRange++;
            if (await staticSelf(masked) === masked) {maskedSelfOk++;}
        }

        if (raw < floor.getRecordCount()) {
            fullFloorInRange++;
            if (FloorRecord.parse(await floor.readRecord(raw)).isReservedUninit?.()) {fullFloorUninit++;}
        }
    }
}

console.log(`\n@0x0C hypothesis scoring over ${checked} non-zero refs (sparser sample):`);
console.log(`  Static+flags: low-20 in Static range ${maskedInRange}/${checked}; of those Static[masked].self==masked ${maskedSelfOk}/${maskedInRange}`);
console.log(`  plain Floor:  raw in Floor range ${fullFloorInRange}/${checked}; of those Floor[raw] uninitialised ${fullFloorUninit}/${fullFloorInRange}`);
void StaticRecord;
console.log('\ndone');
