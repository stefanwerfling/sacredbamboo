import {Win1252} from '../../Util/Win1252.js';
import {BuddyStatus} from './BuddyStatus.js';

/**
 * Body shared by UpdateFriendStatus (54) and FoundUser (37), 260 bytes:
 *   +0    i32   DestinationPermId
 *   +4    i32   Status             BuddyStatus
 *   +8    char  Username[80]
 *   +88   i32   PermId             the friend's permId
 *   +92   i32   GameId             0 when not in a game
 *   +96   char  GameName[80]
 *   +176  i32   ChannelId          0 when not in a channel
 *   +180  char  ChannelName[80]
 *
 * Meta length 274 = 14 + 260.
 */
export class FriendInfoMessage {

    public static readonly BODY_SIZE = 260;
    public static readonly NAME_LEN = 80;

    public destinationPermId: number;
    public status: BuddyStatus;
    public username: string;
    public permId: number;
    public gameId: number;
    public gameName: string;
    public channelId: number;
    public channelName: string;

    public constructor(
        destinationPermId = 0,
        status: BuddyStatus = BuddyStatus.Offline,
        username = '',
        permId = 0,
        gameId = 0,
        gameName = '',
        channelId = 0,
        channelName = ''
    ) {
        this.destinationPermId = destinationPermId;
        this.status = status;
        this.username = username;
        this.permId = permId;
        this.gameId = gameId;
        this.gameName = gameName;
        this.channelId = channelId;
        this.channelName = channelName;
    }

    public static parse(body: Buffer): FriendInfoMessage {
        return new FriendInfoMessage(
            body.readInt32LE(0),
            body.readInt32LE(4) as BuddyStatus,
            Win1252.readString(body, 8, FriendInfoMessage.NAME_LEN),
            body.readInt32LE(88),
            body.readInt32LE(92),
            Win1252.readString(body, 96, FriendInfoMessage.NAME_LEN),
            body.readInt32LE(176),
            Win1252.readString(body, 180, FriendInfoMessage.NAME_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(FriendInfoMessage.BODY_SIZE);
        buf.writeInt32LE(this.destinationPermId, 0);
        buf.writeInt32LE(this.status, 4);
        Win1252.writeString(buf, 8, FriendInfoMessage.NAME_LEN, this.username);
        buf.writeInt32LE(this.permId, 88);
        buf.writeInt32LE(this.gameId, 92);
        Win1252.writeString(buf, 96, FriendInfoMessage.NAME_LEN, this.gameName);
        buf.writeInt32LE(this.channelId, 176);
        Win1252.writeString(buf, 180, FriendInfoMessage.NAME_LEN, this.channelName);
        return buf;
    }

}