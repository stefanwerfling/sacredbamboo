import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferRandomAccess, WlkHeader, WlkReader} from '../src/index.js';

class WlkFixture {

    public static build(sectorCount: number, opts?: {
        signature?: string;
        version?:   number;
        gridW?:     number;
        gridH?:     number;
        originA?:   number;
        originB?:   number;
        truncateBy?: number;
    }): ArrayBuffer {
        const sectorSize = WlkReader.SECTOR_SIZE;
        const total      = WlkHeader.SIZE + sectorCount * sectorSize - (opts?.truncateBy ?? 0);
        const buf        = new ArrayBuffer(total);
        const u8         = new Uint8Array(buf);
        const dv         = new DataView(buf);
        const sig        = opts?.signature ?? 'WLK';

        u8[0] = sig.charCodeAt(0);
        u8[1] = sig.charCodeAt(1);
        u8[2] = sig.charCodeAt(2);
        u8[3] = opts?.version ?? 5;

        dv.setUint32(4,  sectorCount,           true);
        dv.setUint32(8,  opts?.gridW   ?? 100,  true);
        dv.setUint32(12, opts?.gridH   ?? 100,  true);
        dv.setInt32(16,  opts?.originA ?? -18432, true);
        dv.setInt32(20,  opts?.originB ?? 112152, true);

        // Mark each sector with a recognisable byte pattern (sectorIndex & 0xff at @0).
        for (let i = 0; i < sectorCount; i++) {
            const off = WlkHeader.SIZE + i * sectorSize;

            if (off + 1 <= total) {
                u8[off] = i & 0xff;
            }
        }

        return buf;
    }

}

test('WlkHeader.parse reads signature, version, sectorCount, grid + world fields', () => {
    const buf = WlkFixture.build(2);
    const h   = WlkHeader.parse(buf);

    assert.equal(h.signature,    'WLK');
    assert.equal(h.version,      5);
    assert.equal(h.sectorCount,  2);
    assert.equal(h.gridWidth,    100);
    assert.equal(h.gridHeight,   100);
    assert.equal(h.worldOriginA, -18432);
    assert.equal(h.worldOriginB, 112152);
});

test('WlkReader.open accepts a well-formed sectors.keyx', async () => {
    const buf = WlkFixture.build(3);
    const r   = new WlkReader(new BufferRandomAccess(buf));

    await r.open();

    assert.equal(r.getSectorCount(), 3);
});

test('WlkReader.open rejects wrong signature', async () => {
    const buf = WlkFixture.build(1, {signature: 'WLD'});
    const r   = new WlkReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /signature was "WLD", expected "WLK"/);
});

test('WlkReader.open rejects size mismatch (declared sectorCount × stride must equal file size)', async () => {
    const buf = WlkFixture.build(3, {truncateBy: 8});
    const r   = new WlkReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /size mismatch/);
});

test('WlkReader.readSector returns the 768B blob for the indexed sector', async () => {
    const buf = WlkFixture.build(4);
    const r   = new WlkReader(new BufferRandomAccess(buf));

    await r.open();

    for (let i = 0; i < 4; i++) {
        const s = new Uint8Array(await r.readSector(i));

        assert.equal(s.length, WlkReader.SECTOR_SIZE);
        assert.equal(s[0],    i,  `sector ${i} marker byte`);
    }
});

test('WlkReader.readSector rejects out-of-range indices', async () => {
    const buf = WlkFixture.build(2);
    const r   = new WlkReader(new BufferRandomAccess(buf));

    await r.open();

    await assert.rejects(() => r.readSector(-1), /out of range/);
    await assert.rejects(() => r.readSector(2),  /out of range/);
});

test('WlkReader.SECTOR_SIZE matches the 0x300 documented for sectors.keyx', () => {
    assert.equal(WlkReader.SECTOR_SIZE, 0x300);
});

test('WlkReader.readAllSectorsBlob returns the entire sector region in one shot', async () => {
    const buf = WlkFixture.build(5);
    const r   = new WlkReader(new BufferRandomAccess(buf));

    await r.open();

    const blob = new Uint8Array(await r.readAllSectorsBlob());

    assert.equal(blob.length, 5 * WlkReader.SECTOR_SIZE);

    for (let i = 0; i < 5; i++) {
        assert.equal(blob[i * WlkReader.SECTOR_SIZE], i, `sector ${i} marker byte at slice start`);
    }
});