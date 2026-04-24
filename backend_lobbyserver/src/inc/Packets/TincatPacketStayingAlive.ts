import {RawMessage} from 'figtree';
import {ATincatPacket} from './ATincatPacket.js';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * STAYINGALIVE (msgType = 11). Two-byte keep-alive, emitted by
 * `SendAliveMessage` (sub_10004080). The decompiled sender simply allocates
 * a 2-byte payload without writing into it — the original server never
 * reads the content, only the presence of the packet and the timestamp of
 * its arrival. We mirror that: the payload is two zero bytes.
 */
export class TincatPacketStayingAlive extends ATincatPacket {

    public static SIZE = 2;

    public constructor(data?: RawMessage) {
        super(data);
    }

    public getType(): TincatPacketTypes {
        return TincatPacketTypes.STAYINGALIVE;
    }

    public serialize(): Buffer {
        return Buffer.alloc(TincatPacketStayingAlive.SIZE);
    }

}