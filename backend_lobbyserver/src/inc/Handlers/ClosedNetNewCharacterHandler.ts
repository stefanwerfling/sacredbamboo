import {LobbyResults, SacredMsgType, SacredPacket} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {ClosedNetNewCharacterMessage} from '../Packets/Messages/ClosedNetNewCharacterMessage.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ClosedNetNewCharacter (39). Client tells the lobby it created a
 * new character and wants the lobby to initialise a persistent save slot
 * for it. We don't have the PublicData / save-file system yet (Stufe 3b.4),
 * so we acknowledge with Ok and log the request; a future iteration
 * replaces the ack with an actual `Database.InitSaveFile` call.
 */
export class ClosedNetNewCharacterHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ClosedNetNewCharacter;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: ClosedNetNewCharacterMessage;
        try {
            msg = ClosedNetNewCharacterMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ClosedNetNewCharacter parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ClosedNetNewCharacter);
            return;
        }

        logger.info(
            `ClosedNetNewCharacter: ${client.getUsername()} ` +
            `block=${msg.blockId} template=${msg.templateId} (save-file stub, no persistence)`
        );
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ClosedNetNewCharacter);
    }

}