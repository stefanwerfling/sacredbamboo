import {ClientType} from '../Client/ClientType.js';
import {SacredMsgType} from './SacredMsgType.js';
import {SacredPacketSecurityHeader} from './SacredPacketSecurityHeader.js';
import {AllowedClients, clientTypeToFlag, SACRED_PACKET_META} from './SacredPacketMeta.js';

/**
 * Thrown when a CUSTOMDATA payload fails validation. Carrying the reason
 * lets the dispatcher decide whether to log-and-ignore or drop the client.
 */
export class SacredPacketParseError extends Error {

    public readonly reason: string;

    public constructor(reason: string) {
        super(reason);
        this.reason = reason;
        this.name = 'SacredPacketParseError';
    }

}

/**
 * A sub-packet carried inside a CUSTOMDATA Tincat frame.
 *
 * Wire layout (all little-endian, immediately after the 28-byte Tincat V2
 * header):
 *
 *   +0   u16  moduleId       must equal SacredPacket.MODULE_ID = 9910
 *   +2   i16  type           SacredMsgType
 *   +4   u32  securityHeader (see SacredPacketSecurityHeader, 14 bytes)
 *   +18  ...  body           size = securityHeader.length - 14
 *
 * `parse()` performs the same validation the Sacred Gold reference server
 * does:
 *   - moduleId   == MODULE_ID
 *   - securityHeader.type == prefix type
 *   - securityHeader.securityKey matches the metadata table
 *   - AllowedClients.HasFlag(client.type)
 *   - length matches the metadata table (unless dynamicSize)
 */
export class SacredPacket {

    public static readonly MODULE_ID = 9910;
    public static readonly PREFIX_SIZE = 4; // moduleId + type
    public static readonly MIN_SIZE = SacredPacket.PREFIX_SIZE + SacredPacketSecurityHeader.SIZE;

    public readonly type: SacredMsgType;
    public readonly body: Buffer;

    public constructor(type: SacredMsgType, body: Buffer = Buffer.alloc(0)) {
        this.type = type;
        this.body = body;
    }

    /**
     * Parse a CUSTOMDATA payload. Throws SacredPacketParseError if any
     * structural or policy check fails.
     */
    public static parse(payload: Buffer, clientType: ClientType): SacredPacket {
        if (payload.length < SacredPacket.MIN_SIZE) {
            throw new SacredPacketParseError(
                `payload too short: ${payload.length} < ${SacredPacket.MIN_SIZE}`
            );
        }

        const moduleId = payload.readUInt16LE(0);
        if (moduleId !== SacredPacket.MODULE_ID) {
            throw new SacredPacketParseError(`bad moduleId 0x${moduleId.toString(16)}`);
        }

        const type = payload.readInt16LE(2) as SacredMsgType;
        const header = SacredPacketSecurityHeader.read(payload, SacredPacket.PREFIX_SIZE);

        if (header.type !== type) {
            throw new SacredPacketParseError(
                `type mismatch: prefix=${type} security=${header.type}`
            );
        }

        const meta = SACRED_PACKET_META.get(type);
        if (meta === undefined) {
            throw new SacredPacketParseError(`unknown sub-type ${type}`);
        }

        if (header.securityKey !== (meta.securityKey >>> 0)) {
            throw new SacredPacketParseError(
                `bad securityKey for ${SacredMsgType[type]}: ` +
                `got 0x${(header.securityKey >>> 0).toString(16)} ` +
                `want 0x${(meta.securityKey >>> 0).toString(16)}`
            );
        }

        const clientFlag = clientTypeToFlag(clientType);
        if ((meta.allowedClients & clientFlag) === 0 && meta.allowedClients !== AllowedClients.None) {
            throw new SacredPacketParseError(
                `${SacredMsgType[type]} not allowed from client role ${ClientType[clientType]}`
            );
        }

        // The reference server checks `meta.length == payload.length - 4`,
        // i.e. length is counted from the start of the security header.
        const declaredBodyEnd = SacredPacket.PREFIX_SIZE + header.length;
        if (declaredBodyEnd > payload.length) {
            throw new SacredPacketParseError(
                `security.length ${header.length} overruns payload (${payload.length - 4} available)`
            );
        }

        if (!meta.dynamicSize && header.length !== meta.length) {
            throw new SacredPacketParseError(
                `length mismatch for ${SacredMsgType[type]}: ` +
                `got ${header.length} want ${meta.length}`
            );
        }

        const bodyStart = SacredPacket.PREFIX_SIZE + SacredPacketSecurityHeader.SIZE;
        const body = Buffer.from(payload.subarray(bodyStart, declaredBodyEnd));
        return new SacredPacket(type, body);
    }

    /**
     * Build a CUSTOMDATA payload (the bytes that go after the 28-byte
     * Tincat header). The metadata table supplies the securityKey and the
     * length is computed from the body. If the type has no metadata entry
     * we refuse to serialize — that's a caller bug.
     */
    public serialize(): Buffer {
        const meta = SACRED_PACKET_META.get(this.type);
        if (meta === undefined) {
            throw new Error(`cannot serialize unknown SacredMsgType ${this.type}`);
        }

        const totalLen = SacredPacket.PREFIX_SIZE + SacredPacketSecurityHeader.SIZE + this.body.length;
        const buf = Buffer.alloc(totalLen);
        buf.writeUInt16LE(SacredPacket.MODULE_ID, 0);
        buf.writeInt16LE(this.type & 0xFFFF, 2);

        const header = new SacredPacketSecurityHeader(
            this.type,
            meta.securityKey,
            SacredPacketSecurityHeader.SIZE + this.body.length,
            0 // checksum intentionally 0; not validated
        );
        header.write(buf, SacredPacket.PREFIX_SIZE);
        this.body.copy(buf, SacredPacket.PREFIX_SIZE + SacredPacketSecurityHeader.SIZE);
        return buf;
    }

}