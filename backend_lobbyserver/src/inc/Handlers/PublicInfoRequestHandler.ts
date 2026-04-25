import {LobbyResults, SacredMsgType, SacredPacket} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {PublicInfoRequestMessage} from '../Packets/Messages/PublicInfoRequestMessage.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles PublicInfoRequest (6). Look up the target user by permId and
 * reply with SendPublicInfo (8) carrying their username. Unknown permId
 * → LobbyResult(ErrorUserNotFound); no SendPublicInfo is sent.
 */
export class PublicInfoRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.PublicInfoRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let req: PublicInfoRequestMessage;
        try {
            req = PublicInfoRequestMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: PublicInfoRequest parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.PublicInfoRequest);
            return;
        }

        const target = client.getLobby().findByPermId(req.permId);
        if (target === null) {
            client.sendLobbyResult(LobbyResults.ErrorUserNotFound, SacredMsgType.PublicInfoRequest);
            return;
        }

        client.sendPublicInfo(target.getPermId(), target.getUsername());
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.PublicInfoRequest);
    }

}