/**
 * Body of AddFriend (51) and RemoveFriend (52), 8 bytes:
 *   +0  i32 FromPermId   the requester (echoed from the client)
 *   +4  i32 BuddyPermId  the account they want to add/remove
 *
 * Meta length 22 = 14 + 8.
 */
export class BuddyMessage {

    public static readonly BODY_SIZE = 8;

    public fromPermId: number;
    public buddyPermId: number;

    public constructor(fromPermId = 0, buddyPermId = 0) {
        this.fromPermId = fromPermId;
        this.buddyPermId = buddyPermId;
    }

    public static parse(body: Buffer): BuddyMessage {
        return new BuddyMessage(body.readInt32LE(0), body.readInt32LE(4));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(BuddyMessage.BODY_SIZE);
        buf.writeInt32LE(this.fromPermId, 0);
        buf.writeInt32LE(this.buddyPermId, 4);
        return buf;
    }

}