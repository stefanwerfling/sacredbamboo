/**
 * Body of UserLeftServer (46). Sent by a GameServer when a user quits:
 *   +0   i32 PermId
 *
 * Meta length 18 = 14 + 4.
 */
export class UserLeftServerMessage {

    public static readonly BODY_SIZE = 4;

    public permId: number;

    public constructor(permId = 0) {
        this.permId = permId;
    }

    public static parse(body: Buffer): UserLeftServerMessage {
        return new UserLeftServerMessage(body.readInt32LE(0));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(UserLeftServerMessage.BODY_SIZE);
        buf.writeInt32LE(this.permId, 0);
        return buf;
    }

}