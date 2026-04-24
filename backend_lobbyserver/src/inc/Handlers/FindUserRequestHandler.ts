import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {BuddyStatus} from '../Packets/Messages/BuddyStatus.js';
import {FindUserMessage} from '../Packets/Messages/FindUserMessage.js';
import {FriendInfoMessage} from '../Packets/Messages/FriendInfoMessage.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles FindUserRequest (36). Looks up the user by username and — when
 * online — returns a FoundUser (37) with a fully populated FriendInfoMessage
 * body. Offline / not found: ErrorUserNotFound via LobbyResult.
 */
export class FindUserRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.FindUserRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let req: FindUserMessage;
        try {
            req = FindUserMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: FindUserRequest parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.FindUserRequest);
            return;
        }

        const lobby = client.getLobby();
        const target = lobby.findByUsername(req.name);
        if (target === null) {
            client.sendLobbyResult(LobbyResults.ErrorUserNotFound, SacredMsgType.FindUserRequest);
            return;
        }

        const channel = lobby.getChannelRegistry().get(target.getChannelId());
        const info = new FriendInfoMessage(
            client.getPermId(),
            BuddyStatus.InLobby,
            target.getUsername(),
            target.getPermId(),
            0, '',
            target.getChannelId(),
            channel?.name ?? ''
        );
        client.sendFoundUser(info);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.FindUserRequest);
    }

}