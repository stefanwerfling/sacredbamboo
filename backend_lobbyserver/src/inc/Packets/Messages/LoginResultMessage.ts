import {LobbyResults, Win1252} from 'sacredbamboo-core';
/**
 * Body of ClientLoginResult (SacredMsgType = 16, length 282 = 14 + 268):
 *   +0    i32   result       LobbyResults code
 *   +4    u8[4] ip           the IP the client appears to come from
 *   +8    i32   permId       account id assigned/echoed by the server
 *   +12   char  message[256] welcome / status text, plain Win-1252
 */
export class LoginResultMessage {

    public static readonly BODY_SIZE = 268;
    public static readonly MESSAGE_LEN = 256;

    public result: LobbyResults;
    public ip: [number, number, number, number];
    public permId: number;
    public message: string;

    public constructor(
        result: LobbyResults = LobbyResults.Ok,
        ip: [number, number, number, number] = [0, 0, 0, 0],
        permId = 0,
        message = ''
    ) {
        this.result = result;
        this.ip = ip;
        this.permId = permId;
        this.message = message;
    }

    public static parse(body: Buffer): LoginResultMessage {
        return new LoginResultMessage(
            body.readInt32LE(0) as LobbyResults,
            [body[4], body[5], body[6], body[7]],
            body.readInt32LE(8),
            Win1252.readString(body, 12, LoginResultMessage.MESSAGE_LEN)
        );
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(LoginResultMessage.BODY_SIZE);
        buf.writeInt32LE(this.result, 0);
        buf[4] = this.ip[0] & 0xFF;
        buf[5] = this.ip[1] & 0xFF;
        buf[6] = this.ip[2] & 0xFF;
        buf[7] = this.ip[3] & 0xFF;
        buf.writeInt32LE(this.permId, 8);
        Win1252.writeString(buf, 12, LoginResultMessage.MESSAGE_LEN, this.message);
        return buf;
    }

    public static ipFromString(ip: string): [number, number, number, number] {
        const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
        if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
            return [0, 0, 0, 0];
        }
        return [parts[0], parts[1], parts[2], parts[3]];
    }

}