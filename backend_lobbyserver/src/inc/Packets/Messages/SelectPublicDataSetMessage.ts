/**
 * Body of ClientCharacterSelect (17), 2 bytes:
 *   +0   u16 BlockId     which character block the client picked
 *
 * Meta length 16 = 14 + 2.
 */
export class SelectPublicDataSetMessage {

    public static readonly BODY_SIZE = 2;

    public blockId: number;

    public constructor(blockId = 0) {
        this.blockId = blockId;
    }

    public static parse(body: Buffer): SelectPublicDataSetMessage {
        return new SelectPublicDataSetMessage(body.readUInt16LE(0));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(SelectPublicDataSetMessage.BODY_SIZE);
        buf.writeUInt16LE(this.blockId & 0xFFFF, 0);
        return buf;
    }

}