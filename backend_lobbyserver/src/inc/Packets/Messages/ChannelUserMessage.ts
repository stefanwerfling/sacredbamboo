import {Win1252} from 'sacredbamboo-core';
/**
 * Body of OtherUserJoinedChannel (28) and OtherUserLeftChannel (29):
 *   +0   i32  PermId
 *   +4   char Username[80]
 *
 * Meta length is 98 = 14 + 84.
 */
export class ChannelUserMessage {

    public static readonly BODY_SIZE = 84;
    public static readonly NAME_LEN = 80;

    public permId: number;
    public username: string;

    public constructor(permId = 0, username = '') {
        this.permId = permId;
        this.username = username;
    }

    public static parse(body: Buffer): ChannelUserMessage {
        return new ChannelUserMessage(
            body.readInt32LE(0),
            Win1252.readString(body, 4, ChannelUserMessage.NAME_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(ChannelUserMessage.BODY_SIZE);
        buf.writeInt32LE(this.permId, 0);
        Win1252.writeString(buf, 4, ChannelUserMessage.NAME_LEN, this.username);
        return buf;
    }

}