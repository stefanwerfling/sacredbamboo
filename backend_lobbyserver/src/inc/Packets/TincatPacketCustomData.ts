import {RawMessage} from 'figtree';
import {ATincatPacket} from './ATincatPacket.js';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * CUSTOMDATA (msgType = 2). Opaque payload carrier. At the tincat layer the
 * contents are arbitrary bytes; the lobby/game protocol on top of this
 * packet type is what carries server lists, chat, account actions etc.
 *
 * This class simply exposes the raw payload — decoding its inner sub-header
 * is the responsibility of a later layer and is out of scope for Stufe 1.
 */
export class TincatPacketCustomData extends ATincatPacket {

    protected _payload: Buffer;

    public constructor(data?: RawMessage | Buffer) {
        super(data);
        if (data instanceof RawMessage) {
            this._payload = Buffer.from(data.getBuffer());
        } else if (Buffer.isBuffer(data)) {
            this._payload = Buffer.from(data);
        } else {
            this._payload = Buffer.alloc(0);
        }
    }

    public getType(): TincatPacketTypes {
        return TincatPacketTypes.CUSTOMDATA;
    }

    public getPayload(): Buffer {
        return this._payload;
    }

    public setPayload(payload: Buffer): void {
        this._payload = payload;
    }

    public serialize(): Buffer {
        return Buffer.from(this._payload);
    }

}