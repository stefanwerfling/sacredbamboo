import {ISacredMessageHandler} from '../Client/ISacredMessageHandler.js';
import {SacredClient} from '../Client/SacredClient.js';
import {LobbyResults} from '../Packets/Messages/LobbyResults.js';
import {PublicDataRequestMessage} from '../Packets/Messages/PublicDataRequestMessage.js';
import {SacredMsgType} from '../Packets/SacredMsgType.js';
import {SacredPacket} from '../Packets/SacredPacket.js';
import {logger} from '../Util/Logger.js';

/**
 * Handles PublicDataRequest (9). Looks up the stored block from the
 * CharacterStore and replies with SendPublicData (11). If the block
 * doesn't exist we still reply with an empty block so the client's
 * request doesn't hang.
 */
export class PublicDataRequestHandler implements ISacredMessageHandler {

    public getType(): SacredMsgType {
        return SacredMsgType.PublicDataRequest;
    }

    public async handle(client: SacredClient, packet: SacredPacket): Promise<void> {
        let req: PublicDataRequestMessage;
        try {
            req = PublicDataRequestMessage.parse(packet.body);
        } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            logger.warn(`${client.getPeer()}: PublicDataRequest parse failed: ${m}`);
            client.sendLobbyResult(LobbyResults.InternalError, SacredMsgType.PublicDataRequest);
            return;
        }

        const block = client.getLobby().getCharacterStore().getBlock(req.permId, req.blockId);
        const data = block ?? Buffer.alloc(0);
        const offset = Math.min(Math.max(req.offset, 0), data.length);
        const requested = req.length > 0 ? req.length : data.length - offset;
        const slice = data.subarray(offset, Math.min(offset + requested, data.length));

        client.sendPublicData(req.permId, req.blockId, data.length, offset, slice.length, Buffer.from(slice));
        client.sendLobbyResult(LobbyResults.Ok, SacredMsgType.PublicDataRequest);
        logger.debug(
            `PublicDataRequest: permId=${req.permId} block=${req.blockId} ` +
            `offset=${offset} length=${slice.length}`
        );
    }

}