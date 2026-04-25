import {LobbyResults, SacredMsgType} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ServerLogout (14). A GameServer voluntarily takes itself out of
 * the lobby. We remove it from the registry and tell the channel so
 * players drop it from their lists.
 *
 * Note: when the server's TCP connection dies without a clean logout, the
 * same cleanup runs via `LobbyServer.onClientClosed`.
 */
export class ServerLogoutHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ServerLogout;
    }

    public async handle(client: SacredClient): Promise<void> {
        const lobby = client.getLobby();
        const serverId = client.getConnectionId();
        const info = lobby.getServerRegistry().remove(serverId);
        if (info !== null) {
            lobby.broadcastToChannel(info.channelId, (c) => {
                c.sendRemoveServer(info);
            });
            logger.info(`server ${info.name} (id=${serverId}) logged out`);
        }
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ServerLogout);
    }

}