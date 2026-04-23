import {Win1252} from '../../Util/Win1252.js';

/**
 * Body shared by ReceivePrivateInfo (4, server→user response) and
 * SendPrivateInfo (5, user→server update), 112 bytes:
 *   +0    char Password[32]    plain Win-1252 (NOT Tincat-encrypted in
 *                              this packet — verified against
 *                              PrivateInfoMessage.cs in the reference)
 *   +32   char Mail[80]
 *
 * Meta length 126 = 14 + 112.
 */
export class PrivateInfoMessage {

    public static readonly BODY_SIZE = 112;
    public static readonly PASSWORD_LEN = 32;
    public static readonly MAIL_LEN = 80;

    public password: string;
    public mail: string;

    public constructor(password = '', mail = '') {
        this.password = password;
        this.mail = mail;
    }

    public static parse(body: Buffer): PrivateInfoMessage {
        return new PrivateInfoMessage(
            Win1252.readString(body, 0, PrivateInfoMessage.PASSWORD_LEN),
            Win1252.readString(body, PrivateInfoMessage.PASSWORD_LEN, PrivateInfoMessage.MAIL_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(PrivateInfoMessage.BODY_SIZE);
        Win1252.writeString(buf, 0, PrivateInfoMessage.PASSWORD_LEN, this.password);
        Win1252.writeString(buf, PrivateInfoMessage.PASSWORD_LEN, PrivateInfoMessage.MAIL_LEN, this.mail);
        return buf;
    }

}