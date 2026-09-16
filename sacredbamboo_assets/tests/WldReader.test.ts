import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deflate} from 'pako';
import {BufferRandomAccess, WldHeader, WldReader, WldSector} from '../src/index.js';

class WldFixture {

    public static build(sectors: Uint8Array[], opts?: {
        signature?:     string;
        version?:       number;
        unknownAt0x28?: number;
        truncateBy?:    number;
        // Lie about sectorCount in the header to test mismatch detection.
        declaredCount?: number;
    }): ArrayBuffer {
        const compressed = sectors.map((s) => deflate(s));
        const total      = WldHeader.SIZE + compressed.reduce((acc, c) => acc + c.byteLength, 0) - (opts?.truncateBy ?? 0);
        const out        = new Uint8Array(total);
        const dv         = new DataView(out.buffer);
        const sig        = opts?.signature ?? 'WLD';

        out[0] = sig.charCodeAt(0);
        out[1] = sig.charCodeAt(1);
        out[2] = sig.charCodeAt(2);
        out[3] = opts?.version ?? 5;

        dv.setUint32(4,    opts?.declaredCount ?? sectors.length, true);
        dv.setUint32(0x28, opts?.unknownAt0x28 ?? 0,              true);

        let cursor = WldHeader.SIZE;

        for (const c of compressed) {
            const writeLen = Math.min(c.byteLength, out.byteLength - cursor);

            out.set(c.subarray(0, writeLen), cursor);
            cursor += writeLen;
        }

        return out.buffer;
    }

    public static sectorPayload(col: number, row: number, tailBytes = 0): Uint8Array {
        const name   = `Sector ${col},${row}`;
        const header = new Uint8Array(WldSector.NAME_BLOCK_SIZE);

        for (let i = 0; i < name.length; i++) {
            header[i] = name.charCodeAt(i);
        }

        // null-terminator + MSVC heap-fill (0xCD)
        for (let i = name.length + 1; i < header.length; i++) {
            header[i] = 0xcd;
        }

        const body = new Uint8Array(tailBytes);

        for (let i = 0; i < tailBytes; i++) {
            body[i] = (col * 31 + row * 7 + i) & 0xff;
        }

        const full = new Uint8Array(header.length + body.length);

        full.set(header, 0);
        full.set(body, header.length);

        return full;
    }

}

test('WldHeader.parse reads signature, version, sectorCount and unknownAt0x28', () => {
    const buf = WldFixture.build([WldFixture.sectorPayload(0, 15)], {unknownAt0x28: 0xdeadbeef});
    const h   = WldHeader.parse(buf);

    assert.equal(h.signature,     'WLD');
    assert.equal(h.version,       5);
    assert.equal(h.sectorCount,   1);
    assert.equal(h.unknownAt0x28, 0xdeadbeef);
});

test('WldReader.open walks all streams and builds an offset/length index', async () => {
    const buf = WldFixture.build([
        WldFixture.sectorPayload(0, 15),
        WldFixture.sectorPayload(0, 24, 100),
        WldFixture.sectorPayload(1, 30, 4096)
    ]);
    const r = new WldReader(new BufferRandomAccess(buf));

    await r.open();

    assert.equal(r.getSectorCount(), 3);

    const r0 = r.getSectorRange(0);
    const r1 = r.getSectorRange(1);
    const r2 = r.getSectorRange(2);

    assert.equal(r0.offset, WldHeader.SIZE);
    assert.equal(r1.offset, r0.offset + r0.length);
    assert.equal(r2.offset, r1.offset + r1.length);
    assert.equal(r2.offset + r2.length, buf.byteLength);
});

test('WldReader.readSector inflates and returns the original payload', async () => {
    const payloads = [
        WldFixture.sectorPayload(0, 15),
        WldFixture.sectorPayload(0, 24, 100),
        WldFixture.sectorPayload(1, 30, 4096)
    ];
    const buf = WldFixture.build(payloads);
    const r   = new WldReader(new BufferRandomAccess(buf));

    await r.open();

    for (let i = 0; i < payloads.length; i++) {
        const got = await r.readSector(i);

        assert.equal(got.byteLength, payloads[i]!.byteLength, `sector ${i} length`);
        assert.deepEqual(Array.from(got), Array.from(payloads[i]!), `sector ${i} bytes`);
    }
});

test('WldReader.readSector rejects out-of-range indices', async () => {
    const buf = WldFixture.build([WldFixture.sectorPayload(0, 15)]);
    const r   = new WldReader(new BufferRandomAccess(buf));

    await r.open();

    await assert.rejects(() => r.readSector(-1), /out of range/);
    await assert.rejects(() => r.readSector(1),  /out of range/);
});

test('WldReader.open rejects wrong signature', async () => {
    const buf = WldFixture.build([WldFixture.sectorPayload(0, 0)], {signature: 'WLK'});
    const r   = new WldReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /signature was "WLK", expected "WLD"/);
});

test('WldReader.open errors when declared sectorCount exceeds the available streams', async () => {
    const buf = WldFixture.build([WldFixture.sectorPayload(0, 0)], {declaredCount: 3});
    const r   = new WldReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /need at least 6 for zlib frame|did not terminate/);
});

test('WldReader.open errors when the file is truncated mid-stream', async () => {
    const buf = WldFixture.build([WldFixture.sectorPayload(0, 0, 200)], {truncateBy: 80});
    const r   = new WldReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /did not terminate/);
});

test('WldReader.open errors when the file has trailing bytes past the last stream', async () => {
    const inner = WldFixture.build([WldFixture.sectorPayload(0, 0)]);
    const padded = new Uint8Array(inner.byteLength + 4);

    padded.set(new Uint8Array(inner), 0);
    // Trailing garbage that doesn't form a valid zlib stream.
    padded[inner.byteLength]     = 0x78;
    padded[inner.byteLength + 1] = 0x9c;
    padded[inner.byteLength + 2] = 0xff;
    padded[inner.byteLength + 3] = 0xff;

    const r = new WldReader(new BufferRandomAccess(padded.buffer));

    // Header declares 1 sector but trailing 4 bytes are unaccounted for.
    await assert.rejects(() => r.open(), /cursor is at|file size is/);
});

test('WldSector.getName extracts the "Sector col,row" ASCII prefix', () => {
    const u8 = WldFixture.sectorPayload(3, 42);
    const s  = WldSector.parse(u8);

    assert.equal(s.getName(),       'Sector 3,42');
    assert.equal(s.getNameBlock().byteLength, WldSector.NAME_BLOCK_SIZE);
});

test('WldSector body/tail split — isBaseSized() flips at exactly BASE_BODY_SIZE', () => {
    // The fixture pads the name block to 32 B, then appends `tailBytes` more.
    // Base size happens when (header + tail) === BASE_BODY_SIZE.
    const tail = WldSector.BASE_BODY_SIZE - WldSector.NAME_BLOCK_SIZE;
    const base = WldSector.parse(WldFixture.sectorPayload(0, 0, tail));

    assert.equal(base.getSize(), WldSector.BASE_BODY_SIZE);
    assert.equal(base.isBaseSized(), true);
    assert.equal(base.getTail().byteLength, 0);

    const overflow = WldSector.parse(WldFixture.sectorPayload(0, 0, tail + 64));

    assert.equal(overflow.isBaseSized(), false);
    assert.equal(overflow.getTail().byteLength, 64);
});

test('WldSector.parse rejects a buffer that is too short for the name block', () => {
    assert.throws(() => WldSector.parse(new Uint8Array(8)), /need at least 32 bytes/);
});