import {LobbyResults, SacredMsgType, SacredPacket} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {RequestServerListMessage} from '../Packets/Messages/RequestServerListMessage.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ServerListRequest (20). For each GameServer registered in the
 * requested channel, send a SendServerInfo packet. When done, ack with
 * LobbyResult(Ok).
 */
export class ServerListRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ServerListRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let req: RequestServerListMessage;
        try {
            req = RequestServerListMessage.parse(packet.body);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ServerListRequest parse failed: ${msg}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ServerListRequest);
            return;
        }

        const servers = client.getLobby().getServerRegistry().listByChannel(req.channelId);
        for (const info of servers) {
            client.sendServerInfo(info);
        }
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ServerListRequest);
        logger.debug(
            `${client.getPeer()}: ServerListRequest channel=${req.channelId} -> ${servers.length} servers`
        );
    }

}