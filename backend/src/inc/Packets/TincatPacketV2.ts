import {RawMessage} from 'figtree';
import {Crc32} from '../Util/Crc32.js';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * 28-byte Tincat V2 header. Layout (little-endian):
 *
 *   +0   u32  magic           0xDABAFBEF
 *   +4   i32  from            sender handle / connection id
 *   +8   i32  to              destination handle / connection id
 *   +12  i32  msgType         one of TincatPacketTypes
 *   +16  i32  unknown16       NOT set by the known senders — left at 0
 *   +20  i32  payloadLength   bytes of payload that follow on the wire
 *   +24  u32  checksum        CRC-32 over the payload (see Crc32)
 *
 * The header and payload are sent as two separate `send()` calls in
 * `sub_1000CBC0`; the receiver mirrors that in `sub_1000CC50`.
 */
export class TincatPacketV2 extends RawMessage {

    public static SIZE = 28;
    public static MAGIC = 0xDABAFBEF;

    protected _magic: number = TincatPacketV2.MAGIC;
    protected _from: number = 0;
    protected _to: number = 0;
    protected _msgType: TincatPacketTypes = TincatPacketTypes.None;
    protected _unknown16: number = 0;
    protected _payloadLength: number = 0;
    protected _checksum: number = 0;

    public constructor(data?: RawMessage) {
        if (data) {
            super(data);
            this._read();
        } else {
            super(Buffer.alloc(TincatPacketV2.SIZE));
        }
    }

    protected _read(): void {
        const buffer = this.getBuffer();
        this._magic = buffer.readUInt32LE(0);
        this._from = buffer.readInt32LE(4);
        this._to = buffer.readInt32LE(8);
        this._msgType = buffer.readInt32LE(12);
        this._unknown16 = buffer.readInt32LE(16);
        this._payloadLength = buffer.readInt32LE(20);
        this._checksum = buffer.readUInt32LE(24);
    }

    public getMagic(): number {
        return this._magic;
    }

    public getFrom(): number {
        return this._from;
    }

    public setFrom(from: number): void {
        this._from = from;
    }

    public getTo(): number {
        return this._to;
    }

    public setTo(to: number): void {
        this._to = to;
    }

    public getType(): TincatPacketTypes {
        return this._msgType;
    }

    public setType(type: TincatPacketTypes): void {
        this._msgType = type;
    }

    public getPayloadSize(): number {
        return this._payloadLength;
    }

    public setPayloadSize(size: number): void {
        this._payloadLength = size;
    }

    public getChecksum(): number {
        return this._checksum;
    }

    /**
     * Serialize the header into a fresh 28-byte buffer.
     *
     * `payload` is required so we can compute the CRC-32 over it the same
     * way `sub_1000CBC0` does at offset 36 of the envelope. Pass an empty
     * buffer for header-only packets — the checksum of an empty payload is 0,
     * which matches `Crc32.compute(Buffer.alloc(0))`.
     */
    public serializeHeader(payload: Buffer): Buffer {
        this._payloadLength = payload.length;
        this._checksum = Crc32.compute(payload);

        const buf = Buffer.alloc(TincatPacketV2.SIZE);
        buf.writeUInt32LE(TincatPacketV2.MAGIC, 0);
        buf.writeInt32LE(this._from, 4);
        buf.writeInt32LE(this._to, 8);
        buf.writeInt32LE(this._msgType, 12);
        buf.writeInt32LE(this._unknown16, 16);
        buf.writeInt32LE(this._payloadLength, 20);
        buf.writeUInt32LE(this._checksum >>> 0, 24);
        return buf;
    }

}