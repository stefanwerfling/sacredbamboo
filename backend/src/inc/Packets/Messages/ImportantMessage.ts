import {Win1252} from '../../Util/Win1252.js';

/**
 * Body of ClientImportantMessage (SacredMsgType = 48, length 275 = 14 + 261):
 *   +0    u8    VeryImportant     1 = client shows a modal popup
 *   +1    char  MessageData[256]  plain Win-1252 text
 *   +257  i32   DestinationPermId permId of the recipient (0 = current client)
 *
 * Used by the handler layer to return a human-readable error/info message
 * alongside a LobbyResult — matches the reference server's
 * `SendImportantMessage` path.
 */
export class ImportantMessage {

    public static readonly BODY_SIZE = 261;
    public static readonly MESSAGE_LEN = 256;

    public veryImportant: boolean;
    public message: string;
    public destinationPermId: number;

    public constructor(message = '', veryImportant = true, destinationPermId = 0) {
        this.message = message;
        this.veryImportant = veryImportant;
        this.destinationPermId = destinationPermId;
    }

    public static parse(body: Buffer): ImportantMessage {
        return new ImportantMessage(
            Win1252.readString(body, 1, ImportantMessage.MESSAGE_LEN),
            body[0] !== 0,
            body.readInt32LE(1 + ImportantMessage.MESSAGE_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(ImportantMessage.BODY_SIZE);
        buf[0] = this.veryImportant ? 1 : 0;
        Win1252.writeString(buf, 1, ImportantMessage.MESSAGE_LEN, this.message);
        buf.writeInt32LE(this.destinationPermId, 1 + ImportantMessage.MESSAGE_LEN);
        return buf;
    }

}