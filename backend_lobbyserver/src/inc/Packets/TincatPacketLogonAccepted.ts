import {ATincatPacketConnection} from './ATincatPacketConnection.js';
import {TincatPacketTypes} from './TincatPacketTypes.js';

/**
 * LOGONACCEPTED (msgType = 5). Server → client response granting the session.
 * Emitted by `KRNL_LogClientOn` (sub_10005660).
 *
 * In the original server the username field carries the assigned user name
 * (echoed back from the user record) and the password field is a single
 * dash ("-"). Callers should call `setUsername()` before serialize(); the
 * password default is chosen to match the decompiled behavior.
 */
export class TincatPacketLogonAccepted extends ATincatPacketConnection {

    public constructor() {
        super();
        this._password = '-';
    }

    public getType(): TincatPacketTypes {
        return TincatPacketTypes.LOGONACCEPTED;
    }

}