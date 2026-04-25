import {GameMessage} from '../Packets/GameMessage.js';
import {GameMsgType} from '../Packets/GameMsgType.js';
import {GameClient} from './GameClient.js';

/**
 * Strategy-pattern interface for CUSTOMDATA sub-packet handling on the
 * GameServer surface. Mirrors `ISacredMessageHandler` in the lobby.
 *
 * Implementations claim a single `GameMsgType` via `getType()` and get
 * their `handle()` called whenever a validated packet of that type
 * arrives on any GameClient.
 */
export interface IGameMessageHandler {

    getType(): GameMsgType;

    handle(client: GameClient, packet: GameMessage): void | Promise<void>;

}