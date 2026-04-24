import {RawMessage} from 'figtree';
import {ATincatPacket} from './ATincatPacket.js';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * TIMESYNC (msgType = 1). Time-synchronisation probe.
 *
 * The sender in tincat2.dll was not fully isolated during the wire-layer
 * reverse engineering — the decompilation only shows that the type exists
 * and that the payload is passed opaquely through `sub_10003A90`. We treat
 * it as an arbitrary buffer so the dispatcher can forward it; a dedicated
 * time-sync handler can subclass this and parse the fields once the
 * concrete layout is confirmed.
 */
export class TincatPacketTimeSync extends ATincatPacket {

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
        return TincatPacketTypes.TIMESYNC;
    }

    public getPayload(): Buffer {
        return this._payload;
    }

    public serialize(): Buffer {
        return Buffer.from(this._payload);
    }

}