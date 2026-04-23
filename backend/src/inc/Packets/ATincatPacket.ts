import {RawMessage} from 'figtree';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * Common base for the payload of every Tincat V2 packet. The payload is the
 * variable-sized chunk that follows the 28-byte `TincatPacketV2` header on
 * the wire.
 *
 * Subclasses implement:
 *   - `getType()`    the numeric type that the header should carry
 *   - `serialize()`  produce the exact payload bytes to send
 *   - constructor    optionally parse from an incoming RawMessage
 */
export abstract class ATincatPacket extends RawMessage {

    public constructor(data?: RawMessage | Buffer) {
        if (data instanceof RawMessage) {
            super(data);
        } else if (data) {
            super(data);
        } else {
            super(Buffer.alloc(0));
        }
    }

    public abstract getType(): TincatPacketTypes;
    public abstract serialize(): Buffer;

}