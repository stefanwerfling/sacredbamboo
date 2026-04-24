import {Win1252} from '../../Util/Win1252.js';

/**
 * Body shared by SendChatMessage (31), ReceiveChatMessage (30),
 * SendPrivateChatMessage (33), ReceivePrivateChatMessage (32):
 *
 *   +0    char SenderName[80]
 *   +80   i32  SenderPermId
 *   +84   i32  DestinationPermId
 *   +88   char Text[256]
 *
 * Total 344 bytes. Meta length is 358 = 14 + 344. Public broadcast uses
 * `destinationPermId = 0`; private chat uses the target user's permId.
 */
export class ChatMessage {

    public static readonly BODY_SIZE = 344;
    public static readonly NAME_LEN = 80;
    public static readonly TEXT_LEN = 256;

    public senderName: string;
    public senderPermId: number;
    public destinationPermId: number;
    public text: string;

    public constructor(senderName = '', senderPermId = 0, destinationPermId = 0, text = '') {
        this.senderName = senderName;
        this.senderPermId = senderPermId;
        this.destinationPermId = destinationPermId;
        this.text = text;
    }

    public static parse(body: Buffer): ChatMessage {
        return new ChatMessage(
            Win1252.readString(body, 0, ChatMessage.NAME_LEN),
            body.readInt32LE(80),
            body.readInt32LE(84),
            Win1252.readString(body, 88, ChatMessage.TEXT_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(ChatMessage.BODY_SIZE);
        Win1252.writeString(buf, 0, ChatMessage.NAME_LEN, this.senderName);
        buf.writeInt32LE(this.senderPermId, 80);
        buf.writeInt32LE(this.destinationPermId, 84);
        Win1252.writeString(buf, 88, ChatMessage.TEXT_LEN, this.text);
        return buf;
    }

}