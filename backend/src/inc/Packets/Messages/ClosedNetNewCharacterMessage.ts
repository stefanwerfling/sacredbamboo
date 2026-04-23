/**
 * Body of ClosedNetNewCharacter (39), 4 bytes:
 *   +0   i16 BlockId       save block slot
 *   +2   i16 TemplateId    character template
 *
 * Meta length 18 = 14 + 4. The reference server uses this to initialize a
 * DB save file; we simply ack for now (no closed-net save system yet).
 */
export class ClosedNetNewCharacterMessage {

    public static readonly BODY_SIZE = 4;

    public blockId: number;
    public templateId: number;

    public constructor(blockId = 0, templateId = 0) {
        this.blockId = blockId;
        this.templateId = templateId;
    }

    public static parse(body: Buffer): ClosedNetNewCharacterMessage {
        return new ClosedNetNewCharacterMessage(
            body.readInt16LE(0),
            body.readInt16LE(2)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(ClosedNetNewCharacterMessage.BODY_SIZE);
        buf.writeInt16LE(this.blockId, 0);
        buf.writeInt16LE(this.templateId, 2);
        return buf;
    }

}