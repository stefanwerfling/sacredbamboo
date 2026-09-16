/**
 * Tiny random-access abstraction so PAK readers work in both Node and the
 * browser without dragging in a runtime-specific stream API.
 *
 * Browser: wrap a `File` (FileSystemFileHandle.getFile()).
 * Node:    wrap a `FileHandle` (fs/promises.open) — see NodeRandomAccess.
 */
export interface IRandomAccess {

    /** Total length in bytes. */
    size(): number;

    /**
     * Read `length` bytes starting at `offset`. The returned ArrayBuffer
     * may be larger than requested (slab-backed); callers must respect
     * the returned `byteLength`.
     */
    read(offset: number, length: number): Promise<ArrayBuffer>;

}

/**
 * In-memory ArrayBuffer adapter. Useful for tests and for small files
 * (Triggers.PAK is 36 KB — slurping it whole is fine).
 */
export class BufferRandomAccess implements IRandomAccess {

    public constructor(private readonly _buf: ArrayBuffer) {}

    public size(): number {
        return this._buf.byteLength;
    }

    public async read(offset: number, length: number): Promise<ArrayBuffer> {
        return this._buf.slice(offset, offset + length);
    }

}

/**
 * Browser `File` adapter. `File.slice().arrayBuffer()` is the canonical
 * way to do streamed random access from a FileSystemFileHandle.
 */
export class FileRandomAccess implements IRandomAccess {

    public constructor(private readonly _file: File) {}

    public size(): number {
        return this._file.size;
    }

    public async read(offset: number, length: number): Promise<ArrayBuffer> {
        return this._file.slice(offset, offset + length).arrayBuffer();
    }

}