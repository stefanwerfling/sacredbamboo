import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferRandomAccess, PakReader} from '../src/index.js';
import {PakFixture} from './util/PakFixture.js';

test('PakReader.open parses header + entries from a synthetic container', async () => {
    const buf = new PakFixture()
        .signature('OBJ')
        .addEntry(0x87, new Uint8Array([1, 2, 3, 4]))
        .addEntry(0x87, new Uint8Array([5, 6, 7, 8]))
        .build();

    const r = new PakReader(new BufferRandomAccess(buf));

    await r.open();

    const h = r.getHeader();

    assert.equal(h.signature,  'OBJ');
    assert.equal(h.version,    1);
    assert.equal(h.entryCount, 2);

    const es = r.getEntries();

    assert.equal(es.length, 2);
    assert.deepEqual(
        es.map((e) => ({index: e.index, type: e.type, length: e.length})),
        [
            {index: 0, type: 0x87, length: 4},
            {index: 1, type: 0x87, length: 4}
        ]
    );
});

test('PakReader.open filters out all-zero entry slots', async () => {
    const buf = new PakFixture()
        .declaredCount(3)
        .addEntry(0x87, new Uint8Array([1, 2, 3, 4]))
        .addGarbageEntry(0, 0, 0)
        .addEntry(0x87, new Uint8Array([5, 6, 7, 8]))
        .build();

    const r = new PakReader(new BufferRandomAccess(buf));

    await r.open();

    assert.equal(r.getEntries().length, 2);
});

test('PakReader.open filters out entries pointing past EOF (0xCC garbage)', async () => {
    // Triggers.PAK pattern — most table rows have non-zero garbage offsets
    // but only one points inside the file.
    const buf = new PakFixture()
        .signature('TRG')
        .declaredCount(3)
        .addEntry(0x88, new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]))
        .addGarbageEntry(0xCDCDCDCD, 0xCDCDCDCD, 0xCDCDCDCD)
        .addGarbageEntry(0xCDCDCDCD, 999_999, 4)
        .build();

    const r = new PakReader(new BufferRandomAccess(buf));

    await r.open();

    assert.equal(r.getEntries().length, 1);
    assert.equal(r.getEntries()[0]!.type, 0x88);
});

test('PakReader.readEntry returns the payload bytes', async () => {
    const payload = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD, 0xEE]);
    const buf     = new PakFixture()
        .addEntry(0x42, payload)
        .build();

    const r = new PakReader(new BufferRandomAccess(buf));

    await r.open();

    const out = new Uint8Array(await r.readEntry(r.getEntries()[0]!));

    assert.deepEqual(Array.from(out), Array.from(payload));
});

test('PakReader.getHeader / getEntries throw before open()', () => {
    const r = new PakReader(new BufferRandomAccess(new ArrayBuffer(256)));

    assert.throws(() => r.getHeader(),  /open\(\) not called/);
    assert.throws(() => r.getEntries(), /open\(\) not called/);
});