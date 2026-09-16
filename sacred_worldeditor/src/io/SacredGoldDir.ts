/**
 * Wraps a FileSystemDirectoryHandle pointing at the user's local
 * `Sacred Gold/` install. The editor never uploads files — it just reads
 * them lazily via the File System Access API, so multi-GB PAKs stay on
 * disk and only the bytes we actually need cross the JS boundary.
 *
 * Subfolder access is best-effort: if the user picked the wrong directory
 * we surface a clear error rather than guessing.
 */
export class SacredGoldDir {

    public constructor(
        public readonly root: FileSystemDirectoryHandle
    ) {}

    /** Picks a directory via the browser's directory picker. */
    public static async pick(): Promise<SacredGoldDir> {
        if (!('showDirectoryPicker' in window)) {
            throw new Error(
                'File System Access API nicht verfügbar — bitte aktuellen Chromium-basierten Browser nutzen.'
            );
        }

        // showDirectoryPicker isn't in the lib.dom typings everywhere.
        const handle = await (window as unknown as {
            showDirectoryPicker(opts?: {mode?: 'read' | 'readwrite'}): Promise<FileSystemDirectoryHandle>;
        }).showDirectoryPicker({mode: 'read'});

        return new SacredGoldDir(handle);
    }

    public async getFile(relPath: string): Promise<File> {
        const parts = relPath.split('/').filter((p) => p.length > 0);

        if (parts.length === 0) {
            throw new Error(`Empty relative path`);
        }

        let dir: FileSystemDirectoryHandle = this.root;

        for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i]!);
        }

        const fileHandle = await dir.getFileHandle(parts[parts.length - 1]!);

        return fileHandle.getFile();
    }

    /** Returns the names directly inside the picked root, sorted. */
    public async listRoot(): Promise<string[]> {
        const names: string[] = [];
        const iterable = this.root as unknown as AsyncIterable<[string, FileSystemHandle]>;

        for await (const [name] of iterable) {
            names.push(name);
        }

        names.sort();

        return names;
    }

}