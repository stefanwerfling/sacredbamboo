import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {JoinChannelMessage} from '../Packets/Messages/JoinChannelMessage.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ChannelJoinRequest (25). On success:
 *   - add client to channel registry
 *   - send UserJoinChannel to the joiner (confirmation with channel id)
 *   - broadcast OtherUserJoinedChannel to everyone else in the channel
 *   - LobbyResult(Ok)
 *
 * Non-existent channel id → LobbyResult(ErrorJoiningChannel) + important
 * message; no state change.
 */
export class ChannelJoinRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ChannelJoinRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let req: JoinChannelMessage;
        try {
            req = JoinChannelMessage.parse(packet.body);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ChannelJoinRequest parse failed: ${msg}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ChannelJoinRequest);
            return;
        }

        const lobby = client.getLobby();
        const reg = lobby.getChannelRegistry();
        const channel = reg.get(req.channelId);
        if (channel === null) {
            client.sendLobbyResult(LobbyResults.ErrorJoiningChannel, SacredMsgType.ChannelJoinRequest);
            client.sendImportantMessage(`Channel ${req.channelId} does not exist`);
            return;
        }

        // If the client was already in a channel, leave the old one cleanly first.
        const prev = client.getChannelId();
        if (prev !== 0 && prev !== req.channelId) {
            reg.leave(prev, client);
            lobby.broadcastToChannel(prev, (c) => {
                c.sendOtherUserLeft(client.getPermId(), client.getUsername());
            }, client);
        }

        reg.join(req.channelId, client);
        client.setChannelId(req.channelId);

        // Announce the joiner to the rest of the channel.
        lobby.broadcastToChannel(req.channelId, (c) => {
            c.sendOtherUserJoined(client.getPermId(), client.getUsername());
        }, client);

        // Confirm to the joiner and ack.
        client.sendUserJoinChannel(req.channelId);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ChannelJoinRequest);

        logger.info(
            `${client.getPeer()}: joined channel ${channel.name} (id=${channel.id}) ` +
            `as ${client.getUsername()} permId=${client.getPermId()}`
        );
    }

}