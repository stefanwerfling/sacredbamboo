import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {SacredClient} from './SacredClient.js';

/**
 * Strategy-pattern interface for CUSTOMDATA sub-packet handling.
 *
 * Implementations claim a single `SacredMsgType` via `getType()` and get
 * their `handle()` called whenever a validated packet of that type arrives
 * on any SacredClient. Lobby logic (server list, chat, account flow…)
 * plugs in here in Stufe 3; Stufe 2 ships no concrete handlers.
 */
export interface ISacredMessageHandler {

    getType(): SacredMsgType;

    handle(client: SacredClient, packet: SacredPacket): void | Promise<void>;

}