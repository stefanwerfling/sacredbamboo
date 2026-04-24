/**
 * Body of ChannelJoinRequest (25) and UserJoinChannel (26) — same
 * 2-byte payload both directions, only the direction/semantics differ:
 *
 *   +0   u16 ChannelId
 *
 * Meta length is 16 = 14 + 2.
 */
export class JoinChannelMessage {

    public static readonly BODY_SIZE = 2;

    public channelId: number;

    public constructor(channelId = 0) {
        this.channelId = channelId;
    }

    public static parse(body: Buffer): JoinChannelMessage {
        return new JoinChannelMessage(body.readUInt16LE(0));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(JoinChannelMessage.BODY_SIZE);
        buf.writeUInt16LE(this.channelId & 0xFFFF, 0);
        return buf;
    }

}