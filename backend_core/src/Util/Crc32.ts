/**
 * CRC-32 checksum matching the algorithm used by `tincat2.dll`.
 *
 * Layout and semantics taken directly from `sub_1000EA10` (the payload
 * checksum used in the 28-byte Tincat V2 header, offset 24):
 *
 *     result = 0;
 *     for (i = 0; i < len; ++i)
 *         result = table[(result & 0xFF) ^ buf[i]] ^ ((result >> 8) & 0x00FFFFFF);
 *
 * Table is the IEEE-802.3 / PNG / ZIP CRC-32 polynomial 0xEDB88320.
 * Init value is 0 (NOT 0xFFFFFFFF), and there is NO final XOR — that
 * matches what tincat2 sends on the wire, so we must match exactly.
 */
export class Crc32 {

    private static _table: Uint32Array | null = null;

    private static _buildTable(): Uint32Array {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    }

    public static compute(buf: Buffer): number {
        if (Crc32._table === null) {
            Crc32._table = Crc32._buildTable();
        }
        const table = Crc32._table;
        let crc = 0;
        for (let i = 0; i < buf.length; i++) {
            crc = (table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
        }
        return crc;
    }

    public static verify(buf: Buffer, expected: number): boolean {
        return Crc32.compute(buf) === (expected >>> 0);
    }

}