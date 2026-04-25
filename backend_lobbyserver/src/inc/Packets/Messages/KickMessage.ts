import {Win1252} from 'sacredbamboo-core';
/**
 * Body of Kick (34), 256 bytes:
 *   +0   char Reason[256]    human-readable reason shown to the kicked user
 *
 * Meta length 270 = 14 + 256. Outbound only (AllowedClients.None).
 */
export class KickMessage {

    public static readonly BODY_SIZE = 256;

    public reason: string;

    public constructor(reason = '') {
        this.reason = reason;
    }

    public static parse(body: Buffer): KickMessage {
        return new KickMessage(Win1252.readString(body, 0, KickMessage.BODY_SIZE));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(KickMessage.BODY_SIZE);
        Win1252.writeString(buf, 0, KickMessage.BODY_SIZE, this.reason);
        return buf;
    }

}