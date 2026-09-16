import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferRandomAccess, TrgReader} from '../src/index.js';
import {PakFixture} from './util/PakFixture.js';

test('TrgReader.open accepts a "TRG" container', async () => {
    const buf = new PakFixture()
        .signature('TRG')
        .addEntry(0x88, new Uint8Array(16))
        .build();

    const r = new TrgReader(new BufferRandomAccess(buf));

    await r.open();

    assert.equal(r.getHeader().signature, 'TRG');
    assert.equal(r.getEntries().length,   1);
});

test('TrgReader.open rejects non-TRG signatures', async () => {
    const buf = new PakFixture()
        .signature('OBJ')
        .addEntry(0x87, new Uint8Array(16))
        .build();

    const r = new TrgReader(new BufferRandomAccess(buf));

    await assert.rejects(() => r.open(), /signature was "OBJ", expected "TRG"/);
});

test('TrgReader.readEntry returns payload bytes for an indexed entry', async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const buf  = new PakFixture()
        .signature('TRG')
        .addEntry(0x88, body)
        .build();

    const r = new TrgReader(new BufferRandomAccess(buf));

    await r.open();

    const out = new Uint8Array(await r.readEntry(0));

    assert.deepEqual(Array.from(out), Array.from(body));
});

test('TrgReader.readEntry rejects out-of-range indices', async () => {
    const buf = new PakFixture()
        .signature('TRG')
        .addEntry(0x88, new Uint8Array(4))
        .build();

    const r = new TrgReader(new BufferRandomAccess(buf));

    await r.open();

    await assert.rejects(() => r.readEntry(99), /no entry at index 99/);
});