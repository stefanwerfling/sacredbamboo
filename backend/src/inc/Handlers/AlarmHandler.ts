import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles Alarm (35). Empty body. The reference server just logs it and
 * acks. Real admin integrations could forward to a moderator queue later.
 */
export class AlarmHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.Alarm;
    }

    public async handle(client: SacredClient): Promise<void> {
        logger.warn(
            `ALARM from ${client.getUsername()} (permId=${client.getPermId()}, ${client.getPeer()})`
        );
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.Alarm);
    }

}