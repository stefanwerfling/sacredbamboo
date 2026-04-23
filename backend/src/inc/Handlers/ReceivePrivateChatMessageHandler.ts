import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {ChatMessage} from '../Packets/Messages/ChatMessage.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ReceivePrivateChatMessage (32). In the Sacred Gold naming:
 * inbound = user asks the server to deliver a PM; the server forwards
 * it as SendPrivateChatMessage (33) to the target permId.
 *
 * If the recipient isn't online (or is the sender themselves) we ack
 * with ErrorUserNotFound / InternalError + ImportantMessage. No fan-out.
 */
export class ReceivePrivateChatMessageHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ReceivePrivateChatMessage;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: ChatMessage;
        try {
            msg = ChatMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ReceivePrivateChatMessage parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ReceivePrivateChatMessage);
            return;
        }

        if (msg.destinationPermId === client.getPermId()) {
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ReceivePrivateChatMessage);
            return;
        }

        const target = client.getLobby().findByPermId(msg.destinationPermId);
        if (target === null) {
            client.sendLobbyResult(LobbyResults.ErrorUserNotFound, SacredMsgType.ReceivePrivateChatMessage);
            client.sendImportantMessage('Recipient not online');
            return;
        }

        target.sendPrivateChatMessage(
            client.getUsername(), client.getPermId(), target.getPermId(), msg.text
        );
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ReceivePrivateChatMessage);
        logger.info(
            `privchat <${client.getUsername()}> -> <${target.getUsername()}>: ${msg.text}`
        );
    }

}