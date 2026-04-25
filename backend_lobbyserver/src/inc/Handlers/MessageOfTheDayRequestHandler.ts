import {LobbyResults, SacredMsgType, SacredPacket} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {sacredConfig} from '../Config/SacredBambooConfig.js';
import {MotdRequestMessage} from '../Packets/Messages/MotdRequestMessage.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles MessageOfTheDayRequest (SacredMsgType 55). The client asks for
 * MOTD text; we reply with SendMessageOfTheDay carrying whatever is
 * configured under `lobby.messageOfTheDay`. The request's `Id` is echoed
 * back so the client can correlate.
 *
 * If the config has no MOTD, we just ack with LobbyResult(Ok) and skip
 * sending a MOTD body — that's what the reference server does.
 */
export class MessageOfTheDayRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.MessageOfTheDayRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let req: MotdRequestMessage;
        try {
            req = MotdRequestMessage.parse(packet.body);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: MotdRequest parse failed: ${msg}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.MessageOfTheDayRequest);
            return;
        }

        const text = sacredConfig().get()?.lobby?.messageOfTheDay ?? '';
        if (text.trim().length > 0) {
            client.sendMessageOfTheDay(req.id, text);
        }
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.MessageOfTheDayRequest);
    }

}