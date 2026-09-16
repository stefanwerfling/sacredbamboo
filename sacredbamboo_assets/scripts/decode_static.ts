/**
 * Research script — decode + verify the Static.PAK 64-byte record layout.
 * Runs against retail Static.PAK / sectors.wldx under `work/Sacred Gold/World/`.
 *
 * Findings (2026-05-22), confirmed at runtime here:
 *   - @0x00 selfIndex, @0x04 assetId (1036..30944), @0x08 = 0.
 *   - @0x0E i16 = GLOBAL isometric world X: an affine fit of the referencing
 *     cell's (row,col) gives X ≈ 48*(col-row) + k, RMS ≈ 1 cell, with k tracking
 *     the sector's world position (global, not sector-local).
 *   - @0x12 i16 = world Y (2:1 iso depth axis). @0x0C i16 small (z/layer),
 *     @0x10 i16 = -2 const.
 *   - WldCell.staticIndexA/B pack the Static index in the low 20 bits; upper
 *     bits are flags (mask 0xFFFFF validates all out-of-range references).
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/decode_static.ts
 */
import {open}             from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {IRandomAccess, WldReader, WldSector, WldCell, ObjReader, StaticRecord} from '../src/index.js';

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

const sta = new ObjReader(await NodeRA.open(`${WORLD}/Static.PAK`)); await sta.open();
const wld = new WldReader(await NodeRA.open(`${WORLD}/sectors.wldx`)); await wld.open();
const staticCount = sta.getRecordCount();

console.log(`Static.PAK ${staticCount} × 64B · WLD ${wld.getSectorCount()} sectors`);

// 1) staticIndexB flag/index split: mask 0xFFFFF must validate every out-of-range ref.
let over = 0, masked = 0;

for (const si of [1, 2, 3, 100, 1000, 2000, 3000, 4000]) {
    const sec = WldSector.parse(await wld.readSector(si));

    for (let c = 0; c < sec.cellCount(); c++) {
        const raw = sec.getCell(c).staticIndexB;

        if (raw !== 0 && raw >= staticCount) {
            over++;
            if ((raw & WldCell.STATIC_INDEX_MASK) < staticCount) {masked++;}
        }
    }
}

console.log(`staticIndexB out-of-range: ${over}; recovered via 20-bit mask: ${masked}/${over}`);

// 2) affine fit of worldX (@0x0e i16) vs cell (row,col) over populated sectors.
const fitX = async (si: number): Promise<void> => {
    const sec = WldSector.parse(await wld.readSector(si));
    const cs: number[] = [], rs: number[] = [], vs: number[] = [];

    for (let c = 0; c < sec.cellCount(); c++) {
        const cell = sec.getCell(c);
        const idx  = cell.staticA();

        if (idx === 0 || idx >= staticCount) {continue;}

        vs.push(StaticRecord.parse(await sta.readRecord(idx)).worldX);
        cs.push(c % 64); rs.push(Math.floor(c / 64));
    }

    const n = vs.length; if (n < 30) {return;}
    let Scc=0,Scr=0,Sc=0,Srr=0,Sr=0,Svc=0,Svr=0,Sv=0;

    for (let i=0;i<n;i++){const c=cs[i]!,r=rs[i]!,v=vs[i]!;Scc+=c*c;Scr+=c*r;Sc+=c;Srr+=r*r;Sr+=r;Svc+=v*c;Svr+=v*r;Sv+=v;}
    const M=[[Scc,Scr,Sc],[Scr,Srr,Sr],[Sc,Sr,n]]; const Y=[Svc,Svr,Sv];
    const det=(m:number[][])=>m[0]![0]!*(m[1]![1]!*m[2]![2]!-m[1]![2]!*m[2]![1]!)-m[0]![1]!*(m[1]![0]!*m[2]![2]!-m[1]![2]!*m[2]![0]!)+m[0]![2]!*(m[1]![0]!*m[2]![1]!-m[1]![1]!*m[2]![0]!);
    const D=det(M); const rep=(col:number)=>{const m=M.map((row)=>row.slice());for(let i=0;i<3;i++)m[i]![col]=Y[i]!;return det(m)/D;};
    const a=rep(0),b=rep(1),k=rep(2); let ss=0; for(let i=0;i<n;i++){const e=vs[i]!-(a*cs[i]!+b*rs[i]!+k);ss+=e*e;}

    console.log(`  sector#${si.toString().padStart(4)} "${sec.getName()}"  worldX ≈ ${a.toFixed(1)}*col ${b>=0?'+':''}${b.toFixed(1)}*row + ${k.toFixed(0)}  RMS=${Math.sqrt(ss/n).toFixed(1)} (n=${n})`);
};

console.log(`\nworldX affine fit (slope ~const, intercept tracks sector ⇒ global iso coords):`);
for (const si of [1, 3, 4, 6]) {await fitX(si);}

console.log('done');
