/**
 * Research script — verify the keyx → wldx compressed-payload cross-reference.
 *
 * Hypothesis (from Aytackydln/SacredEngineRemake's `KeyxSectorRecord`, used as
 * a reference only — see reference_sacredengineremake memory): each 0x300-byte
 * sector entry in `sectors.keyx` stores the location of that sector's
 * compressed payload inside `sectors.wldx`:
 *
 *   uint32 @+0xEC   CompressedOffset  — absolute byte offset in sectors.wldx
 *   uint32 @+0xF0   CompressedSize    — compressed payload size in bytes
 *   (bonus, printed only) uint32 @+0xD4 TilesRelativeOffset / @+0xD8 TilesSize
 *
 * Our own `WldReader` currently believes NO offset table exists and rebuilds
 * the per-sector (offset, length) index by walking every zlib stream once
 * (WldReader.ts header). If the keyx table is real and agrees with that walk,
 * we can index wldx directly from keyx and drop the O(file) inflate-walk.
 *
 * This script cross-checks, per sector i (iteration order — the order both
 * files are stored in), keyx `@0xEC/@0xF0` against `WldReader.getSectorRange(i)`
 * and reports, under several size/offset interpretations:
 *   - offset exact match (absolute) / match relative to the 0x100 header
 *   - size exact / size == frame-6 (deflate body only) / size == frame-4 / -2
 *   - set-equality (order-independent) as a fallback if order-wise fails
 *
 * Not a unit test — one-shot exploration. Reads the whole 4.6 MB keyx and lets
 * WldReader walk the 60 MB wldx once.
 *
 * Run from `sacredbamboo_assets/`:
 *   npx tsx scripts/verify_keyx_wldx_xref.ts
 */
import {open, FileHandle}  from 'node:fs/promises';
import {resolve, dirname}  from 'node:path';
import {fileURLToPath}     from 'node:url';
import {IRandomAccess, WlkReader, WldReader} from '../src/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR  = resolve(SCRIPT_DIR, '..', '..', 'work', 'Sacred Gold', 'World');

const KEYX_COMPRESSED_OFFSET = 0xEC;
const KEYX_COMPRESSED_SIZE   = 0xF0;
const KEYX_TILES_OFFSET      = 0xD4;
const KEYX_TILES_SIZE        = 0xD8;

/** Node-side IRandomAccess over an fs.FileHandle (same shape as sibling scripts). */
class NodeFileRandomAccess implements IRandomAccess {

    public static async open(path: string): Promise<NodeFileRandomAccess> {
        const fh   = await open(path, 'r');
        const stat = await fh.stat();

        return new NodeFileRandomAccess(fh, stat.size);
    }

    private constructor(
        private readonly _fh:   FileHandle,
        private readonly _size: number
    ) {}

    public size(): number {
        return this._size;
    }

