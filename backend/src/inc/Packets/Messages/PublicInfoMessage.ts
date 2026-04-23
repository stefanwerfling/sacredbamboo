import {Win1252} from '../../Util/Win1252.js';

/**
 * Body shared by ReceivePublicInfo (7, user→server update) and
 * SendPublicInfo (8, server→user response), 84 bytes:
 *   +0   i32  PermId
 *   +4   char Username[80]
 *
 * Meta length 98 = 14 + 84.
 */
export class PublicInfoMessage {

    public static readonly BODY_SIZE = 84;
    public static readonly NAME_LEN = 80;

    public permId: number;
    public username: string;

    public constructor(permId = 0, username = '') {
        this.permId = permId;
        this.username = username;
    }

    public static parse(body: Buffer): PublicInfoMessage {
        return new PublicInfoMessage(
            body.readInt32LE(0),
            Win1252.readString(body, 4, PublicInfoMessage.NAME_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(PublicInfoMessage.BODY_SIZE);
        buf.writeInt32LE(this.permId, 0);
        Win1252.writeString(buf, 4, PublicInfoMessage.NAME_LEN, this.username);
        return buf;
    }

}