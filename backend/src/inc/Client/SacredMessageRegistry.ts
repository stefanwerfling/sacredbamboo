import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';
import {ISacredMessageHandler} from './ISacredMessageHandler.js';
import {SacredClient} from './SacredClient.js';

/**
 * Lookup table of CUSTOMDATA handlers keyed by SacredMsgType.
 *
 * A type can have at most one handler — a second `register()` for the
 * same type replaces the first and logs a warning, so a typo in a plugin
 * doesn't silently shadow a production handler.
 *
 * Delivery:
 *   - `dispatch()` is sync/async-transparent: it awaits async handlers
 *     but swallows errors (logged) so a bad handler cannot crash the
 *     receive loop.
 *   - Unknown types are logged once and then dropped; they are not an
 *     error because the wire can carry types we have no handler for yet.
 */
export class SacredMessageRegistry {

    private _handlers: Map<SacredMsgType, ISacredMessageHandler> = new Map();

    public register(handler: ISacredMessageHandler): void {
        const type = handler.getType();
        if (this._handlers.has(type)) {
            logger.warn(`replacing existing handler for ${SacredMsgType[type] ?? type}`);
        }
        this._handlers.set(type, handler);
    }

    public unregister(type: SacredMsgType): boolean {
        return this._handlers.delete(type);
    }

    public has(type: SacredMsgType): boolean {
        return this._handlers.has(type);
    }

    public async dispatch(client: SacredClient, packet: SacredPacket): Promise<void> {
        const handler = this._handlers.get(packet.type);
        if (handler === undefined) {
            logger.debug(
                `${client.getPeer()}: no handler for ${SacredMsgType[packet.type] ?? packet.type}, ` +
                `body=${packet.body.length}B`
            );
            return;
        }

        try {
            await handler.handle(client, packet);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(
                `${client.getPeer()}: handler for ${SacredMsgType[packet.type] ?? packet.type} ` +
                `threw: ${msg}`
            );
        }
    }

}