/**
 * Research script — empirically decode the still-unnamed fields of a keyx
 * sector entry (0x300 B), using Aytackydln/SacredEngineRemake's KeyxSectorRecord
 * ONLY as a hint for which offsets to look at (reference-only — we confirm
 * every claim against the retail file + ground truth here).
 *
 * Ground truth per sector:
 *   - gridIndex @0x20 → (row, col) = (idx/100, idx%100)
 *   - the inflated wldx stream begins "Sector <col>,<row>" — independent (col,row)
 *
 * Candidate fields probed (ref names in comments):
 *   @0x24 Id/ordinal · @0x28 ServerRevisionId · @0x2C..0x3C Neighbors(surround)
 *   @0x3C RawX · @0x40 RawY · @0x44 RawEndX · @0x48 RawEndY
 *   @0x1CC EnvironmentFlags · @0x1D8 NatureType · @0x2E0/@0x2E1 LiquidStyleA/B
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/inspect_keyx_fields.ts
 */
import {open, FileHandle}  from 'node:fs/promises';
import {resolve, dirname}  from 'node:path';
import {fileURLToPath}     from 'node:url';
import {IRandomAccess, WlkReader, WldReader, WldSector} from '../src/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR  = resolve(SCRIPT_DIR, '..', '..', 'work', 'Sacred Gold', 'World');

class NodeRA implements IRandomAccess {

    public static async open(path: string): Promise<NodeRA> {
        const fh   = await open(path, 'r');
        const stat = await fh.stat();

        return new NodeRA(fh, stat.size);
    }

    private constructor(private readonly _fh: FileHandle, private readonly _size: number) {}

    public size(): number {
        return this._size;
    }

    public async read(offset: number, length: number): Promise<ArrayBuffer> {
        const buf = Buffer.allocUnsafe(length);
        const r   = await this._fh.read(buf, 0, length, offset);

        if (r.bytesRead !== length) {throw new Error(`short read @${offset}`);}

        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    public async close(): Promise<void> {
        await this._fh.close();
    }

}

const wlk = new WlkReader(await NodeRA.open(`${WORLD_DIR}/sectors.keyx`));
await wlk.open();
const h    = wlk.getHeader();
const blob = await wlk.readAllSectorsBlob();
const view = new DataView(blob);

const wld = new WldReader(await NodeRA.open(`${WORLD_DIR}/sectors.wldx`));
await wld.open(await wlk.getWldxSectorIndex());

const u32 = (base: number, off: number): number => view.getUint32(base + off, true);
const i32 = (base: number, off: number): number => view.getInt32(base + off, true);
const i16 = (base: number, off: number): number => view.getInt16(base + off, true);
const u8  = (base: number, off: number): number => view.getUint8(base + off);

console.log(`keyx ${h.sectorCount} sectors · header origin A=${h.worldOriginA} B=${h.worldOriginB} · grid ${h.gridWidth}×${h.gridHeight}\n`);

// --- Detail dump for a handful of sectors spanning the grid ---
const sample = [0, 1, 29, 30, 100, 1000, 3000, 6049];

for (const si of sample) {
    const base = si * WlkReader.SECTOR_SIZE;
    const gi   = u32(base, 0x20);
    const row  = Math.floor(gi / h.gridWidth);
    const col  = gi % h.gridWidth;
    const name = WldSector.parse(await wld.readSector(si)).getName();

    // Neighbors region 0x2C..0x3C as both int16[8] and int32[4]
    const nb16 = [0, 2, 4, 6, 8, 10, 12, 14].map((o) => i16(base, 0x2C + o));
    const nb32 = [0, 4, 8, 12].map((o) => i32(base, 0x2C + o));

    console.log(`#${si}  gridIndex=${gi} → (row ${row}, col ${col})   wldx name="${name}"`);
    console.log(`   @0x24 Id=${u32(base, 0x24)}  @0x28 Rev=${u32(base, 0x28)}`);
    console.log(`   @0x2C neighbors i16[8]=[${nb16.join(', ')}]`);
    console.log(`         neighbors i32[4]=[${nb32.join(', ')}]`);
    console.log(`   @0x3C RawX=${i32(base, 0x3C)} RawY=${i32(base, 0x40)}  RawEndX=${i32(base, 0x44)} RawEndY=${i32(base, 0x48)}`);
    console.log(`   @0x1CC EnvFlags=0x${(u32(base, 0x1CC) >>> 0).toString(16)}  @0x1D8 NatureType=${u8(base, 0x1D8)}  @0x2E0/1 Liquid=${u8(base, 0x2E0)}/${u8(base, 0x2E1)}`);
    console.log('');
}

// --- Correlate RawX/RawY with (row,col) across ALL sectors ---
// Hypothesis: RawX, RawY are a linear function of col, row (sector grid → world).
// Fit stride by comparing consecutive sectors that differ by one grid step.
let rawXeqOriginPlusCol = 0, rawYeqOriginPlusRow = 0;
const strideXset = new Set<number>(), strideYset = new Set<number>();
let prevRow = -1, prevCol = -1, prevRawX = 0, prevRawY = 0;
const envFlagHist = new Map<number, number>();
const natureHist  = new Map<number, number>();

for (let si = 0; si < h.sectorCount; si++) {
    const base = si * WlkReader.SECTOR_SIZE;
    const gi   = u32(base, 0x20);
    const row  = Math.floor(gi / h.gridWidth);
    const col  = gi % h.gridWidth;
    const rawX = i32(base, 0x3C);
    const rawY = i32(base, 0x40);

    // header origin + col*stride?  check a couple candidate strides
    if (rawX === h.worldOriginA + col * 1024) {rawXeqOriginPlusCol++;}
    if (rawY === h.worldOriginB - row * 1024) {rawYeqOriginPlusRow++;}

    if (si > 0 && row === prevRow && col === prevCol + 1) {strideXset.add(rawX - prevRawX);}
    if (si > 0 && col === prevCol && row === prevRow + 1) {strideYset.add(rawY - prevRawY);}

    const ef = u32(base, 0x1CC) >>> 0;
    envFlagHist.set(ef, (envFlagHist.get(ef) ?? 0) + 1);
    const nt = u8(base, 0x1D8);
    natureHist.set(nt, (natureHist.get(nt) ?? 0) + 1);

    prevRow = row; prevCol = col; prevRawX = rawX; prevRawY = rawY;
}

console.log('--- correlations over all sectors ---');
console.log(`RawX == originA + col*1024 : ${rawXeqOriginPlusCol}/${h.sectorCount}`);
console.log(`RawY == originB - row*1024 : ${rawYeqOriginPlusRow}/${h.sectorCount}`);
console.log(`RawX deltas for col+1 steps: {${[...strideXset].slice(0, 8).join(', ')}}${strideXset.size > 8 ? ' …' : ''} (distinct=${strideXset.size})`);
console.log(`RawY deltas for row+1 steps: {${[...strideYset].slice(0, 8).join(', ')}}${strideYset.size > 8 ? ' …' : ''} (distinct=${strideYset.size})`);

const top = (m: Map<number, number>, n: number): string =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([k, v]) => `0x${(k >>> 0).toString(16)}×${v}`).join('  ');

