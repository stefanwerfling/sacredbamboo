import {ATincatPacketConnection} from './ATincatPacketConnection.js';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * LOGMEON (msgType = 3). Client → server handshake carrying credentials.
 * Emitted by `KRNL_SendLogonRequest` (sub_10004380) and
 * `KRNL_ProcessPendingConnects` (sub_10004790) in tincat2.dll.
 */
export class TincatPacketLogOn extends ATincatPacketConnection {

    public getType(): TincatPacketTypes {
        return TincatPacketTypes.LOGMEON;
    }

}