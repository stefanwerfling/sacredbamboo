/**
 * Tincat string obfuscation. Not cryptographically secure — this is the
 * stateful XOR scheme that the original Sacred client uses for password,
 * CD-key and CD-key2 fields inside LoginMessageData. Reverse-engineered via
 * the Sacred-Gold-LobbyServer C# reference (`Utils.TincatDecrypt` /
 * `TincatEncrypt`). Key is the ASCII string "Sacred", initial `num` = 63.
 *
 * Decrypt:  plain[i] = ((cipher[i] ^ key[i%6]) - i - num_prev) & 0xFF
 *           num := plain[i]
 *
 * Encrypt:  cipher[i] = ((plain[i] + i + num_prev) ^ key[i%6]) & 0xFF
 *           num := plain[i]
 *
 * Both are processed over the FULL fixed-width field (including the
 * trailing zero bytes that pad the plaintext after the null terminator).
 */
export class TincatCrypto {

    private static readonly KEY = Buffer.from('Sacred', 'ascii');

    public static decrypt(cipher: Buffer): string {
        const key = TincatCrypto.KEY;
        const out = Buffer.alloc(cipher.length);
        let num = 63;
        for (let i = 0; i < cipher.length; i++) {
            const v = (cipher[i] ^ key[i % key.length]) - i - num;
            out[i] = v & 0xFF;
            num = out[i];
        }
        const nul = out.indexOf(0);
        return out.subarray(0, nul === -1 ? out.length : nul).toString('latin1');
    }

    public static encrypt(plain: string, targetLen: number): Buffer {
        const key = TincatCrypto.KEY;
        const out = Buffer.alloc(targetLen);
        let num = 63;
        // Write the plaintext byte (or 0 once past the end) into out[i] so
        // encryption mirrors decryption byte-for-byte.
        for (let i = 0; i < targetLen; i++) {
            const ch = i < plain.length ? plain.charCodeAt(i) & 0xFF : 0;
            out[i] = ((ch + i + num) ^ key[i % key.length]) & 0xFF;
            num = ch;
        }
        return out;
    }

}