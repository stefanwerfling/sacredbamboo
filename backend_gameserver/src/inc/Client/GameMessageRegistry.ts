import {GameMessage} from '../Packets/GameMessage.js';
import {GameMsgType} from '../Packets/GameMsgType.js';
import {logger} from '../Util/Logger.js';
import {GameClient} from './GameClient.js';
import {IGameMessageHandler} from './IGameMessageHandler.js';

/**
 * Lookup table of CUSTOMDATA handlers keyed by GameMsgType. Shape matches
 * `SacredMessageRegistry` in the lobby — see that file for the rationale
 * behind replacing-on-duplicate-register and swallowing-handler-errors.
 */
export class GameMessageRegistry {

    private _handlers: Map<GameMsgType, IGameMessageHandler> = new Map();

    public register(handler: IGameMessageHandler): void {
        const type = handler.getType();
        if (this._handlers.has(type)) {
            logger.warn(`replacing existing handler for game msg type ${GameMsgType[type] ?? type}`);
        }
        this._handlers.set(type, handler);
    }

    public unregister(type: GameMsgType): boolean {
        return this._handlers.delete(type);
    }

    public has(type: GameMsgType): boolean {
        return this._handlers.has(type);
    }

    public async dispatch(client: GameClient, packet: GameMessage): Promise<void> {
        const handler = this._handlers.get(packet.type);
        if (handler === undefined) {
            logger.debug(
                `${client.getPeer()}: no handler for game msg type ` +
                `${GameMsgType[packet.type] ?? packet.type}, body=${packet.body.length}B`
            );
            return;
        }

        try {
            await handler.handle(client, packet);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(
                `${client.getPeer()}: handler for game msg type ` +
                `${GameMsgType[packet.type] ?? packet.type} threw: ${msg}`
            );
        }
    }

}