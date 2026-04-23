import {ATincatPacketConnection} from './ATincatPacketConnection.js';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * LOGOFFACCEPTED (msgType = 6). Server → client confirmation that a
 * `LOGMEOFF` was processed. Emitted by `KRNL_LogClientOff` (sub_100057D0)
 * with only the 52-byte envelope set to the sub-magic — no credentials.
 */
export class TincatPacketLogOffAccepted extends ATincatPacketConnection {

    public getType(): TincatPacketTypes {
        return TincatPacketTypes.LOGOFFACCEPTED;
    }

}