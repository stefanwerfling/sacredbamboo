/**
 * Body of UserJoinedServer (45). Sent by a GameServer to the lobby when
 * a user joins a hosted game:
 *   +0   i32 PermId       the account that joined
 *   +4   i16 BlockId      which save block they brought
 *   +6   u16 Check        opaque verification token
 *
 * Meta length 22 = 14 + 8.
 */
export class UserJoinedServerMessage {

    public static readonly BODY_SIZE = 8;

    public permId: number;
    public blockId: number;
    public check: number;

    public constructor(permId = 0, blockId = 0, check = 0) {
        this.permId = permId;
        this.blockId = blockId;
        this.check = check;
    }

    public static parse(body: Buffer): UserJoinedServerMessage {
        return new UserJoinedServerMessage(
            body.readInt32LE(0),
            body.readInt16LE(4),
            body.readUInt16LE(6)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(UserJoinedServerMessage.BODY_SIZE);
        buf.writeInt32LE(this.permId, 0);
        buf.writeInt16LE(this.blockId, 4);
        buf.writeUInt16LE(this.check & 0xFFFF, 6);
        return buf;
    }

}