console.log(`EnvFlags distinct=${envFlagHist.size}  top: ${top(envFlagHist, 8)}`);
console.log(`NatureType distinct=${natureHist.size}  top: ${top(natureHist, 8)}`);

// --- Confirm Neighbors = int16[8] of @0x24 Id, each spatially adjacent ---
// Build Id → (row,col) and sectorArrayIndex → (row,col) maps.
const idToRC = new Map<number, {row: number; col: number}>();

for (let si = 0; si < h.sectorCount; si++) {
    const base = si * WlkReader.SECTOR_SIZE;
    const gi   = u32(base, 0x20);

    idToRC.set(u32(base, 0x24), {row: Math.floor(gi / h.gridWidth), col: gi % h.gridWidth});
}

let nbTotal = 0, nbValidId = 0, nbAdjacent = 0, nbSelfRefLast = 0;

for (let si = 0; si < h.sectorCount; si++) {
    const base = si * WlkReader.SECTOR_SIZE;
    const gi   = u32(base, 0x20);
    const row  = Math.floor(gi / h.gridWidth);
    const col  = gi % h.gridWidth;
    const myId = u32(base, 0x24);

    for (let k = 0; k < 8; k++) {
        const v = view.getUint16(base + 0x2C + k * 2, true);

        if (v === 0) {continue;}

        // Slot 7 (@0x3A) frequently equals the sector's own Id — note separately.
        if (k === 7 && v === myId) {nbSelfRefLast++; continue;}

        nbTotal++;
        const rc = idToRC.get(v);

        if (rc) {
            nbValidId++;
            if (Math.abs(rc.row - row) <= 1 && Math.abs(rc.col - col) <= 1) {nbAdjacent++;}
        }
    }
}

console.log(`\n--- Neighbors (int16[8] @0x2C), excluding slot7-self-ref (${nbSelfRefLast} sectors) ---`);
console.log(`non-zero neighbor refs: ${nbTotal}  valid Id: ${nbValidId}  spatially adjacent: ${nbAdjacent}`);

// --- Confirm RawX/RawY linear in col/row (stride ~3434.6, origin ~0) ---
let rawFit = 0;
const STRIDE = 340025 / 99; // = world span over 99 grid steps

for (let si = 0; si < h.sectorCount; si++) {
    const base = si * WlkReader.SECTOR_SIZE;
    const gi   = u32(base, 0x20);
    const row  = Math.floor(gi / h.gridWidth);
    const col  = gi % h.gridWidth;

    if (Math.abs(i32(base, 0x3C) - col * STRIDE) < 2 && Math.abs(i32(base, 0x40) - row * STRIDE) < 2) {rawFit++;}
}

console.log(`RawX≈col×${STRIDE.toFixed(3)} AND RawY≈row×same (±2): ${rawFit}/${h.sectorCount}`);
console.log('done');
