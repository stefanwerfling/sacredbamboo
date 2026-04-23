import {ClientType} from '../Client/ClientType.js';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {ServerInfoMessage} from '../Packets/Messages/ServerInfoMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
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
        if (lobby.getChannelRegistry().get(info.channelId) === null) {
            logger.warn(`${client.getPeer()}: server-login for unknown channel ${info.channelId}`);
            client.sendLobbyResult(LobbyResults.GameLoginNotAllowed, SacredMsgType.ServerLoginRequest);
            client.sendImportantMessage(`Channel ${info.channelId} does not exist`);
            return;
        }

        const externalIp = client.getPeerIp();
        info.serverId = client.getConnectionId();
        info.externalIp = externalIp;

        client.setClientType(ClientType.GameServer);
        client.setIdentity(info.name, client.getConnectionId());
        client.setChannelId(info.channelId);

        lobby.getChannelRegistry().join(info.channelId, client);
        lobby.getServerRegistry().register(info.serverId, client, info);

        client.sendServerLoginResult(externalIp);

        // Announce to existing players in the same channel.
        lobby.broadcastToChannel(info.channelId, (c) => {
            c.sendServerInfo(info);
        }, client);

        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ServerLoginRequest);

        logger.info(
            `${client.getPeer()}: server '${info.name}' logged in channel=${info.channelId} ` +
            `slots=${info.playerCount}/${info.playerMax}`
        );
    }

}