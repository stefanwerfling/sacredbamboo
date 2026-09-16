/**
 * Research script — verifies the WLK ↔ OBJ cross-reference hypothesis.
 *
 * Per project_worldeditor_track memory (2026-05-21): every sector entry in
 * `sectors.keyx` exposes `u32@+0x20` and `u32@+0x24` as unique, monotonically
 * increasing values. Conjecture: these are first-record indices into
 * Floor.PAK and Static.PAK (in some order).
 *
 * This script walks all 6050 sectors, harvests both columns, and checks:
 *   - bounds: each value < recordCount of the candidate target
 *   - monotonicity: strictly increasing over the sector sequence
 *   - coverage: per-sector deltas average ≈ recordCount / sectorCount
 *
 * Not a unit test — one-shot exploration. Sized to read only the headers of
 * Floor.PAK / Static.PAK (no 188 MB slurp), and the whole 4.6 MB sectors.keyx.
 *
 * Run from repo root or from `sacredbamboo_assets/`:
 *   npx tsx scripts/verify_wlk_obj_xref.ts
 */
import {open, FileHandle} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath}    from 'node:url';
import {
    BufferRandomAccess,
    IRandomAccess,
    ObjReader,
    WlkHeader,
    WlkReader
} from '../src/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR  = resolve(SCRIPT_DIR, '..', '..', 'work', 'Sacred Gold', 'World');

/**
 * Node-side `IRandomAccess` backed by an fs.FileHandle. Lives in this script
 * for now — if a second consumer needs it, lift to src/Util/.
 */
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
            throw new Error(
                `NodeFileRandomAccess: short read at ${offset}: wanted ${length}, got ${r.bytesRead}`
            );
        }

        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    public async close(): Promise<void> {
        await this._fh.close();
    }

}

/**
 * Verdict for one hypothesised mapping (e.g. "@+0x20 → Static records").
 * Holds both the raw stats and a human-readable summary.
 */
class XrefVerdict {

    public constructor(
        public readonly label:           string,
        public readonly recordCount:     number,
        public readonly inBounds:        boolean,
        public readonly strictlyIncreasing: boolean,
        public readonly minVal:          number,
        public readonly maxVal:          number,
        public readonly meanDelta:       number,
        public readonly expectedDelta:   number,
        public readonly outOfBoundsIdx:  number | null,
        public readonly outOfOrderIdx:   number | null
    ) {}

    public summary(): string {
        const lines = [
            `  recordCount of target: ${this.recordCount.toLocaleString()}`,
            `  values:    min=${this.minVal.toLocaleString()}  max=${this.maxVal.toLocaleString()}`,
            `  meanΔ:     ${this.meanDelta.toFixed(2)}   (records/sector if uniformly distributed: ${this.expectedDelta.toFixed(2)})`,
            `  in bounds: ${this.inBounds ? 'yes' : `NO — first violator at sector ${this.outOfBoundsIdx}`}`,
            `  monotone:  ${this.strictlyIncreasing ? 'yes' : `NO — first violator at sector ${this.outOfOrderIdx}`}`
        ];

        return lines.join('\n');
    }

}

class XrefChecker {

    public static check(
        label:       string,
        values:      Uint32Array,
        recordCount: number,
        sectorCount: number
    ): XrefVerdict {
        let inBounds          = true;
        let strictlyIncreasing = true;
        let outOfBoundsIdx: number | null = null;
        let outOfOrderIdx:  number | null = null;
        let minVal = Number.POSITIVE_INFINITY;
        let maxVal = Number.NEGATIVE_INFINITY;
        let prev   = -1;
        let deltaSum = 0;
        let deltaCnt = 0;

        for (let i = 0; i < values.length; i++) {
            const v = values[i]!;

            if (v < minVal) {minVal = v;}
            if (v > maxVal) {maxVal = v;}

            if (v >= recordCount && inBounds) {
                inBounds       = false;
                outOfBoundsIdx = i;
            }

            if (i > 0) {
                if (v <= prev && strictlyIncreasing) {
                    strictlyIncreasing = false;
                    outOfOrderIdx      = i;
                }

                deltaSum += (v - prev);
                deltaCnt += 1;
            }

            prev = v;
        }

        return new XrefVerdict(
            label,
            recordCount,
            inBounds,
            strictlyIncreasing,
            minVal,
            maxVal,
            deltaCnt > 0 ? deltaSum / deltaCnt : 0,
            recordCount / sectorCount,
            outOfBoundsIdx,
            outOfOrderIdx
        );
    }

}

