import {LobbyResults, SacredMsgType, SacredPacket} from 'sacredbamboo-core';
import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {SelectPublicDataSetMessage} from '../Packets/Messages/SelectPublicDataSetMessage.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ClientCharacterSelect (17). The client picks one of their
 * character save-blocks as the active character. We store the blockId
 * in the CharacterStore so UserJoinedServer (already in 3b.3) and
 * future match-making logic can surface the chosen character.
 */
export class ClientCharacterSelectHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ClientCharacterSelect;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: SelectPublicDataSetMessage;
        try {
            msg = SelectPublicDataSetMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ClientCharacterSelect parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.ClientCharacterSelect);
            return;
        }

        client.getLobby().getCharacterStore().setSelected(client.getPermId(), msg.blockId);
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.ClientCharacterSelect);
        logger.info(
            `${client.getUsername()} selected character block=${msg.blockId}`
        );
    }

}