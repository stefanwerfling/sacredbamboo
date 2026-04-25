import {LobbyResults, SacredMsgType, SacredPacket, ServerInfoMessage} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ServerChangePublicInfo (13). A GameServer calls this whenever
 * player count or flags change. We stamp the server's authoritative
 * serverId + externalIp over whatever the caller sent, then broadcast
 * the updated info to everyone in the server's channel.
 */
export class ServerChangePublicInfoHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ServerChangePublicInfo;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let incoming: ServerInfoMessage;
        try {
            incoming = ServerInfoMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ServerChangePublicInfo parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ServerChangePublicInfo);
            return;
        }

        const serverId = client.getConnectionId();
        const reg = client.getLobby().getServerRegistry();
        const existing = reg.get(serverId);
        if (existing === null) {
            client.sendLobbyResult(LobbyResults.GameUpdateNotAllowed, SacredMsgType.ServerChangePublicInfo);
            return;
        }

        // Preserve authoritative fields; let the server update cosmetic ones.
        incoming.serverId = serverId;
        incoming.externalIp = existing.externalIp;
        incoming.channelId = existing.channelId;
        reg.update(serverId, incoming);

        client.getLobby().broadcastToChannel(existing.channelId, (c) => {
            c.sendServerInfo(incoming);
        });
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ServerChangePublicInfo);
        logger.debug(
            `server ${incoming.name} updated: ${incoming.playerCount}/${incoming.playerMax} ` +
            `flags=0x${incoming.flags.toString(16)}`
        );
    }

}