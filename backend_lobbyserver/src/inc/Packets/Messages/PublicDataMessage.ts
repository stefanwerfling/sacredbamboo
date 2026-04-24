/**
 * Body shared by ReceivePublicData (10), SendPublicData (11) and
 * ReceiveClientPublicDataFromServer (18). Total 131090 bytes (fixed
 * struct; dynamicSize on the wire allows shorter if needed but we mirror
 * the reference server and always emit the full struct to stay
 * compatible with the game client's struct reader):
 *
 *   +0      i32   PermId
 *   +4      i16   BlockId
 *   +6      i32   Size            canonical size of the block (sometimes 0)
 *   +10     i32   Offset          byte offset inside the block
 *   +14     i32   Length          valid byte count inside Data[]
 *   +18     u8[]  Data[131072]    fixed-width blob, null-padded beyond Length
 *
 * Meta length max 131104 = 14 + 131090.
 */
export class PublicDataMessage {

    public static readonly BODY_SIZE = 131090;
    public static readonly DATA_OFFSET = 18;
    public static readonly DATA_MAX = 131072;

    public permId: number;
    public blockId: number;
    public size: number;
    public offset: number;
    public length: number;
    public data: Buffer;

    public constructor(
        permId = 0, blockId = 0, size = 0, offset = 0, length = 0,
        data: Buffer = Buffer.alloc(0)
    ) {
        this.permId = permId;
        this.blockId = blockId;
        this.size = size;
        this.offset = offset;
        this.length = length;
        this.data = data;
    }

    public static parse(body: Buffer): PublicDataMessage {
        const permId = body.readInt32LE(0);
        const blockId = body.readInt16LE(4);
        const size = body.readInt32LE(6);
        const offset = body.readInt32LE(10);
        const length = body.readInt32LE(14);

        const dataEnd = Math.min(
            PublicDataMessage.DATA_OFFSET + length,
            body.length
        );
        const data = Buffer.from(body.subarray(PublicDataMessage.DATA_OFFSET, dataEnd));
        return new PublicDataMessage(permId, blockId, size, offset, length, data);
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(PublicDataMessage.BODY_SIZE);
        buf.writeInt32LE(this.permId, 0);
        buf.writeInt16LE(this.blockId, 4);
        buf.writeInt32LE(this.size, 6);
        buf.writeInt32LE(this.offset, 10);
        const copyLen = Math.min(this.length, this.data.length, PublicDataMessage.DATA_MAX);
        buf.writeInt32LE(copyLen, 14);
        this.data.copy(buf, PublicDataMessage.DATA_OFFSET, 0, copyLen);
        return buf;
    }

}