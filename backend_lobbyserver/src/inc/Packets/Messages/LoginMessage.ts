import {TincatCrypto, Win1252} from 'sacredbamboo-core';
/**
 * Body of a CUSTOMDATA ClientLoginRequest (SacredMsgType = 2).
 *
 * Layout (Constants.cs + LoginMessageData.cs):
 *   +0    char Username[80]        plain Win-1252, null-padded
 *   +80   char Password[32]        Tincat-encrypted
 *   +112  char CdKey[21]           Tincat-encrypted
 *   +133  u32  PatchLevel
 *   +137  u32  ProgramVersion
 *   +141  char CdKey2[21]          Tincat-encrypted
 *   total 162 bytes  (SACRED_PACKET_META length=176 = 14 header + 162)
 */
export class LoginMessage {

    public static readonly BODY_SIZE = 162;

    public static readonly OFF_USERNAME = 0;
    public static readonly LEN_USERNAME = 80;
    public static readonly OFF_PASSWORD = 80;
    public static readonly LEN_PASSWORD = 32;
    public static readonly OFF_CDKEY = 112;
    public static readonly LEN_CDKEY = 21;
    public static readonly OFF_PATCHLEVEL = 133;
    public static readonly OFF_PROGRAMVERSION = 137;
    public static readonly OFF_CDKEY2 = 141;
    public static readonly LEN_CDKEY2 = 21;

    public username: string;
    public password: string;
    public cdKey: string;
    public patchLevel: number;
    public programVersion: number;
    public cdKey2: string;

    public constructor(
        username = '', password = '', cdKey = '',
        patchLevel = 0, programVersion = 0, cdKey2 = ''
    ) {
        this.username = username;
        this.password = password;
        this.cdKey = cdKey;
        this.patchLevel = patchLevel;
        this.programVersion = programVersion;
        this.cdKey2 = cdKey2;
    }

    public static parse(body: Buffer): LoginMessage {
        if (body.length < LoginMessage.BODY_SIZE) {
            throw new Error(`LoginMessage body too short: ${body.length} < ${LoginMessage.BODY_SIZE}`);
        }
        return new LoginMessage(
            Win1252.readString(body, LoginMessage.OFF_USERNAME, LoginMessage.LEN_USERNAME),
            TincatCrypto.decrypt(body.subarray(
                LoginMessage.OFF_PASSWORD,
                LoginMessage.OFF_PASSWORD + LoginMessage.LEN_PASSWORD
            )),
            TincatCrypto.decrypt(body.subarray(
                LoginMessage.OFF_CDKEY,
                LoginMessage.OFF_CDKEY + LoginMessage.LEN_CDKEY
            )),
            body.readUInt32LE(LoginMessage.OFF_PATCHLEVEL),
            body.readUInt32LE(LoginMessage.OFF_PROGRAMVERSION),
            TincatCrypto.decrypt(body.subarray(
                LoginMessage.OFF_CDKEY2,
                LoginMessage.OFF_CDKEY2 + LoginMessage.LEN_CDKEY2
            ))
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(LoginMessage.BODY_SIZE);
        Win1252.writeString(buf, LoginMessage.OFF_USERNAME, LoginMessage.LEN_USERNAME, this.username);
        TincatCrypto.encrypt(this.password, LoginMessage.LEN_PASSWORD)
            .copy(buf, LoginMessage.OFF_PASSWORD);
        TincatCrypto.encrypt(this.cdKey, LoginMessage.LEN_CDKEY)
            .copy(buf, LoginMessage.OFF_CDKEY);
        buf.writeUInt32LE(this.patchLevel >>> 0, LoginMessage.OFF_PATCHLEVEL);
        buf.writeUInt32LE(this.programVersion >>> 0, LoginMessage.OFF_PROGRAMVERSION);
        TincatCrypto.encrypt(this.cdKey2, LoginMessage.LEN_CDKEY2)
            .copy(buf, LoginMessage.OFF_CDKEY2);
        return buf;
    }

}