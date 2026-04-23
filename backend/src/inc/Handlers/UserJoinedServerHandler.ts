import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {UserJoinedServerMessage} from '../Packets/Messages/UserJoinedServerMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles UserJoinedServer (45). A GameServer tells the lobby a user
 * just connected into its game. We broadcast a system chat notice to
 * all users currently in a channel — matches the reference's
 * `BroadcastSystemMessage("X joined Y with character Z")` (minus the
 * character name, which lives in the PublicData/Profile layer not built
 * yet in Stufe 3b.3).
 */
export class UserJoinedServerHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.UserJoinedServer;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: UserJoinedServerMessage;
        try {
            msg = UserJoinedServerMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: UserJoinedServer parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.UserJoinedServer);
            return;
        }

        const lobby = client.getLobby();
        const user = lobby.findByPermId(msg.permId);
        const userName = user?.getUsername() ?? `permId=${msg.permId}`;
        const serverName = client.getUsername() || `server=${client.getConnectionId()}`;

        lobby.broadcastSystemChatMessage(`${userName} joined ${serverName}`);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.UserJoinedServer);
        logger.info(`UserJoinedServer: ${userName} joined ${serverName}`);
    }

}