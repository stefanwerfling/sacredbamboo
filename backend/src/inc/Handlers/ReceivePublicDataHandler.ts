import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {PublicDataMessage} from '../Packets/Messages/PublicDataMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles ReceivePublicData (10). The user uploads a block of their own
 * character data; we stash it under (permId, blockId). Clients can only
 * push to their own permId — a mismatch is rejected as
 * ChangePublicDataFailed so spoofed uploads don't overwrite someone
 * else's block.
 */
export class ReceivePublicDataHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.ReceivePublicData;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let msg: PublicDataMessage;
        try {
            msg = PublicDataMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: ReceivePublicData parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.ChangePublicDataFailed, SacredMsgType.ReceivePublicData);
            return;
        }

        if (msg.permId !== client.getPermId()) {
            logger.warn(
                `${client.getUsername()}: attempted to upload PublicData for ` +
                `foreign permId=${msg.permId}, refused`
            );
            client.sendLobbyResult(LobbyResults.ChangePublicDataFailed, SacredMsgType.ReceivePublicData);
            return;
        }

        client.getLobby().getCharacterStore().setBlock(msg.permId, msg.blockId, msg.data);
        client.sendLobbyResult(LobbyResults.ChangePublicDataSuccess, SacredMsgType.ReceivePublicData);
        logger.info(
            `${client.getUsername()} uploaded PublicData block=${msg.blockId} ` +
            `length=${msg.data.length}`
        );
    }

}