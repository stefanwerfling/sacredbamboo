import {ClientType, LobbyResults, SacredMsgType, SacredPacket, ServerInfoMessage} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {sacredConfig} from '../Config/SacredBambooConfig.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ServerLoginRequest (SacredMsgType 12).
 *
 *   - parse 116-byte ServerInfoMessage
 *   - validate the requested channel exists (GameLoginNotAllowed otherwise)
 *   - stamp authoritative serverId (=connId) + externalIp over caller data
 *   - mark the connection as GameServer, register + join channel
 *   - ServerLoginResult with observed IP, broadcast SendServerInfo to the
 *     channel so existing players see the new server immediately
 *   - LobbyResult(Ok)
 */
export class ServerLoginRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ServerLoginRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let info: ServerInfoMessage;
        try {
            info = ServerInfoMessage.parse(packet.body);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ServerLoginRequest parse failed: ${msg}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ServerLoginRequest);
            return;
        }

        const lobby = client.getLobby();

        const peerIp = client.getPeerIp().join('.');
        const banReason = lobby.isBanned(peerIp, 'server');
        if (banReason !== null) {
            logger.warn(
                `${client.getPeer()}: server-login rejected (banned)` +
                (banReason !== '' ? ` reason="${banReason}"` : '')
            );
            client.sendLobbyResult(LobbyResults.ErrorUserBanned, SacredMsgType.ServerLoginRequest);
            client.sendImportantMessage(banReason !== '' ? `Banned: ${banReason}` : 'Banned');
            client.close();
            return;
        }

        if (lobby.getChannelRegistry().get(info.channelId) === null) {
            logger.warn(`${client.getPeer()}: server-login for unknown channel ${info.channelId}`);
            client.sendLobbyResult(LobbyResults.GameLoginNotAllowed, SacredMsgType.ServerLoginRequest);
            client.sendImportantMessage(`Channel ${info.channelId} does not exist`);
            return;
        }

        const useObserved = sacredConfig().get()?.lobby?.useObservedGameServerIp ?? true;
        info.serverId = client.getConnectionId();
        if (useObserved) {
            info.externalIp = client.getPeerIp();
        }
        // else: leave info.externalIp as whatever the GameServer reported
        // (e.g. from its own NETWORK_IP_ADDRESS config).

        client.setClientType(ClientType.GameServer);
        client.setIdentity(info.name, client.getConnectionId());
        client.setChannelId(info.channelId);

        lobby.getChannelRegistry().join(info.channelId, client);
        lobby.getServerRegistry().register(info.serverId, client, info);

        client.sendServerLoginResult(info.externalIp);

        // Announce to existing players in the same channel.
        lobby.broadcastToChannel(info.channelId, (c) => {
            c.sendServerInfo(info);
        }, client);

        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ServerLoginRequest);

        logger.info(
            `${client.getPeer()}: server '${info.name}' logged in channel=${info.channelId} ` +
            `slots=${info.playerCount}/${info.playerMax} ` +
            `externalIp=${info.externalIp.join('.')} (${useObserved ? 'observed' : 'self-reported'})`
        );
    }

}