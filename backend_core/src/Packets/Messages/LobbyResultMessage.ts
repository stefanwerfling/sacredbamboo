import {SacredMsgType} from '../SacredMsgType.js';
import {LobbyResults} from './LobbyResults.js';

/**
 * Body of LobbyResult (SacredMsgType = 15, length 22 = 14 + 8):
 *   +0    i32 result        LobbyResults code
 *   +4    i32 action        the SacredMsgType this result is a response to
 *
 * The client pairs it with the last request it sent to know which operation
 * completed; we echo back the incoming type.
 */
export class LobbyResultMessage {

    public static readonly BODY_SIZE = 8;

    public result: LobbyResults;
    public action: SacredMsgType;

    public constructor(result: LobbyResults = LobbyResults.Ok, action: SacredMsgType = SacredMsgType.Reserved1) {
        this.result = result;
        this.action = action;
    }

    public static parse(body: Buffer): LobbyResultMessage {
        return new LobbyResultMessage(
            body.readInt32LE(0) as LobbyResults,
            body.readInt32LE(4) as SacredMsgType
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(LobbyResultMessage.BODY_SIZE);
        buf.writeInt32LE(this.result, 0);
        buf.writeInt32LE(this.action, 4);
        return buf;
    }

}