class Verifier {

    public static async run(): Promise<void> {
        const wlkPath    = `${WORLD_DIR}/sectors.keyx`;
        const floorPath  = `${WORLD_DIR}/Floor.PAK`;
        const staticPath = `${WORLD_DIR}/Static.PAK`;

        console.log(`[verify_wlk_obj_xref] world dir: ${WORLD_DIR}\n`);

        // sectors.keyx — slurp whole 4.6 MB
        const wlkFh  = await NodeFileRandomAccess.open(wlkPath);
        const wlkBuf = await wlkFh.read(0, wlkFh.size());

        await wlkFh.close();

        const wlk = new WlkReader(new BufferRandomAccess(wlkBuf));

        await wlk.open();

        const header      = wlk.getHeader();
        const sectorCount = wlk.getSectorCount();

        console.log('sectors.keyx header:');
        console.log(`  signature=${header.signature}  version=${header.version}`);
        console.log(`  sectorCount=${sectorCount}  grid=${header.gridWidth}x${header.gridHeight}`);
        console.log(`  worldOriginA=${header.worldOriginA}  worldOriginB=${header.worldOriginB}\n`);

        // Floor + Static — only read headers via ObjReader (no whole-file slurp)
        const floorFh = await NodeFileRandomAccess.open(floorPath);
        const floor   = new ObjReader(floorFh);

        await floor.open();

        const staticFh = await NodeFileRandomAccess.open(staticPath);
        const staticR  = new ObjReader(staticFh);

        await staticR.open();

        const floorCount  = floor.getRecordCount();
        const staticCount = staticR.getRecordCount();

        console.log('Floor.PAK:');
        console.log(`  recordCount=${floorCount.toLocaleString()}  stride=${floor.getRecordLength()}  type=0x${floor.getRecordType().toString(16)}\n`);
        console.log('Static.PAK:');
        console.log(`  recordCount=${staticCount.toLocaleString()}  stride=${staticR.getRecordLength()}  type=0x${staticR.getRecordType().toString(16)}\n`);

        // Harvest @+0x20 and @+0x24 across all sectors
        const at20 = new Uint32Array(sectorCount);
        const at24 = new Uint32Array(sectorCount);
        const view = new DataView(wlkBuf);

        for (let i = 0; i < sectorCount; i++) {
            const off = WlkHeader.SIZE + i * WlkReader.SECTOR_SIZE;

            at20[i] = view.getUint32(off + 0x20, true);
            at24[i] = view.getUint32(off + 0x24, true);
        }

        console.log('First 10 sectors:');
        console.log('  idx    @+0x20      @+0x24');

        for (let i = 0; i < Math.min(10, sectorCount); i++) {
            console.log(`  ${i.toString().padStart(3)}    ${at20[i]!.toString().padStart(10)}    ${at24[i]!.toString().padStart(10)}`);
        }

        console.log('\nLast 5 sectors:');

        for (let i = sectorCount - 5; i < sectorCount; i++) {
            console.log(`  ${i.toString().padStart(4)}   ${at20[i]!.toString().padStart(10)}    ${at24[i]!.toString().padStart(10)}`);
        }

        console.log('');

        // Test all four mapping hypotheses
        const verdicts = [
            XrefChecker.check('@+0x20 → Floor',  at20, floorCount,  sectorCount),
            XrefChecker.check('@+0x20 → Static', at20, staticCount, sectorCount),
            XrefChecker.check('@+0x24 → Floor',  at24, floorCount,  sectorCount),
            XrefChecker.check('@+0x24 → Static', at24, staticCount, sectorCount)
        ];

        for (const v of verdicts) {
            console.log(`=== ${v.label} ===`);
            console.log(v.summary());
            console.log('');
        }

        // Best mapping = column whose maxVal is closest to but not over a recordCount
        console.log('=== conclusion ===');

        const choose = (
            column: Uint32Array,
            colLabel: string
        ): string => {
            const a = column[column.length - 1]!;
            const fitsFloor  = a <= floorCount;
            const fitsStatic = a <= staticCount;
            const ratioFloor  = a / floorCount;
            const ratioStatic = a / staticCount;

            if (fitsFloor && fitsStatic) {
                return ratioFloor > ratioStatic
                    ? `${colLabel}: best fit = Floor  (uses ${(ratioFloor * 100).toFixed(1)}% of Floor's recordCount vs ${(ratioStatic * 100).toFixed(1)}% of Static's)`
                    : `${colLabel}: best fit = Static (uses ${(ratioStatic * 100).toFixed(1)}% of Static's recordCount vs ${(ratioFloor * 100).toFixed(1)}% of Floor's)`;
            }

            if (fitsFloor)  {return `${colLabel}: only fits Floor  (max=${a.toLocaleString()})`;}
            if (fitsStatic) {return `${colLabel}: only fits Static (max=${a.toLocaleString()})`;}

            return `${colLabel}: fits NEITHER (max=${a.toLocaleString()})`;
        };

        console.log(choose(at20, '@+0x20'));
        console.log(choose(at24, '@+0x24'));
        console.log('');

        // === New hypothesis ===
        // @+0x20 max = 9999 ≈ 100*100. Early values 1500,2400,2800,... are
        // multiples of 100. Decompose as (row, col) with stride = gridWidth.
        const gridW = header.gridWidth;
        console.log('=== @+0x20 as (row, col) with stride=gridWidth ===');
        console.log('  sec   raw       row    col');

        const around = [0, 1, 2, 28, 29, 30, 31, 32, sectorCount - 2, sectorCount - 1];

        for (const i of around) {
            const v = at20[i]!;

            console.log(`  ${i.toString().padStart(4)}  ${v.toString().padStart(5)}    ${Math.floor(v / gridW).toString().padStart(3)}    ${(v % gridW).toString().padStart(3)}`);
        }

        // Are at20 values pairwise unique (i.e. cover distinct grid cells)?
        const seen20 = new Set<number>();
        let dup20 = 0;

        for (let i = 0; i < sectorCount; i++) {
            const v = at20[i]!;

            if (seen20.has(v)) {dup20++;}
            seen20.add(v);
        }

        console.log(`\n  @+0x20 unique count: ${seen20.size} / ${sectorCount}   duplicates: ${dup20}`);

        // Same question for @+0x24
        const seen24 = new Set<number>();
        let dup24 = 0;

        for (let i = 0; i < sectorCount; i++) {
            const v = at24[i]!;

            if (seen24.has(v)) {dup24++;}
            seen24.add(v);
        }

        console.log(`  @+0x24 unique count: ${seen24.size} / ${sectorCount}   duplicates: ${dup24}`);

        // If @+0x24 covers 1..sectorCount exactly, it's a sector ordinal/permutation.
        if (seen24.size === sectorCount) {
            let isOneTo = true;

            for (let k = 1; k <= sectorCount; k++) {
                if (!seen24.has(k)) {isOneTo = false; break;}
            }

            console.log(`  @+0x24 == permutation of 1..${sectorCount}?  ${isOneTo ? 'YES' : 'no'}`);
        }

        // If @+0x20 are all valid (row, col) in 0..gridH-1 × 0..gridW-1
        let allValidGrid = true;

        for (let i = 0; i < sectorCount; i++) {
            const v = at20[i]!;

            if (Math.floor(v / gridW) >= header.gridHeight || (v % gridW) >= gridW) {
                allValidGrid = false;
                break;
            }
        }

        console.log(`  @+0x20 all decode to valid (row<${header.gridHeight}, col<${gridW})?  ${allValidGrid ? 'YES' : 'no'}`);

        // Does the iteration order of @+0x20 match column-major over the populated grid cells?
        // (i.e. (row,col) sorted by col ASC, then row ASC)
        let columnMajor = true;
        let prevRow = -1, prevCol = -1;

        for (let i = 0; i < sectorCount; i++) {
            const v   = at20[i]!;
            const row = Math.floor(v / gridW);
            const col = v % gridW;

            const ok = col > prevCol || (col === prevCol && row > prevRow);

            if (!ok) {columnMajor = false; break;}

            prevRow = row;
            prevCol = col;
        }

        console.log(`  @+0x20 iterates column-major (col ASC, then row ASC)?  ${columnMajor ? 'YES' : 'no'}`);

        if (!columnMajor) {
            let rowMajor = true;
            prevRow = -1; prevCol = -1;

            for (let i = 0; i < sectorCount; i++) {
                const v   = at20[i]!;
                const row = Math.floor(v / gridW);
                const col = v % gridW;

                const ok = row > prevRow || (row === prevRow && col > prevCol);

                if (!ok) {rowMajor = false; break;}

                prevRow = row;
                prevCol = col;
            }

            console.log(`  @+0x20 iterates row-major   (row ASC, then col ASC)?  ${rowMajor ? 'YES' : 'no'}`);
        }

        await floorFh.close();
        await staticFh.close();
    }

}

Verifier.run().catch((err) => {
    console.error(err);
    process.exit(1);
});