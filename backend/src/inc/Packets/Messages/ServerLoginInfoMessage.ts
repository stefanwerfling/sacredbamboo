/**
 * Body of ServerLoginResult (SacredMsgType = 38, length 18 = 14 + 4):
 *   +0  u8[4] Ip     the external IP the lobby observed on the connection
 *
 * Sent by the lobby immediately after a successful ServerLoginRequest so
 * the game-server learns how it looks from the outside.
 */
export class ServerLoginInfoMessage {

    public static readonly BODY_SIZE = 4;

    public ip: [number, number, number, number];

    public constructor(ip: [number, number, number, number] = [0, 0, 0, 0]) {
        this.ip = ip;
    }

    public static parse(body: Buffer): ServerLoginInfoMessage {
        return new ServerLoginInfoMessage([body[0], body[1], body[2], body[3]]);
    }

    public serialize(): Buffer {
        return Buffer.from(this.ip);
    }

}