import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {ChatMessage} from '../Packets/Messages/ChatMessage.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ReceiveChatMessage (30). In the Sacred Gold naming convention
 * (matched here), "Receive*" is the inbound request from the user
 * ("please have everyone receive this chat"). The server broadcasts
 * SendChatMessage (31) to the other channel members — that's what the
 * client's chat-box renders as incoming chat.
 *
 * Sender-supplied identity fields are overwritten with the server's
 * authoritative view so a spoofed name can't slip through.
 */
export class ReceiveChatMessageHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ReceiveChatMessage;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: ChatMessage;
        try {
            msg = ChatMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ReceiveChatMessage parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ReceiveChatMessage);
            return;
        }

        const chId = client.getChannelId();
        if (chId === 0) {
            client.sendLobbyResult(LobbyResults.ErrorJoiningChannel, SacredMsgType.ReceiveChatMessage);
            client.sendImportantMessage('Not in a channel');
            return;
        }

        const senderName = client.getUsername();
        const senderPermId = client.getPermId();
        client.getLobby().broadcastToChannel(chId, (c) => {
            c.sendChatMessage(senderName, senderPermId, c.getPermId(), msg.text);
        }, client);

        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ReceiveChatMessage);
        logger.info(`chat[${chId}] <${senderName}> ${msg.text}`);
    }

}