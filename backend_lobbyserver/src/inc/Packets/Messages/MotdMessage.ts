import {Win1252} from 'sacredbamboo-core';
/**
 * Body of SendMessageOfTheDay (SacredMsgType = 56, dynamic size, max 131218).
 *
 * The MotdMessageData struct in the Sacred Gold reference is declared as
 * fixed-size (131204 bytes):
 *   +0    u16  Id
 *   +2    u16  Length            length of Text in bytes
 *   +4    u8[128] Reserved
 *   +132  u8[131072] Text        null-padded, plain Win-1252
 *
 * We preserve that fixed layout so the original client can read `Text` at
 * its hard-coded offset.
 */
export class MotdMessage {

    public static readonly BODY_SIZE = 2 + 2 + 128 + 131072;
    public static readonly TEXT_OFFSET = 132;
    public static readonly TEXT_MAX = 131072;

    public id: number;
    public text: string;

    public constructor(id = 0, text = '') {
        this.id = id;
        this.text = text;
    }

    public static parse(body: Buffer): MotdMessage {
        const id = body.readUInt16LE(0);
        const length = body.readUInt16LE(2);
        const textLen = Math.min(length, Math.max(0, body.length - MotdMessage.TEXT_OFFSET));
        const text = body.subarray(
            MotdMessage.TEXT_OFFSET,
            MotdMessage.TEXT_OFFSET + textLen
        ).toString('latin1').replace(/\0+$/, '');
        return new MotdMessage(id, text);
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(MotdMessage.BODY_SIZE);
        buf.writeUInt16LE(this.id & 0xFFFF, 0);
        const encoded = Buffer.from(this.text, 'latin1');
        const textLen = Math.min(encoded.length, MotdMessage.TEXT_MAX - 1);
        buf.writeUInt16LE(textLen, 2);
        encoded.copy(buf, MotdMessage.TEXT_OFFSET, 0, textLen);
        // Rest (Reserved + trailing Text padding) stays zero from Buffer.alloc.
        return buf;
    }

}