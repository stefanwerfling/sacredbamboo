import {SacredMsgType} from './SacredMsgType.js';

/**
 * 14-byte security header that sits between the `moduleId`/`subType` prefix
 * and the actual body of a CUSTOMDATA sub-packet.
 *
 *   +0   u16  type          redundant copy of the sub-packet type
 *   +2   u32  securityKey   constant per-type magic (see SACRED_PACKET_META)
 *   +6   i32  length        14 + body.length (the security header counts itself)
 *   +10  u32  checksum      always written as 0 — the Sacred Gold reference
 *                           server does not validate it either; the outer
 *                           Tincat CRC-32 already covers the body
 *
 * All little-endian.
 */
export class SacredPacketSecurityHeader {

    public static readonly SIZE = 14;

    public type: SacredMsgType;
    public securityKey: number;
    public length: number;
    public checksum: number;

    public constructor(
        type: SacredMsgType = SacredMsgType.Reserved1,
        securityKey: number = 0,
        length: number = 0,
        checksum: number = 0
    ) {
        this.type = type;
        this.securityKey = securityKey;
        this.length = length;
        this.checksum = checksum;
    }

    public static read(buf: Buffer, offset: number = 0): SacredPacketSecurityHeader {
        return new SacredPacketSecurityHeader(
            buf.readUInt16LE(offset + 0) as SacredMsgType,
            buf.readUInt32LE(offset + 2),
            buf.readInt32LE(offset + 6),
            buf.readUInt32LE(offset + 10)
        );
    }

    public write(buf: Buffer, offset: number = 0): void {
        buf.writeUInt16LE(this.type & 0xFFFF, offset + 0);
        buf.writeUInt32LE(this.securityKey >>> 0, offset + 2);
        buf.writeInt32LE(this.length, offset + 6);
        buf.writeUInt32LE(this.checksum >>> 0, offset + 10);
    }

}