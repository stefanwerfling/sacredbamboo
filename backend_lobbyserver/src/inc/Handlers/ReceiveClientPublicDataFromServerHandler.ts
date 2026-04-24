import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {PublicDataMessage} from '../Packets/Messages/PublicDataMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ReceiveClientPublicDataFromServer (18). A GameServer writes
 * back a client's character block (typical flow: player leaves a game,
 * the game-server pushes the updated savegame into the lobby for
 * persistence). Unlike ReceivePublicData, the `permId` in the packet
 * can differ from the sender — the sender IS a server acting on behalf
 * of that user.
 */
export class ReceiveClientPublicDataFromServerHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ReceiveClientPublicDataFromServer;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: PublicDataMessage;
        try {
            msg = PublicDataMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ReceiveClientPublicDataFromServer parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.ChangePublicDataFailed, SacredMsgType.ReceiveClientPublicDataFromServer);
            return;
        }

        client.getLobby().getCharacterStore().setBlock(msg.permId, msg.blockId, msg.data);
        client.sendLobbyResult(LobbyResults.ChangePublicDataSuccess, SacredMsgType.ReceiveClientPublicDataFromServer);
        logger.info(
            `server ${client.getUsername()} wrote back PublicData for permId=${msg.permId} ` +
            `block=${msg.blockId} length=${msg.data.length}`
        );
    }

}