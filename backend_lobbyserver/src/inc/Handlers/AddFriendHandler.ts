import {LobbyResults, SacredMsgType, SacredPacket} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {BuddyMessage} from '../Packets/Messages/BuddyMessage.js';
import {BuddyStatus} from '../Packets/Messages/BuddyStatus.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles AddFriend (51). The client says "add buddy with permId X to my
 * list"; we:
 *   - insert into FriendRegistry
 *   - if the buddy is online: send them AddedToFriends + tell the adder
 *     about the buddy's current status via UpdateFriendStatus
 *
 * Adding yourself is rejected silently with InternalError so the client
 * UI doesn't get a confusing success.
 */
export class AddFriendHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.AddFriend;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: BuddyMessage;
        try {
            msg = BuddyMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: AddFriend parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.AddFriend);
            return;
        }

        if (msg.buddyPermId === client.getPermId() || msg.buddyPermId === 0) {
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.AddFriend);
            return;
        }

        const lobby = client.getLobby();
        const added = lobby.getFriendRegistry().add(client.getPermId(), msg.buddyPermId);
        if (!added) {
            // Already a friend — treat as success, no fan-out.
            client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.AddFriend);
            return;
        }

        const buddy = lobby.findByPermId(msg.buddyPermId);
        if (buddy !== null) {
            buddy.sendAddedToFriends(client.getPermId(), client.getUsername());
            // Give the adder the current status of the buddy so their
            // friend list renders with an online indicator right away.
            client.sendUpdateFriendStatus(
                BuddyStatus.InLobby,
                buddy.getUsername(),
                buddy.getPermId(),
                buddy.getChannelId(),
                lobby.getChannelRegistry().get(buddy.getChannelId())?.name ?? ''
            );
        }

        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.AddFriend);
        logger.info(
            `${client.getUsername()} (${client.getPermId()}) added friend permId=${msg.buddyPermId}`
        );
    }

}