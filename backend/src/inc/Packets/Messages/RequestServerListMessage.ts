/**
 * Body of ServerListRequest (20):
 *   +0   i32 ChannelId   channel the client wants servers for
 *
 * Meta length is 18 = 14 + 4. The response is a stream of SendServerInfo
 * packets, one per server, followed by a LobbyResult ack.
 */
export class RequestServerListMessage {

    public static readonly BODY_SIZE = 4;

    public channelId: number;

    public constructor(channelId = 0) {
        this.channelId = channelId;
    }

    public static parse(body: Buffer): RequestServerListMessage {
        return new RequestServerListMessage(body.readInt32LE(0));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(RequestServerListMessage.BODY_SIZE);
        buf.writeInt32LE(this.channelId, 0);
        return buf;
    }

}