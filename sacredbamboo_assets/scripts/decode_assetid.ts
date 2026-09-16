/**
 * Research script — verify the full Floor assetId → texture chain end-to-end
 * with the shipped readers. Runs against retail Floor.PAK / sectors.wldx /
 * tiles.pak / texture.pak under `work/Sacred Gold/`.
 *
 *   FloorRecord.assetId
 *     → tileIndex = assetId & 0x1FFFF   (low 17 bits; VERIFIED < 90132)
 *     → IsoTilesReader.getTile(tileIndex).textureIndex
 *     → TexReader.readImage(textureIndex) → RGBA (ARGB4444, 256×256)
 *
 *   npx tsx scripts/decode_assetid.ts
 */
import {open}             from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {
    IRandomAccess, WldReader, WldSector, ObjReader, FloorRecord,
    IsoTilesReader, TexReader
} from '../src/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SG         = resolve(SCRIPT_DIR, '..', '..', 'work', 'Sacred Gold');

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

const flr   = new ObjReader(await NodeRA.open(`${SG}/World/Floor.PAK`));    await flr.open();
const wld   = new WldReader(await NodeRA.open(`${SG}/World/sectors.wldx`)); await wld.open();
const tiles = new IsoTilesReader(await NodeRA.open(`${SG}/pak/tiles.pak`)); await tiles.open();
const tex   = new TexReader(await NodeRA.open(`${SG}/pak/texture.pak`));    await tex.open();

console.log(`tiles.pak ${tiles.getTileCount()} tiles · texture.pak ${tex.getImageCount()} images`);

// 1) every referenced assetId's tileIndex is a valid tiles.pak index.
const assets = new Set<number>();

for (const si of [1, 2, 3, 4, 100, 1000, 3000]) {
    const sec = WldSector.parse(await wld.readSector(si));

    for (let c = 0; c < sec.cellCount(); c++) {
        assets.add(FloorRecord.parse(await flr.readRecord(sec.getCell(c).floorIndex)).assetId);
    }
}

const arr    = [...assets];
const inRange = arr.filter((a) => (a & FloorRecord.TILE_INDEX_MASK) < tiles.getTileCount()).length;

console.log(`\nassetId.tileIndex in tiles.pak range: ${inRange}/${arr.length}`);

// 2) resolve + decode a handful end-to-end.
console.log(`\nassetId → tile → texture → RGBA:`);
for (const a of arr.slice(0, 5)) {
    const fr   = new FloorRecord(0, a, 0, 0);
    const tile = await tiles.getTile(fr.tileIndex());
    const info = await tex.getImageInfo(tile.textureIndex);
    const img  = await tex.readImage(tile.textureIndex);

    // opaque pixel count as a sanity signal
    let opaque = 0;
    for (let i = 3; i < img.rgba.length; i += 4) {if (img.rgba[i]! > 0) {opaque++;}}

    console.log(`  assetId ${a} (flags=0x${fr.tileFlags().toString(16)}) → tile#${fr.tileIndex()} "${tile.filename}" texIdx=${tile.textureIndex}`
        + ` → "${info.name}" ${img.width}×${img.height} type${info.typeId}  opaquePx=${opaque}/${img.width * img.height}`);
}

console.log('\ndone');
