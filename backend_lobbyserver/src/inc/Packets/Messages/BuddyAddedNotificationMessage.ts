import {Win1252} from 'sacredbamboo-core';
/**
 * Body of AddedToFriends (53). Sent to the target of an AddFriend:
 *   +0   i32   DestinationPermId   recipient's permId (per-receiver rewrite)
 *   +4   i32   AdderPermId         permId of the user who added them
 *   +8   char  AdderName[80]       display name of the adder
 *
 * Meta length 102 = 14 + 88.
 */
export class BuddyAddedNotificationMessage {

    public static readonly BODY_SIZE = 88;
    public static readonly NAME_LEN = 80;

    public destinationPermId: number;
    public adderPermId: number;
    public adderName: string;

    public constructor(destinationPermId = 0, adderPermId = 0, adderName = '') {
        this.destinationPermId = destinationPermId;
        this.adderPermId = adderPermId;
        this.adderName = adderName;
    }

    public static parse(body: Buffer): BuddyAddedNotificationMessage {
        return new BuddyAddedNotificationMessage(
            body.readInt32LE(0),
            body.readInt32LE(4),
            Win1252.readString(body, 8, BuddyAddedNotificationMessage.NAME_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(BuddyAddedNotificationMessage.BODY_SIZE);
        buf.writeInt32LE(this.destinationPermId, 0);
        buf.writeInt32LE(this.adderPermId, 4);
        Win1252.writeString(buf, 8, BuddyAddedNotificationMessage.NAME_LEN, this.adderName);
        return buf;
    }

}