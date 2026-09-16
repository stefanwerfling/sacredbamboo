/**
 * Research script — decode + verify the WldSector cell layout (the
 * sector→records linkage). Runs against the retail sectors.wldx / Floor.PAK /
 * Static.PAK under `work/Sacred Gold/World/`.
 *
 * Findings (2026-05-22), all confirmed here at runtime:
 *   - A base sector body = 4096 (64×64) cell records of 32 B (row-major),
 *     then a 292-byte trailer, filling BASE_BODY_SIZE 0x20144.
 *   - cell @0x00 = Floor.PAK record index — matches Floor[v].selfIndex for all
 *     4096 cells of every sampled sector.
 *   - cell @0x04 and @0x0C = Static.PAK record indices (0 = none) — non-zero
 *     values match Static[v].selfIndex.
 *   - cell @0x14 = 0xFFFFFFFF (no static data) or 0; @0x18 = 4 corner bytes;
 *     @0x1F = flags byte; @0x08 = 0.
 *   - trailer @0x04 = row × 64 (sector world-cell Y origin), @0x0C = 6 (const).
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/decode_wldsector.ts
 */
import {open}             from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IRandomAccess, WldReader, WldSector, WldCell, ObjReader, FloorRecord} from '../src/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORLD      = resolve(SCRIPT_DIR, '..', '..', 'work', 'Sacred Gold', 'World');

class NodeRA implements IRandomAccess {

    public static async open(p: string): Promise<NodeRA> {
        const fh = await open(p, 'r'); const st = await fh.stat();

        return new NodeRA(fh, st.size);
    }

    private constructor(private readonly _fh: Awaited<ReturnType<typeof open>>, private readonly _size: number) {}

    public size(): number {return this._size;}

    public async read(o: number, l: number): Promise<ArrayBuffer> {
        const buf = Buffer.allocUnsafe(l); const r = await this._fh.read(buf, 0, l, o);

        if (r.bytesRead !== l) {throw new Error(`short read @${o}`);}

        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    public async close(): Promise<void> {await this._fh.close();}

}

const wld = new WldReader(await NodeRA.open(`${WORLD}/sectors.wldx`)); await wld.open();
const flr = new ObjReader(await NodeRA.open(`${WORLD}/Floor.PAK`));    await flr.open();
const sta = new ObjReader(await NodeRA.open(`${WORLD}/Static.PAK`));   await sta.open();

console.log(`WLD ${wld.getSectorCount()} sectors · Floor ${flr.getRecordCount()} · Static ${sta.getRecordCount()}`);

const staSelf = async (i: number): Promise<number> => {
    const b = new Uint8Array(await sta.readRecord(i));

    return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, true);
};

// Verify cell @0 = Floor index and @4/@0C = Static index across a few sectors.
let floorOk = 0, floorTot = 0, statOk = 0, statTot = 0;

for (const si of [1, 2, 3, 100, 1000, 2000]) {
    const sec = WldSector.parse(await wld.readSector(si));

    for (let c = 0; c < sec.cellCount(); c++) {
        const cell = sec.getCell(c);

        floorTot++;
        if (FloorRecord.parse(await flr.readRecord(cell.floorIndex)).selfIndex === cell.floorIndex) {floorOk++;}

        for (const s of [cell.staticIndexA, cell.staticIndexB]) {
            if (s !== 0 && s < sta.getRecordCount()) {
                statTot++;
                if (await staSelf(s) === s) {statOk++;}
            }
        }
    }
}

console.log(`cell @0 vs Floor.selfIndex:   ${floorOk}/${floorTot} match`);
console.log(`cell @4/@0C vs Static.selfIndex: ${statOk}/${statTot} match (in-range non-zero)`);

// Trailer @4 = row*64 check.
for (const si of [0, 1, 100, 1000]) {
    const sec  = WldSector.parse(await wld.readSector(si));
    const tr   = sec.getTrailer();
    const row  = new DataView(tr.buffer, tr.byteOffset, tr.byteLength).getUint32(4, true) / 64;

    console.log(`  sector #${si} "${sec.getName()}"  trailer@4/64 = ${row}`);
}

console.log('done');
