/**
 * Research script — verify the Static-object → sprite chain with the shipped
 * readers. Runs against retail Static.PAK / mixed.pak / texture.pak under
 * `work/Sacred Gold/`.
 *
 *   WldCell.staticA()/staticB()  (Static.PAK record index)
 *     → StaticRecord.assetId
 *     → MixedReader.getDef(assetId)   (mixed.pak "MIX" object definition)
 *     → frame.textureIndex + [x1,y1,x2,y2]
 *     → TexReader.readImage(textureIndex) cropped to the frame rect → sprite
 *
 *   npx tsx scripts/decode_mixed.ts
 */
import {open}             from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {
    IRandomAccess, WldReader, WldSector, ObjReader, StaticRecord,
    MixedReader, TexReader
} from '../src/index.js';

const SG = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'work', 'Sacred Gold');

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

const wld = new WldReader(await NodeRA.open(`${SG}/World/sectors.wldx`)); await wld.open();
const sta = new ObjReader(await NodeRA.open(`${SG}/World/Static.PAK`));   await sta.open();
const mix = new MixedReader(await NodeRA.open(`${SG}/pak/mixed.pak`));    await mix.open();
const tex = new TexReader(await NodeRA.open(`${SG}/pak/texture.pak`));    await tex.open();

console.log(`mixed.pak defs=${mix.getDefCount()} · texture.pak images=${tex.getImageCount()}`);

let resolved = 0, missing = 0;
const seen = new Set<number>();

for (const si of [1, 2, 3, 4, 100, 1000, 2000]) {
    const sec = WldSector.parse(await wld.readSector(si));

    for (let c = 0; c < sec.cellCount(); c++) {
        const cell = sec.getCell(c);
        const idx  = cell.staticA() || cell.staticB();

        if (idx === 0 || idx >= sta.getRecordCount()) {continue;}

        const asset = StaticRecord.parse(await sta.readRecord(idx)).assetId;

        if (asset === 0 || asset >= mix.getDefCount() || seen.has(asset)) {continue;}

        seen.add(asset);

        const def = await mix.getDef(asset);
        const f   = def.frames[0];

        if (f && f.textureIndex < tex.getImageCount() && f.x2 > f.x1 && f.y2 > f.y1) {
            const img = await tex.readImage(f.textureIndex);

            if (img.width >= f.x2 && img.height >= f.y2) {resolved++;} else {missing++;}
        } else {missing++;}
    }
}

console.log(`distinct static objects resolved to a sprite: ${resolved} (unresolved: ${missing})`);
console.log('done');
