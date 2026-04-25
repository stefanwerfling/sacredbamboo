import {TincatCrypto, Win1252} from 'sacredbamboo-core';
/**
 * Body of ClientRegistrationRequest (1), 242 bytes:
 *   +0    char Username[80]       plain Win-1252
 *   +80   char Password[32]       Tincat-encrypted
 *   +112  char CdKey[21]          Tincat-encrypted
 *   +133  char Mail[80]           plain Win-1252
 *   +213  u32  PatchLevel
 *   +217  u32  ProgramVersion
 *   +221  char CdKey2[21]         Tincat-encrypted
 *
 * Meta length 256 = 14 + 242. Identical encryption scheme as LoginMessage.
 */
export class RegistrationMessage {

    public static readonly BODY_SIZE = 242;

    public username: string;
    public password: string;
    public cdKey: string;
    public mail: string;
    public patchLevel: number;
    public programVersion: number;
    public cdKey2: string;

    public constructor(
        username = '', password = '', cdKey = '', mail = '',
        patchLevel = 0, programVersion = 0, cdKey2 = ''
    ) {
        this.username = username;
        this.password = password;
        this.cdKey = cdKey;
        this.mail = mail;
        this.patchLevel = patchLevel;
        this.programVersion = programVersion;
        this.cdKey2 = cdKey2;
    }

    public static parse(body: Buffer): RegistrationMessage {
        if (body.length < RegistrationMessage.BODY_SIZE) {
            throw new Error(`RegistrationMessage body too short: ${body.length}`);
        }
        return new RegistrationMessage(
            Win1252.readString(body, 0, 80),
            TincatCrypto.decrypt(body.subarray(80, 80 + 32)),
            TincatCrypto.decrypt(body.subarray(112, 112 + 21)),
            Win1252.readString(body, 133, 80),
            body.readUInt32LE(213),
            body.readUInt32LE(217),
            TincatCrypto.decrypt(body.subarray(221, 221 + 21))
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(RegistrationMessage.BODY_SIZE);
        Win1252.writeString(buf, 0, 80, this.username);
        TincatCrypto.encrypt(this.password, 32).copy(buf, 80);
        TincatCrypto.encrypt(this.cdKey, 21).copy(buf, 112);
        Win1252.writeString(buf, 133, 80, this.mail);
        buf.writeUInt32LE(this.patchLevel >>> 0, 213);
        buf.writeUInt32LE(this.programVersion >>> 0, 217);
        TincatCrypto.encrypt(this.cdKey2, 21).copy(buf, 221);
        return buf;
    }

}