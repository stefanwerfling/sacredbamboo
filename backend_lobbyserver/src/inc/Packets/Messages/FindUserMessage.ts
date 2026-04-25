import {Win1252} from 'sacredbamboo-core';
/**
 * Body of FindUserRequest (36), 80 bytes:
 *   +0   char Name[80]
 *
 * Meta length 94 = 14 + 80. The response is a FoundUser (37) carrying a
 * FriendInfoMessage body.
 */
export class FindUserMessage {

    public static readonly BODY_SIZE = 80;

    public name: string;

    public constructor(name = '') {
        this.name = name;
    }

    public static parse(body: Buffer): FindUserMessage {
        return new FindUserMessage(Win1252.readString(body, 0, FindUserMessage.BODY_SIZE));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(FindUserMessage.BODY_SIZE);
        Win1252.writeString(buf, 0, FindUserMessage.BODY_SIZE, this.name);
        return buf;
    }

}