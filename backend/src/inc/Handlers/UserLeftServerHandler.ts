import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {UserLeftServerMessage} from '../Packets/Messages/UserLeftServerMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles UserLeftServer (46). The reference server simply acks — there's
 * no observable side effect on the lobby state. We keep the log line so
 * operators can trace user flow through games.
 */
export class UserLeftServerHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.UserLeftServer;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: UserLeftServerMessage;
        try {
            msg = UserLeftServerMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: UserLeftServer parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.UserLeftServer);
            return;
        }

        const user = client.getLobby().findByPermId(msg.permId);
        logger.info(
            `UserLeftServer: ${user?.getUsername() ?? `permId=${msg.permId}`} ` +
            `left ${client.getUsername() || `server=${client.getConnectionId()}`}`
        );
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.UserLeftServer);
    }

}