import {RawMessage} from 'figtree';
import {ATincatPacket} from './ATincatPacket.js';

/**
 * Shared 52-byte payload shape for every connection-control packet:
 * LOGMEON, LOGMEOFF, LOGONACCEPTED, LOGOFFACCEPTED. The layout is built by
 * `sub_10005E10` in tincat2.dll and observed in `sub_10004380`,
 * `sub_10005660` and `sub_100057D0`.
 *
 *   +0   u32   magic      = 0xDABAFBEF (SUB_MAGIC, independent of the
 *                           header magic even though the numeric value
 *                           happens to match)
 *   +4   i32   connId     caller-assigned id (0 on initial LOGMEON)
 *   +8   char  username[32]   null-padded, trimmed when read
 *   +40  char  password[8]    null-padded, trimmed when read
 *   +48  u32   flags      bit 0 is set by `sub_10005E10` after packing;
 *                         observed as 1 in a fully-built packet
 */
export abstract class ATincatPacketConnection extends ATincatPacket {

    public static SIZE = 52;
    public static SUB_MAGIC = 0xDABAFBEF;
    public static USERNAME_SIZE = 32;
    public static PASSWORD_SIZE = 8;

    protected _magic: number = ATincatPacketConnection.SUB_MAGIC;
    protected _connectionId: number = 0;
    protected _username: string = '';
    protected _password: string = '';
    protected _flags: number = 1;

    public constructor(data?: RawMessage) {
        if (data) {
            super(data);
            this._read();
        } else {
            super(Buffer.alloc(ATincatPacketConnection.SIZE));
        }
    }

    protected _read(): void {
        const buffer = this.getBuffer();
        this._magic = buffer.readUInt32LE(0);
        this._connectionId = buffer.readInt32LE(4);
        this._username = ATincatPacketConnection._readCString(
            buffer, 8, ATincatPacketConnection.USERNAME_SIZE
        );
        this._password = ATincatPacketConnection._readCString(
            buffer, 8 + ATincatPacketConnection.USERNAME_SIZE,
            ATincatPacketConnection.PASSWORD_SIZE
        );
        this._flags = buffer.readUInt32LE(48);
    }

    public serialize(): Buffer {
        const buf = Buffer.alloc(ATincatPacketConnection.SIZE);
        buf.writeUInt32LE(this._magic >>> 0, 0);
        buf.writeInt32LE(this._connectionId, 4);
        ATincatPacketConnection._writeCString(
            buf, 8, ATincatPacketConnection.USERNAME_SIZE, this._username
        );
        ATincatPacketConnection._writeCString(
            buf, 8 + ATincatPacketConnection.USERNAME_SIZE,
            ATincatPacketConnection.PASSWORD_SIZE, this._password
        );
        buf.writeUInt32LE(this._flags >>> 0, 48);
        return buf;
    }

    public getMagic(): number {
        return this._magic;
    }

    public getConnectionId(): number {
        return this._connectionId;
    }

    public setConnectionId(connectionId: number): void {
        this._connectionId = connectionId;
    }

    public getUsername(): string {
        return this._username;
    }

    public setUsername(username: string): void {
        this._username = username;
    }

    public getPassword(): string {
        return this._password;
    }

    public setPassword(password: string): void {
        this._password = password;
    }

    public getFlags(): number {
        return this._flags;
    }

    public setByPacket(packet: ATincatPacketConnection): void {
        this._connectionId = packet.getConnectionId();
        this._username = packet.getUsername();
        this._password = packet.getPassword();
    }

    protected static _readCString(buf: Buffer, offset: number, size: number): string {
        const slice = buf.subarray(offset, offset + size);
        const nulIdx = slice.indexOf(0);
        const end = nulIdx === -1 ? size : nulIdx;
        return slice.subarray(0, end).toString('ascii');
    }

    protected static _writeCString(buf: Buffer, offset: number, size: number, value: string): void {
        const encoded = Buffer.from(value, 'ascii');
        const copyLen = Math.min(encoded.length, size - 1);
        encoded.copy(buf, offset, 0, copyLen);
        buf.fill(0, offset + copyLen, offset + size);
    }

}