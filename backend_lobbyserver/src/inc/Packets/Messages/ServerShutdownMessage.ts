import {Win1252} from 'sacredbamboo-core';
/**
 * Body of ServerShutdown (50), 256 bytes:
 *   +0   char MessageData[256]    shutdown note displayed on each client
 *
 * Meta length 270 = 14 + 256. Outbound only (AllowedClients.None).
 */
export class ServerShutdownMessage {

    public static readonly BODY_SIZE = 256;

    public message: string;

    public constructor(message = '') {
        this.message = message;
    }

    public static parse(body: Buffer): ServerShutdownMessage {
        return new ServerShutdownMessage(Win1252.readString(body, 0, ServerShutdownMessage.BODY_SIZE));
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(ServerShutdownMessage.BODY_SIZE);
        Win1252.writeString(buf, 0, ServerShutdownMessage.BODY_SIZE, this.message);
        return buf;
    }

}