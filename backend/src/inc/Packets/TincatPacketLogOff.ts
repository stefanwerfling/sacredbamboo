import {ATincatPacketConnection} from './ATincatPacketConnection.js';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * LOGMEOFF (msgType = 4). Client → server request to tear down a session.
 * The payload layout is identical to LOGMEON; only the username field is
 * typically populated.
 */
export class TincatPacketLogOff extends ATincatPacketConnection {

    public getType(): TincatPacketTypes {
        return TincatPacketTypes.LOGMEOFF;
    }

}