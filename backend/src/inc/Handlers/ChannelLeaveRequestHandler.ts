import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ChannelLeaveRequest (27). Empty body. Effects:
 *   - broadcast OtherUserLeftChannel to the rest of the channel
 *   - clear the client's channel state
 *   - LobbyResult(Ok)
 *
 * A leave when the client isn't in any channel is a no-op; we still send
 * LobbyResult(Ok) so the client doesn't stall waiting for an ack.
 */
export class ChannelLeaveRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ChannelLeaveRequest;
    }

    public async handle(client: SacredClient): Promise<void> {
        const lobby = client.getLobby();
        const chId = client.getChannelId();
        if (chId !== 0) {
            lobby.getChannelRegistry().leave(chId, client);
            lobby.broadcastToChannel(chId, (c) => {
                c.sendOtherUserLeft(client.getPermId(), client.getUsername());
            }, client);
            client.setChannelId(0);
            logger.info(`${client.getPeer()}: left channel ${chId}`);
        }
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ChannelLeaveRequest);
    }

}