    public async read(offset: number, length: number): Promise<ArrayBuffer> {
        const buf = Buffer.allocUnsafe(length);
        const r   = await this._fh.read(buf, 0, length, offset);

        if (r.bytesRead !== length) {
            throw new Error(`NodeFileRandomAccess: short read at ${offset}: wanted ${length}, got ${r.bytesRead}`);
        }

        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    public async close(): Promise<void> {
        await this._fh.close();
    }

}

const keyxRA = await NodeFileRandomAccess.open(`${WORLD_DIR}/sectors.keyx`);
const wldxRA = await NodeFileRandomAccess.open(`${WORLD_DIR}/sectors.wldx`);

const wlk = new WlkReader(keyxRA);
await wlk.open();
const wld = new WldReader(wldxRA);
await wld.open();

const count = wlk.getSectorCount();

if (count !== wld.getSectorCount()) {
    throw new Error(`sector-count mismatch: keyx ${count} vs wldx ${wld.getSectorCount()}`);
}

console.log(`keyx sectors ${count} · wldx sectors ${wld.getSectorCount()} · wldx size ${wldxRA.size()} B`);

// Pull all keyx entries once.
const blob = await wlk.readAllSectorsBlob();
const view = new DataView(blob);

// Tallies for each interpretation of the two columns.
const tally = {
    offAbs:     0,   // keyx offset == wld offset (absolute)
    offRelHdr:  0,   // keyx offset == wld offset - 0x100
    sizeExact:  0,   // keyx size   == wld length (full zlib frame)
    sizeMinus6: 0,   // keyx size   == wld length - 6 (deflate body only)
    sizeMinus4: 0,   // keyx size   == wld length - 4 (no Adler)
    sizeMinus2: 0,   // keyx size   == wld length - 2 (no zlib header)
    bothAbs:    0    // offset-absolute AND size-exact
};

const keyxOffsets = new Set<number>();
const wldOffsets  = new Set<number>();
const sampleRows: string[] = [];

for (let i = 0; i < count; i++) {
    const base = i * WlkReader.SECTOR_SIZE;
    const kOff = view.getUint32(base + KEYX_COMPRESSED_OFFSET, true);
    const kSz  = view.getUint32(base + KEYX_COMPRESSED_SIZE, true);
    const kTOf = view.getUint32(base + KEYX_TILES_OFFSET, true);
    const kTSz = view.getUint32(base + KEYX_TILES_SIZE, true);

    const {offset: wOff, length: wLen} = wld.getSectorRange(i);

    keyxOffsets.add(kOff);
    wldOffsets.add(wOff);

    if (kOff === wOff)            {tally.offAbs++;}
    if (kOff === wOff - 0x100)    {tally.offRelHdr++;}
    if (kSz === wLen)             {tally.sizeExact++;}
    if (kSz === wLen - 6)         {tally.sizeMinus6++;}
    if (kSz === wLen - 4)         {tally.sizeMinus4++;}
    if (kSz === wLen - 2)         {tally.sizeMinus2++;}
    if (kOff === wOff && kSz === wLen) {tally.bothAbs++;}

    if (i < 6 || i === 1000 || i === count - 1) {
        sampleRows.push(
            `  #${String(i).padStart(4)}  keyx off=0x${kOff.toString(16).padStart(8, '0')} sz=${String(kSz).padStart(7)}` +
            ` | wld off=0x${wOff.toString(16).padStart(8, '0')} len=${String(wLen).padStart(7)}` +
            ` | tiles off=0x${kTOf.toString(16)} sz=${kTSz}`
        );
    }
}

// Order-independent fallback: do the two files describe the same offset set?
let setOverlap = 0;
for (const o of keyxOffsets) {
    if (wldOffsets.has(o)) {setOverlap++;}
}

console.log('\nsample rows (i<6, 1000, last):');
for (const r of sampleRows) {console.log(r);}

const pct = (n: number): string => `${n}/${count} (${(100 * n / count).toFixed(1)}%)`;

console.log('\noffset interpretations:');
console.log(`  keyx@0xEC == wld.offset (absolute)      ${pct(tally.offAbs)}`);
console.log(`  keyx@0xEC == wld.offset - 0x100         ${pct(tally.offRelHdr)}`);
console.log('\nsize interpretations (wld.length = full zlib frame incl. 2B hdr + 4B Adler):');
console.log(`  keyx@0xF0 == wld.length                 ${pct(tally.sizeExact)}`);
console.log(`  keyx@0xF0 == wld.length - 6             ${pct(tally.sizeMinus6)}`);
console.log(`  keyx@0xF0 == wld.length - 4             ${pct(tally.sizeMinus4)}`);
console.log(`  keyx@0xF0 == wld.length - 2             ${pct(tally.sizeMinus2)}`);
console.log('\ncombined:');
console.log(`  offset-absolute AND size-exact          ${pct(tally.bothAbs)}`);
console.log(`  keyx-offset set ∩ wld-offset set        ${setOverlap}/${count} distinct offsets shared`);

const verdict =
    tally.bothAbs === count ? 'CONFIRMED: keyx@0xEC/@0xF0 is the wldx offset table (absolute offset, full-frame size).' :
    tally.offAbs === count  ? 'PARTIAL: offset matches exactly; size column uses a different unit (see interpretations above).' :
    setOverlap === count    ? 'REORDERED: same offset set but not in iteration order — keyx indexes wldx by a permutation (likely Id@0x24).' :
    'REJECTED: keyx@0xEC/@0xF0 does not line up with WldReader\'s walked index under any tested interpretation.';

console.log(`\nverdict: ${verdict}`);

await keyxRA.close();
await wldxRA.close();
console.log('done');
