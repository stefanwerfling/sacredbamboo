import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferRandomAccess} from '../src/index.js';

test('BufferRandomAccess.size reports the wrapped buffer length', () => {
    const ra = new BufferRandomAccess(new ArrayBuffer(123));

    assert.equal(ra.size(), 123);
});

test('BufferRandomAccess.read returns a slice with the requested bytes', async () => {
    const src = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    const ra  = new BufferRandomAccess(src.buffer);

    const out = new Uint8Array(await ra.read(2, 4));

    assert.equal(out.length, 4);
    assert.deepEqual(Array.from(out), [30, 40, 50, 60]);
});

test('BufferRandomAccess.read at offset 0 returns the head', async () => {
    const src = new Uint8Array([1, 2, 3, 4]);
    const out = new Uint8Array(await new BufferRandomAccess(src.buffer).read(0, 2));

    assert.deepEqual(Array.from(out), [1, 2]);
});

test('BufferRandomAccess.read at EOF returns an empty buffer', async () => {
    const src = new Uint8Array([1, 2, 3, 4]);
    const out = new Uint8Array(await new BufferRandomAccess(src.buffer).read(4, 0));

    assert.equal(out.length, 0);
});