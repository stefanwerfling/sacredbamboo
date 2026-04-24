/**
 * Body of MessageOfTheDayRequest (SacredMsgType = 55, length 144 = 14 + 130):
 *   +0    u16  Id
 *   +2    u8[128] Reserved
 *
 * The `Id` is echoed back in the response so the client can correlate
 * request and reply. `Reserved` has been observed all-zero; we ignore it.
 */
export class MotdRequestMessage {

    public static readonly BODY_SIZE = 130;

    public id: number;
    public reserved: Buffer;

    public constructor(id = 0, reserved: Buffer = Buffer.alloc(128)) {
        this.id = id;
        this.reserved = reserved;
    }

    public static parse(body: Buffer): MotdRequestMessage {
        return new MotdRequestMessage(
            body.readUInt16LE(0),
            Buffer.from(body.subarray(2, 2 + 128))
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(MotdRequestMessage.BODY_SIZE);
        buf.writeUInt16LE(this.id & 0xFFFF, 0);
        this.reserved.copy(buf, 2, 0, Math.min(128, this.reserved.length));
        return buf;
    }

}