import {Win1252} from '../../Util/Win1252.js';
import {KickReasons} from './KickReasons.js';

/**
 * Body of UserKickedFromServer (47). The lobby tells clients a user was
 * kicked from a game:
 *   +0    i32  PermId        which user was kicked
 *   +4    i32  Reason        KickReasons enum
 *   +8    char Text[256]     free-form reason text
 *
 * Meta length 278 = 14 + 264. Outbound only (AllowedClients.None).
 */
export class UserKickedFromServerMessage {

    public static readonly BODY_SIZE = 264;
    public static readonly TEXT_LEN = 256;

    public permId: number;
    public reason: KickReasons;
    public text: string;

    public constructor(permId = 0, reason: KickReasons = KickReasons.CustomReason, text = '') {
        this.permId = permId;
        this.reason = reason;
        this.text = text;
    }

    public static parse(body: Buffer): UserKickedFromServerMessage {
        return new UserKickedFromServerMessage(
            body.readInt32LE(0),
            body.readInt32LE(4) as KickReasons,
            Win1252.readString(body, 8, UserKickedFromServerMessage.TEXT_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(UserKickedFromServerMessage.BODY_SIZE);
        buf.writeInt32LE(this.permId, 0);
        buf.writeInt32LE(this.reason, 4);
        Win1252.writeString(buf, 8, UserKickedFromServerMessage.TEXT_LEN, this.text);
        return buf;
    }

}