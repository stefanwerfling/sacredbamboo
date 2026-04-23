/**
 * Body of PublicDataRequest (9) and ServerRequestsClientsPublicData (19),
 * 14 bytes:
 *   +0    i32 PermId     whose data the requester wants
 *   +4    i16 BlockId    which save block (0 = cheater counter, 10 = profile, ...)
 *   +6    i32 Offset     byte offset inside the block
 *   +10   i32 Length     bytes requested
 *
 * Meta length 28 = 14 + 14.
 */
export class PublicDataRequestMessage {

    public static readonly BODY_SIZE = 14;

    public permId: number;
    public blockId: number;
    public offset: number;
    public length: number;

    public constructor(permId = 0, blockId = 0, offset = 0, length = 0) {
        this.permId = permId;
        this.blockId = blockId;
        this.offset = offset;
        this.length = length;
    }

    public static parse(body: Buffer): PublicDataRequestMessage {
        return new PublicDataRequestMessage(
            body.readInt32LE(0),
            body.readInt16LE(4),
            body.readInt32LE(6),
            body.readInt32LE(10)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(PublicDataRequestMessage.BODY_SIZE);
        buf.writeInt32LE(this.permId, 0);
        buf.writeInt16LE(this.blockId, 4);
        buf.writeInt32LE(this.offset, 6);
        buf.writeInt32LE(this.length, 10);
        return buf;
    }

}