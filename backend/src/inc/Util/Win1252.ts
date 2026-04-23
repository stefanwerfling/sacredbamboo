/**
 * Minimal Windows-1252 codec sufficient for the Sacred lobby protocol.
 *
 * Node's Buffer doesn't ship a native 'win1252' encoding; 'latin1'
 * (ISO-8859-1) agrees with Windows-1252 for codepoints 0x00-0x7F and
 * 0xA0-0xFF. The 0x80-0x9F range differs (Euro sign, smart quotes, etc.).
 * For Sacred payloads (usernames, chat) that deviation hasn't mattered in
 * the reference implementation, so we accept the small loss and use
 * 'latin1' — swap to `iconv-lite` later if Euro signs start showing up.
 *
 * All strings in the Sacred wire format live in fixed-width buffers,
 * null-terminated, with the remaining bytes zero-filled.
 */
export class Win1252 {

    public static readString(buf: Buffer, offset: number, maxLen: number): string {
        const slice = buf.subarray(offset, offset + maxLen);
        const nul = slice.indexOf(0);
        const end = nul === -1 ? maxLen : nul;
        return slice.subarray(0, end).toString('latin1');
    }

    public static writeString(buf: Buffer, offset: number, maxLen: number, value: string): void {
        const encoded = Buffer.from(value, 'latin1');
        const copyLen = Math.min(encoded.length, maxLen - 1);
        encoded.copy(buf, offset, 0, copyLen);
        buf.fill(0, offset + copyLen, offset + maxLen);
    }

}