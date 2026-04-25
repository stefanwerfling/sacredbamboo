import {Win1252} from '../../Util/Win1252.js';

/**
 * Body shared by ServerLoginRequest / ServerChangePublicInfo / ServerLogout
 * / SendServerInfo / RemoveServer (all 130 bytes = 14 + 116). Layout from
 * ServerInfoMessageData.cs:
 *
 *   +0   char Name[80]             server display name
 *   +80  u8[4] LanIp                internal IP the server listens on
 *   +84  u8[4] ExternalIp           lobby fills this in from socket peer
 *   +88  u32  Port
 *   +92  i16  PlayerCount
 *   +94  i16  PlayerMax
 *   +96  i32  Flags                 ServerFlags bitmask
 *   +100 u32  ServerId              set by lobby to the client's connId
 *   +104 i32  NetworkVersion
 *   +108 i32  ClientGameVersion
 *   +112 i32  ChannelId
 */
export class ServerInfoMessage {

    public static readonly BODY_SIZE = 116;

    public name: string;
    public lanIp: [number, number, number, number];
    public externalIp: [number, number, number, number];
    public port: number;
    public playerCount: number;
    public playerMax: number;
    public flags: number;
    public serverId: number;
    public networkVersion: number;
    public clientGameVersion: number;
    public channelId: number;

    public constructor() {
        this.name = '';
        this.lanIp = [0, 0, 0, 0];
        this.externalIp = [0, 0, 0, 0];
        this.port = 0;
        this.playerCount = 0;
        this.playerMax = 0;
        this.flags = 0;
        this.serverId = 0;
        this.networkVersion = 0;
        this.clientGameVersion = 0;
        this.channelId = 0;
    }

    public static parse(body: Buffer): ServerInfoMessage {
        const m = new ServerInfoMessage();
        m.name = Win1252.readString(body, 0, 80);
        m.lanIp = [body[80], body[81], body[82], body[83]];
        m.externalIp = [body[84], body[85], body[86], body[87]];
        m.port = body.readUInt32LE(88);
        m.playerCount = body.readInt16LE(92);
        m.playerMax = body.readInt16LE(94);
        m.flags = body.readInt32LE(96);
        m.serverId = body.readUInt32LE(100);
        m.networkVersion = body.readInt32LE(104);
        m.clientGameVersion = body.readInt32LE(108);
        m.channelId = body.readInt32LE(112);
        return m;
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(ServerInfoMessage.BODY_SIZE);
        Win1252.writeString(buf, 0, 80, this.name);
        buf[80] = this.lanIp[0] & 0xFF; buf[81] = this.lanIp[1] & 0xFF;
        buf[82] = this.lanIp[2] & 0xFF; buf[83] = this.lanIp[3] & 0xFF;
        buf[84] = this.externalIp[0] & 0xFF; buf[85] = this.externalIp[1] & 0xFF;
        buf[86] = this.externalIp[2] & 0xFF; buf[87] = this.externalIp[3] & 0xFF;
        buf.writeUInt32LE(this.port >>> 0, 88);
        buf.writeInt16LE(this.playerCount, 92);
        buf.writeInt16LE(this.playerMax, 94);
        buf.writeInt32LE(this.flags, 96);
        buf.writeUInt32LE(this.serverId >>> 0, 100);
        buf.writeInt32LE(this.networkVersion, 104);
        buf.writeInt32LE(this.clientGameVersion, 108);
        buf.writeInt32LE(this.channelId, 112);
        return buf;
    }

}