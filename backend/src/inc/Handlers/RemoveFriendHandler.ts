import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {BuddyMessage} from '../Packets/Messages/BuddyMessage.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles RemoveFriend (52). Symmetric to AddFriend — drops the edge from
 * FriendRegistry. The removed buddy is NOT notified; that matches the
 * reference server's minimalist policy.
 */
export class RemoveFriendHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.RemoveFriend;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: BuddyMessage;
        try {
            msg = BuddyMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: RemoveFriend parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.RemoveFriend);
            return;
        }

        client.getLobby().getFriendRegistry().remove(client.getPermId(), msg.buddyPermId);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.RemoveFriend);
        logger.info(
            `${client.getUsername()} (${client.getPermId()}) removed friend permId=${msg.buddyPermId}`
        );
    }

}