/**
 * Body of PublicInfoRequest (6), 4 bytes:
 *   +0   i32 PermId    whose public info the requester wants
 *
 * Meta length 18 = 14 + 4. The response is SendPublicInfo (8) carrying
 * a PublicInfoMessage.
 */
export class PublicInfoRequestMessage {

    public static readonly BODY_SIZE = 4;

    public permId: number;

    public constructor(permId = 0) {
        this.permId = permId;
    }

    public static parse(body: Buffer): PublicInfoRequestMessage {
        return new PublicInfoRequestMessage(body.readInt32LE(0));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(PublicInfoRequestMessage.BODY_SIZE);
        buf.writeInt32LE(this.permId, 0);
        return buf;
    }

}